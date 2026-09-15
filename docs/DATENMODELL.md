# Datenmodell und Schnittstellen

Ergänzung zu [`KONZEPT.md`](./KONZEPT.md). Hier steht das Konkrete: wie die
Ordner auf dem NAS aussehen müssen, welches JSON dabei herauskommt, was in
Firestore liegt und wie die Endpunkte aufgebaut sind.

---

## 1. Ordnerkonvention auf dem QNAP

Ein dedizierter Ordner, vom Dienst **nur lesend** eingebunden:

```
/share/Hoerbuecher/
├── Die drei ???/                          ← oberster Ordner = Reihe
│   ├── 01 - Der Super-Papagei/
│   │   ├── cover.jpg                      ← optional
│   │   ├── buch.json                      ← optional, überschreibt Erkanntes
│   │   ├── 01 - Kapitel 1.mp3
│   │   ├── 02 - Kapitel 2.mp3
│   │   └── 03 - Kapitel 3.mp3
│   ├── 02 - Der Phantomsee/
│   │   ├── cover.jpg
│   │   ├── 01 - Kapitel 1.mp3
│   │   └── 02 - Kapitel 2.mp3
│   └── Mini-Fälle/                        ← Ordner darunter = Gruppe
│       └── Die drei ??? - 05 - Alarm im Zoo/
│           └── 01 - Alarm.mp3
├── Bibi Blocksberg - Hexerei/
│   └── ...
└── .hb-cache/                             ← vom Scanner angelegt
    ├── catalog.json
    └── meta/                              ← gelesene ID3-Daten, hash-basiert
```

**Reihe und Gruppe.** Der oberste Ordner unter dem Medien-Stamm ist die Reihe;
danach kommt die App gliedert. Alles, was dazwischen liegt, ist eine Gruppe
innerhalb dieser Reihe („Adventskalender", „Mini-Fälle") und steht dort als
eigener Abschnitt. Ein Buch direkt im Stamm hat weder Reihe noch Gruppe.

**Womit der Scanner liest:** [`music-metadata`](https://github.com/borewit/music-metadata)
(reines JavaScript, liest ID3v1/ID3v2, Dauer und eingebettete Cover) und
[`sharp`](https://sharp.pixelplumbing.com/) zum Verkleinern der Cover. Kein
`ffmpeg` im Image nötig.

**Regeln des Scanners**

| Situation | Verhalten |
|---|---|
| Ordner enthält Audiodateien | → ist ein Buch |
| Ordner enthält nur Unterordner | → ist Reihe oder Gruppe; der oberste wird `series`, die dazwischen `group` |
| Mehrere Audiodateien | Sortierung nach Dateiname (natürlich, `2` vor `10`) |
| Kapiteltitel | Aus dem ID3-`TIT2`-Tag, sonst aus dem Dateinamen (führende Nummerierung wird entfernt) |
| `cover.jpg` / `cover.png` / `folder.jpg` vorhanden | wird verwendet |
| Kein Cover-File | Eingebettetes Bild aus dem ID3-`APIC`-Frame extrahieren |
| Auch das fehlt | `cover: null` → App generiert eine farbige Buchstabenkachel |
| Ordnername `01 - Titel` | `seriesIndex: 1`, `title: "Titel"` |
| Ordnername beginnt mit dem Reihennamen | Der fliegt heraus: `Die Drei Fragezeichen Kids-68-Chaos` → `seriesIndex: 68`, `title: "Chaos"`. Verglichen wird unempfindlich gegen Artikel, Gross-/Kleinschreibung und Zahlwörter, `Die drei ???` gilt als `Die 3 Fragezeichen` |
| Trennzeichen | `_` wird Leerzeichen; ein Strich gilt als Trenner, wenn Leerraum daneben steht oder auf einer Seite eine Ziffer – `Mini-Fall` behält seinen Bindestrich |
| Ordnername ist danach leer | Dann bleibt der ursprüngliche Name stehen. Lieber einmal zu viel stehen lassen als einen Titel anschneiden |
| `buch.json` vorhanden | Felder daraus haben **Vorrang** vor allem Erkannten |

**`buch.json` (optional, alle Felder optional)**

```json
{
  "title": "Der Super-Papagei",
  "series": "Die drei ???",
  "group": "Mini-Fälle",
  "seriesIndex": 1,
  "author": "Robert Arthur",
  "narrator": "Oliver Rohrbeck",
  "tags": ["Krimi", "ab 8"],
  "hidden": false
}
```

---

## 2. Katalog (`GET /library`)

Vom Scanner erzeugt, von der App in IndexedDB gespiegelt.

> Ein echter Ausgabestand liegt in
> [`examples/catalog.sample.json`](./examples/catalog.sample.json). Beide Seiten
> prüfen dagegen: Der Dienst, dass er ihn so erzeugt, die App, dass sie ihn
> vollständig versteht. Weicht eine Seite ab, schlägt der Test fehl, statt dass
> es im Betrieb auffällt.

```jsonc
{
  "schemaVersion": 2,
  "generatedAt": "2026-09-15T14:29:30Z",
  "books": [
    {
      "id": "b_4f3a9c2e",              // sha1(relativer Pfad), gekürzt – stabil
      "title": "Der Super-Papagei",
      "series": "Die drei ???",        // oberster Ordner = Reihe
      "group": null,                   // Ordner darunter, sonst null
      "seriesIndex": 1,
      "author": "Robert Arthur",
      "narrator": "Oliver Rohrbeck",
      "durationSec": 4123,             // Summe aller Dateien
      "cover": "/cover/b_4f3a9c2e.jpg",// null, wenn keins vorhanden
      "coverColor": "#c2410c",         // Fallback-Farbe für Buchstabenkachel
      "tags": ["Krimi", "ab 8"],
      "addedAt": "2026-09-01T08:00:00Z",
      "filesHash": "a91c…",            // ändert sich, wenn Dateien wechseln
      "files": [
        { "idx": 0, "durationSec": 1380, "bytes": 22118400, "mime": "audio/mpeg" },
        { "idx": 1, "durationSec": 1402, "bytes": 22470144, "mime": "audio/mpeg" },
        { "idx": 2, "durationSec": 1341, "bytes": 21479424, "mime": "audio/mpeg" }
      ],
      "chapters": [
        { "idx": 0, "title": "Kapitel 1", "fileIdx": 0, "startSec": 0,    "endSec": 1380 },
        { "idx": 1, "title": "Kapitel 2", "fileIdx": 1, "startSec": 1380, "endSec": 2782 },
        { "idx": 2, "title": "Kapitel 3", "fileIdx": 2, "startSec": 2782, "endSec": 4123 }
      ]
    }
  ]
}
```

**Schema-Version 2** (seit M9): `group` ist dazugekommen, und `series` ist nicht
mehr der unmittelbar übergeordnete Ordner, sondern der oberste. Eine ältere App
lehnt einen neueren Katalog ab und sagt das auch – lieber ehrlich melden als
raten. Umgekehrt versteht die aktuelle App einen Katalog der Version 1
weiterhin: `group` fehlt dann schlicht.

**Wichtig:** `startSec`/`endSec` in `chapters` sind **globale** Sekunden im Buch,
nicht relativ zur Datei. Beim vorliegenden Aufbau (ein Ordner mit MP3s) bildet
jedes Kapitel genau auf eine Datei ab – die Trennung der beiden Listen kostet
nichts und würde später auch Dateien mit mehreren Kapiteln abdecken.

**Umrechnung global ↔ Datei**

```ts
// global → (fileIdx, offset)
function resolve(positionSec: number, files: File[]) {
  let acc = 0
  for (const f of files) {
    if (positionSec < acc + f.durationSec) {
      return { fileIdx: f.idx, offsetSec: positionSec - acc }
    }
    acc += f.durationSec
  }
  return { fileIdx: files.at(-1)!.idx, offsetSec: files.at(-1)!.durationSec }
}
```

Bei MP3-Ordnern trifft die Schleife immer die Datei, die das aktuelle Kapitel
enthält; `offsetSec` ist dann die Position innerhalb dieses Kapitels.

---

## 3. Firestore

```
users/{uid}
  ├─ pinSalt            : string        // zufällig, je Konto
  ├─ pinHash            : string        // Eltern-PIN, PBKDF2 (nie im Klartext)
  ├─ createdAt          : timestamp
  └─ settings           : map           // { allowSeek, defaultSleepMinutes, … }

users/{uid}/profiles/{profileId}
  ├─ name               : string        // "Emma"
  ├─ color              : string        // "#7c3aed"
  ├─ avatar             : string        // Emoji oder Icon-Key, z.B. "fox"
  ├─ allowDownload      : boolean       // Vorgabe false, nur im Elternmodus setzbar
  └─ createdAt          : timestamp

users/{uid}/profiles/{profileId}/progress/{bookId}
  ├─ positionSec        : number        // globale Sekunde im Buch
  ├─ fileIdx            : number        // exakte Stelle …
  ├─ offsetSec          : number        // … innerhalb dieser Datei
  ├─ filesHash          : string        // gültig nur, wenn Katalog übereinstimmt
  ├─ durationSec        : number        // Snapshot, für Prozentanzeige offline
  ├─ finished           : boolean
  ├─ updatedAt          : string        // ISO-8601 (UTC) – entscheidet Konflikte
  └─ deviceId           : string        // nur zur Diagnose

users/{uid}/profiles/{profileId}/favorites/{bookId}
  └─ addedAt            : string        // die Dokument-ID ist die Aussage
```

**Favoriten hängen am Profil, nicht am Konto.** Zwei Geschwister auf demselben
Tablet haben verschiedene Lieblingsfolgen; ein gemeinsamer Stern wäre für beide
der falsche.

Die Buch-Kennung steht **nur** im Dokumentnamen, nicht noch einmal im Dokument.

**`updatedAt` ist die Gerätezeit, nicht `serverTimestamp()`.** Der Grund steht in
KONZEPT §7.3: Ein Gerät, das eine Woche offline war, schiebt seine gepufferten
Schreibvorgänge später hinaus – nach Server-Ankunft wären das die „neuesten",
obwohl dort niemand zugehört hat. Praktisch kommt dazu, dass `serverTimestamp()`
beim Schreiben noch gar nicht bekannt ist: Offline stünde dort `null`, und genau
offline muss der Fortschritt zuverlässig sein.

Gelesen wird der Zeitstempel misstrauisch und auf eine einheitliche Schreibweise
normalisiert (`parseRemoteProgress`) – verglichen wird als Zeichenkette, und das
geht nur auf, wenn alle Zeitstempel gleich geschrieben sind. Ein Dokument ohne
lesbaren Zeitstempel wird übersprungen; der lokale Stand bleibt dann stehen.

**Datenmenge:** Ein Progress-Dokument ist ~200 Byte. Bei 200 Büchern × 3 Profilen
sind das unter 150 KB – weit unter jeder Firestore-Grenze, und im Offline-Cache
komplett vorhanden.

**Lesevorgänge pro App-Start:** 1 Profil-Query + 1 Progress-Query über die
Bücher des aktiven Profils ≈ wenige Dutzend Reads. Bewusst **ohne** `limit()`:
Wer nur die letzten 50 Einträge liest, weiss bei den übrigen nicht, ob sie in
der Cloud fehlen oder nur nicht abgefragt wurden – und würde sie bei jedem Start
erneut hochschieben. Dank `persistentLocalCache` liefern Folgestarts ohnehin nur
noch die geänderten Dokumente nach. Bei 50 000 Reads/Tag im Gratis-Kontingent
unkritisch.

**Sicherheitsregeln:** Der Fortschritt liegt unter `users/{uid}/…` und ist damit
von der bestehenden Regel abgedeckt – gelesen und geschrieben wird er nur vom
eigenen, freigeschalteten Konto. Eine Feldprüfung (etwa „`updatedAt` darf nicht
zurücklaufen") gibt es bewusst nicht: Sie würde die Selbstreparatur oben
verhindern, und schützen müsste sie ein Konto vor sich selbst.

### Freigabeliste und Anfragen

```
allowlist/{uid}
  ├─ email              : string        // nur zur Anzeige im Adminbereich
  ├─ name               : string
  ├─ role               : string        // "admin" beim Administratorkonto, sonst fehlend
  ├─ approvedAt         : string
  └─ approvedBy         : string        // UID des Administrators

accessRequests/{uid}
  ├─ uid                : string        // muss der eigenen UID entsprechen
  ├─ email              : string        // wie von Google geliefert
  ├─ name               : string
  ├─ requestedAt        : string
  └─ status             : string        // "pending" | "denied"
```

Der eigentliche Zugangsriegel ist weiterhin `allowlist`: Mit aktivierter
Google-Anmeldung kann sich jeder *anmelden* – Zugriff bekommt nur, wessen UID
dort als Dokument steht. Geschrieben wird die Liste jetzt aber nicht mehr von
Hand in der Konsole, sondern vom Administratorkonto in der App.

Ein neues Konto freischalten:

1. In der App anmelden. Die App legt selbst eine Anfrage unter
   `accessRequests/{uid}` ab und zeigt „Gleich geht's los".
2. Der Administrator sieht sie im Adminbereich mit Namen und Adresse und tippt
   auf **Freigeben**. Das legt den `allowlist`-Eintrag an und löscht die Anfrage.
3. Das wartende Gerät tippt auf „Nochmal prüfen".

Abgelehnte Anfragen bleiben mit `status: "denied"` stehen. Ohne das legte
dasselbe Gerät bei jedem Start eine neue an, und die Liste füllte sich von
selbst wieder.

### Gemeinsame Bibliotheksdaten

```
bookTitles/{bookId}
  ├─ title              : string        // von Hand im Adminbereich gesetzt
  ├─ updatedAt          : string
  └─ updatedBy          : string

listening/{uid}_{profileId}_{bookId}
  ├─ uid                : string        // muss der eigenen UID entsprechen
  ├─ profileId          : string
  ├─ profileName        : string        // mitgeschrieben: der Admin darf fremde Profile nicht lesen
  ├─ bookId             : string
  ├─ bookTitle          : string
  ├─ plays              : number        // increment() – zwei Geräte addieren sich richtig
  ├─ secondsListened    : number        // increment(), im Minutentakt gebündelt
  └─ lastPlayedAt       : string
```

Beide Kollektionen liegen bewusst **ausserhalb** von `users/{uid}`: Titel
gehören der Bibliothek und nicht einem Konto, und die Hörhistorie muss der
Administrator lesen können, ohne Zugriff auf fremde Profile und fremden
Fortschritt zu bekommen.

Die Kennung eines Historien-Eintrags beginnt mit der UID. Das ist keine
Bequemlichkeit, sondern die Regel: Geschrieben werden darf nur, was mit der
eigenen UID anfängt. Zwei Geräte desselben Kindes schreiben damit in dasselbe
Dokument, und `increment()` zählt richtig zusammen, statt sich gegenseitig zu
überschreiben.

### Sicherheitsregeln

Die vollständigen Regeln liegen als Vorlage in
[`firestore.rules.tmpl`](../firestore.rules.tmpl). Kurzfassung:

```js
function isAdminByEmail() {          // __ADMIN_EMAIL__ wird beim Deployen eingesetzt
  return request.auth != null
      && request.auth.token.get('email_verified', false) == true
      && request.auth.token.get('email', '').lower() == '__ADMIN_EMAIL__';
}
function isAdmin() {                 // zweiter Weg: role == "admin" im eigenen Eintrag
  return isAdminByEmail() || isAdminByList();
}
function isAllowed() {
  return hasAllowlistEntry() || isAdminByEmail();
}

match /allowlist/{uid} {
  allow get: if isOwner(uid) || isAdmin();      // den eigenen Eintrag nachsehen
  allow list: if isAdmin();                     // die Liste sieht nur der Administrator
  allow create, update, delete: if isAdmin();   // und nur er gibt frei
}

match /accessRequests/{uid} {
  allow create: if ownRequest();                // Name, Adresse, Zeit, status "pending"
  allow update: if ownRequest() && resource.data.status != 'denied';
  allow list:   if isAdmin();
}

match /users/{uid}/{document=**} {
  allow read, write: if isOwner(uid) && isAllowed();
}

match /bookTitles/{bookId} { allow read: if isAllowed(); allow write: if isAdmin(); }

match /listening/{entryId} {
  allow read: if isAdmin();
  allow create, update: if isAllowed()
      && request.resource.data.uid == request.auth.uid
      && entryId.matches(request.auth.uid + '_.*');
}
```

**Warum die Adresse ein Platzhalter ist:** Das Repository ist öffentlich, und
eine private Adresse gehört dort nicht hinein (KONZEPT §9.3). `npm run rules`
erzeugt aus der Vorlage die deploybare `firestore.rules` und setzt die Adresse
aus `HB_ADMIN_EMAIL` ein; die erzeugte Datei ist per `.gitignore` gesperrt.

**Warum es zwei Wege zum Administrator gibt:** Die Adresse im Token ist der
Normalfall. Der `role: "admin"`-Eintrag in der Freigabeliste – beim ersten
Anmelden selbst angelegt – ist die Rückversicherung, falls beim Deployen einmal
die falsche Adresse eingesetzt wird. Sonst stünde niemand mehr zur Verfügung,
der das geraderücken könnte.

Deployt wird bei jeder Änderung an der Vorlage automatisch über
[`.github/workflows/firestore-rules.yml`](../.github/workflows/firestore-rules.yml);
die Einrichtung steht in [`FIREBASE-DEPLOY.md`](./FIREBASE-DEPLOY.md). Von Hand
geht es weiterhin:

```bash
HB_ADMIN_EMAIL=… npm run rules
firebase deploy --only firestore:rules
```

> Änderungen an diesen Regeln gehen laut deiner Standardvorgabe **immer** als PR
> ohne Auto-Merge zu dir.

---

## 4. Lokale Speicher im Browser

| Speicher | Inhalt | Warum dort |
|---|---|---|
| **IndexedDB** `catalog` | Gespiegelter Katalog + `generatedAt` | Bibliothek offline browsebar |
| **IndexedDB** `progress` | Fortschritt pro (Profil, Buch) | Überlebt alles, auch abgestürzte Tabs |
| **IndexedDB** `downloads` | Pro Buch: Status, geladene Dateien und Bytes, `filesHash` | Stand überlebt den Neustart |
| **Cache Storage** `hb-media-v1` | Audiodateien und Cover, Schlüssel = kanonische URL **ohne** `?t=` | Für grosse Responses gebaut |
| **Cache Storage** `hb-app-v1` | App-Shell (Workbox-Precache) | Sofortstart, offline |
| **localStorage** | Zuletzt gewähltes Profil, Gerätekennung (`hb.device`), UI-Kleinkram | Synchron lesbar beim Start, spart einen Frame |

Ein `dirty`-Flag war dafür einmal vorgesehen und ist entfallen: Firestore puffert
noch nicht gesendete Schreibvorgänge selbst und schickt sie nach, sobald wieder
Netz da ist. Ein zweites Verzeichnis derselben Information hätte nur eine weitere
Stelle geschaffen, an der etwas auseinanderlaufen kann. Was die Cloud verpasst
hat, fällt beim nächsten Abgleich ohnehin auf – dort wird verglichen, nicht
geglaubt.

Der Zustand je Datei steht bewusst **nicht** dort: Ob eine Datei schon da ist,
weiss der Cache selbst am besten. Ein zweites Verzeichnis daneben könnte
auseinanderlaufen – etwa wenn das System bei Speicherdruck aufräumt. Ein
abgebrochener Download fragt deshalb den Cache und überspringt, was er findet.

Der `downloads`-Eintrag gilt für das **Gerät**, nicht für ein Profil: Der Platz
ist einer, und zweimal dieselbe Datei zu speichern, nur weil zwei Kinder sie
hören, wäre Verschwendung. Die Erlaubnis zum Herunterladen hängt dagegen sehr
wohl am Profil (`allowDownload`).

**Cache-Schlüssel ohne Ticket** – das ist der entscheidende Kniff:

```ts
const canonical = (url: string) => {
  const u = new URL(url); u.searchParams.delete('t'); return u.toString()
}
await cache.put(canonical(signedUrl), response)   // schreiben
const hit  = await cache.match(canonical(signedUrl))           // lesen
```

Der Schlüssel steht in `features/downloads/mediaKeys.ts`, und diese Datei kennt
weder React noch das DOM – sie wird von der App **und** vom Service Worker
benutzt. Gäbe es zwei Fassungen davon, legte der eine ab, was der andere nicht
findet.

Sonst wäre jeder Download nach 8 Stunden wertlos, weil sich das Ticket in der URL
geändert hat.

---

## 5. API des NAS-Dienstes (`hb-media`)

Basis-URL kommt aus `VITE_MEDIA_BASE_URL`, z. B. `https://media.example.com`.

### `GET /health`
Ohne Auth. Für Diagnose im Elternmodus.
```json
{ "ok": true, "version": "1.0.0", "books": 187, "scannedAt": "2026-09-15T06:00:00Z" }
```

### `POST /auth/session`
```
Authorization: Bearer <Firebase-ID-Token>
```
Prüft: Signatur gegen Googles JWKS · `iss == https://securetoken.google.com/<projectId>`
· `aud == <projectId>` · `exp` · UID in `HB_ALLOWED_UIDS` (falls gesetzt).

```json
{ "ticket": "eyJhbGciOi…", "expiresAt": "2026-09-15T22:29:30Z" }
```

Ticket = JWT (HS256, Secret `HB_TICKET_SECRET`), Nutzlast `{ sub: uid, iat, exp, v: 1 }`.
Laufzeit 8 Stunden.

### `GET /library?t=<ticket>`
Der Katalog aus Kapitel 2. Mit `ETag`; die App sendet `If-None-Match` und bekommt
im Normalfall `304`.

### `GET /cover/{bookId}.jpg?t=<ticket>`
Cover, auf max. 600 px Kantenlänge verkleinert, `Cache-Control: public, max-age=31536000, immutable`.

### `GET /audio/{bookId}/{fileIdx}?t=<ticket>`
Die Audiodatei. **Muss** unterstützen:

```
Accept-Ranges: bytes
Content-Type: audio/mpeg | audio/mp4
Content-Length: <bytes>

→ bei Range-Request:
206 Partial Content
Content-Range: bytes 1024-2047/22118400
```

Ohne Range-Support kann im Player nicht gesprungen werden, und viele Browser
starten die Wiedergabe gar nicht erst.

### `POST /admin/rescan?t=<ticket>`
Nur für UIDs in `HB_ADMIN_UIDS` (leer = jede zugelassene UID). Antwortet
sofort mit `202`; der Scan läuft im Hintergrund weiter und liefert so lange den
bisherigen Katalog aus. Ein zweiter Aufruf während eines laufenden Scans
bekommt `409`.

### Fehlerfälle

| Code | Bedeutung | Reaktion der App |
|---|---|---|
| 401 | Ticket fehlt/abgelaufen/ungültig | Neues Ticket holen, Request **einmal** wiederholen |
| 403 | UID nicht freigeschaltet | „Dieses Konto hat keinen Zugriff" im Elternmodus |
| 404 | Buch/Datei nicht (mehr) da | Aus lokalem Katalog entfernen, Neu-Scan vorschlagen |
| 409 | Ein Scan läuft bereits | Warten; `/health` meldet `scanning` |
| 416 | Angeforderter Bereich liegt ausserhalb der Datei | Sollte nicht vorkommen; Datei neu laden |
| Netzwerkfehler | NAS offline | Umschalten auf „Nur heruntergeladene Bücher" |

### Konfiguration (Umgebungsvariablen des Containers)

| Variable | Beispiel | Zweck |
|---|---|---|
| `HB_MEDIA_ROOT` | `/media` | Gemounteter Hörbuch-Ordner (read-only) |
| `HB_FIREBASE_PROJECT_ID` | `hoerbuch-app` | Für die Token-Prüfung |
| `HB_TICKET_SECRET` | *(zufällig, 32+ Byte)* | Signatur der Media-Tickets |
| `HB_ALLOWED_ORIGINS` | `https://hb.netlify.app` | CORS |
| `HB_ALLOWED_UIDS` | `abc…,def…` | Leer = jeder verifizierte Nutzer des Projekts |
| `HB_ADMIN_UIDS` | `abc…` | Darf `/admin/rescan` |
| `HB_RESCAN_INTERVAL_MINUTES` | `360` | Abstand automatischer Neu-Scans; `0` schaltet sie ab |
| `HB_SCAN_ON_START` | `true` | Beim Start einmal einlesen |
| `HB_PORT` | `8080` | Port **im Container** |
| `HB_HOST_PORT` | `18080` | Port auf dem NAS – auf dem QNAP gehört `8080` der QTS-Weboberfläche |

Eingebunden wird der Hörbuch-Ordner in der `docker-compose.yml` read-only:

Die tatsächliche Datei steht in `services/media/docker-compose.yml`; hier nur
der Kern. Der veröffentlichte Port ist einstellbar, weil auf dem QNAP die
QTS-Weboberfläche selbst auf 8080 hört – und der Tunnel liegt in einem eigenen
Profil, damit der Dienst schon läuft, bevor es ihn gibt
(`docker compose up -d`, später `docker compose --profile tunnel up -d`).

```yaml
services:
  hb-media:
    image: ghcr.io/<owner>/hb-media:latest   # oder lokal gebaut
    restart: unless-stopped
    ports: ["${HB_HOST_PORT:-8080}:8080"]    # auf dem QNAP z. B. 18080
    volumes:
      - /share/Hoerbuecher:/media:ro         # read-only, der Dienst schreibt nie
      - hb-cache:/cache
    environment:
      HB_MEDIA_ROOT: /media
      HB_FIREBASE_PROJECT_ID: ${HB_FIREBASE_PROJECT_ID}
      HB_TICKET_SECRET: ${HB_TICKET_SECRET}
      HB_ALLOWED_ORIGINS: ${HB_ALLOWED_ORIGINS}
volumes:
  hb-cache:
```

> Der Cache liegt bewusst in einem eigenen Volume und nicht im Hörbuch-Ordner –
> so bleibt die Freigabe wirklich read-only.

---

## 6. Projektstruktur (geplant)

```
HB/
├── apps/web/                    # die PWA
│   ├── public/
│   │   ├── manifest.webmanifest
│   │   └── icons/               # 192, 512, maskable, apple-touch-icon
│   ├── src/
│   │   ├── app/                 # Routing, Layout, Fehlergrenzen
│   │   ├── features/
│   │   │   ├── auth/            # Login, Profilwahl, Elternmodus
│   │   │   ├── library/         # Katalog, Raster, Buchseite
│   │   │   ├── player/          # Audio-Engine, Media Session, Sleep-Timer
│   │   │   ├── progress/        # Speichern, Auflösen, Sync
│   │   │   └── downloads/       # Cache Storage, Background Fetch
│   │   ├── lib/                 # firebase, media-client, idb, format
│   │   ├── ui/                  # Button, Cover, Ring, … (grosse Touch-Ziele)
│   │   └── sw.ts                # eigener Service Worker
│   └── vite.config.ts
├── services/media/              # NAS-Dienst
│   ├── src/
│   │   ├── auth/                # Firebase-Token prüfen, Tickets ausstellen
│   │   ├── catalog/             # Scanner, Namensauswertung, Katalogbau
│   │   ├── media/               # Range-Header
│   │   └── server.ts            # Routen
│   ├── Dockerfile
│   └── docker-compose.yml       # für Container Station
├── docs/
│   ├── KONZEPT.md
│   ├── DATENMODELL.md
│   └── QNAP-SETUP.md
├── netlify.toml
└── package.json                 # npm workspaces
```
