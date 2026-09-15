# HB – Hörbuch-App

Private Hörbuch-PWA für die Familie. Die Hörbücher liegen auf dem eigenen
QNAP-NAS, die App ist auf dem Startbildschirm installierbar, spielt im
Hintergrund weiter und merkt sich für jedes Kind punktgenau, wo es aufgehört hat.

> **Status:** M2 steht – Anmeldung, Freigabeliste und Kinderprofile
> funktionieren. Katalog und Player folgen ab M3.

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
  müssen nie ein Passwort eintippen.

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

## Roadmap

| M | Inhalt | Status |
|---|---|---|
| M0 | Konzept | ✅ |
| M1 | Projektgerüst, PWA-Hülle, CI, Netlify | ✅ |
| M2 | Firebase Auth + Kinderprofile | ✅ |
| M3 | NAS-Dienst `hb-media` + Scanner + Tunnel | offen |
| M4 | Bibliothek im Kinderdesign | offen |
| M5 | Player, Hintergrundwiedergabe, Fortschritt | offen |
| M6 | Geräte-Sync über Firestore | offen |
| M7 | Offline-Downloads | offen |
| M8 | Sleep-Timer, Elternmodus, Feinschliff | offen |

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
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript über App, Werkzeuge und Service Worker |
| `npm test` | Vitest |
| `npm run icons` | App-Icons aus `tools/generate-icons.mjs` neu erzeugen |

### Einrichtung

1. `.env.example` nach `apps/web/.env.local` kopieren und die
   Firebase-Web-Konfiguration eintragen. In Netlify liegen dieselben Werte unter
   *Site settings → Environment variables*. Fehlen sie, zeigt die App den
   Bildschirm „Konfiguration fehlt" und nennt die fehlenden Variablen.
2. Firestore-Regeln deployen: `firebase deploy --only firestore:rules`
3. Das eigene Konto freischalten – siehe unten.

### Ein Konto freischalten

Mit aktivierter Google-Anmeldung kann sich grundsätzlich jeder *anmelden*.
Zugriff bekommt nur, wer in der Freigabeliste steht:

1. In der App anmelden. Es erscheint „Noch kein Zugriff" mit der Kennung (UID).
2. In der Firebase-Konsole unter *Firestore → Daten* eine Kollektion
   `allowlist` anlegen und darin ein Dokument mit genau dieser UID als
   Dokument-ID erstellen. Der Inhalt spielt keine Rolle.
3. In der App auf „Nochmal prüfen" tippen.

Zusätzlich empfiehlt sich, unter *Authentication → Settings → User actions* die
Selbst-Registrierung abzuschalten. Das ersetzt die Freigabeliste nicht, hält
aber fremde Konten aus dem Projekt heraus.

### Aufbau

```
apps/web/            PWA (Vite, React, TypeScript, Tailwind)
  src/app/           Router, Anmelde-Weiche, App-Hülle
  src/features/auth/ Anmeldung, Freigabeliste
  src/features/profiles/  Kinderprofile
  src/routes/        Bildschirme
  src/ui/            Design-System-Bausteine
  src/lib/           Firebase, Konfiguration, Hilfsfunktionen
  src/sw.ts          Service Worker (eigener Code, kein generierter)
tools/               Build-Werkzeuge ausserhalb der App
docs/                Konzept und Datenmodell
firestore.rules      Sicherheitsregeln der Datenbank
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
