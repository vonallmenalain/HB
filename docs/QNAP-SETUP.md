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

## 3. Image holen

Das Image wird nicht mehr auf dem NAS gebaut. GitHub baut es bei jeder Änderung
am Medien-Dienst (Workflow **Medien-Dienst**) für `amd64` und `arm64` und legt
es in der GitHub Container Registry ab:

```
ghcr.io/vonallmenalain/hb-media:latest
```

Auf dem NAS bleibt damit nur noch: herunterladen und starten. Kein Quelltext,
kein `docker build`, keine halbe Stunde Wartezeit auf einer NAS-CPU.

**Einmalig:** Das Paket muss öffentlich sein, sonst verlangt das NAS eine
Anmeldung. In GitHub: **Profil → Packages → hb-media → Package settings →
Change visibility → Public**. Der Inhalt ist ohnehin nur der Quelltext dieses
öffentlichen Repositories – Hörbücher, Adressen und Geheimnisse sind nicht im
Image.

> **Lieber privat?** Dann auf dem NAS einmal anmelden:
> ```bash
> echo <GitHub-Token mit read:packages> | docker login ghcr.io -u vonallmenalain --password-stdin
> ```

**Nur zwei Dateien aufs NAS**, in einen Freigabeordner (nicht ins Home –
Container Station spiegelt Pfade von dort in einen eigenen Verwaltungsordner und
scheitert daran):

```bash
sudo -s                                    # echte Root-Rechte, siehe unten
mkdir -p /share/CACHEDEV2_DATA/Container/hb-media
cd /share/CACHEDEV2_DATA/Container/hb-media
curl -LO https://raw.githubusercontent.com/vonallmenalain/HB/main/services/media/docker-compose.yml
curl -LO https://raw.githubusercontent.com/vonallmenalain/HB/main/services/media/.env.example
mv .env.example .env
```

> **Root-Shell.** Es genügt nicht, dass dein Konto in QTS zur Gruppe
> *administrators* gehört – das ist Gruppe 0, nicht Benutzer 0. Docker-Befehle
> über SSH brauchen echte Root-Rechte, sonst bricht schon der Start ab mit
> `permission denied`.
>
> `sudo -i` tut es auch, landet auf dem QNAP aber zuerst im
> Console-Management-Menü – dort `Q` drücken. `sudo -s` startet keine
> Login-Shell und umgeht das Menü.

**Selber bauen** geht weiterhin, etwa um eine Änderung auszuprobieren, bevor sie
in `main` liegt. Dafür braucht es den Quelltext und die Ergänzungsdatei:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml build
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d
```

> Der Bau-Kontext ist der **Projektstamm**, nicht der Service-Ordner: Das
> Projekt ist ein npm-Workspace und braucht das Wurzel-`package-lock.json`.
> Das Image nutzt `bookworm-slim` statt Alpine, weil `sharp` (für die Cover)
> dort fertige Binärdateien mitbringt.

---

## 4. Umgebungsvariablen setzen

`services/media/.env.example` nach `.env` kopieren und ausfüllen:

| Variable | Beispiel | Bedeutung |
|---|---|---|
| `HB_LIBRARY_PATH` | `/share/Hoerbuecher` | Ordner auf dem NAS, wird read-only eingehängt |
| `HB_HOST_PORT` | `18080` | Port auf dem NAS selbst – **8080 gehört dort der QTS-Weboberfläche** |
| `HB_FIREBASE_PROJECT_ID` | `hoerbuchkinder` | Projekt-ID aus der Firebase-Konsole |
| `HB_TICKET_SECRET` | *(aus Schritt 2)* | Signatur der Media-Tickets, ≥ 32 Zeichen |
| `HB_ALLOWED_ORIGINS` | `https://hb.alae.app` | Adresse der App; mehrere mit Komma |
| `HB_ALLOWED_UIDS` | `abc123…` | **Bei aktivierter Google-Anmeldung unbedingt ausfüllen** – leer heisst „jeder verifizierte Nutzer des Projekts" |
| `HB_ADMIN_UIDS` | `abc123…` | Darf `/admin/rescan` auslösen |
| `HB_RESCAN_INTERVAL_MINUTES` | `360` | Abstand automatischer Neu-Scans; `0` schaltet sie ab |
| `CLOUDFLARE_TUNNEL_TOKEN` | *(aus Schritt 6)* | Token des Tunnels; bis dahin leer lassen |

Fehlt etwas, startet der Dienst nicht und nennt **alle** fehlenden Variablen auf
einmal im Log – nicht nur die erste.

---

## 5. Container starten

Über SSH, im Ordner mit `docker-compose.yml` und `.env`:

```bash
cd /share/CACHEDEV2_DATA/Container/hb-media
docker compose pull          # holt das fertige Image aus der Registry
docker compose up -d
```

Der Cloudflare-Tunnel bleibt dabei aussen vor – er liegt im Profil `tunnel` und
kommt erst in Schritt 6 dazu. Der Medien-Dienst läuft auch ohne ihn.

> In der Container Station geht es auch über **Anwendungen → Erstellen** mit dem
> Inhalt von `docker-compose.yml`. Dort liest sie allerdings keine `.env` von der
> Platte – die Werte müssen in der Maske selbst eingetragen werden, sonst bricht
> sie mit `required variable … is missing a value` ab. Über SSH ist es kürzer.

Prüfen, ob er läuft (Port aus `HB_HOST_PORT`):

```bash
curl http://localhost:18080/health
# {"ok":true,"books":187,"scannedAt":"…","scanning":false}
```

Steht dort `"books": 0`, hat der Scanner nichts gefunden – dann stimmt
`HB_LIBRARY_PATH` nicht oder der Ordner enthält keine Audiodateien in der
erwarteten Struktur.

> Der erste Scan dauert länger als alle folgenden: Bei MP3s ohne VBR-Header muss
> jede Datei einmal ganz gelesen werden, um die Dauer zu bestimmen. Das Ergebnis
> landet im Cache-Volume und wird danach wiederverwendet.
>
> `docker compose down` ist deshalb unbedenklich, `docker compose down -v` nicht:
> Das `-v` löscht das Cache-Volume, und der nächste Start liest alles neu ein.

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
5. Tunnel dazustarten:

   ```bash
   docker compose --profile tunnel up -d
   ```

> Die `8080` im Public Hostname ist der **containerinterne** Port – der bleibt
> immer 8080, unabhängig davon, was in `HB_HOST_PORT` steht. Cloudflared spricht
> den Dienst über das Docker-Netz an, nicht über den Port auf dem NAS.

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

## 8. Konten freischalten

Zwei Stellen, die dasselbe Konto kennen müssen:

1. **Firestore** – die Freigabeliste `allowlist`. Darum kümmert sich seit M9 die
   App selbst: Wer sich anmeldet, legt eine Anfrage ab, und der Administrator
   gibt sie im Adminbereich frei (*Elternbereich → Adminbereich →
   Zugriffsanfragen*). Von Hand in der Konsole muss dort niemand mehr etwas
   eintragen.
2. **`HB_ALLOWED_UIDS`** – die UID desselben Kontos, damit der Medien-Dienst Ton
   ausliefert. Das bleibt Handarbeit: Der Dienst auf dem NAS kennt Firestore
   nicht.

Die UID steht im Adminbereich bei jedem freigegebenen Konto und in der
Firebase-Konsole unter *Authentication → Users*.

Die Trennung ist Absicht: Firestore schützt den Fortschritt, der Medien-Dienst
die Dateien. Fällt eine Stelle aus, bleibt die andere wirksam.

---

## 9. Aktualisieren

Sobald am Medien-Dienst etwas geändert wird, baut GitHub das Image neu. Auf dem
NAS gibt es zwei Wege, es dort auch laufen zu lassen.

**Von Hand – zwei Zeilen:**

```bash
cd /share/CACHEDEV2_DATA/Container/hb-media
docker compose pull && docker compose up -d
```

`up -d` startet den Container nur neu, wenn sich das Image tatsächlich geändert
hat. Ist schon der neue Stand da, passiert nichts.

**Von selbst – einmal einschalten:**

```bash
docker compose --profile auto-update up -d
```

Damit läuft zusätzlich ein kleiner Wächter (Watchtower), der stündlich nach
einem neuen Image sieht und `hb-media` bei Bedarf neu startet. Den Abstand
bestimmt `HB_UPDATE_INTERVAL_SECONDS`.

> **Was das kostet:** Der Wächter braucht den Docker-Socket und darf damit
> alles, was Docker auf dem NAS darf. Für ein Heim-NAS ist das vertretbar, aber
> es ist eine Entscheidung – deshalb liegt er in einem eigenen Profil und
> startet nicht von allein mit.

**Prüfen, was läuft:**

```bash
curl http://localhost:18080/health
# {"ok":true,"version":"1a2b3c4","schemaVersion":2,"books":187,…}
```

`version` ist die Kennung des Standes, aus dem das Image gebaut wurde – sie
steht auch im Protokoll des GitHub-Workflows. `schemaVersion` sagt, welche
Katalogform der Dienst liefert; die App zeigt im Elternbereich eine Warnung,
solange dort noch `1` steht.

**Einen Stand zurücknehmen:** In der `.env` `HB_IMAGE` auf eine bestimmte
Kennung setzen und neu starten:

```bash
HB_IMAGE=ghcr.io/vonallmenalain/hb-media:1a2b3c4
```

---

## Fehlersuche

| Beobachtung | Wahrscheinliche Ursache |
|---|---|
| `denied` oder `unauthorized` bei `docker compose pull` | Das Paket in GitHub steht auf *privat* – öffentlich schalten oder auf dem NAS bei ghcr.io anmelden (Schritt 3) |
| `no matching manifest for linux/...` | Das NAS hat eine Architektur, für die nicht gebaut wird – im Workflow `platforms` ergänzen |
| `permission denied` auf `.qpkg/container-station/homes/…` | Docker ohne Root-Shell aufgerufen – `sudo -s` (Schritt 3) |
| Nach dem Update läuft weiter der alte Stand | `docker compose pull` vergessen; `curl …/health` zeigt unter `version`, was wirklich läuft |
| `bind: address already in use` auf `8080` | Die QTS-Weboberfläche belegt den Port – `HB_HOST_PORT` setzen |
| `hb-tunnel` startet immer wieder neu | Mit `--profile tunnel` gestartet, aber `CLOUDFLARE_TUNNEL_TOKEN` ist leer |
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
