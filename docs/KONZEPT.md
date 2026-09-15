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
 │ │  · Scanner (ffprobe: Dauer, Kapitel, Tags)      │ │
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
| PWA | `vite-plugin-pwa` im `injectManifest`-Modus | Manifest + Workbox-Precache automatisch, aber eigener Service Worker für die Audio-Logik | `generateSW` (kein Platz für eigene Range-/Cache-Logik) |
| State | Zustand (Player-Store) + React Query-artiger Cache für Katalog | Sehr klein, kein Boilerplate | Redux (Overkill) |
| Audio | **Ein einziges** `<audio>`-Element, wiederverwendet | iOS erlaubt Wiedergabe nur nach Nutzergeste; ein wiederverwendetes Element behält die Freigabe über Kapitelwechsel | Neues Element pro Track (bricht auf iOS) |
| Hintergrund/Lockscreen | Media Session API | Lockscreen-Cover, Titel, Play/Pause, ±30 s, Kapitelwechsel | Nichts (Bedienung nur in der App) |
| Medien-Zugriff | Kurzlebiges **Media-Ticket** in der URL (`?t=…`) | Funktioniert für `<audio src>`, Range-Requests, Downloads und auf iOS – im Gegensatz zu Authorization-Headern | Header (auf iOS bei Media-Elementen unzuverlässig), Cookies (nur bei eigener Domain sauber) |
| Offline-Speicher | **Cache Storage** für Audio, IndexedDB für Metadaten | Cache Storage ist für grosse Responses gebaut; Metadaten gehören in eine Datenbank | Alles in IndexedDB (Blob-Handling umständlicher) |
| Offline-Wiedergabe | Blob aus dem Cache holen und per Object-URL abspielen | Umgeht die iOS-Schwäche, dass Media-Requests nicht zuverlässig durch den Service Worker laufen | Nur SW-Interception (auf iOS fragil) |
| Katalog | Vom NAS erzeugt, in IndexedDB gespiegelt | Eine Quelle der Wahrheit (der Ordner), trotzdem offline browsebar | Katalog in Firestore pflegen (doppelte Pflege) – siehe Ausbaustufe 7.3 |
| Tunnel | Cloudflare Tunnel (`cloudflared` im Container) | Gratis, kein offener Port, HTTPS inklusive | Portfreigabe + DDNS (Angriffsfläche), Tailscale (Client auf jedem Gerät nötig) |
| NAS-Dienst | Node 20 + Fastify in Docker (Container Station) | Range-Support in wenigen Zeilen, `ffprobe` für Kapitel/Dauer | QNAP Multimedia/DLNA (kein Auth-Modell, das zu Firebase passt) |

---

## 5. Bedienkonzept für Kinder

### 5.1 Nur drei Ebenen – mehr nicht

```
  Profilwahl  →  Start  →  Player
  (nur wenn        │
   mehrere         └→ Bibliothek (Cover-Raster)  →  Player
   Profile)
```

Kein Hamburger-Menü, keine Tabs, keine Modals, kein Suchfeld auf der Kinderseite.
Die Rück-Geste ist immer derselbe grosse Pfeil links oben.

### 5.2 Startbildschirm

Der Startbildschirm ist zu 60 % **eine einzige Kachel**: das zuletzt gehörte Buch,
mit Cover, Fortschrittsring und dem Wort „Weiterhören". Ein Tap startet die
Wiedergabe an der gespeicherten Position – ohne Zwischenseite.

```
 ┌───────────────────────────────┐
 │ ┌───────────────────────────┐ │
 │ │                           │ │
 │ │     [  COVER  GROSS  ]    │ │   ← 1 Tap = weiterhören
 │ │                           │ │
 │ │  >  Weiterhören           │ │
 │ │  ◕ Kapitel 4 · noch 18 Min│ │
 │ └───────────────────────────┘ │
 │                               │
 │ Zuletzt gehört                │
 │ ┌─────┐ ┌─────┐ ┌─────┐       │   ← seitlich scrollbar
 │ │Cover│ │Cover│ │Cover│       │
 │ └─────┘ └─────┘ └─────┘       │
 │                               │
 │ ┌───────────────────────────┐ │
 │ │      Alle Hörbücher       │ │   ← ein grosser Button
 │ └───────────────────────────┘ │
 └───────────────────────────────┘
```

### 5.3 Bibliothek

Raster aus **grossen Covern**, 2 Spalten auf dem Handy, 3–4 auf dem Tablet.
Titel klein darunter, aber das Cover trägt die Erkennung. Bücher mit Fortschritt
bekommen einen Ring, fertige einen Haken, heruntergeladene ein Offline-Symbol.

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
 │  ████████░░░░░░░░░░░░░░░░░░░  │   ← nur Anzeige, nicht ziehbar
 │  12:04                -18:22  │
 │                               │
 │  |<    -30s    >    +30s   >| │
 │  64px   64px  112px  64px     │
 └───────────────────────────────┘
```

**Warum der Fortschrittsbalken nicht ziehbar ist:** Kinder verlieren beim
versehentlichen Wischen ihre Stelle – genau das, was diese App verhindern soll.
Springen geht über Kapitel und ±30 s. Freies Spulen schaltet der Elternmodus frei.

### 5.5 Design-Regeln (verbindlich)

| Regel | Wert |
|---|---|
| Kleinstes Touch-Ziel | 64 × 64 px |
| Play/Pause | 112 × 112 px |
| Schriftgrösse Fliesstext | ≥ 18 px, Titel ≥ 24 px |
| Kontrast | mindestens WCAG AA, Ziel AAA bei Text |
| Abstand zwischen tappbaren Elementen | ≥ 16 px |
| Animationen | ruhig, ≤ 250 ms, respektieren `prefers-reduced-motion` |
| Destruktives | nie im Kinderbereich (kein Löschen, kein Logout, keine Einstellungen) |
| Fehler | nie als Text-Dialog, sondern als Bild + ein Knopf („Nochmal probieren") |
| Zustand merken | Scrollposition, letztes Profil, letzte Ansicht überleben den App-Neustart |

### 5.6 Sleep-Timer

Wichtigstes Elternfeature. Auswahl: 5 / 10 / 15 / 30 / 45 / 60 Minuten oder
„bis Kapitelende". Restzeit gross sichtbar, letzte 20 Sekunden sanftes Ausblenden
der Lautstärke, dann Pause (kein harter Stopp mitten im Satz).

### 5.7 Elternmodus

Erreichbar über langen Druck (2 s) auf das Logo, gesichert mit 4-stelliger PIN.
Enthält: Profile verwalten, Downloads verwalten/löschen, freies Spulen erlauben,
Katalog neu einlesen, Abmelden, Diagnose (ist das NAS erreichbar?).

---

## 6. Wiedergabe und Hintergrund-Audio

### 6.1 Wie Hintergrundwiedergabe zustande kommt

- Ein `<audio>`-Element wird beim ersten Tap auf „Play" freigeschaltet und danach
  **nie ersetzt**, nur die `src` gewechselt. Das erhält die Wiedergabe-Erlaubnis
  auf iOS über Kapitelgrenzen hinweg.
- Ton ist nie stumm und nie lautstärke-0, sonst beendet iOS die
  Hintergrundwiedergabe.
- Die installierte PWA (`display: standalone`) spielt bei ausgeschaltetem
  Bildschirm weiter – auf iOS wie auf Android.
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

### 6.4 Zwei Dateiformate, ein Modell

| Quelle auf dem NAS | Wie die App es sieht |
|---|---|
| Ordner mit `01.mp3`, `02.mp3`, … | Mehrere Dateien, jede Datei = ein Kapitel |
| Eine `buch.m4b` mit eingebetteten Kapiteln | Eine Datei, Kapitel = Sprungmarken (vom Scanner via `ffprobe` ausgelesen) |

Im Katalog gibt es darum getrennt `files[]` (was geladen wird) und `chapters[]`
(was das Kind sieht). Beide Fälle laufen durch denselben Player-Code.

---

## 7. Fortschritt und Wiederaufnahme

Das ist das Herzstück. Entsprechend redundant ausgelegt.

### 7.1 Speichern

| Wann | Wohin |
|---|---|
| alle 5 Sekunden während der Wiedergabe | IndexedDB (lokal) |
| bei Pause, Kapitelwechsel, Buchwechsel | IndexedDB **und** Firestore |
| bei `visibilitychange` (App in den Hintergrund) | IndexedDB **und** Firestore |
| bei `pagehide` / `freeze` | IndexedDB (synchron, letzte Rettung) |
| alle 30 Sekunden, wenn online | Firestore |

Lokal wird **immer zuerst** geschrieben. Firestore hat Offline-Persistenz
aktiviert (`persistentLocalCache`), gepufferte Schreibvorgänge gehen automatisch
raus, sobald wieder Netz da ist. Kein eigener Sync-Code nötig.

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

Letzter Schreibvorgang gewinnt (`updatedAt`, Server-Zeitstempel). Bewusst
einfach und vorhersehbar. Falls sich das im Alltag als störend erweist
(Geschwister hören dasselbe Buch auf zwei Geräten), ist die Lösung nicht
kompliziertere Logik, sondern **getrennte Kinderprofile** – dafür sind sie da.

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

### 8.2 Im Hintergrund – was geht und was nicht

| Plattform | Verhalten |
|---|---|
| Android / Chrome | **Background Fetch API**: echter Systemdownload mit Benachrichtigung, läuft weiter, wenn die App geschlossen wird |
| iOS / Safari | Keine vergleichbare API. Download läuft nur, solange die App offen ist. Gegenmassnahme: `navigator.wakeLock` hält den Bildschirm an, Fortschritt gross sichtbar, pro Datei fortsetzbar |

Das ist eine echte Plattformgrenze, keine Bequemlichkeit. Auf iPad heisst
„Hörbuch für die Reise laden" also: App offen lassen, bis der Balken voll ist.
Bei einem 300-MB-Hörbuch im WLAN sind das typischerweise ein bis zwei Minuten.

### 8.3 Abspielen von heruntergeladenen Büchern

Die App fragt vor jedem Track: liegt er im Cache?

- **Ja** → Blob aus dem Cache holen, `URL.createObjectURL()`, abspielen. Kein
  Netzwerk, kein Service Worker, kein Ticket. Funktioniert garantiert auch auf iOS.
- **Nein** → signierte Stream-URL vom NAS.

Object-URLs werden beim Trackwechsel wieder freigegeben.

### 8.4 Speicher

- `navigator.storage.persist()` beim ersten Download anfordern – verhindert, dass
  das Betriebssystem den Cache bei Speicherdruck wegräumt.
- `navigator.storage.estimate()` vor dem Download prüfen und warnen, wenn es eng wird.
- Im Elternmodus: Liste der heruntergeladenen Bücher mit Grösse und „Löschen".

**Bekannte Einschränkung:** iOS räumt Website-Daten nach längerer Nichtnutzung
auf. Bei installierten PWAs mit `persist()` ist das deutlich entschärft, aber
nicht ausgeschlossen. Die App erkennt fehlende Dateien und bietet
Neu-Herunterladen an, statt einen Fehler zu zeigen.

---

## 9. Sicherheit und Urheberrecht

Die Inhalte sind urheberrechtlich geschützt. Die App ist eine private
Familienlösung, kein Verteildienst. Entsprechend:

### 9.1 Zugangskontrolle

| Ebene | Massnahme |
|---|---|
| Registrierung | In der Firebase-Konsole **abgeschaltet** (`Authentication → Settings → User actions → Enable create` deaktivieren). Konten werden von Hand angelegt. |
| App | Ohne gültigen Login kein Katalog, kein Cover, kein Ton |
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
eigenen Header setzen, und Range-Requests von Media-Elementen laufen auf iOS
nicht zuverlässig durch den Service Worker. Die URL ist der einzige Weg, der auf
allen Zielgeräten funktioniert. Das Ticket ist deshalb kurzlebig und enthält
keine verwertbaren Daten ausser der UID.

### 9.3 Was nie ins Repository gehört

- Audiodateien, Cover, Kataloge mit echten Titeln
- `HB_TICKET_SECRET`, Firebase-Service-Account-Keys, Tunnel-Credentials
- Die konkrete Tunnel-Adresse des NAS (kommt aus Umgebungsvariablen)

Die `.gitignore` sperrt Medien-Endungen und `.env`-Dateien bereits.

> **Empfehlung: Repository auf `private` umstellen.**
> Es ist aktuell öffentlich. Der Code selbst enthält keine Geheimnisse (die
> Firebase-Web-Konfiguration ist per Design öffentlich), aber die Struktur der
> NAS-Schnittstelle, die Endpunkte und die Betriebsdokumentation müssen nicht für
> jeden lesbar sein. Umstellen unter `Settings → General → Danger Zone → Change
> repository visibility`.

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

---

## 11. Risiken und wie wir damit umgehen

| # | Risiko | Auswirkung | Umgang |
|---|---|---|---|
| R1 | Cloudflares Nutzungsbedingungen beschränken das Ausliefern grosser Mengen Nicht-HTML-Inhalte (Audio/Video) über den kostenlosen Proxy | Tunnel könnte theoretisch beanstandet werden | Bei Familiennutzung praktisch unkritisch. Trotzdem: Die Medien-Basis-URL ist **eine Konfigurationsvariable**, der Tunnel ist in 10 Minuten gegen QNAPs eigenes `myQNAPcloud` + Let's Encrypt oder Tailscale austauschbar. |
| R2 | NAS nicht erreichbar (Strom, Internet, Neustart) | Kein Streaming | Katalog und heruntergeladene Bücher funktionieren weiter. Die App zeigt „Nur heruntergeladene Bücher" statt eines Fehlers. |
| R3 | iOS räumt Offline-Daten weg | Heruntergeladenes Buch weg | `persist()` anfordern, fehlende Dateien erkennen, stilles Neu-Laden anbieten |
| R4 | Kein Hintergrund-Download auf iOS | Laden dauert „sichtbar" | Wake-Lock, klare Fortschrittsanzeige, pro Datei fortsetzbar (Kapitel 8.2) |
| R5 | Upload-Bandbreite zuhause zu klein | Ruckeln beim Streaming | Prüfen: Ein 128-kbit/s-MP3 braucht ~0,13 Mbit/s – selbst schwache Anschlüsse reichen für 2–3 gleichzeitige Streams. Notfalls Transcoding auf dem NAS (Ausbaustufe). |
| R6 | Kind tippt sich aus dem Konto | Kann sich nicht neu anmelden | Kein Logout im Kinderbereich, nur im PIN-geschützten Elternmodus |
| R7 | Katalog wächst, Scan wird langsam | Neue Bücher erscheinen spät | Inkrementeller Scan (nur geänderte Ordner), `ffprobe`-Ergebnisse gecacht |

---

## 12. Roadmap

Jeder Meilenstein ist ein eigener Pull Request und für sich lauffähig.

| M | Inhalt | Ergebnis |
|---|---|---|
| **M0** | Konzept (dieses Dokument) | Gemeinsames Verständnis ✅ |
| **M1** | Projektgerüst: Vite/React/TS/Tailwind, Manifest, Icons, Service Worker, `netlify.toml`, GitHub-Actions-CI | App ist auf Netlify installierbar (noch ohne Inhalt) |
| **M2** | Firebase Auth, dauerhafte Session, Profilwahl, geschützte Routen | Login funktioniert, Kind wählt Avatar |
| **M3** | NAS-Dienst `hb-media` + Scanner + Docker + Tunnel, `/library`, `/cover`, `/audio` | Katalog und Audio sind authentifiziert abrufbar |
| **M4** | Bibliothek und Buchseite im Kinderdesign | Bücher sind sichtbar und auswählbar |
| **M5** | Player, Media Session, Hintergrundwiedergabe, lokale Fortschrittsspeicherung | **Die App ist benutzbar** |
| **M6** | Firestore-Sync des Fortschritts über Geräte | Weiterhören auf jedem Gerät |
| **M7** | Offline-Download (Cache Storage, Background Fetch, Verwaltung) | Reisetauglich |
| **M8** | Sleep-Timer, Elternmodus mit PIN, Feinschliff, Barrierefreiheit | Fertig für den Alltag |

**Realistische Reihenfolge-Logik:** Nach M5 ist die App für ein Kind zuhause im
WLAN bereits vollständig nutzbar. M6–M8 sind Komfort, der aber den Unterschied
zwischen „funktioniert" und „wird täglich benutzt" ausmacht.

Ausbaustufen danach (nicht eingeplant, nur notiert): Serien-Ansicht mit
Reihenfolge, „Nur diese Bücher für dieses Kind", Cast/Sonos, Transcoding auf dem
NAS, Katalogspiegel in Firestore, Wiedergabegeschwindigkeit.

---

## 13. Offene Fragen an dich

Diese Punkte ändern die Umsetzung spürbar – alles andere kann ich selbst entscheiden.

| # | Frage | Warum es zählt |
|---|---|---|
| **F1** | Welches QNAP-Modell, und ist **Container Station** (Docker) verfügbar? | Ohne Docker braucht der Medien-Dienst einen anderen Weg (Node direkt via Entware, oder doch eine Cloud-Zwischenschicht) |
| **F2** | In welchem Format liegen die Hörbücher – **Ordner mit MP3s**, einzelne **M4B**, oder gemischt? | Bestimmt den Scanner und die Kapitel-Logik (Kapitel 6.4) |
| **F3** | Grobe Grössenordnung: wie viele Bücher, wie viel GB insgesamt? | Relevant für Scan-Strategie und Offline-Speicherplanung |
| **F4** | Welche Geräte nutzen die Kinder – **iPad/iPhone**, **Android**, oder beides? | iOS hat die härteren Einschränkungen (Kapitel 8.2); bei reinem Android wird der Download deutlich komfortabler |
| **F5** | Hast du eine **eigene Domain** für den Tunnel, oder soll ich mit einer Cloudflare-Subdomain planen? | Beeinflusst Tunnel-Setup und CORS-Konfiguration |
| **F6** | Wie viele **Kinderprofile**, und sollen Kinder selbst herunterladen dürfen? | Bestimmt Umfang von M2 und M7 |
| **F7** | Soll das Repository auf **privat** umgestellt werden? | Siehe Kapitel 9.3 – meine Empfehlung ist ja |

---

## Verwandte Dokumente

- [`DATENMODELL.md`](./DATENMODELL.md) – Katalog-Schema, Firestore-Struktur, API-Verträge, NAS-Ordnerkonvention
