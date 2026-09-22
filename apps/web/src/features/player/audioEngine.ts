import {
  type Book,
  chapterAt,
  fileStartSec,
  globalPosition,
  resolvePosition,
} from '@/features/library/catalog'

import {
  type SleepMode,
  type SleepTimer,
  armSleep,
  fadeVolume,
  holdSleep,
  resumeSleep,
  sleepRemainingSec,
} from './sleepTimer'

/**
 * Was der Player von einem Medienelement braucht.
 *
 * Bewusst schmal gehalten: Ein echtes `<audio>` erfüllt das strukturell, und im
 * Test lässt sich dieselbe Logik ohne echte Wiedergabe prüfen – jsdom spielt
 * nichts ab.
 */
export interface MediaElement {
  src: string
  currentTime: number
  duration: number
  paused: boolean
  playbackRate: number
  volume: number
  play: () => Promise<void>
  pause: () => void
  load: () => void
  addEventListener: (type: string, listener: () => void) => void
  removeEventListener: (type: string, listener: () => void) => void
}

export interface PlayerSnapshot {
  book: Book | null
  /** Globale Sekunde im Buch. */
  positionSec: number
  durationSec: number
  playing: boolean
  /** Quelle gewechselt, Metadaten noch nicht da. */
  loading: boolean
  /** Das Buch ist bis zum Ende gelaufen. */
  finished: boolean
  error: boolean
  /** Eingestellter Einschlaf-Timer, oder `null`. */
  sleepMode: SleepMode | null
  /** Restzeit des Einschlaf-Timers in Sekunden. */
  sleepRemainingSec: number
}

const EMPTY: PlayerSnapshot = {
  book: null,
  positionSec: 0,
  durationSec: 0,
  playing: false,
  loading: false,
  finished: false,
  error: false,
  sleepMode: null,
  sleepRemainingSec: 0,
}

export interface AudioEngine {
  subscribe: (listener: () => void) => () => void
  snapshot: () => PlayerSnapshot
  open: (book: Book, positionSec: number) => void
  play: () => Promise<void>
  pause: () => void
  toggle: () => Promise<void>
  /** Springt auf eine globale Sekunde im Buch. */
  seekTo: (positionSec: number) => void
  /** Verschiebt um Sekunden, auch über Dateigrenzen hinweg. */
  skip: (deltaSec: number) => void
  nextChapter: () => void
  previousChapter: () => void
  /** Einschlaf-Timer setzen oder mit `null` abschalten. */
  setSleep: (mode: SleepMode | null) => void
  /** Hält an und macht den Player zu – danach ist kein Buch mehr offen. */
  stop: () => void
  close: () => void
}

/**
 * Wie weit zurück beim Fortsetzen gesprungen wird.
 *
 * Steht in jeder guten Hörbuch-App und hilft beim Wiedereinsteigen – man hört
 * den letzten Satz noch einmal an, statt mitten hineinzufallen.
 */
export const RESUME_REWIND_SEC = 5

/**
 * Wartezeiten vor den Wiederholungen, nachdem die Wiedergabe abgebrochen ist.
 *
 * Der erste Versuch kommt sofort: Meist ist nur das Ticket in der Adresse
 * abgelaufen, und ein neues ist in einer halben Sekunde da. Die weiteren
 * lassen dem Netz Zeit – einem WLAN, das kurz weg war, einem NAS, dessen
 * Platten erst anlaufen. Danach gibt die Engine auf und meldet den Fehler;
 * der Abspielknopf versucht es dann von vorn.
 */
export const RETRY_DELAYS_MS: readonly number[] = [0, 1000, 3000, 8000, 15_000]

/** Liegt der letzte Abbruch länger zurück, zählen die Versuche wieder von vorn. */
const FAILURE_WINDOW_MS = 60_000

/**
 * So lange darf die Wiedergabe auf Daten warten, ohne dass etwas ankommt.
 *
 * Weist der Dienst mitten in einer Datei ab, meldet Chrome keinen Fehler: Es
 * wiederholt dieselbe Anfrage eine halbe Minute lang, und so lange zeigt der
 * Player „spielt", während nichts zu hören ist. Treffen dagegen Daten ein
 * (`progress`), ist das nur ein langsames Netz und kein Grund einzugreifen.
 */
export const STALL_TIMEOUT_MS = 8000

/** Länger wartet eine Wiederholung nicht auf ein neues Ticket. */
export const RENEW_TIMEOUT_MS = 10_000

/**
 * Zeigt das Element schon auf diese Adresse?
 *
 * `src` liefert die Adresse immer absolut zurück. Stünde der Medien-Dienst
 * relativ in der Konfiguration, wäre sonst jede Adresse „neu" – und jedes
 * Weiterhören lüde die Datei noch einmal. Aufgelöst wird gegen die laufende
 * Quelle: Die ist selbst schon gegen die Seite aufgelöst.
 */
function sameSource(current: string, next: string): boolean {
  if (current === next) return true
  try {
    return current === new URL(next, current).href
  } catch {
    return false
  }
}

/** Wartet auf `task`, aber höchstens `ms` – ein hängendes Netz soll nichts blockieren. */
async function atMost(task: Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      task,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

export function createAudioEngine(deps: {
  element: MediaElement
  audioUrl: (bookId: string, fileIdx: number) => string | null
  /**
   * Besorgt frische Zugangsdaten, bevor nach einem Abbruch neu geladen wird.
   *
   * Die Adressen tragen ein Ticket, das abläuft. `force` ersetzt auch eines,
   * das nach eigener Rechnung noch gilt – für den Fall, dass der Dienst es
   * trotzdem abweist.
   */
  renewAccess?: (force: boolean) => Promise<void>
  /** Nur für Tests: die Uhr, gegen die der Einschlaf-Timer rechnet. */
  now?: () => number
}): AudioEngine {
  const { element } = deps

  let book: Book | null = null
  let fileIdx = 0
  let pendingSeek: number | null = null
  let state: PlayerSnapshot = EMPTY
  let sleep: SleepTimer | null = null
  const now = deps.now ?? (() => Date.now())

  /**
   * Soll gerade Ton kommen?
   *
   * Anders als `state.playing` übersteht das einen Abbruch: Danach geht es von
   * selbst weiter – aber nur, wenn vorher auch jemand zugehört hat.
   */
  let wantsPlay = false
  /**
   * Wo es nach einem Abbruch weitergeht; `null`, solange das Element gesund ist.
   *
   * Ein Element, das aufgegeben hat, spielt auf `play()` hin nicht wieder – es
   * muss neu geladen werden. Genau das fehlte früher: Danach half nur noch,
   * die App zu schliessen.
   */
  let resumeAt: number | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let stallTimer: ReturnType<typeof setTimeout> | null = null
  let failures = 0
  let lastFailureAt = Number.NEGATIVE_INFINITY
  /** Zählt die Anstösse – was ein überholter meldet, zählt nicht mehr. */
  let playAttempt = 0

  const listeners = new Set<() => void>()
  const emit = (patch: Partial<PlayerSnapshot>): void => {
    state = { ...state, ...patch }
    for (const listener of listeners) listener()
  }

  function currentGlobal(): number {
    if (!book) return 0
    return globalPosition(book, fileIdx, element.currentTime)
  }

  /**
   * Die Stelle im Buch, auch wenn das Element sie gerade nicht kennt.
   *
   * Während des Ladens steht `currentTime` noch auf 0 – massgeblich ist dann
   * das Ziel. Nach einem Abbruch gilt die Stelle, an der es abbrach.
   */
  function knownPosition(): number {
    if (resumeAt !== null) return resumeAt
    if (state.loading) return state.positionSec
    return currentGlobal()
  }

  function clearStall(): void {
    if (stallTimer !== null) clearTimeout(stallTimer)
    stallTimer = null
  }

  function clearTimers(): void {
    clearStall()
    if (retryTimer !== null) clearTimeout(retryTimer)
    retryTimer = null
  }

  /**
   * Lädt die Datei, in der die globale Sekunde liegt, und springt dorthin.
   *
   * `reload` lädt auch dann neu, wenn Datei und Adresse gleich bleiben – nach
   * einem Abbruch hilft nur das.
   */
  function load(target: number, autoplay: boolean, reload = false): void {
    if (!book) return

    if (autoplay) wantsPlay = true
    // Wer springt, überholt eine geplante Wiederholung. Und ein Element, das
    // aufgegeben hat, spielt auch nach einem Sprung nicht wieder.
    const fresh = reload || resumeAt !== null
    clearTimers()
    resumeAt = null

    const { fileIdx: nextFile, offsetSec } = resolvePosition(book, target)
    const url = deps.audioUrl(book.id, nextFile)
    if (url === null) {
      // Noch kein Ticket, etwa gleich nach dem Start: wie ein Abbruch – die
      // Wiederholung besorgt eines.
      fail(target)
      return
    }

    if (fresh || nextFile !== fileIdx || !sameSource(element.src, url)) {
      fileIdx = nextFile
      pendingSeek = offsetSec
      element.src = url
      element.load()
      emit({ loading: true, error: false, positionSec: target })
    } else if (pendingSeek !== null) {
      // Die Datei lädt noch. Gesprungen wird, sobald die Metadaten da sind –
      // sonst überschriebe dort das alte Ziel das neue.
      pendingSeek = offsetSec
      emit({ positionSec: target })
    } else {
      element.currentTime = offsetSec
      emit({ positionSec: target })
    }

    if (autoplay) void start()
  }

  /**
   * Stösst das Element an.
   *
   * Lädt die Engine inzwischen neu, bricht der Browser den alten Anstoss ab.
   * Die Anzeige soll dann nicht auf „Pause" springen, während es gleich
   * weitergeht – deshalb zählt nur, was der jüngste meldet.
   */
  async function start(): Promise<void> {
    const attempt = (playAttempt += 1)
    try {
      await element.play()
      if (attempt === playAttempt) emit({ playing: true, finished: false, error: false })
    } catch {
      // Ohne Nutzergeste verweigern Browser die Wiedergabe – kein Fehlerfall,
      // der Knopf bleibt einfach auf „Pause". Scheitert dagegen die Quelle,
      // kümmert sich `onError` darum.
      if (attempt === playAttempt && resumeAt === null) emit({ playing: false })
    }
  }

  async function play(): Promise<void> {
    if (!book) return
    wantsPlay = true

    // Nach einem Abbruch hilft ein blosses `play()` nicht – das Element muss
    // neu laden. Und zwar sofort, nicht erst nach der Wartezeit: Wer tippt,
    // will hören.
    if (resumeAt !== null || state.error) {
      failures = 0
      load(resumeAt ?? state.positionSec, true, true)
      return
    }

    // Seit dem Anhalten kann ein neues Ticket da sein oder die Datei auf dem
    // Gerät liegen. Mit der alten Adresse liefe erst der Puffer weiter, und
    // dann verstummte es mitten im Satz.
    if (!state.loading) {
      const url = deps.audioUrl(book.id, fileIdx)
      if (url !== null && !sameSource(element.src, url)) {
        load(currentGlobal(), true, true)
        return
      }
    }

    await start()
  }

  function pause(): void {
    wantsPlay = false
    // Eine geplante Wiederholung entfällt; das nächste Abspielen lädt neu.
    const broken = resumeAt !== null
    clearTimers()
    element.pause()
    emit({ playing: false, positionSec: knownPosition(), ...(broken ? { loading: false } : {}) })
  }

  /**
   * Die Wiedergabe ist abgebrochen – Ticket abgelaufen, Netz weg, NAS neu
   * gestartet.
   *
   * Hört jemand zu, geht es mit frischem Ticket an derselben Stelle weiter.
   * Sonst wird nichts erzwungen: Das nächste Abspielen lädt ohnehin neu.
   */
  function fail(at: number): void {
    clearTimers()
    resumeAt = at

    if (!wantsPlay) {
      emit({ loading: false, positionSec: at })
      return
    }

    const jetzt = now()
    if (jetzt - lastFailureAt > FAILURE_WINDOW_MS) failures = 0
    lastFailureAt = jetzt

    const delay = RETRY_DELAYS_MS[failures]
    if (delay === undefined) {
      // Aufgegeben. Der Abspielknopf versucht es danach von vorn.
      wantsPlay = false
      emit({ error: true, loading: false, playing: false, positionSec: at })
      return
    }

    failures += 1
    // Ab dem zweiten Versuch auch ein Ticket ersetzen, das noch zu gelten
    // scheint – vielleicht weist der Dienst es aus anderem Grund ab.
    const force = failures > 1
    emit({ loading: true, error: false, positionSec: at })
    retryTimer = setTimeout(() => {
      retryTimer = null
      void recover(at, force)
    }, delay)
  }

  async function recover(at: number, force: boolean): Promise<void> {
    const openBook = book
    try {
      if (deps.renewAccess) await atMost(deps.renewAccess(force), RENEW_TIMEOUT_MS)
    } catch {
      // Ohne Netz gibt es kein neues Ticket. Versucht wird trotzdem: Liegt die
      // Datei auf dem Gerät, braucht sie keines.
    }
    // Inzwischen kann jemand angehalten, gesprungen oder ein anderes Buch
    // geöffnet haben – dann gilt das.
    if (book !== openBook || resumeAt !== at) return
    load(at, wantsPlay, true)
  }

  /**
   * Der Wächter für Hänger ohne Fehlermeldung.
   *
   * Scharf, sobald das Element auf Daten wartet, während jemand zuhört. Jede
   * Lieferung setzt ihn zurück; läuft er ab, gilt das als Abbruch.
   */
  function armStall(): void {
    clearStall()
    if (!wantsPlay || resumeAt !== null) return
    stallTimer = setTimeout(() => {
      stallTimer = null
      if (book && wantsPlay && resumeAt === null) fail(knownPosition())
    }, STALL_TIMEOUT_MS)
  }

  const onLoadedMetadata = (): void => {
    if (pendingSeek !== null) {
      element.currentTime = pendingSeek
      pendingSeek = null
    }
    emit({ loading: false, positionSec: currentGlobal() })
  }

  /** Wie lange das laufende Kapitel noch dauert – für „bis Kapitelende". */
  function chapterRemainingSec(): number {
    if (!book) return 0
    const position = knownPosition()
    const chapter = chapterAt(book, position)
    return chapter === null ? book.durationSec - position : chapter.endSec - position
  }

  /**
   * Den Einschlaf-Timer nachführen.
   *
   * Aufgerufen wird das aus `timeupdate` – der einzigen Uhr, die auch bei
   * ausgeschaltetem Bildschirm zuverlässig weitergeht, solange etwas läuft.
   * Zurückgegeben wird, ob die Wiedergabe jetzt enden soll.
   */
  function tickSleep(): boolean {
    if (sleep === null) return false

    const remaining = sleepRemainingSec(sleep, now(), chapterRemainingSec())
    if (remaining <= 0) return true

    element.volume = fadeVolume(remaining)
    emit({ sleepRemainingSec: remaining })
    return false
  }

  /** Schluss für heute: erst aufräumen, dann anhalten. */
  function endSleep(): void {
    sleep = null
    element.volume = 1
    emit({ sleepMode: null, sleepRemainingSec: 0 })
    pause()
  }

  const onTimeUpdate = (): void => {
    if (!book || state.loading || resumeAt !== null) return
    emit({ positionSec: currentGlobal() })
    if (tickSleep()) endSleep()
  }

  const onEnded = (): void => {
    if (!book) return
    clearStall()

    // „Bis zum Kapitelende" heisst: hier ist Schluss, nicht am nächsten Kapitel.
    if (sleep?.mode.kind === 'chapter') {
      emit({ positionSec: currentGlobal() })
      endSleep()
      return
    }

    const next = book.files.find((file) => fileStartSec(book!, file.idx) > fileStartSec(book!, fileIdx))
    if (next) {
      // Nahtlos weiter: dieselbe Elementinstanz behält die Wiedergabe-Erlaubnis.
      load(fileStartSec(book, next.idx), true)
      return
    }

    wantsPlay = false
    emit({ playing: false, finished: true, positionSec: book.durationSec })
  }

  const onError = (): void => {
    // Nach dem Zumachen ist ein Fehler keiner: Das Leeren der Quelle löst
    // selbst ein `error`-Ereignis aus, und ein Player ohne Buch hat nichts,
    // woran etwas schiefgehen könnte.
    if (!book) return
    // Schon in Arbeit – etwa nach einem Hänger, den der Wächter erkannt hat.
    if (resumeAt !== null) return
    fail(knownPosition())
  }

  const onPause = (): void => {
    // Auf einen Abbruch folgt in Chrome ein `pause`. Das ist kein Wunsch
    // anzuhalten – sonst ginge es nach dem Neuladen nicht weiter.
    if (resumeAt !== null) return
    wantsPlay = false
    clearStall()
    // Die Uhr hält mit an: „Noch 15 Minuten hören" meint Hörzeit, und eine
    // Pause dazwischen soll davon nichts abziehen.
    if (sleep !== null) sleep = holdSleep(sleep, now())
    if (state.playing) emit({ playing: false })
  }

  const onPlay = (): void => {
    wantsPlay = true
    if (sleep !== null) sleep = resumeSleep(sleep, now())
    if (!state.playing) emit({ playing: true })
  }

  const onWaiting = (): void => {
    armStall()
  }

  const onProgress = (): void => {
    // Es kommen Daten – nur ein langsames Netz. Der Wächter zählt neu.
    if (stallTimer !== null) armStall()
  }

  const onPlaying = (): void => {
    clearStall()
  }

  const handlers: [string, () => void][] = [
    ['loadedmetadata', onLoadedMetadata],
    ['timeupdate', onTimeUpdate],
    ['ended', onEnded],
    ['error', onError],
    ['pause', onPause],
    ['play', onPlay],
    ['waiting', onWaiting],
    ['progress', onProgress],
    ['playing', onPlaying],
  ]
  for (const [type, handler] of handlers) element.addEventListener(type, handler)

  return {
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    snapshot: () => state,

    open: (nextBook, positionSec) => {
      const sameBook = book?.id === nextBook.id
      // Hat das Element aufgegeben, hilft nur neu laden – auch beim selben Buch.
      const reload = resumeAt !== null || state.error
      failures = 0
      book = nextBook
      emit({
        book: nextBook,
        durationSec: nextBook.durationSec,
        finished: false,
        error: false,
        positionSec,
      })
      if (!sameBook) fileIdx = -1
      load(positionSec, false, reload)
    },

    play,
    pause,
    toggle: async () => {
      if (state.playing) {
        pause()
        return
      }
      await play()
    },

    seekTo: (positionSec) => {
      if (!book) return
      const clamped = Math.min(book.durationSec, Math.max(0, positionSec))
      load(clamped, state.playing)
    },

    skip: (deltaSec) => {
      if (!book) return
      const clamped = Math.min(book.durationSec, Math.max(0, knownPosition() + deltaSec))
      load(clamped, state.playing)
    },

    nextChapter: () => {
      if (!book) return
      const position = knownPosition()
      const next = book.chapters.find((chapter) => chapter.startSec > position)
      load(next ? next.startSec : book.durationSec, state.playing)
    },

    previousChapter: () => {
      if (!book) return
      const position = knownPosition()
      // Innerhalb der ersten drei Sekunden zum vorigen Kapitel, sonst an den
      // Anfang des laufenden – so verhalten sich alle Player, und Kinder
      // treffen den Knopf ohnehin mehrfach.
      const current = book.chapters.find(
        (chapter) => position >= chapter.startSec && position < chapter.endSec,
      )
      if (!current) {
        load(0, state.playing)
        return
      }
      if (position - current.startSec > 3) {
        load(current.startSec, state.playing)
        return
      }
      const previous = [...book.chapters].reverse().find((c) => c.endSec <= current.startSec)
      load(previous ? previous.startSec : 0, state.playing)
    },

    setSleep: (mode) => {
      if (mode === null) {
        sleep = null
        element.volume = 1
        emit({ sleepMode: null, sleepRemainingSec: 0 })
        return
      }

      sleep = armSleep(mode, now())
      // Wer im Pausenzustand einstellt, soll nicht sofort Zeit verlieren.
      if (!state.playing) sleep = holdSleep(sleep, now())
      element.volume = 1
      emit({
        sleepMode: mode,
        sleepRemainingSec: sleepRemainingSec(sleep, now(), chapterRemainingSec()),
      })
    },

    /**
     * Wiedergabe beenden und den Player zumachen.
     *
     * Anders als `pause` bleibt danach nichts stehen: kein Buch, keine Leiste
     * am unteren Rand. Anders als `close` bleibt die Engine benutzbar – das
     * nächste Buch startet wie immer.
     */
    stop: () => {
      clearTimers()
      resumeAt = null
      failures = 0
      wantsPlay = false
      element.pause()
      sleep = null
      element.volume = 1
      // Die Quelle leeren, sonst hält der Browser den Puffer weiter offen.
      element.src = ''
      element.load()
      book = null
      fileIdx = -1
      state = EMPTY
      for (const listener of listeners) listener()
    },

    close: () => {
      clearTimers()
      resumeAt = null
      wantsPlay = false
      element.pause()
      sleep = null
      element.volume = 1
      for (const [type, handler] of handlers) element.removeEventListener(type, handler)
      book = null
      state = EMPTY
      for (const listener of listeners) listener()
    },
  }
}
