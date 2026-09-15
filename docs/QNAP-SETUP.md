# Medien-Dienst auf dem QNAP einrichten

Der Dienst `hb-media` liefert Katalog, Cover und Audio aus dem Hörbuch-Ordner
aus. Er läuft als Docker-Container in der Container Station und wird über einen
Cloudflare Tunnel erreichbar gemacht – ohne offenen Port im Heimnetz.

Zum Verständnis, was dabei wohin gehört: [`KONZEPT.md`](./KONZEPT.md) Kapitel 3
und 9, Schnittstellen in [`DATENMODELL.md`](./DATENMODELL.md) Kapitel 5.

---

## Was du brauchst

- QNAP mit **Container Station** (App Center, kostenlos)
- Einen dedizierten Ordner mit den Hörbüchern, z. B. `/share/Hoerbuecher`
- Ein Cloudflare-Konto mit der Domain (für den Tunnel)
- Die Firebase-Projekt-ID

---

## 1. Hörbuch-Ordner vorbereiten

Ein Ordner pro Buch, darin nummerierte MP3-Dateien:

```
/share/Hoerbuecher/
├── Die drei ???/                      ← optionaler Reihenordner
│   ├── 01 - Der Super-Papagei/
│   │   ├── cover.jpg                  ← optional
│   │   ├── 01 - Kapitel eins.mp3
│   │   └── 02 - Kapitel zwei.mp3
│   └── 02 - Der Phantomsee/
│       └── …
└── Bibi Blocksberg - Hexerei/
    └── …
```

Was der Scanner daraus macht, steht in
[`DATENMODELL.md`](./DATENMODELL.md#1-ordnerkonvention-auf-dem-qnap). Kurz:

- Ordner **mit** Audiodateien = ein Buch
- Ordner **ohne** Audiodateien = eine Reihe, der Name wird übernommen
- `01 - Titel` wird zu Reihennummer 1 und Titel „Titel"
- Cover: `cover.jpg`, `folder.jpg`, `front.png` – sonst das eingebettete Bild
  aus den ID3-Tags, sonst eine farbige Buchstabenkachel in der App
- Eine optionale `buch.json` im Buchordner überschreibt alles Erkannte

Der Dienst schreibt **nie** in diesen Ordner – er wird read-only eingehängt.

---

## 2. Geheimnis erzeugen

Auf einem beliebigen Rechner mit Terminal:

```bash
openssl rand -base64 48
```

Das Ergebnis ist `HB_TICKET_SECRET`. Es signiert die Media-Tickets und darf
nirgends sonst auftauchen – insbesondere nicht im Repository.

---

## 3. Image bauen

Das Projekt ist ein npm-Workspace, der Bau-Kontext ist deshalb der
**Projektstamm**, nicht der Service-Ordner.

**Weg A – auf dem NAS bauen** (wenn dort git und Container Station verfügbar sind):

```bash
git clone https://github.com/vonallmenalain/HB.git
cd HB
docker build -f services/media/Dockerfile -t hb-media:latest .
```

**Weg B – auf dem Rechner bauen und übertragen** (wenn das NAS schwach ist):

```bash
# Auf dem Rechner – Architektur des NAS beachten:
docker build --platform linux/amd64 -f services/media/Dockerfile -t hb-media:latest .
docker save hb-media:latest | gzip > hb-media.tar.gz
# Datei aufs NAS kopieren, dann dort:
docker load < hb-media.tar.gz
```

> Die meisten QNAP-Modelle sind `linux/amd64`. Bei einem ARM-Modell
> (z. B. TS-x33) stattdessen `--platform linux/arm64` verwenden. Das Image
> nutzt `bookworm-slim` statt Alpine, weil `sharp` (für die Cover) dort
> fertige Binärdateien mitbringt.

---

## 4. Umgebungsvariablen setzen

`services/media/.env.example` nach `.env` kopieren und ausfüllen:

| Variable | Beispiel | Bedeutung |
|---|---|---|
| `HB_LIBRARY_PATH` | `/share/Hoerbuecher` | Ordner auf dem NAS, wird read-only eingehängt |
| `HB_FIREBASE_PROJECT_ID` | `hoerbuchkinder` | Projekt-ID aus der Firebase-Konsole |
| `HB_TICKET_SECRET` | *(aus Schritt 2)* | Signatur der Media-Tickets, ≥ 32 Zeichen |
| `HB_ALLOWED_ORIGINS` | `https://hb.alae.app` | Adresse der App; mehrere mit Komma |
| `HB_ALLOWED_UIDS` | `abc123…` | **Bei aktivierter Google-Anmeldung unbedingt ausfüllen** – leer heisst „jeder verifizierte Nutzer des Projekts" |
| `HB_ADMIN_UIDS` | `abc123…` | Darf `/admin/rescan` auslösen |
| `HB_RESCAN_INTERVAL_MINUTES` | `360` | Abstand automatischer Neu-Scans; `0` schaltet sie ab |
| `CLOUDFLARE_TUNNEL_TOKEN` | *(aus Schritt 6)* | Token des Tunnels |

Fehlt etwas, startet der Dienst nicht und nennt **alle** fehlenden Variablen auf
einmal im Log – nicht nur die erste.

---

## 5. Container starten

In der Container Station → **Anwendungen → Erstellen**, den Inhalt von
`services/media/docker-compose.yml` einfügen und die `.env` daneben ablegen.

Alternativ über SSH:

```bash
cd HB/services/media
docker compose up -d
```

Prüfen, ob er läuft:

```bash
curl http://localhost:8080/health
# {"ok":true,"books":187,"scannedAt":"…","scanning":false}
```

Steht dort `"books": 0`, hat der Scanner nichts gefunden – dann stimmt
`HB_LIBRARY_PATH` nicht oder der Ordner enthält keine Audiodateien in der
erwarteten Struktur.

> Der erste Scan dauert länger als alle folgenden: Bei MP3s ohne VBR-Header muss
> jede Datei einmal ganz gelesen werden, um die Dauer zu bestimmen. Das Ergebnis
> landet im Cache-Volume und wird danach wiederverwendet.

---

## 6. Cloudflare Tunnel einrichten

1. Im Cloudflare-Dashboard: **Zero Trust → Networks → Tunnels → Create a tunnel**
2. Typ **Cloudflared**, Name z. B. `hb-media`
3. Das angezeigte **Token** kopieren und als `CLOUDFLARE_TUNNEL_TOKEN` in die
   `.env` eintragen
4. Unter **Public Hostnames** einen Eintrag anlegen:
   - Subdomain: `hb-media`
   - Domain: `alae.app`
   - Service: `HTTP` → `hb-media:8080`
5. Container neu starten

Danach ist der Dienst unter `https://hb-media.alae.app` erreichbar:

```bash
curl https://hb-media.alae.app/health
```

> **Zu Cloudflares Nutzungsbedingungen:** Sie beschränken das Ausliefern grosser
> Mengen Nicht-HTML-Inhalte über den kostenlosen Proxy. Bei Familiennutzung ist
> das praktisch unkritisch. Die Medien-Adresse ist ohnehin nur eine
> Konfigurationsvariable – ein Wechsel auf `myQNAPcloud` mit Let's Encrypt oder
> Tailscale ändert nur `HB_ALLOWED_ORIGINS` und `VITE_MEDIA_BASE_URL`.

---

## 7. Mit der App verbinden

In Netlify unter *Site settings → Environment variables*:

```
VITE_MEDIA_BASE_URL = https://hb-media.alae.app
```

Der Host steht zusätzlich in der Content-Security-Policy in `netlify.toml`
(`img-src`, `media-src`, `connect-src`). Bei einer anderen Adresse muss er dort
mitziehen – sonst blockiert der Browser die Anfragen stillschweigend.

---

## 8. UIDs freischalten

Zwei Stellen, die dasselbe Konto kennen müssen:

1. **Firestore** – Kollektion `allowlist`, ein Dokument mit der UID als ID.
   Ohne das zeigt die App „Noch kein Zugriff" samt der UID zum Kopieren.
2. **`HB_ALLOWED_UIDS`** – dieselbe UID, damit der Medien-Dienst Ton ausliefert.

Die Trennung ist Absicht: Firestore schützt den Fortschritt, der Medien-Dienst
die Dateien. Fällt eine Stelle aus, bleibt die andere wirksam.

---

## Fehlersuche

| Beobachtung | Wahrscheinliche Ursache |
|---|---|
| Container startet nicht, Log nennt Variablen | `.env` unvollständig – das Log listet alle fehlenden auf |
| `"books": 0` | `HB_LIBRARY_PATH` falsch, oder keine Audiodateien in Buchordnern |
| `401` bei `/library` | Ticket fehlt oder abgelaufen; die App holt normalerweise selbst ein neues |
| `403` bei `/auth/session` | UID steht nicht in `HB_ALLOWED_UIDS` |
| App zeigt Bücher, spielt aber nichts | Medien-Host fehlt in der CSP in `netlify.toml` |
| Tunnel erreichbar, aber CORS-Fehler | `HB_ALLOWED_ORIGINS` stimmt nicht mit der App-Adresse überein |
| Neue Bücher erscheinen nicht | `HB_RESCAN_INTERVAL_MINUTES` steht auf `0`, oder der Scan läuft noch (`/health` zeigt `scanning: true`) |

Logs ansehen:

```bash
docker logs -f hb-media
docker logs -f hb-tunnel
```
