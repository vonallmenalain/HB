# Datenmodell und Schnittstellen

Ergänzung zu [`KONZEPT.md`](./KONZEPT.md). Hier steht das Konkrete: wie die
Ordner auf dem NAS aussehen müssen, welches JSON dabei herauskommt, was in
Firestore liegt und wie die Endpunkte aufgebaut sind.

---

## 1. Ordnerkonvention auf dem QNAP

Ein dedizierter Ordner, vom Dienst **nur lesend** eingebunden:

```
/share/Hoerbuecher/
├── Die drei ???/                          ← optional: Serienordner
│   ├── 01 - Der Super-Papagei/
│   │   ├── cover.jpg                      ← optional
│   │   ├── buch.json                      ← optional, überschreibt Erkanntes
│   │   ├── 01 - Kapitel 1.mp3
│   │   ├── 02 - Kapitel 2.mp3
│   │   └── 03 - Kapitel 3.mp3
│   └── 02 - Der Phantomsee/
│       └── phantomsee.m4b                 ← Einzeldatei mit Kapiteln
├── Bibi Blocksberg - Hexerei/
│   └── ...
└── .hb-cache/                             ← vom Scanner angelegt
    ├── catalog.json
    └── probe/                             ← ffprobe-Ergebnisse, hash-basiert
```

**Regeln des Scanners**

| Situation | Verhalten |
|---|---|
| Ordner enthält Audiodateien | → ist ein Buch |
| Ordner enthält nur Unterordner | → ist eine Serie, Name wird als `series` übernommen |
| Mehrere Audiodateien | Sortierung nach Dateiname (natürlich, `2` vor `10`) |
| Eine `.m4b`/`.m4a` mit Kapitelatomen | Kapitel aus der Datei, eine einzige `file` |
| `cover.jpg` / `cover.png` / `folder.jpg` vorhanden | wird verwendet |
| Kein Cover-File | Eingebettetes Bild aus ID3/MP4 extrahieren |
| Auch das fehlt | `cover: null` → App generiert eine farbige Buchstabenkachel |
| Ordnername `01 - Titel` | `seriesIndex: 1`, `title: "Titel"` |
| `buch.json` vorhanden | Felder daraus haben **Vorrang** vor allem Erkannten |

**`buch.json` (optional, alle Felder optional)**

```json
{
  "title": "Der Super-Papagei",
  "series": "Die drei ???",
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

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "2026-09-15T14:29:30Z",
  "books": [
    {
      "id": "b_4f3a9c2e",              // sha1(relativer Pfad), gekürzt – stabil
      "title": "Der Super-Papagei",
      "series": "Die drei ???",
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

**Wichtig:** `startSec`/`endSec` in `chapters` sind **globale** Sekunden im Buch,
nicht relativ zur Datei. Damit funktioniert dieselbe Rechnung für MP3-Ordner und
für eine einzelne M4B-Datei.

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

Bei einer M4B mit nur einer Datei ist `fileIdx` immer 0 und `offsetSec === positionSec`.

---

## 3. Firestore

```
users/{uid}
  ├─ pinHash            : string        // Eltern-PIN, gehasht (nie im Klartext)
  ├─ createdAt          : timestamp
  └─ settings           : map           // { allowSeek, defaultSleepMinutes, … }

users/{uid}/profiles/{profileId}
  ├─ name               : string        // "Emma"
  ├─ color              : string        // "#7c3aed"
  ├─ avatar             : string        // Emoji oder Icon-Key, z.B. "fox"
  ├─ allowDownload      : boolean
  └─ createdAt          : timestamp

users/{uid}/profiles/{profileId}/progress/{bookId}
  ├─ positionSec        : number        // globale Sekunde im Buch
  ├─ fileIdx            : number        // exakte Stelle …
  ├─ offsetSec          : number        // … innerhalb dieser Datei
  ├─ filesHash          : string        // gültig nur, wenn Katalog übereinstimmt
  ├─ durationSec        : number        // Snapshot, für Prozentanzeige offline
  ├─ finished           : boolean
  ├─ updatedAt          : timestamp     // serverTimestamp() – entscheidet Konflikte
  └─ deviceId           : string        // nur zur Diagnose
```

**Datenmenge:** Ein Progress-Dokument ist ~200 Byte. Bei 200 Büchern × 3 Profilen
sind das unter 150 KB – weit unter jeder Firestore-Grenze, und im Offline-Cache
komplett vorhanden.

**Lesevorgänge pro App-Start:** 1 Profil-Query + 1 Progress-Query (limitiert auf
die 50 zuletzt geänderten) ≈ wenige Dutzend Reads. Bei 50 000 Reads/Tag im
Gratis-Kontingent unkritisch.

### Sicherheitsregeln

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
      match /{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == uid;
      }
    }
    // alles andere: verboten
  }
}
```

> Diese Regeln liegen später in `firestore.rules`. Änderungen daran gehen laut
> deiner Standardvorgabe **immer** als PR ohne Auto-Merge zu dir.

---

## 4. Lokale Speicher im Browser

| Speicher | Inhalt | Warum dort |
|---|---|---|
| **IndexedDB** `catalog` | Gespiegelter Katalog + `generatedAt` | Bibliothek offline browsebar |
| **IndexedDB** `progress` | Fortschritt pro (Profil, Buch), inkl. `dirty`-Flag | Überlebt alles, auch abgestürzte Tabs |
| **IndexedDB** `downloads` | Pro Buch: Status, pro Datei: `pending`/`done`/`failed`, Bytes | Fortsetzbare Downloads |
| **Cache Storage** `hb-media-v1` | Die Audiodateien, Schlüssel = kanonische URL **ohne** `?t=` | Für grosse Responses gebaut |
| **Cache Storage** `hb-app-v1` | App-Shell (Workbox-Precache) | Sofortstart, offline |
| **localStorage** | Zuletzt gewähltes Profil, UI-Kleinkram | Synchron lesbar beim Start, spart einen Frame |

**Cache-Schlüssel ohne Ticket** – das ist der entscheidende Kniff:

```ts
const canonical = (url: string) => {
  const u = new URL(url); u.searchParams.delete('t'); return u.toString()
}
await cache.put(new Request(canonical(signedUrl)), response)   // schreiben
const hit  = await cache.match(canonical(signedUrl))           // lesen
```

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

Ohne Range-Support kann im Player nicht gesprungen werden und iOS startet die
Wiedergabe gar nicht erst.

### `POST /admin/rescan?t=<ticket>`
Nur für UIDs in `HB_ADMIN_UIDS`. Stösst einen inkrementellen Scan an.

### Fehlerfälle

| Code | Bedeutung | Reaktion der App |
|---|---|---|
| 401 | Ticket fehlt/abgelaufen/ungültig | Neues Ticket holen, Request **einmal** wiederholen |
| 403 | UID nicht freigeschaltet | „Dieses Konto hat keinen Zugriff" im Elternmodus |
| 404 | Buch/Datei nicht (mehr) da | Aus lokalem Katalog entfernen, Neu-Scan vorschlagen |
| 503 | Scan läuft | Freundlich warten, automatisch erneut versuchen |
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
| `HB_SCAN_CRON` | `0 4 * * *` | Nächtlicher Scan |

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
│   ├── src/                     # server, auth, scanner, range
│   ├── Dockerfile
│   └── docker-compose.yml       # für Container Station
├── docs/
│   ├── KONZEPT.md
│   ├── DATENMODELL.md
│   └── QNAP-SETUP.md            # folgt mit M3
├── netlify.toml
└── package.json                 # npm workspaces
```
