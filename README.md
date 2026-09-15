# HB – Hörbuch-App

Private Hörbuch-PWA für die Familie. Die Hörbücher liegen auf dem eigenen
QNAP-NAS, die App ist auf dem Startbildschirm installierbar, spielt im
Hintergrund weiter und merkt sich für jedes Kind punktgenau, wo es aufgehört hat.

> **Status:** Konzeptphase. Es gibt noch keinen Code – zuerst wird das Konzept
> abgestimmt, dann startet die Umsetzung mit Meilenstein M1.

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

## Dokumentation

| Dokument | Inhalt |
|---|---|
| [`docs/KONZEPT.md`](docs/KONZEPT.md) | Ziele, Bedienkonzept für Kinder, Architektur, Sicherheit, Offline-Strategie, Risiken, Roadmap, **offene Fragen** |
| [`docs/DATENMODELL.md`](docs/DATENMODELL.md) | Ordnerkonvention auf dem NAS, Katalog-Schema, Firestore-Struktur, API-Verträge |

## Roadmap

| M | Inhalt | Status |
|---|---|---|
| M0 | Konzept | ✅ |
| M1 | Projektgerüst, PWA-Hülle, CI, Netlify | offen |
| M2 | Firebase Auth + Kinderprofile | offen |
| M3 | NAS-Dienst `hb-media` + Scanner + Tunnel | offen |
| M4 | Bibliothek im Kinderdesign | offen |
| M5 | Player, Hintergrundwiedergabe, Fortschritt | offen |
| M6 | Geräte-Sync über Firestore | offen |
| M7 | Offline-Downloads | offen |
| M8 | Sleep-Timer, Elternmodus, Feinschliff | offen |

Details und Begründungen in [`docs/KONZEPT.md`](docs/KONZEPT.md#12-roadmap).

## Hinweis zu Inhalten

Dieses Repository enthält **ausschliesslich Quellcode und Dokumentation**.
Hörbücher, Cover, Kataloge mit echten Titeln sowie sämtliche Zugangsdaten
gehören nicht hierher und sind über `.gitignore` gesperrt.
