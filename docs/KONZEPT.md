# Konzept: Hörbuch-PWA für Kinder

> Stand: 2026-09-15 · Status: **Entwurf zur Abstimmung** · Nächster Schritt: offene Fragen (Kapitel 13) klären, dann Meilenstein M1

---

## 1. Ziel und Leitplanken

Eine private Hörbuch-App für die Familie. Die Hörbücher liegen auf dem eigenen
QNAP-NAS, die App läuft als installierbare PWA auf Tablets und Handys.

**Die drei Dinge, an denen die App gemessen wird:**

1. Ein Kind, das noch nicht lesen kann, findet sein Hörbuch in **zwei Taps**.
2. Es hört **exakt** dort weiter, wo es aufgehört hat – auch am nächsten Tag,
   auch auf einem anderen Gerät, auch nachdem die App weggewischt wurde.
3. Beim Einschlafen läuft der Ton weiter, wenn der Bildschirm ausgeht.

**Leitplanken:**

| Prinzip | Bedeutung |
|---|---|
| Kind zuerst | Grosse Flächen, Bilder statt Text, keine Menüs, keine Dialoge, nichts kaputt zu machen |
| Nie Fortschritt verlieren | Position wird lokal laufend gespeichert, Cloud-Sync ist nur ein Bonus obendrauf |
| Offline ist normal | Heruntergeladene Bücher funktionieren ohne NAS, ohne Internet, im Flugzeug |
| Inhalte bleiben privat | Kein Medien-Zugriff ohne Login, keine öffentlichen URLs, nichts Urheberrechtliches im Repo |
| Wenig Teile | Kein eigener Server ausser dem kleinen Dienst auf dem NAS; keine laufenden Kosten |

**Ausdrücklich nicht Ziel (v1):** Öffentliche Nutzung, Fremd-Accounts,
Empfehlungen, Bewertungen, Streaming an Dritte, Ausleihe, Podcast-Feeds.

### Festgelegte Rahmenbedingungen

Diese vier Punkte sind entschieden und prägen das ganze Konzept:

| Punkt | Entscheidung | Was daraus folgt |
|---|---|---|
| **Zielgeräte** | **Nur Android** | Background Fetch API steht zur Verfügung → echte Hintergrund-Downloads. Sämtliche iOS-Sonderwege entfallen (siehe Kapitel 8). |
| **Audioformat** | **Ordner mit MP3s**, eine Datei pro Kapitel | Kein `ffmpeg`/`ffprobe` nötig; Metadaten und Cover kommen aus den ID3-Tags. Die M4B-Unterstützung bleibt im Datenmodell vorbereitet, wird aber nicht gebaut. |
| **NAS** | QNAP mit **laufender Container Station** | Der Medien-Dienst wird als Docker-Image mit `docker-compose.yml` ausgeliefert. |
| **Repository** | Bleibt **öffentlich** | Verschärfte Disziplin bei allem, was committet wird – siehe Kapitel 9.3. |

---

## 2. Nutzer und Kernszenarien

**Rollen**

- **Eltern** (ein Firebase-Konto pro Familie): richten ein, laden Bücher aufs NAS,
  verwalten Kinderprofile, laden Bücher für die Reise herunter.
- **Kinder** (Profile innerhalb des Familienkontos, **kein eigenes Passwort**):
  hören. Mehr nicht.

Das ist eine bewusste Entscheidung: Kinder können keine E-Mail-Adresse und kein
Passwort eintippen. Es gibt **einen Login pro Gerät**, der dauerhaft bestehen
bleibt (`browserLocalPersistence`) – danach sieht das Kind nur noch Avatare zum
Antippen.

**Kernszenarien**

| # | Szenario | Erwartung |
|---|---|---|
| S1 | Kind öffnet App vom Startbildschirm | Erste Kachel ist „Weiterhören" mit Cover des laufenden Buchs. Ein Tap → es läuft. |
| S2 | Kind will ein anderes Buch | Ein Tap auf „Zurück", grosses Cover-Raster, ein Tap aufs Cover → es läuft ab Anfang bzw. ab letzter Position. |
| S3 | Einschlafen | Sleep-Timer setzen, Bildschirm aus, Ton läuft weiter, blendet am Ende sanft aus. |
| S4 | Autofahrt ohne Netz | Buch war vorher heruntergeladen, läuft komplett offline, Fortschritt wird lokal gemerkt und später synchronisiert. |
| S5 | Wechsel Tablet → Handy | Position ist auf dem anderen Gerät da (sofern beide mal online waren). |
| S6 | Eltern legen neues Hörbuch aufs NAS | Ordner rein, Scan läuft (automatisch/per Knopf), Buch erscheint in der App. |

---

## 3. Architektur im Überblick

```
   Kind-Tablet / Handy
   ┌────────────────────────────────────────────┐
   │  PWA (installiert, Standalone)             │
   │  ┌────────────────────────────────────────┐│
   │  │ UI (React)                             ││
   │  │ Player: 1x <audio> + Media-Session     ││
   │  ├────────────────────────────────────────┤│
   │  │ Service Worker                         ││
   │  │  · App-Shell-Precache                  ││
   │  │  · Audio-Cache (Cache Storage)         ││
   │  ├────────────────────────────────────────┤│
   │  │ IndexedDB: Katalog, Fortschritt,       ││
   │  │             Download-Status            ││
   │  └────────────────────────────────────────┘│
   └───┬────────────────┬─────────────────┬─────┘
       │                │                 │
       │ App-Code       │ Login +         │ Katalog + Audio
       │ (HTTPS)        │ Fortschritt     │ (HTTPS via Tunnel)
       ▼                ▼                 │
   ┌───────────────┐  ┌─────────────────┐ │
   │ Netlify       │  │ Firebase        │ │
   │ · Static Host │  │ · Authentication│ │
   │ · CDN         │  │ · Firestore     │ │
   └───────────────┘  └─────────────────┘ │
                                          ▼
 ┌─────────────────────────────────────────────────────┐
 │ QNAP NAS                                            │
 │ ┌─────────────────────────────────────────────────┐ │
 │ │ Container Station: hb-media (Node, Docker)      │ │
 │ │  · prüft Firebase-Token → gibt Media-Ticket aus │ │
 │ │  · /library  (Katalog als JSON)                 │ │
 │ │  · /cover    (Cover-Bilder)                     │ │
 │ │  · /audio    (Streaming mit Range-Support)      │ │
 │ │  · Scanner (ID3-Tags: Dauer, Titel, Cover)      │ │
 │ └─────────────────────────────────────────────────┘ │
 │ Dedizierter Ordner: /share/Hoerbuecher/ (read-only) │
 └─────────────────────────────────────────────────────┘
```

**Wer macht was**

| Komponente | Aufgabe | Warum dort |
|---|---|---|
| Netlify | Auslieferung der App (HTML/JS/CSS/Icons) | Statisch, CDN, gratis, Auto-Deploy aus Git |
| Firebase Auth | Wer darf rein | Fertig, sicher, gratis, kein eigener Auth-Code |
| Firestore | Hörfortschritt, Profile, Einstellungen | Winzige Datenmengen, Offline-Persistenz eingebaut, Sync über Geräte gratis |
| QNAP `hb-media` | Katalog + Audio-Auslieferung | Die Dateien liegen dort; Streaming über fremde Server wäre teuer und langsam |
| Tunnel | Erreichbarkeit von aussen ohne Portfreigabe | Kein offener Port am Heimnetz |

**Bewusst nicht dabei:** Keine Netlify Functions in v1. Der NAS-Dienst prüft das
Firebase-Token selbst gegen Googles öffentliche Schlüssel (JWKS) – dafür braucht
er keine Zugangsdaten, nur Internet-Zugriff. Das spart eine ganze Schicht.

---

## 4. Technische Entscheidungen

| Thema | Entscheidung | Begründung | Verworfene Alternative |
|---|---|---|---|
| Frontend | Vite + React + TypeScript | Schnell, typsicher, kleines Bundle, gute PWA-Tooling-Unterstützung | Next.js (zu viel für eine statische App), Vanilla JS (Wartbarkeit) |
| Styling | Tailwind CSS | Design-Tokens für grosse Touch-Ziele zentral steuerbar | CSS-Module (mehr Handarbeit) |
| PWA | `vite-plugin-pwa` im `injectManifest`-Modus | Manifest + Workbox-Precache automatisch, eigener Service Worker für Background Fetch | `generateSW` (kein Platz für die Download-Logik) |
| State | Zustand (Player-Store) + React Query-artiger Cache für Katalog | Sehr klein, kein Boilerplate | Redux (Overkill) |
| Audio | **Ein einziges** `<audio>`-Element, wiederverwendet | Browser erlauben Wiedergabe nur nach einer Nutzergeste; ein wiederverwendetes Element behält diese Freigabe über Kapitelwechsel hinweg | Neues Element pro Track (verliert die Freigabe) |
| Hintergrund/Lockscreen | Media Session API | Lockscreen-Cover, Titel, Play/Pause, ±30 s, Kapitelwechsel | Nichts (Bedienung nur in der App) |
| Medien-Zugriff | Kurzlebiges **Media-Ticket** in der URL (`?t=…`) | `<audio src>` kann keine eigenen Header setzen; die URL trägt die Berechtigung durch Streaming, Range-Requests und Background Fetch gleichermassen | Authorization-Header (geht bei Media-Elementen nicht), Cookies (nur bei eigener Domain sauber) |
| Offline-Speicher | **Cache Storage** für Audio, IndexedDB für Metadaten | Cache Storage ist für grosse Responses gebaut; Metadaten gehören in eine Datenbank | Alles in IndexedDB (Blob-Handling umständlicher) |
| Offline-Wiedergabe | Blob aus dem Cache holen und per Object-URL abspielen | Der Player fragt direkt den Cache, ohne Umweg über den Service Worker – damit entfällt das Nachbauen von 206-Range-Antworten im SW komplett | SW-Interception mit Workbox-`RangeRequestsPlugin` (mehr bewegliche Teile ohne Mehrwert) |
| Katalog | Vom NAS erzeugt, in IndexedDB gespiegelt | Eine Quelle der Wahrheit (der Ordner), trotzdem offline browsebar | Katalog in Firestore pflegen (doppelte Pflege) – siehe Ausbaustufe 7.3 |
| Tunnel | Cloudflare Tunnel (`cloudflared` im Container) | Gratis, kein offener Port, HTTPS inklusive | Portfreigabe + DDNS (Angriffsfläche), Tailscale (Client auf jedem Gerät nötig) |
| NAS-Dienst | Node 20 + Fastify in Docker (Container Station) | Range-Support in wenigen Zeilen; Container Station läuft bereits | QNAP Multimedia/DLNA (kein Auth-Modell, das zu Firebase passt) |
| Metadaten lesen | `music-metadata` (reines JS) + `sharp` fürs Cover | Liest ID3-Tags, Dauer und eingebettete Cover ohne externe Binaries → schlankes Image, kein `ffmpeg` | `ffprobe`/`ffmpeg` (nur nötig, falls später doch M4B dazukommt) |

---

## 5. Bedienkonzept für Kinder

### 5.1 Wenige Ebenen – und von der Startseite aus fast immer nur eine

```
  Profilwahl  →  Start  →  Player
  (nur wenn        │
   mehrere         ├→ Buch → Player
   Profile)        │
                   └→ Reihe (Folgen) → Buch → Player
                      ↑ steht unten auf der Startseite
```

Kein Hamburger-Menü, keine Tabs, keine Modals, kein Suchfeld auf der Kinderseite.
Die Rück-Geste ist immer derselbe grosse Pfeil links oben.

**Die Bibliothek hat seit M9 eine Ebene mehr, und die Startseite dafür weniger.**
Neun Reihen mit zusammen mehreren hundert Folgen waren als ein einziges Raster
unbenutzbar – man scrollte an allem vorbei, was man suchte. Alles, was regelmässig
gehört wird, steht dafür jetzt auf der Startseite und ist von dort aus einen Tap
entfernt: Weiterhören, Gemerktes, Vorschläge.

**Die Reihenübersicht steht dabei unten auf der Startseite selbst.** Vorher
standen dort die sechs neuesten Folgen und darunter ein Knopf „Alle Hörbücher".
Am ersten Tag – ohne Weiterhören, ohne Gemerktes, ohne Vorschläge – war die
Startseite damit eine fast leere Seite mit einem Knopf, obwohl zehn Reihen
bereitstanden. Scrollen kostet nichts und zeigt etwas; ein Tap auf einen Knopf
kostet einen Bildschirmwechsel und zeigt dasselbe. Die Seite `/bibliothek`
bleibt: Sie ist der Weg zurück aus einer Reihe und die gemerkte letzte Ansicht.

### 5.2 Startbildschirm

Oben **eine einzige grosse Kachel**: das zuletzt gehörte Buch, mit Cover,
Fortschritt und dem Wort „Weiterhören". Ein Tap startet die Wiedergabe an der
gespeicherten Position – ohne Zwischenseite. Darunter, in dieser Reihenfolge,
was ein Kind sonst noch sucht.

```
 ┌───────────────────────────────┐
 │ Hörbücher            [Avatar] │   ← Avatar: Tier und Farbe ändern
 │ ┌───────────────────────────┐ │
 │ │                           │ │
 │ │     [  COVER  GROSS  ]    │ │   ← 1 Tap = weiterhören
 │ │                           │ │
 │ │  >  Weiterhören           │ │
 │ │  ◕ Kapitel 4 · noch 18 Min│ │
 │ └───────────────────────────┘ │
 │                               │
 │ Weiterhören                   │   ← alles andere, was angefangen ist;
 │ ┌─────┐ ┌─────┐ ┌─────┐       │      Kreuz an der Kachel nimmt es weg
 │ │Cover│ │Cover│ │Cover│       │
 │ └─────┘ └─────┘ └─────┘       │
 │                               │
 │ Gemerkt                    ★  │
 │ ┌─────┐ ┌─────┐               │
 │ └─────┘ └─────┘               │
 │                               │
 │ Vielleicht auch etwas für dich│
 │ ┌─────┐ ┌─────┐ ┌─────┐       │
 │ └─────┘ └─────┘ └─────┘       │
 │                               │
 │ Alle Hörbücher                │
 │ ┌─────┐ ┌─────┐ ┌─────┐       │   ← alle Reihen, nicht nur ein
 │ │Reihe│ │Reihe│ │Buch │       │      Ausschnitt; weiterscrollen
 │ └─────┘ └─────┘ └─────┘       │      statt weitertippen
 └───────────────────────────────┘
```

**Gemerkt.** Ein Stern auf der Buchseite, mehr ist es nicht. Er gehört dem
Profil, nicht dem Konto: Zwei Geschwister auf demselben Tablet haben
verschiedene Lieblingsfolgen.

**Vorschläge – bewusst dumm.** Wer Folge 5 hört, bekommt 6, 7 und 8. Gewichtet
wird nur danach, in welchem Fach am meisten Zeit verbracht wurde; höchstens drei
Folgen je Fach, sonst besteht die Zeile aus einer einzigen Reihe. Am ersten Tag,
wenn es noch nichts zu wissen gibt, steht dort das zuletzt Dazugekommene. Nichts
davon lernt, nichts davon rechnet – und genau deshalb versteht ein Kind das
Ergebnis ohne Erklärung.

**Der Avatar ist ein Knopf.** Ein Tap darauf führt zu Tier und Farbe. Das ist
das Einzige am eigenen Profil, was ein Kind ohne Eltern ändern darf – der Name
bleibt im Elternbereich, sonst heisst am Nachmittag jemand „aaaaaa".

### 5.3 Bibliothek

Zwei Schritte: **erst die Reihen, dann die Folgen.** Beide sind dasselbe Raster
aus **grossen Covern**, 2 Spalten auf dem Handy, 3–4 auf dem Tablet. Titel klein
darunter, aber das Cover trägt die Erkennung. Heruntergeladene Bücher bekommen
ein Offline-Symbol, gemerkte einen Stern.

Innerhalb einer Reihe stehen Unterordner des NAS als eigene Abschnitte:
„Adventskalender", „Mini-Fälle". Sie gehören zur Reihe, sind aber nicht die
Reihe – und in einem Topf mit ihr wären sie an der falschen Stelle einsortiert.

**Titel werden aufgeräumt, nicht abgetippt.** Auf dem NAS heisst ein Ordner
„Die Drei Fragezeichen Kids-68-Chaos Im Dunkeln", weil er über Jahre so gewachsen
ist. In der Reihe gelesen steht der Reihenname dann in jeder Zeile noch einmal.
Der Scanner nimmt ihn deshalb vorn heraus, vereinheitlicht die Trennzeichen und
trennt die Folgennummer ab; angezeigt wird „68 - Chaos Im Dunkeln". Dieselbe
Aufbereitung läuft zusätzlich in der App – sonst müsste man auf einen neuen
NAS-Dienst warten, um ein Ergebnis zu sehen. Wo die Automatik danebenliegt,
setzt der Adminbereich den Titel von Hand; der gilt dann für alle Geräte.

Bücher ohne Cover bekommen automatisch eine farbige Kachel mit grossem
Anfangsbuchstaben – nie ein leeres graues Rechteck.

### 5.4 Player

```
 ┌───────────────────────────────┐
 │ ←                       Timer │   ← Zurück · Sleep-Timer
 │                               │
 │      ┌─────────────────┐      │
 │      │                 │      │
 │      │      COVER      │      │
 │      │                 │      │
 │      └─────────────────┘      │
 │                               │
 │      Der Super-Papagei        │
 │          Kapitel 4            │
 │                               │
 │  🔒  ███████░░░░░░░░░░░░░░░░  │   ← Riegel auf = spulen, sonst nur Anzeige
 │      12:04            -18:22  │
 │                               │
 │  |<    -30s    >    +30s   >| │
 │  64px   64px  112px  64px     │
 │              ■                │   ← anhalten und zumachen
 └───────────────────────────────┘
```

**Das Viereck macht den Player zu.** Pause allein lässt die Leiste am unteren
Rand stehen – sie gehört dorthin, solange noch etwas läuft, und ist im Weg,
wenn niemand mehr hört. Die Stelle geht dabei nicht verloren: Sie steht danach
wieder oben auf der Startseite unter „Weiterhören".

**Dasselbe Viereck steht auch in der Leiste selbst**, links neben Play/Pause:

```
 ┌───────────────────────────────┐
 │ ▢  Der Super-Papagei      ■ ▶ │   ← Titel antippen = Player
 │    Kapitel 4            64px  │   ← ■ = anhalten und zumachen
 └───────────────────────────────┘
```

Wer die Leiste wegbekommen will, musste dafür bisher erst den Player aufmachen
– einen Bildschirm weit für das, was man gerade sieht. Der Abstand von 16px
zwischen den beiden Knöpfen ist hier der Preis: Zumachen ist kein Vertippen
wert, das man sich beim Greifen nach Pause einhandelt. Der Knopf trägt einen
Rand aus `--color-control`; ohne ihn stünde eine weisse Fläche auf einer
weissen Leiste.

**Der Fortschrittsbalken war bis M8 bewusst nur Anzeige** – aus Sorge, ein Kind
verliere beim versehentlichen Wischen seine Stelle. In der Praxis fehlte er:
Wer eine bestimmte Stelle sucht, tippt sonst minutenlang auf ⏪. Seit M9 lässt
sich hineintippen und ziehen; die ±30-Sekunden-Knöpfe bleiben genau so, wie sie
waren.

Die ursprüngliche Sorge bleibt berechtigt, und die erste Antwort darauf war
falsch. Sie lautete: Die Fläche zum Ziehen ist ein volles Touch-Ziel hoch, man
trifft sie also absichtlich und nicht im Vorbeiwischen. Im Gebrauch stimmt genau
das nicht – ein Touch-Ziel über die ganze Breite streift jeder, der das Gerät in
der Hand hält, und bei einem Hörbuch von zehn Stunden ist die Stelle danach weg:
Der Fortschritt wird ja laufend gesichert, und gesichert wird dann die falsche.

**Deshalb liegt der Balken hinter einem Riegel.** Gesperrt zeigt er nur an – die
Füllung bleibt voll ablesbar, es fehlt der Griff. Ein Tap auf den Riegel gibt
ihn frei; danach bleibt er offen, solange man ihn bedient, und schliesst sich
nach zwanzig Sekunden ohne Bedienung von selbst. Ohne dieses Zufallen wäre die
Sperre nach dem ersten Mal für immer weg.

Zwei Schritte statt einem sind hier kein Umweg, sondern der Zweck: Spulen ist
eine Absicht, kein Nebenprodukt des Haltens. Die ±30-Sekunden-Knöpfe bleiben
frei bedienbar – sie kosten im schlimmsten Fall dreissig Sekunden, nicht die
Stelle.

Technisch ist es ein `input[type=range]` mit `disabled`: Tastatur und
Vorleseprogramm können damit umgehen, ohne dass dafür etwas nachgebaut werden
müsste. Der Tap auf den Riegel setzt den Tastaturfokus auf den Balken – sonst
führte mit der Tastatur kein Weg dorthin.

**Warum zwei Bedienzeilen statt einer:** Fünf Knöpfe nebeneinander brauchen
368 px, plus die oben geforderten 16 px Abstand zwischen tappbaren Elementen
sind das 432 px – mehr, als ein Handy im Hochformat hergibt. Statt die
Mindestgrössen zu unterschreiten, liegt die Kapitelnavigation in einer eigenen
Zeile und zeigt dort nebenbei, in welchem Kapitel man gerade ist.

### 5.5 Design-Regeln (verbindlich)

| Regel | Wert |
|---|---|
| Kleinstes Touch-Ziel | 64 × 64 px |
| Play/Pause | 112 × 112 px |
| Schriftgrösse Fliesstext | ≥ 18 px, Titel ≥ 24 px |
| Kontrast | mindestens WCAG AA, Ziel AAA bei Text |
| Abstand zwischen tappbaren Elementen | ≥ 16 px |
| Animationen | ruhig, ≤ 250 ms, respektieren `prefers-reduced-motion` |
| Destruktives | nie im Kinderbereich – eine Ausnahme, siehe unten |
| Fehler | nie als Text-Dialog, sondern als Bild + ein Knopf („Nochmal probieren") |
| Zustand merken | Letztes Profil und letzte Ansicht überleben den App-Neustart |

**Die eine Ausnahme beim Destruktiven** ist das Kreuz an den Kacheln unter
„Weiterhören". Gemeint war mit der Regel, dass ein Kind
nichts kaputt machen kann: kein gelöschtes Profil, keine Abmeldung, keine
Einstellung, die niemand zurückdreht. Hier geht nichts verloren ausser der
Stelle im Buch – das Hörbuch selbst liegt weiter auf dem NAS und steht zwei
Tipps entfernt in der Bibliothek. Und es bleibt bei zwei Tipps: Der erste macht
aus dem Kreuz einen Haken, der zweite nimmt weg. Alles andere aus der Zeile gilt
unverändert.

Zwei dieser Regeln haben beim Nachmessen nicht gehalten, und beide sahen beim
Ansehen richtig aus:

**Der Fehlertext verfehlte den Kontrast.** `#ea580c` auf Weiss ergibt 3,6:1 –
verlangt sind 4,5:1, ausgerechnet dort, wo etwas schiefgegangen ist. Die Farbe
ist jetzt dunkler (6,0:1).

**Der Rand sekundärer Knöpfe war fast unsichtbar.** Ein solcher Knopf hebt sich
farblich kaum vom Hintergrund ab; erkannt wird er an seinem Rand, und der kam
auf 1,4:1 statt der von WCAG 1.4.11 geforderten 3:1. Dafür gibt es jetzt ein
eigenes Token (`--color-control`, 3,3:1) – Trennlinien dürfen weiterhin zart
sein, Bedienelemente nicht.

Gerechnet wird das seither im Test, aus derselben Datei, aus der die App ihre
Farben nimmt. Kontrast ist die einzige dieser Regeln, die man beim Ansehen
nicht prüfen kann.

**Die letzte Ansicht wird gemerkt, der Player aber nie.** Ihn beim Öffnen
wiederherzustellen hiesse, dass die App von selbst zu spielen anfängt, sobald
jemand sie antippt. Gemerkt wird stattdessen die Buchseite: dieselbe Stelle,
ohne Ton im Wohnzimmer. Die Scrollposition bleibt offen – sie über einen
Neustart zu erhalten lohnt den Aufwand erst, wenn die Bibliothek so gross ist,
dass Scrollen wehtut.

### 5.6 Sleep-Timer

Wichtigstes Elternfeature. Auswahl: 5 / 10 / 15 / 30 / 45 / 60 Minuten oder
„bis Kapitelende". Restzeit gross sichtbar, letzte 20 Sekunden sanftes Ausblenden
der Lautstärke, dann Pause (kein harter Stopp mitten im Satz).

Drei Dinge daran sind beim Bauen dazugekommen:

**Gerechnet wird gegen die Uhr, nicht mit einem Zähler.** Ein `setInterval`
drosselt Android, sobald der Bildschirm ausgeht – und genau dann läuft dieser
Timer. Der Zeitpunkt, an dem Schluss ist, steht deshalb fest, und nachgesehen
wird bei jedem `timeupdate` des Audioelements. Das ist die eine Uhr, die im
Hintergrund zuverlässig weitergeht, solange etwas läuft.

**Die Uhr hält mit der Wiedergabe an.** „Noch 15 Minuten hören" meint
Hörzeit. Läuft der Timer in einer Pause weiter, ist die Zeit vorbei, während
das Tablet unangetastet auf dem Nachttisch lag.

**Ausgeblendet wird nur bis zu einem Rest, nie bis auf null.** Eine Lautstärke
von 0 stufen Browser als „spielt nicht" ein und beenden die
Hintergrundwiedergabe (§6.1) – aus dem sanften Auslaufen würde ein hartes
Ende. Nach dem Ausblenden folgt deshalb eine echte Pause.

Bei „bis Kapitelende" endet die Wiedergabe am Kapitelende, statt wie sonst
selbsttätig weiterzuwechseln.

### 5.7 Elternmodus und Adminbereich

Erreichbar über das Profilbild oben rechts (**Profil → Für Erwachsene**) und
weiterhin über langen Druck (2 s) auf den Titel; beides gesichert mit
4-stelliger PIN.

**Warum jetzt sichtbar:** Der versteckte Eingang war als Schutz gedacht und war
keiner – er hielt nicht die Kinder fern, sondern die Erwachsenen. Wer ihn nicht
kennt, findet ihn nicht, und die App merkt sich beim Start die zuletzt gesehene
Ansicht, sodass man den Titel unter Umständen gar nicht mehr zu Gesicht bekommt.
Geschützt wird der Bereich durch die PIN, nicht durch das Verstecken der Tür –
deshalb sagt die App deutlich, solange keine gesetzt ist.
Enthält: Profile verwalten, Downloads verwalten/löschen, neue Hörbücher suchen,
Diagnose (ist das NAS erreichbar?), PIN setzen, alles zurücksetzen, Abmelden.

**Was jedes Kind darf, steht bei seinem Profil.** Vier Dinge, alle an derselben
Stelle – wer sie sucht, sucht sie beim Kind und nicht in einem eigenen
Abschnitt weiter unten:

| | |
|---|---|
| **Alter** | Gegen die Altersfreigabe am Hörbuch (§5.8). Ohne Alter bleibt alles mit Freigabe verborgen: Wer eine Folge auf „ab 12" setzt, will sie vor den Kleinen verbergen und nicht erst noch bei jedem Profil eine Zahl nachtragen müssen. Freigeben heisst hier also: das Alter eintragen. |
| **Einzelne Hörbücher sperren** | Für die Ausnahme, für die kein Alter etwas hergibt – eine Folge, die ausgerechnet diesem Kind Angst macht. |
| **Darf herunterladen** | Wie bisher, Vorgabe aus (R8). |
| **Darf das Profil wechseln** | Vorgabe **aus**. Auf dem Familientablett wird einmal ausgewählt, wer zuhört, und danach bleibt es dabei. Ein Kind, das zwischen den Profilen hin- und herspringt, verliert seine Stellen und findet fremde Bücher unter „Weiterhören". Der Weg zurück zur Auswahl steht im Elternbereich und liegt damit hinter der PIN. |

**Der Kinderbereich zeigt davon nichts.** Kein „gesperrt"-Schild, keine graue
Kachel, keine Meldung: Was nicht erlaubt ist, ist einfach nicht da. Ein Schild
wäre eine Auskunft über etwas, das das Kind ohnehin nicht bekommt – und in einer
App, die zwei Taps bis zum Ton verspricht, ist es genau die Ablenkung, die dort
nicht hingehört.

„Neue Hörbücher suchen" lässt bewusst das NAS seine Ordner lesen und wartet auf
das Ergebnis, statt nur den Katalog neu zu holen. Der Unterschied ist der
einzige, der hier zählt: Ein Ordner, der gerade erst aufs NAS kopiert wurde,
steht im Katalog noch gar nicht drin. Wer nichts drückt, wartet auf den
selbsttätigen Durchgang des Dienstes – der Knopf spart diese Wartezeit, mehr
nicht.

**Ein Stockwerk darüber liegt der Adminbereich.** Der Elternmodus ist für alle,
die das Tablet verwalten; der Adminbereich für das eine Konto, das über Zugänge
entscheidet – und darüber, wie die Sammlung aussieht. Er enthält die Dinge,
die es sonst nirgends gibt:

| | |
|---|---|
| **Zugriffsanfragen** | Wer sich mit einer fremden Adresse anmeldet, erscheint hier mit Namen und Adresse. Ein Tap gibt frei. Vorher stand auf dem Sperrbildschirm eine UID zum Abschreiben, die von Hand in die Firebase-Konsole gehörte – der einzige Schritt der ganzen App, der einen Rechner verlangte. |
| **Titel** | Was die Automatik aus §5.3 falsch aufräumt, lässt sich hier hinschreiben. Der Eintrag gilt für alle Geräte und alle Kinder. |
| **Altersfreigabe** | „Ab wie vielen Jahren" – je Reihe in zwei Taps, je Hörbuch einzeln (§5.8). Die Freigabe gehört zum Buch und gilt für die ganze Familie; wem sie ein Buch wegnimmt, entscheidet das Alter beim Profil. |
| **Cover** | Wo auf dem NAS kein Bild liegt, lässt sich hier eines hochladen. Für ein Kind, das noch nicht liest, ist das Cover der Name des Hörbuchs – eine farbige Buchstabenkachel ist der Notbehelf, nicht das Ziel. |
| **Ordner** | Ein Ordner mit vielen Dateien ist entweder ein Hörbuch mit Kapiteln oder eine Sammlung ganzer Folgen. Hier wird umgestellt, welches von beidem (§6.4). |
| **Gehört** | Wer hat was wie oft gehört – je Profil, mit den meistgehörten Folgen. Beantwortet die Frage, die sich zu Hause tatsächlich stellt („läuft eigentlich immer nur dieselbe Folge?"), ohne ein Protokoll über den Tag eines Kindes anzulegen: gezählt werden Starts und abgespielte Sekunden, sonst nichts. |

**Warum Cover und Ordner in die App gehören und nicht aufs NAS.** Beides liesse
sich dort erledigen – eine `cover.jpg` in den Ordner legen, eine `buch.json`
danebenschreiben. Nur heisst das: Rechner aufklappen, Freigabe verbinden,
Ordner suchen. Die Hürde ist hoch genug, dass es liegen bleibt, und dann steht
in der Bibliothek eben ein Jahr lang eine Buchstabenkachel. In der App sind es
drei Taps vom Sofa aus.

**Geschrieben wird dabei trotzdem nichts auf dem NAS.** Der Hörbuch-Ordner
bleibt nur lesend eingebunden – das ist die Zusage, die den Dienst überhaupt
erst unbedenklich macht: Er kann eine Sammlung nicht kaputtmachen, auch nicht
durch einen Fehler. Hochgeladene Cover und umgestellte Ordner liegen deshalb im
Cache-Volume des Dienstes. Sie überleben Neustarts und jeden Scan, und wer sie
loswerden will, nimmt sie dort wieder weg, wo er sie gesetzt hat.

Wer nicht das Administratorkonto ist, sieht den Eingang gar nicht erst – und
bekäme dort auch nichts zu lesen: Die Firestore-Regeln geben die Listen nur einer
einzigen, im Deployment hinterlegten Adresse heraus (§9.1).

**Auf dem eigenen Telefon lässt sich die PIN merken.** Beim Eingeben steht
„Auf diesem Gerät merken" – dann geht der Elternbereich hier ohne Eingabe auf,
bis ihn jemand darin wieder sperrt. Das ist der Unterschied zwischen dem eigenen
Telefon und dem Kindertablett: Auf dem eigenen Gerät ist die PIN ein Hindernis
ohne Zweck, denn wer das Telefon entsperrt hat, ist ohnehin schon drin; auf dem
Tablett ist sie der ganze Zweck. Deshalb entscheidet das nicht eine Einstellung
im Voraus für beide Geräte, sondern jedes Gerät für sich – und der Vermerk liegt
in `localStorage`, nicht in Firestore.

**Was die PIN ist und was nicht.** Sie hält ein Kind vom Elternbereich fern.
Sie ist keine Sicherheitsgrenze: Wer das Gerät in der Hand hat, ist ohnehin
angemeldet, und vier Ziffern sind zehntausend Möglichkeiten. Gespeichert wird
sie trotzdem nicht im Klartext und abgeleitet mit PBKDF2 – das kostet nichts
und macht aus dem Durchprobieren wenigstens Arbeit. Versprochen wird damit
nichts, was nicht eingehalten werden kann.

**Eine vergessene PIN sperrt niemanden aus.** Wer sich frisch angemeldet hat,
kommt einmal ohne PIN hinein und kann eine neue setzen. Das ist die richtige
Hürde: Anmelden kann sich, wer das Konto kennt – ein Kind nicht.

**Der Titel bleibt eine Überschrift.** Ihn zum Knopf zu machen wäre der
naheliegende Weg und der falsche: Die Seite verlöre ihre Hauptüberschrift. Für
Tastatur und Vorleseprogramm steht daneben ein eigener Knopf, den nur sie zu
sehen bekommen – ein Eingang, den nur der Finger kennt, wäre für sie keiner.

### 5.8 Wer darf welches Hörbuch hören?

Zwei Schrauben, und sie greifen unabhängig voneinander:

**Die Altersfreigabe hängt am Hörbuch** und gilt für die ganze Familie. Sie
steht im Adminbereich, weil sie zur Bibliothek gehört und nicht zu einem Gerät:
„Der Feuerkelch ist ab 12" ist eine Aussage über das Buch. Gesetzt wird sie auf
einer kurzen Leiter – 3, 6, 8, 10, 12, 14, 16.

**Die Einheit dort ist die Reihe, nicht der Bildschirm.** Der Abschnitt zeigt
zuerst die Reihen mit ihrer Länge und mit dem, was in ihnen gerade gilt; zwei
Taps setzen „Die drei ??? ab 10", alle zweihundert Folgen. Zuerst stand dort
ein Knopf „alle hier gezeigten auf einmal", und der griff nur auf die
fünfundzwanzig, die die Liste zeigte – für eine Reihe mit zweihundert Folgen
hiess das achtmal suchen und achtmal tippen, ohne Anzeige, was noch fehlt. Die
Liste der Reihen ist ausserdem kurz genug, um darin zu suchen; die der
neunhundert Hörbücher ist es nicht, und deshalb erscheint sie erst nach einer
Suche.

Bei einer Suche setzt der Knopf einer Reihe nur ihre Treffer, und die Karte
sagt das („3 von 209 Folgen"): Wer „Weihnachten" sucht, meint die drei
Weihnachtsfolgen und nicht zweihundert. Gilt in einer Reihe mehr als eine
Stufe, steht das da – „Gemischt: ohne, ab 8" –, denn „gemischt" allein liesse
offen, was zu tun ist.

Geschrieben wird das als **ein** Stapel je 400 Folgen (`writeBatch`), nicht als
zweihundert einzelne Schreibvorgänge: Ein Stapel ist ein Netzgang statt
zweihundert und geht ganz oder gar nicht durch – es bleiben also keine halb
gesetzten zweihundert Folgen zurück, an denen sich niemand mehr auskennt.

**Die Sperre hängt am Profil** und gilt nur für dieses Kind. Sie ist für die
Ausnahme, für die kein Alter etwas hergibt.

Ein Hörbuch erscheint also, wenn es nicht für dieses Kind gesperrt ist **und**
entweder keine Freigabe hat oder das eingetragene Alter mindestens so hoch ist.
Ohne Alter beim Profil bleibt alles mit Freigabe verborgen – siehe §5.7.

**Gefiltert wird an einer Stelle**, im `LibraryProvider`. Er gibt zwei Listen
heraus: `books`, was dieses Kind sehen darf, und `allBooks`, den ganzen Katalog
für Eltern- und Adminbereich. Jeder Bildschirm liest `books` und muss von
Altersfreigaben nichts wissen. Auch `bookById` hängt daran, und das ist der
Grund für diesen Aufbau: Die App startet dort, wo man aufgehört hat, und ein
gesperrtes Buch liefe über diese gemerkte Adresse sonst doch noch an.

**Ein Schloss ist das nicht, und es gibt sich auch nicht als eines aus.** Wer
das Gerät in der Hand hat, ist angemeldet und kommt mit dem Ticket des
Medien-Dienstes an jede Datei – das gilt hier wie bei der PIN (§9.3). Was diese
Einstellung leistet, ist, Unpassendes aus der Kachelübersicht eines
Sechsjährigen herauszuhalten. Deshalb gilt bei einer Störung auch die
unvorsichtige Richtung: Sind die Freigaben nicht zu lesen, zählt keine – sonst
stünde das Kind bei abgeschaltetem NAS vor einer leeren Bibliothek, und der
häufigste Grund dafür ist kein Umgehungsversuch.

---

## 6. Wiedergabe und Hintergrund-Audio

### 6.1 Wie Hintergrundwiedergabe zustande kommt

- Ein `<audio>`-Element wird beim ersten Tap auf „Play" freigeschaltet und danach
  **nie ersetzt**, nur die `src` gewechselt. Das erhält die Wiedergabe-Erlaubnis
  über Kapitelgrenzen hinweg.
- Ton ist nie stumm und nie lautstärke-0 – Browser stufen das als „spielt nicht"
  ein und beenden die Hintergrundwiedergabe.
- Die installierte PWA (`display: fullscreen`) spielt bei ausgeschaltetem
  Bildschirm weiter. Auf Android hält die aktive Media Session die Wiedergabe
  am Leben, auch wenn die App im Hintergrund ist.
- Kein Wake-Lock während der Wiedergabe: der Bildschirm **soll** ausgehen.

### 6.2 Lockscreen-Steuerung (Media Session API)

```
navigator.mediaSession.metadata = { title: Kapitel, artist: Autor/Sprecher,
                                    album: Buchtitel, artwork: [Cover] }
Handler: play, pause, seekbackward(30), seekforward(30),
         previoustrack, nexttrack, seekto (nur Elternmodus)
setPositionState({ duration, position, playbackRate })  → alle ~5 s
```

Damit funktionieren Lockscreen, Kopfhörer-Tasten, Autoradio und Smartwatch.

### 6.3 Kapitelwechsel ohne Lücke

Der nächste Track wird ab 30 Sekunden vor Ende vorgeladen (`preload`-Element bzw.
Cache-Warmup). Bei `ended` wird sofort die nächste Quelle gesetzt und gestartet.

### 6.4 Dateiformat

Gebaut wird für den vorliegenden Fall: **ein Ordner pro Buch mit nummerierten
MP3-Dateien**, jede Datei ein Kapitel. Dauer, Titel, Autor und das eingebettete
Cover liest der Scanner aus den ID3-Tags.

**Zwei andere Ablagen kommen auf jedem gewachsenen NAS trotzdem vor**, und
beide sahen in der Bibliothek falsch aus:

*Ein Buch über zwanzig `CD`-Ordner.* Jeder Ordner wurde ein Buch – die Reihe
„Harry Potter" bestand aus „CD 1", „CD 10", „CD 11". Der Scanner fasst
Unterordner, die alle `CD 1`, `Teil 2` … heissen, jetzt zu einem Buch zusammen.
Verlangt wird dafür das Wort: Blosse Nummern (`01`, `02`) und `Folge 1` bleiben
eigene Bücher – so legen andere Sammlungen ihre Folgen ab, und aus zwanzig
Folgen dürfte nie ein Buch werden.

*Neunzig Folgen als neunzig Dateien in einem Ordner.* Das ergab ein Hörbuch von
hundert Stunden mit neunzig „Kapiteln"; eine bestimmte Folge zu finden hiess,
in einer Kapitelliste zu suchen. Mit `{"einzelfolgen": true}` in der `buch.json`
wird jede Datei ein eigenes Hörbuch, der Ordner zur Reihe, und Titel und Nummer
kommen aus dem Dateinamen.

**Warum das eine Ansage ist und keine Automatik.** Von aussen sieht ein Roman
mit langen, benannten Kapiteln genauso aus wie eine Folgensammlung: numerierte
Dateien, je eine halbe Stunde, jede mit eigenem Titel. Ein Fehlgriff wäre
einseitig teuer – aus einem Buch würden zwölf, die Reihenfolge ginge verloren,
gemerkte Stellen zeigten ins Leere. Eine Zeile in einer Datei auf dem NAS ist
dagegen in einer halben Minute geschrieben.

**Seit M10 geht dasselbe auch ohne NAS-Zugriff:** Der Adminbereich listet die
Ordner mit mehreren Dateien, die längsten zuerst, und stellt sie auf Knopfdruck
um (§5.7). Die Wahl liegt im Cache-Volume des Dienstes und schlägt die
`buch.json` – an eine Datei auf dem NAS kommt nicht jeder heran, an den
Adminbereich schon.

Im Katalog bleiben `files[]` (was geladen wird) und `chapters[]` (was das Kind
sieht) trotzdem getrennte Listen, auch wenn sie hier 1:1 aufeinander abbilden.
Das kostet nichts und hält die Tür offen: Kämen später M4B-Dateien mit
eingebetteten Kapiteln dazu, wären das mehrere `chapters` auf einer `file` – der
Player-Code bliebe unverändert, nur der Scanner bekäme einen zweiten Zweig.

---

## 7. Fortschritt und Wiederaufnahme

Das ist das Herzstück. Entsprechend redundant ausgelegt.

### 7.1 Speichern

| Wann | Wohin |
|---|---|
| alle 5 Sekunden während der Wiedergabe | IndexedDB (lokal) |
| bei Pause, Kapitelwechsel, Buchwechsel | IndexedDB, Firestore gedrosselt |
| bei `visibilitychange` (App in den Hintergrund) | IndexedDB **und** Firestore sofort |
| bei `pagehide` / `freeze` | IndexedDB **und** Firestore sofort |
| höchstens alle 30 Sekunden pro Buch | Firestore |

Lokal wird **immer zuerst** geschrieben. Firestore hat Offline-Persistenz
aktiviert (`persistentLocalCache`), gepufferte Schreibvorgänge gehen automatisch
raus, sobald wieder Netz da ist.

Die Drosselung sitzt vor Firestore, nicht vor IndexedDB: Lokal zu schreiben
kostet nichts, ein Cloud-Schreibvorgang wird gezählt – und für „weiterhören auf
dem anderen Gerät" reicht eine Stelle, die dreissig Sekunden alt ist, vollkommen
aus. Jedes Buch hat dabei seinen eigenen Takt, damit ein Buchwechsel nicht
warten muss. Wartet beim Wegwischen der App noch ein Stand, geht er sofort
hinaus statt am Ende der Drosselung.

### 7.2 Position robust ablegen

Gespeichert wird **beides**:

- `positionSec` – globale Sekunde im gesamten Buch (geräteunabhängig, überlebt
  Umbenennungen und Re-Encodes einigermassen)
- `fileIdx` + `offsetSec` – exakte Stelle, gültig solange `filesHash` passt

Beim Fortsetzen: stimmt `filesHash` → exakte Stelle verwenden. Sonst →
`positionSec` über die kumulierten Dateilängen neu auflösen. So geht nie etwas
verloren, auch wenn die Dateien auf dem NAS mal neu sortiert werden.

Zusätzlich springt die App beim Fortsetzen **5 Sekunden zurück** – erleichtert das
Wiedereinsteigen und ist der Standard, den alle guten Hörbuch-Apps haben.

### 7.3 Konflikte zwischen Geräten

**Der jüngere Stand gewinnt** – nicht der zuletzt beim Server eingetroffene.
Entschieden wird über `updatedAt`, den Zeitstempel des Geräts, das zugehört hat.

Das ist die eine Stelle, an der die ursprüngliche Skizze („Server-Zeitstempel")
nicht trägt, und der Grund liegt in der Offline-Fähigkeit: Ein Tablet, das eine
Woche im Flugmodus lag, schiebt beim nächsten Einschalten seine gepufferten
Schreibvorgänge hinaus. Nach Server-Ankunft wären das die „neuesten", obwohl
dort seit einer Woche niemand zugehört hat – die Stelle auf dem Handy würde
zurückgesetzt. Der Preis dafür ist eine Abhängigkeit von der Gerätezeit; bei
Android-Geräten mit Netzzeit ist das unkritisch.

Weil Firestore selbst nicht zusammenführt, sondern überschreibt, kann ein solcher
Nachzügler das Dokument trotzdem kurzzeitig auf den alten Stand setzen. Dagegen
hilft ein zweiter Schritt: Sieht ein Gerät beim Abgleich, dass die Cloud hinter
seinem eigenen Stand zurückliegt, legt es ihn wieder hin. **Der Abgleich
repariert sich damit von selbst**, sobald ein Gerät mit dem jüngeren Stand
online ist.

Bleibt der eigentliche Fall: Geschwister hören dasselbe Buch auf zwei Geräten.
Die Lösung ist dort nicht kompliziertere Logik, sondern **getrennte
Kinderprofile** – dafür sind sie da.

Wichtig bleibt in allen Fällen die Reihenfolge: **lokal ist die Wahrheit, die
Cloud ist die Ergänzung.** Ohne Netz, ohne Freigabe oder ohne Firebase läuft die
App unverändert weiter; der Abgleich ist das Einzige, was dann fehlt. Im
Elternbereich steht, was er gerade tut – für das Kind bleibt er unsichtbar.

### 7.4 „Fertig gehört"

Ab 97 % gilt ein Buch als beendet: Haken in der Bibliothek, verschwindet aus
„Weiterhören", startet beim nächsten Tap wieder von vorn.

---

## 8. Offline-Download

### 8.1 Ablauf

1. Eltern (oder Kind, wenn freigegeben) tippen im Buch auf „Herunterladen".
2. App holt ein frisches Media-Ticket und lädt alle Dateien des Buchs **nacheinander**.
3. Jede fertige Datei landet in Cache Storage unter ihrer **kanonischen URL ohne
   Ticket** (`/audio/{bookId}/{fileIdx}`).
4. Download-Status pro Datei in IndexedDB → Abbruch und Fortsetzen sind möglich,
   ohne alles neu zu laden.
5. Cover und Katalogeintrag werden mitgespeichert.

### 8.2 Im Hintergrund

Wo es sie gibt – auf Android in Chrome – übernimmt die **Background Fetch API**
den Transfer, und das ist ein grosser Unterschied:

- Der Download wird an das Betriebssystem übergeben und läuft weiter, **auch wenn
  die App geschlossen oder das Gerät gesperrt wird**.
- Android zeigt eine eigene Fortschrittsbenachrichtigung, die das Kind (oder die
  Eltern) abbrechen kann.
- Nach Abschluss weckt Android den Service Worker, der die Dateien in den Cache
  übernimmt und den Status in IndexedDB auf `done` setzt.
- Unterbrochene Downloads nimmt das System selbst wieder auf, sobald wieder
  WLAN da ist.

„Hörbuch für die Reise laden" heisst damit schlicht: antippen und weglegen.

Der Download im Vordergrund bleibt daneben bestehen – für Geräte ohne
Background Fetch, für den Desktop-Browser, und für den Fall, dass das System
die Übergabe ablehnt (kein Platz, schon in der Schlange). Die App probiert erst
den einen Weg und nimmt dann den anderen; im Elternbereich steht, welcher es
gerade ist.

Fortsetzbar ist beides ohne eigenes Buchhalten: Was schon im Cache liegt, wird
übersprungen. Ein abgebrochener Download muss sich deshalb nicht merken, wo er
war – er sieht es.

**Das Cover geht nicht mit in die Übergabe.** Android bricht ab, sobald mehr
ankommt als angekündigt, und die Grösse des Covers steht nicht im Katalog. Es
sind ein paar Dutzend Kilobyte, die die App sofort selbst holt, solange sie
noch offen ist.

**Der Service Worker legt ab, nicht das Fenster.** Wenn Android fertig ist, ist
die App vielleicht längst geschlossen – die Dateien in den Cache zu übernehmen
und den Stand fortzuschreiben, muss deshalb dort passieren. Ist ein Fenster
offen, bekommt es eine Nachricht und zieht nach.

### 8.3 Abspielen von heruntergeladenen Büchern

Die App fragt vor jedem Track: liegt er im Cache?

- **Ja** → Object-URL auf den Blob aus dem Cache. Kein Netzwerk, kein Service
  Worker, kein Ticket, kein abgelaufenes Ticket.
- **Nein** → signierte Stream-URL vom NAS.

**Gefragt wird synchron, vorbereitet wird beim Start.** Das ist keine
Feinheit: Der Player fragt in dem Moment nach der Adresse, in dem das Kind
tippt. Läge dort ein `await`, ginge die Nutzergeste verloren – und Android
verweigert die Wiedergabe dann. Die Object-URLs für alles, was auf dem Gerät
liegt, werden deshalb einmal beim App-Start angelegt und bis zum Löschen
gehalten. Ein Blob aus Cache Storage liegt auf der Platte, nicht im
Arbeitsspeicher; die Adresse dafür kostet nichts.

Der Umweg über den Blob statt über eine vom Service Worker abgefangene Anfrage
ist bewusst gewählt: Ein `<audio>`-Element stellt Range-Requests, und die müsste
der Service Worker aus der vollständigen Cache-Antwort selbst als `206 Partial
Content` nachbauen. Bei einzelnen Kapitel-MP3s von 20–30 MB ist der Blob
einfacher, schneller und hat eine Fehlerquelle weniger.

### 8.4 Speicher

- `navigator.storage.persist()` beim ersten Download anfordern – verhindert, dass
  das Betriebssystem den Cache bei Speicherdruck wegräumt.
- `navigator.storage.estimate()` vor dem Download prüfen und warnen, wenn es eng wird.
- Im Elternmodus: Liste der heruntergeladenen Bücher mit Grösse und „Löschen".

Auf Android gewährt Chrome einer installierten PWA typischerweise einen grossen
Teil des freien Gerätespeichers, und `persist()` wird bei installierten Apps in
der Regel ohne Rückfrage gewährt. Das Kontingent ist damit praktisch das, was auf
dem Tablet frei ist – nicht die App ist die Grenze, sondern das Gerät.

Trotzdem gilt: Die App prüft vor jedem Download, ob genug Platz da ist, erkennt
nachträglich fehlende Dateien und bietet stilles Neu-Herunterladen an, statt
einen Fehler zu zeigen.

---

## 9. Sicherheit und Urheberrecht

Die Inhalte sind urheberrechtlich geschützt. Die App ist eine private
Familienlösung, kein Verteildienst. Entsprechend:

### 9.1 Zugangskontrolle

> **Wichtig:** Sobald die Google-Anmeldung aktiv ist, kann sich grundsätzlich
> jeder mit einem Google-Konto *anmelden*. Das lässt sich nicht verhindern und
> ist auch nicht nötig – entscheidend ist, dass ein angemeldetes Konto ohne
> Freigabe **nichts** sieht und **nichts** ablegen kann. Der eigentliche Riegel
> ist deshalb die Freigabeliste, nicht die abgeschaltete Registrierung.

| Ebene | Massnahme |
|---|---|
| **Freigabeliste** | Firestore-Kollektion `allowlist`, ein Dokument je erlaubter UID. Geschrieben wird sie ausschliesslich vom Administratorkonto. Ohne Eintrag verweigern die Firestore-Regeln jeden Zugriff. |
| **Administrator** | Ein einziges Konto, erkannt an der E-Mail-Adresse im Anmelde-Token (`email_verified` zwingend). Die Adresse wird beim Deployen der Regeln aus einem Geheimnis eingesetzt und steht nicht im öffentlichen Repository – siehe [`FIREBASE-DEPLOY.md`](./FIREBASE-DEPLOY.md). Es ist das einzige Konto, das freigeben, Titel setzen und die Hörhistorie lesen darf. |
| Registrierung | Zusätzlich in der Firebase-Konsole abschalten (`Authentication → Settings → User actions → Enable create`). Das reduziert den Lärm, ersetzt die Freigabeliste aber nicht. |
| App | Ohne gültigen Login und ohne Freigabe kein Katalog, kein Cover, kein Ton. Ein nicht freigeschaltetes Konto legt eine Anfrage ab (`accessRequests/{uid}`: nur Name, Adresse, Zeitpunkt, Status „offen") und wartet. |
| NAS-Dienst | Prüft jeden Request gegen ein Media-Ticket; ohne gültiges Ticket **401** |
| Ticket | Kurzlebiges JWT (HS256, 8 h), enthält nur die Firebase-UID; signiert mit einem Secret, das nur Netlify-Build und NAS kennen |
| Firestore | Regeln: `users/{uid}/**` nur für genau diese `uid` lesbar/schreibbar |
| CORS | NAS-Dienst akzeptiert nur die Netlify-Origin (und `localhost` im Dev-Modus) |
| Pfade | Der Dienst nimmt **nie** Dateipfade aus der URL entgegen, sondern nur `bookId`/`fileIdx` und schlägt im Katalog-Index nach → Directory Traversal ist strukturell ausgeschlossen |
| Protokoll | Jeder Medienzugriff wird mit UID, Zeit und Datei geloggt |

### 9.2 Der Token-Fluss

```
1. Kind/Eltern eingeloggt  →  Firebase-ID-Token (JWT, 1 h)
2. App:  POST https://media.<domain>/auth/session
         Authorization: Bearer <Firebase-ID-Token>
3. NAS:  prüft Signatur gegen Googles öffentliche JWKS-Schlüssel,
         prüft iss/aud/exp und ob die UID erlaubt ist
         →  { ticket: "<kurzes JWT>", expiresAt: ... }
4. App:  GET .../audio/{bookId}/{fileIdx}?t=<ticket>      (mit Range-Support)
5. Bei 401: Schritt 2 wiederholen, Request neu ausführen (transparent)
```

Warum das Ticket in der URL und nicht im Header: Ein `<audio src="…">` kann keine
eigenen Header setzen, und die Background Fetch API lädt ebenfalls schlicht eine
URL. Die URL ist damit der einzige Ort, an dem die Berechtigung durch Streaming,
Range-Requests und Hintergrund-Download gleichermassen durchkommt. Das Ticket ist
deshalb kurzlebig und enthält keine verwertbaren Daten ausser der UID.

### 9.3 Was nie ins Repository gehört

**Das Repository bleibt öffentlich.** Das ist eine bewusste Entscheidung und für
die Sicherheit der Inhalte unproblematisch – der Schutz liegt im Login und im
Ticket-Mechanismus, nicht in der Geheimhaltung des Quellcodes. Es bedeutet aber,
dass jede einzelne Zeile, die hier landet, für alle lesbar ist. Deshalb gilt
strikt:

| Nie im Repo | Stattdessen |
|---|---|
| Audiodateien, Cover | Bleiben auf dem NAS; `.gitignore` sperrt die Endungen |
| Kataloge mit echten Buchtiteln | Beispieldaten in der Doku sind erfunden (`Die drei ???` steht hier nur als Muster) |
| `HB_TICKET_SECRET`, Service-Account-Keys, Tunnel-Zugangsdaten | Umgebungsvariablen; `.env.example` zeigt nur die Namen |
| Die echte Tunnel-Adresse des NAS | `VITE_MEDIA_BASE_URL` als Netlify-Umgebungsvariable, in der Doku immer `media.example.com` |
| Echte Firebase-UIDs, E-Mail-Adressen, Pfade der Freigaben | Platzhalter |

Die Firebase-Web-Konfiguration (API-Key, Projekt-ID) darf dagegen offen im Code
stehen – sie ist per Design öffentlich, der Schutz kommt von den
Firestore-Regeln und der abgeschalteten Registrierung.

Konkrete Massnahmen im Projekt:

- `.gitignore` sperrt Medien-Endungen, `.env*` und `*-service-account*.json`
- GitHub **Secret Scanning** und **Push Protection** in den Repo-Einstellungen
  aktivieren (bei öffentlichen Repos gratis) – fängt versehentlich committete
  Schlüssel ab, bevor sie draussen sind
- Vor jedem Commit ein Blick in den Diff: keine echten Titel, keine echten Adressen

> Falls du später doch umstellen willst: `Settings → General → Danger Zone →
> Change repository visibility`. Die Architektur ändert sich dadurch nicht.

### 9.4 Rechtlicher Rahmen

Privatkopien im engen Familienkreis sind das eine – ein öffentlich erreichbarer
Streaming-Dienst wäre etwas anderes. Deshalb: Registrierung geschlossen, Konten
nur für die eigene Familie, keine Weitergabe von Zugangsdaten, keine öffentlichen
Links. Diese App bildet genau das ab.

---

## 10. Betrieb und Kosten

| Posten | Kosten | Grenzen |
|---|---|---|
| Netlify | 0 € | 100 GB Traffic/Monat – die App selbst ist wenige MB, Audio läuft nicht darüber |
| Firebase Auth | 0 € | Weit unter jeder Grenze |
| Firestore (Spark) | 0 € | 50 000 Lesevorgänge/Tag; die App braucht ~20 pro Start |
| Cloudflare Tunnel | 0 € | siehe Risiko R1 |
| QNAP | Strom | — |
| Domain (optional) | ~10–15 €/Jahr | Nur nötig für eine schöne feste Tunnel-Adresse |

**Laufende Kosten realistisch: 0 €**, optional eine Domain.

**Deployment:** Push auf `main` → Netlify baut automatisch. Da bei dir
Auto-Publishing gesperrt ist, wird der Build erstellt, aber nicht live geschaltet –
das Veröffentlichen bleibt ein bewusster Klick.

Drei Dinge werden unabhängig voneinander ausgeliefert, und jedes hat seinen
eigenen Weg:

| Teil | Wie es dorthin kommt |
|---|---|
| App | Netlify baut aus `main`; veröffentlicht wird von Hand |
| Firestore-Regeln | GitHub deployt sie bei jeder Änderung an der Vorlage ([`FIREBASE-DEPLOY.md`](./FIREBASE-DEPLOY.md)) |
| Medien-Dienst | GitHub baut das Image für `amd64` und `arm64` und legt es in der GitHub Container Registry ab; ein Wächter auf dem NAS holt es von selbst und startet den Dienst neu – am NAS ist nichts zu tun. Läuft dort schon einer für andere Dienste, genügt ihm das Label an `hb-media`; sonst bringt die `docker-compose.yml` einen mit ([`QNAP-SETUP.md`](./QNAP-SETUP.md#9-aktualisieren)) |

Das ist Absicht: Die App darf sich ändern, ohne das NAS anzufassen, und
umgekehrt. Welcher Stand auf dem NAS läuft, sagt `/health` – ohne die Angabe
bliebe nach einem Update nur Raten.

---

## 11. Risiken und wie wir damit umgehen

| # | Risiko | Auswirkung | Umgang |
|---|---|---|---|
| R1 | Cloudflares Nutzungsbedingungen beschränken das Ausliefern grosser Mengen Nicht-HTML-Inhalte (Audio/Video) über den kostenlosen Proxy | Tunnel könnte theoretisch beanstandet werden | Bei Familiennutzung praktisch unkritisch. Trotzdem: Die Medien-Basis-URL ist **eine Konfigurationsvariable**, der Tunnel ist in 10 Minuten gegen QNAPs eigenes `myQNAPcloud` + Let's Encrypt oder Tailscale austauschbar. |
| R2 | NAS nicht erreichbar (Strom, Internet, Neustart) | Kein Streaming | Katalog und heruntergeladene Bücher funktionieren weiter. Die App zeigt „Nur heruntergeladene Bücher" statt eines Fehlers. |
| R3 | Android räumt Website-Daten bei Speichermangel weg | Heruntergeladenes Buch weg | `persist()` anfordern (bei installierten PWAs meist automatisch gewährt), fehlende Dateien erkennen, stilles Neu-Laden anbieten |
| R4 | Versehentlich committete Zugangsdaten sind im öffentlichen Repo sofort öffentlich | Tunnel oder Firebase-Projekt kompromittiert | Secret Scanning + Push Protection aktivieren, alles Sensible nur in Umgebungsvariablen, Diff-Kontrolle vor dem Commit (Kapitel 9.3) |
| R5 | Upload-Bandbreite zuhause zu klein | Ruckeln beim Streaming | Prüfen: Ein 128-kbit/s-MP3 braucht ~0,13 Mbit/s – selbst schwache Anschlüsse reichen für 2–3 gleichzeitige Streams. Notfalls Transcoding auf dem NAS (Ausbaustufe). |
| R6 | Kind tippt sich aus dem Konto | Kann sich nicht neu anmelden | Kein Logout im Kinderbereich, nur im PIN-geschützten Elternmodus |
| R6b | Kind wechselt das Profil und hört im Namen des Geschwisters weiter | Beide verlieren ihre Stellen, „Weiterhören" zeigt fremde Bücher | `maySwitchProfile` standardmässig **aus**; der Weg zurück zur Auswahl liegt im PIN-geschützten Elternbereich (§5.7) |
| R7 | Katalog wächst, Scan wird langsam | Neue Bücher erscheinen spät | Inkrementeller Scan (nur geänderte Ordner); Metadaten-Ergebnisse werden pro Datei gecacht. Bei MP3s ohne VBR-Header muss die Dauer einmalig durch Lesen der ganzen Datei ermittelt werden – deshalb ist der Cache wichtig, nicht optional. |
| R8 | Ein Kind lädt aus Versehen die halbe Bibliothek herunter | Tablet voll | Downloads pro Profil freischaltbar (`allowDownload`); Speicherwarnung vor dem Start; Übersicht mit Grössen im Elternmodus |

---

## 12. Roadmap

Jeder Meilenstein ist ein eigener Pull Request und für sich lauffähig.

| M | Inhalt | Ergebnis |
|---|---|---|
| **M0** | Konzept (dieses Dokument) | Gemeinsames Verständnis ✅ |
| **M1** | Projektgerüst: Vite/React/TS/Tailwind, Manifest, Icons, Service Worker, `netlify.toml`, GitHub-Actions-CI | App ist auf Netlify installierbar ✅ |
| **M2** | Firebase Auth, dauerhafte Session, Profilwahl, geschützte Routen | Login funktioniert, Kind wählt Avatar ✅ |
| **M3** | NAS-Dienst `hb-media` (Docker) + ID3-Scanner + Tunnel, `/library`, `/cover`, `/audio` | Katalog und Audio sind authentifiziert abrufbar ✅ (Code fertig; Deployen aufs NAS steht aus) |
| **M4** | Bibliothek und Buchseite im Kinderdesign | Bücher sind sichtbar und auswählbar ✅ |
| **M5** | Player, Media Session, Hintergrundwiedergabe, lokale Fortschrittsspeicherung | **Die App ist benutzbar** ✅ |
| **M6** | Firestore-Sync des Fortschritts über Geräte | Weiterhören auf jedem Gerät ✅ |
| **M7** | Offline-Download über Background Fetch, Cache Storage, Verwaltung im Elternmodus | Reisetauglich ✅ |
| **M8** | Sleep-Timer ✅, Elternmodus mit PIN ✅, Feinschliff ✅, Barrierefreiheit ✅ | Fertig für den Alltag ✅ |
| **M9** | Bibliothek nach Reihen, aufgeräumte Titel, Startseite als Dashboard (Favoriten, Vorschläge), Adminbereich mit Freigaben, Titeln und Hörhistorie, Spulen im Player, Regel-Deployment über GitHub | Aus „läuft" wird „macht Freude" ✅ |
| **M10** | Die Sammlung von der App aus in Form bringen: Reihen direkt auf der Startseite, CD-Ordner als ein Buch, Ordner mit ganzen Folgen aufteilen, Cover hochladen – beides auch im Adminbereich, ohne ans NAS zu müssen | Eine gewachsene Sammlung sieht aus wie eine gepflegte ✅ |
| **M11** | Wer darf was: Altersfreigabe je Hörbuch, Alter und einzelne Sperren je Profil, gesperrter Profilwechsel, PIN auf dem eigenen Gerät merkbar (§5.7, §5.8) | Jedes Kind sieht seine Bibliothek – und nur die ✅ |

**Realistische Reihenfolge-Logik:** Nach M5 ist die App für ein Kind zuhause im
WLAN bereits vollständig nutzbar. M6–M8 sind Komfort, der aber den Unterschied
zwischen „funktioniert" und „wird täglich benutzt" ausmacht.

Ausbaustufen danach (nicht eingeplant, nur notiert): Cast/Sonos, Transcoding auf
dem NAS, Katalogspiegel in Firestore, Wiedergabegeschwindigkeit.

---

## 13. Geklärt und noch offen

### Geklärt

| Frage | Antwort | Auswirkung |
|---|---|---|
| Zielgeräte | Nur Android | Background Fetch statt iOS-Kompromissen (Kapitel 8.2); Risiken R3/R4 alter Fassung entfallen |
| Audioformat | Ordner mit MP3s | Scanner ohne `ffmpeg`; Metadaten aus ID3-Tags (Kapitel 6.4) |
| Container Station | Läuft bereits | Medien-Dienst als Docker-Image mit `docker-compose.yml` |
| Repo-Sichtbarkeit | Bleibt öffentlich | Verschärfte Commit-Disziplin, Secret Scanning (Kapitel 9.3) |

### Noch offen – blockiert M1 nicht

Diese Punkte brauche ich erst später; ich baue bis dahin mit sinnvollen
Vorgaben weiter.

| # | Frage | Gebraucht ab | Vorgabe, solange keine Antwort |
|---|---|---|---|
| **F1** | Wie viele Bücher, wie viel GB insgesamt? | M3 | Scanner wird inkrementell gebaut und skaliert bis einige Tausend Dateien |
| **F2** | Eigene Domain für den Tunnel, oder Cloudflare-Subdomain? | M3 | Ich plane mit einer Cloudflare-Subdomain; ein Wechsel ist eine Änderung an einer Umgebungsvariablen |
| **F3** | Wie viele Kinderprofile, und dürfen Kinder selbst herunterladen? | M2 / M7 | Beliebig viele Profile möglich; `allowDownload` standardmässig **aus**, im Elternmodus pro Kind einschaltbar |
| **F4** | Sollen die Kinder unterschiedliche Bücher sehen („nur diese für Emma")? | ~~Ausbaustufe~~ M11 | **Beantwortet:** ja. Altersfreigabe je Hörbuch im Adminbereich, Alter und einzelne Sperren je Profil im Elternbereich (§5.8) |

---

## Verwandte Dokumente

- [`DATENMODELL.md`](./DATENMODELL.md) – Katalog-Schema, Firestore-Struktur, API-Verträge, NAS-Ordnerkonvention
- [`FIREBASE-DEPLOY.md`](./FIREBASE-DEPLOY.md) – Firestore-Regeln aus GitHub deployen: Dienstkonto, Rollen, Geheimnisse
