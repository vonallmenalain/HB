# HB – Hörbuch-App

Private Hörbuch-PWA für die Familie. Die Hörbücher liegen auf dem eigenen
QNAP-NAS, die App ist auf dem Startbildschirm installierbar, spielt im
Hintergrund weiter und merkt sich für jedes Kind punktgenau, wo es aufgehört hat.

> **Status:** Alle Meilensteine M0–M11 stehen. Die App ist damit fertig für den
> Alltag: auswählen, hören, punktgenau weiterhören, über Geräte abgleichen,
> herunterladen und offline hören, Einschlaf-Timer, Elternbereich mit PIN,
> Bibliothek nach Reihen, Favoriten und Vorschläge, Adminbereich mit Freigaben,
> Altersfreigaben und ein Profil je Gerät.
>
> **Was noch aussteht, kann nur Alain tun:** den Medien-Dienst aufs QNAP
> deployen (siehe [`docs/QNAP-SETUP.md`](docs/QNAP-SETUP.md)), die Netlify-
> Variablen setzen und die beiden GitHub-Geheimnisse für das Regel-Deployment
> hinterlegen (siehe [`docs/FIREBASE-DEPLOY.md`](docs/FIREBASE-DEPLOY.md)).
>
> **Der Elternbereich öffnet sich mit zwei Sekunden Druck auf den Titel
> „Hörbücher"** – kein sichtbarer Knopf, damit ihn kein Kind findet. Der
> **Adminbereich** liegt darin, sichtbar nur für das Administratorkonto.

## Was die App können soll

- **Zwei Taps bis zum Ton.** Grosse Cover, keine Menüs, kein Text zum Lesen.
- **Weiterhören, immer.** Position wird laufend lokal gespeichert und über
  Firebase zwischen Geräten synchronisiert.
- **Hintergrundwiedergabe.** Läuft weiter, wenn der Bildschirm ausgeht;
  Steuerung über Lockscreen und Kopfhörer.
- **Offline.** Ganze Hörbücher herunterladen und ohne NAS und ohne Internet hören.
- **Geschützt.** Login über Firebase Authentication, kein Medienzugriff ohne
  gültiges Token.
- **Kinderprofile.** Ein Familien-Login, darin ein Avatar pro Kind – Kinder
  müssen nie ein Passwort eintippen. Ein Gerät bleibt bei dem Profil, das
  einmal gewählt wurde; zurück zur Auswahl geht es nur über den Elternbereich.
- **Nur, was passt.** Altersfreigabe je Hörbuch im Adminbereich, dazu Alter und
  einzelne Sperren je Profil im Elternbereich. Was ein Kind nicht hören soll,
  erscheint bei ihm gar nicht – ohne Schild und ohne graue Kachel.
- **Aufgeräumt.** Die Bibliothek gliedert nach Reihen, Titel werden aus den
  Ordnernamen lesbar gemacht, und auf der Startseite stehen Weiterhören,
  Gemerktes und Vorschläge.

## Technik in einem Satz

React-PWA auf Netlify · Firebase für Login und Fortschritt · ein kleiner
Node-Dienst im Docker-Container auf dem QNAP liefert Katalog und Audio (mit
Range-Support) über einen Tunnel aus · Offline-Dateien liegen in Cache Storage.

## Rahmenbedingungen

| | |
|---|---|
| Zielgeräte | Android (Tablet/Handy) – damit steht die Background Fetch API für echte Hintergrund-Downloads zur Verfügung |
| Audioformat | Ein Ordner pro Buch mit nummerierten MP3-Dateien, Metadaten aus den ID3-Tags |
| NAS | QNAP mit Container Station (Docker) |
| Repository | Öffentlich – deshalb gehören Mediendateien, echte Buchtitel, Adressen und Zugangsdaten **nie** hier hinein |

## Dokumentation

| Dokument | Inhalt |
|---|---|
| [`docs/KONZEPT.md`](docs/KONZEPT.md) | Ziele, Bedienkonzept für Kinder, Architektur, Sicherheit, Offline-Strategie, Risiken, Roadmap, **offene Fragen** |
| [`docs/DATENMODELL.md`](docs/DATENMODELL.md) | Ordnerkonvention auf dem NAS, Katalog-Schema, Firestore-Struktur, API-Verträge |
| [`docs/QNAP-SETUP.md`](docs/QNAP-SETUP.md) | Schritt für Schritt: Medien-Dienst aufs NAS bringen, Tunnel einrichten, mit der App verbinden |
| [`docs/FIREBASE-DEPLOY.md`](docs/FIREBASE-DEPLOY.md) | Schritt für Schritt durch die Google-Konsole: Dienstkonto, Rollen, Geheimnisse – damit GitHub die Firestore-Regeln deployt |

## Roadmap

| M | Inhalt | Status |
|---|---|---|
| M0 | Konzept | ✅ |
| M1 | Projektgerüst, PWA-Hülle, CI, Netlify | ✅ |
| M2 | Firebase Auth + Kinderprofile | ✅ |
| M3 | NAS-Dienst `hb-media` + Scanner + Tunnel | ✅ |
| M4 | Bibliothek im Kinderdesign | ✅ |
| M5 | Player, Hintergrundwiedergabe, Fortschritt | ✅ |
| M6 | Geräte-Sync über Firestore | ✅ |
| M7 | Offline-Downloads, Background Fetch, Verwaltung im Elternmodus | ✅ |
| M8 | Sleep-Timer, Elternmodus mit PIN, Feinschliff | ✅ |
| M9 | Reihen, aufgeräumte Titel, Dashboard, Adminbereich, Spulen | ✅ |
| M10 | Die Sammlung von der App aus in Form bringen: CD-Ordner, Einzelfolgen, Cover | ✅ |
| M11 | Wer darf was: Altersfreigabe, Sperren je Profil, gesperrter Profilwechsel | ✅ |

Details und Begründungen in [`docs/KONZEPT.md`](docs/KONZEPT.md#12-roadmap).

## Entwicklung

```bash
npm install          # einmalig, installiert alle Workspaces
npm run dev          # Entwicklungsserver auf http://localhost:5173
```

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver (ohne Service Worker) |
| `npm run build` | Typprüfung und Produktionsbuild nach `apps/web/dist` |
| `npm run preview` | Gebautes Ergebnis lokal servieren – nur so lässt sich der Service Worker testen |
| `npm run sample -w @hb/media` | Beispielkatalog in `docs/examples/` neu erzeugen (nur nach absichtlicher Schema-Änderung) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript über App, Werkzeuge und Service Worker |
| `npm test` | Vitest |
| `npm run icons` | App-Icons aus `tools/generate-icons.mjs` neu erzeugen |
| `HB_ADMIN_EMAIL=… npm run rules` | `firestore.rules` aus `firestore.rules.tmpl` erzeugen (siehe unten) |
| `npm run rules:check` | Die Regeln gegen den Firestore-Emulator prüfen – braucht Java, läuft nicht in der CI |

### Einrichtung

1. `.env.example` nach `apps/web/.env.local` kopieren und die
   Firebase-Web-Konfiguration eintragen, dazu `VITE_ADMIN_EMAIL` mit der Adresse
   des Administratorkontos. In Netlify liegen dieselben Werte unter
   *Site settings → Environment variables*. Fehlen sie, zeigt die App den
   Bildschirm „Konfiguration fehlt" und nennt die fehlenden Variablen.
2. In GitHub die Geheimnisse `FIREBASE_SERVICE_ACCOUNT` und `HB_ADMIN_EMAIL`
   hinterlegen – Schritt für Schritt in
   [`docs/FIREBASE-DEPLOY.md`](docs/FIREBASE-DEPLOY.md). Danach deployt GitHub
   die Firestore-Regeln bei jeder Änderung von selbst. Von Hand geht es weiterhin:
   `HB_ADMIN_EMAIL=… npm run rules && firebase deploy --only firestore:rules`
3. Einmal anmelden. Das Administratorkonto schaltet sich dabei selbst frei.

### Ein Konto freischalten

Mit aktivierter Google-Anmeldung kann sich grundsätzlich jeder *anmelden*.
Zugriff bekommt nur, wer in der Freigabeliste steht – und darüber entscheidet
der Adminbereich, nicht mehr die Firebase-Konsole:

1. Das neue Konto meldet sich in der App an. Es erscheint „Gleich geht's los";
   die Anfrage liegt damit beim Administrator.
2. Der Administrator öffnet *Elternbereich → Adminbereich* und tippt bei der
   Anfrage auf **Freigeben**.
3. Das wartende Gerät tippt auf „Nochmal prüfen".

Damit der Medien-Dienst auf dem NAS demselben Konto auch Ton ausliefert, gehört
seine UID zusätzlich in `HB_ALLOWED_UIDS` (siehe
[`docs/QNAP-SETUP.md`](docs/QNAP-SETUP.md#8-konten-freischalten)).

Zusätzlich empfiehlt sich, unter *Authentication → Settings → User actions* die
Selbst-Registrierung abzuschalten. Das ersetzt die Freigabeliste nicht, hält
aber fremde Konten aus dem Projekt heraus.

### Aufbau

```
apps/web/            PWA (Vite, React, TypeScript, Tailwind)
  src/app/           Router, Anmelde-Weiche, App-Hülle
  src/features/auth/ Anmeldung, Freigabeliste, Zugriffsanfragen
  src/features/admin/     Adminbereich: Freigaben, Titel, Altersfreigaben, Hörhistorie
  src/features/library/   Katalog, Medien-Client, Reihen, Titel-Aufbereitung
  src/features/favorites/ Gemerkte Hörbücher je Profil
  src/features/history/   Hörhistorie aufzeichnen und auswerten
  src/features/player/    Audio-Engine, Media Session, Player-Zustand
  src/features/progress/  Hörfortschritt
  src/features/profiles/  Kinderprofile, Alter und Sperren (`access.ts`)
  src/routes/        Bildschirme
  src/ui/            Design-System-Bausteine
  src/lib/           Firebase, Konfiguration, Hilfsfunktionen
  src/sw.ts          Service Worker (eigener Code, kein generierter)
services/media/      Medien-Dienst für das QNAP (Node, Fastify, Docker)
  src/auth/          Firebase-Token prüfen, Media-Tickets ausstellen
  src/catalog/       Scanner, Namensauswertung, Katalogbau
  src/media/         Range-Header
tools/               Build-Werkzeuge ausserhalb der App
docs/                Konzept, Datenmodell, NAS- und Firebase-Anleitung
firestore.rules.tmpl Sicherheitsregeln der Datenbank (Vorlage, siehe oben)
```

### Bildschirme ansehen, ohne sich anzumelden

`npm run dev`, dann `http://localhost:5173/harness.html?route=/bibliothek`.
Die Vorschau rendert jeden Bildschirm mit Beispieldaten – ohne Firebase-Konto
und ohne laufendes NAS. Sie ist nicht Teil des Produktionsbuilds.

Mit `&sync=1` tritt an die Stelle von Firestore eine Cloud aus localStorage.
Zwei offene Tabs sind dann zwei Geräte: Was im einen läuft, erscheint im
anderen als „Weiterhören".

Mit einem laufenden Medien-Dienst geht auch echtes Audio, weiterhin ohne
Anmeldung:

```
/harness.html?route=/bibliothek&media=http://localhost:8080&ticket=<ticket>
```

Ein Ticket dafür erzeugt man mit demselben `HB_TICKET_SECRET` wie der Dienst:

```bash
node --input-type=module -e "
import { issueTicket } from './services/media/dist/auth/ticket.js'
process.stdout.write((await issueTicket(process.env.HB_TICKET_SECRET, 'test', 3600)).ticket)"
```

Der Service Worker läuft im Entwicklungsmodus bewusst **nicht** mit – sonst
bekommt man beim Entwickeln veraltete Dateien ausgeliefert. Zum Testen der
Installierbarkeit und des Offline-Starts `npm run build && npm run preview`.

## Deployment

| | |
|---|---|
| Host | Netlify, Build aus `main` |
| Netlify-Domain | `hoerbuchkinder.netlify.app` |
| App-Domain | `hb.alae.app` |
| Medien-Dienst | `hb-media.alae.app` (QNAP über Cloudflare Tunnel, ab M3) |
| Image des Dienstes | `ghcr.io/vonallmenalain/hb-media:latest` – GitHub baut es bei jeder Änderung an `services/media/**`, das NAS holt es mit `docker compose pull` (oder von selbst, siehe [`docs/QNAP-SETUP.md`](docs/QNAP-SETUP.md#9-aktualisieren)) |

Auto-Publishing ist in Netlify gesperrt: Ein Merge auf `main` baut einen Deploy,
veröffentlicht ihn aber nicht. Das Publishen bleibt ein bewusster Schritt.

Die Content-Security-Policy in `netlify.toml` nennt den Medien-Host namentlich.
Wird der Tunnel unter einer anderen Adresse erreichbar, muss er dort und in
`VITE_MEDIA_BASE_URL` geändert werden.

## Hinweis zu Inhalten

Dieses Repository ist **öffentlich** und enthält ausschliesslich Quellcode und
Dokumentation. Hörbücher, Cover, Kataloge mit echten Titeln sowie sämtliche
Zugangsdaten gehören nicht hierher; `.gitignore` sperrt Medien-Endungen,
`.env`-Dateien und Service-Account-Schlüssel. Alle Beispiele in der
Dokumentation sind erfunden.

Der Schutz der Inhalte liegt im Login und im Ticket-Mechanismus, nicht in der
Geheimhaltung des Quellcodes – siehe [Konzept, Kapitel 9](docs/KONZEPT.md#9-sicherheit-und-urheberrecht).
