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
  über Kapitelgrenzen hinweg.
- Ton ist nie stumm und nie lautstärke-0 – Browser stufen das als „spielt nicht"
  ein und beenden die Hintergrundwiedergabe.
- Die installierte PWA (`display: standalone`) spielt bei ausgeschaltetem
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

### 8.2 Im Hintergrund

Da nur Android-Geräte im Einsatz sind, steht die **Background Fetch API** zur
Verfügung – und das ist ein grosser Unterschied:

- Der Download wird an das Betriebssystem übergeben und läuft weiter, **auch wenn
  die App geschlossen oder das Gerät gesperrt wird**.
- Android zeigt eine eigene Fortschrittsbenachrichtigung, die das Kind (oder die
  Eltern) abbrechen kann.
- Nach Abschluss weckt Android den Service Worker, der die Dateien in den Cache
  übernimmt und den Status in IndexedDB auf `done` setzt.
- Unterbrochene Downloads nimmt das System selbst wieder auf, sobald wieder
  WLAN da ist.

„Hörbuch für die Reise laden" heisst damit schlicht: antippen und weglegen.

Als Rückfallebene bleibt der Download im Vordergrund (Datei für Datei per
`fetch`, Fortschritt in IndexedDB), falls Background Fetch auf einem Gerät
fehlt oder scheitert. Der gleiche Code deckt auch den Desktop-Browser ab.

### 8.3 Abspielen von heruntergeladenen Büchern

Die App fragt vor jedem Track: liegt er im Cache?

- **Ja** → Blob aus dem Cache holen, `URL.createObjectURL()`, abspielen. Kein
  Netzwerk, kein Service Worker, kein Ticket, kein abgelaufenes Ticket.
- **Nein** → signierte Stream-URL vom NAS.

Object-URLs werden beim Trackwechsel wieder freigegeben.

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
| **Freigabeliste** | Firestore-Kollektion `allowlist`, ein Dokument je erlaubter UID. Nur von Hand in der Firebase-Konsole pflegbar (`allow write: if false`). Ohne Eintrag verweigern die Firestore-Regeln jeden Zugriff. |
| Registrierung | Zusätzlich in der Firebase-Konsole abschalten (`Authentication → Settings → User actions → Enable create`). Das reduziert den Lärm, ersetzt die Freigabeliste aber nicht. |
| App | Ohne gültigen Login und ohne Freigabe kein Katalog, kein Cover, kein Ton. Ein nicht freigeschaltetes Konto sieht seine UID zum Übertragen in die Konsole. |
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
| **M6** | Firestore-Sync des Fortschritts über Geräte | Weiterhören auf jedem Gerät |
| **M7** | Offline-Download über Background Fetch, Cache Storage, Verwaltung im Elternmodus | Reisetauglich |
| **M8** | Sleep-Timer, Elternmodus mit PIN, Feinschliff, Barrierefreiheit | Fertig für den Alltag |

**Realistische Reihenfolge-Logik:** Nach M5 ist die App für ein Kind zuhause im
WLAN bereits vollständig nutzbar. M6–M8 sind Komfort, der aber den Unterschied
zwischen „funktioniert" und „wird täglich benutzt" ausmacht.

Ausbaustufen danach (nicht eingeplant, nur notiert): Serien-Ansicht mit
Reihenfolge, „Nur diese Bücher für dieses Kind", Cast/Sonos, Transcoding auf dem
NAS, Katalogspiegel in Firestore, Wiedergabegeschwindigkeit.

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
| **F4** | Sollen die Kinder unterschiedliche Bücher sehen („nur diese für Emma")? | Ausbaustufe | Alle Profile sehen alles; Einschränkung wäre eine spätere Erweiterung |

---

## Verwandte Dokumente

- [`DATENMODELL.md`](./DATENMODELL.md) – Katalog-Schema, Firestore-Struktur, API-Verträge, NAS-Ordnerkonvention
