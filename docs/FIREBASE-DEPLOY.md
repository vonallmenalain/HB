# Firestore-Regeln automatisch deployen

Die Regeln in [`firestore.rules.tmpl`](../firestore.rules.tmpl) sind der
eigentliche Zugangsriegel der App: Sie entscheiden, wer lesen und schreiben
darf, und wer Zugänge freigeben kann. Bisher mussten sie von Hand deployt
werden – also: daran denken. Ab jetzt erledigt das GitHub bei jeder Änderung an
der Vorlage.

Dafür braucht GitHub zweierlei: ein **Dienstkonto**, das im Namen des Projekts
deployen darf, und die **Adresse des Administrators**, die in die Regeln
eingesetzt wird.

> **Warum die Adresse nicht einfach in der Datei steht:** Dieses Repository ist
> öffentlich. Eine private E-Mail-Adresse gehört dort nicht hinein
> ([Konzept §9.3](KONZEPT.md#93-was-nie-ins-repository-gehört)). In der Vorlage
> steht deshalb `__ADMIN_EMAIL__`, und `npm run rules` setzt beim Deployen die
> echte Adresse ein.

---

## Teil 1 – Dienstkonto in der Google-Cloud-Konsole

Zeitaufwand: ein paar Minuten, einmalig.

### 1. Projekt öffnen

<https://console.cloud.google.com> öffnen und oben in der Projektauswahl
**hoerbuchkinder** wählen. Es ist dasselbe Projekt wie in der
Firebase-Konsole – Firebase *ist* ein Google-Cloud-Projekt, nur mit einer
freundlicheren Oberfläche.

### 2. Dienstkonto anlegen

Menü links → **IAM und Verwaltung** → **Dienstkonten**
(direkt: <https://console.cloud.google.com/iam-admin/serviceaccounts>).

1. Oben auf **+ Dienstkonto erstellen**.
2. **Name:** `github-firestore-rules`
   Die Konto-ID füllt sich von selbst, die E-Mail-Adresse des Dienstkontos
   lautet dann
   `github-firestore-rules@hoerbuchkinder.iam.gserviceaccount.com`.
3. **Beschreibung** (freiwillig): „Deployt die Firestore-Regeln aus GitHub
   Actions“.
4. Auf **Erstellen und fortfahren**.

### 3. Rollen vergeben

Jetzt kommt der Schritt, der über Funktionieren oder Nicht-Funktionieren
entscheidet. Im Abschnitt **Diesem Dienstkonto Zugriff auf das Projekt
gewähren** zwei Rollen hinzufügen:

| Rolle | Kennung | Wofür |
|---|---|---|
| **Firebase Rules Admin** | `roles/firebaserules.admin` | Regeln hochladen und aktiv schalten. Das ist die eigentliche Arbeit. |
| **Firebase Viewer** | `roles/firebase.viewer` | Das Projekt überhaupt finden. Ohne sie bricht die CLI mit „Failed to get Firebase project“ ab, noch bevor sie etwas hochlädt. |

So kommt man hin: **+ Weitere Rolle hinzufügen** → ins Filterfeld
`Firebase Rules Admin` tippen → auswählen. Dann noch einmal
**+ Weitere Rolle hinzufügen** → `Firebase Viewer` → auswählen.

Danach **Weiter** und **Fertig**. Den Schritt „Nutzern Zugriff auf dieses
Dienstkonto gewähren“ einfach überspringen.

> **Weniger geht nicht, mehr braucht es nicht.** „Firebase Rules Admin“ darf
> ausschliesslich Regeln verwalten – keine Daten lesen, keine Nutzer anlegen,
> nichts löschen. Falls später doch einmal eine Fehlermeldung über fehlende
> Berechtigungen auftaucht, steht unter [Wenn etwas schiefgeht](#wenn-etwas-schiefgeht),
> was dann zu tun ist.

### 4. Schlüssel erzeugen

1. In der Liste der Dienstkonten auf `github-firestore-rules@…` klicken.
2. Reiter **Schlüssel** → **Schlüssel hinzufügen** → **Neuen Schlüssel
   erstellen**.
3. Typ **JSON** wählen → **Erstellen**.

Der Browser lädt eine `.json`-Datei herunter. **Diese Datei ist ein Passwort.**
Sie gehört nicht ins Repository, nicht in eine E-Mail und nicht in einen Chat –
gleich nach Teil 2 kann sie gelöscht werden.

---

## Teil 2 – Geheimnisse in GitHub hinterlegen

Im Repository: **Settings** → **Secrets and variables** → **Actions** →
**New repository secret**. Zwei Stück:

| Name | Inhalt |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Der **komplette Inhalt** der heruntergeladenen JSON-Datei – mit Datei-Editor öffnen, alles markieren, einfügen. Von `{` bis `}`. |
| `HB_ADMIN_EMAIL` | Die E-Mail-Adresse des Administratorkontos, also die Google-Adresse, mit der du dich in der App anmeldest. |

Danach kann die heruntergeladene JSON-Datei vom Rechner gelöscht werden: In
GitHub liegt sie verschlüsselt, und herauslesen lässt sie sich dort nicht mehr.

---

## Teil 3 – Dieselbe Adresse in Netlify

Die App muss wissen, wem sie den Adminbereich zeigen soll. In Netlify:
**Site settings** → **Environment variables** → **Add a variable**:

| Name | Wert |
|---|---|
| `VITE_ADMIN_EMAIL` | dieselbe Adresse wie in `HB_ADMIN_EMAIL` |

Danach einmal neu bauen lassen (**Deploys** → **Trigger deploy** →
**Deploy site**), denn die Variable wird beim Bauen eingesetzt.

> Der Adminbereich wird nicht dadurch sicher, dass diese Variable stimmt. Sie
> blendet ihn nur ein. Was jemand wirklich darf, entscheiden die
> Firestore-Regeln – und die kennen die Adresse aus `HB_ADMIN_EMAIL`. Stehen
> dort zwei verschiedene Adressen, sieht das eine Konto einen Adminbereich, in
> dem nichts lädt.

---

## Teil 4 – Loslaufen lassen

Der Workflow startet von selbst, sobald auf `main` etwas an der Regel-Vorlage
geändert wird. Zum ersten Mal von Hand:

**Actions** → links **Firestore-Regeln** → rechts **Run workflow** →
Branch `main` → **Run workflow**.

Grüner Haken heisst: Die Regeln sind live. Nachsehen lässt sich das in der
Firebase-Konsole unter **Firestore Database** → **Regeln**; dort steht oben,
wann zuletzt veröffentlicht wurde.

---

## Wenn etwas schiefgeht

| Meldung im Protokoll | Ursache und Abhilfe |
|---|---|
| `Es fehlen Repository-Geheimnisse: …` | Teil 2 ist noch nicht erledigt, oder ein Name ist vertippt. Gross- und Kleinschreibung zählt. |
| `HB_ADMIN_EMAIL sieht nicht wie eine E-Mail-Adresse aus` | Beim Einfügen ist ein Leerzeichen oder ein Zeilenumbruch mitgekommen. Geheimnis neu setzen. |
| `Failed to get Firebase project` | Die Rolle **Firebase Viewer** fehlt (Teil 1, Schritt 3). |
| `PERMISSION_DENIED` beim Hochladen | Die Rolle **Firebase Rules Admin** fehlt. |
| `SERVICE_DISABLED` oder etwas mit `serviceusage` | In der Cloud-Konsole unter **APIs und Dienste** die *Firebase Rules API* und die *Firebase Management API* aktivieren. Hilft das nicht, dem Dienstkonto zusätzlich die Rolle **Service Usage Consumer** (`roles/serviceusage.serviceUsageConsumer`) geben. |
| Regeln sind deployt, aber der Adminbereich bleibt leer | In `HB_ADMIN_EMAIL` und `VITE_ADMIN_EMAIL` steht nicht dieselbe Adresse – oder Netlify wurde seit dem Setzen der Variablen nicht neu gebaut. |

Änderungen an den Rollen brauchen manchmal ein, zwei Minuten, bis sie greifen.
Bei einem Fehlschlag kurz nach dem Anpassen: **Re-run all jobs** im
fehlgeschlagenen Lauf.

---

## Regeln vorher prüfen

Die Regeln sind der einzige Teil dieser App, dessen Wirkung sich beim Ansehen
nicht überprüfen lässt: Eine Zeile, die richtig aussieht, kann die Tür
aufmachen oder die ganze Familie aussperren. Deshalb:

```bash
npm run rules:check
```

Das startet den Firestore-Emulator und spielt knapp dreissig Fälle durch –
Administrator, freigegebenes Kind, fremdes Konto, abgelehnte Anfrage. Gebraucht
wird dafür Java; der Emulator lädt sich beim ersten Mal selbst herunter.

Der Durchlauf gehört bewusst nicht zur CI: Java und ein Download von rund
hundert Megabyte bei jedem Pull Request wären zu viel des Guten. Vor einer
Änderung an `firestore.rules.tmpl` gehört er trotzdem einmal gestartet.

## Ohne GitHub deployen

Geht weiterhin, etwa zum Ausprobieren:

```bash
HB_ADMIN_EMAIL=deine@adresse.tld npm run rules
firebase deploy --only firestore:rules
```

`npm run rules` erzeugt `firestore.rules` aus der Vorlage. Die erzeugte Datei
ist per `.gitignore` gesperrt und landet nie im Repository.

---

## Zum Schlüssel

Ein JSON-Schlüssel läuft nicht ab. Wer ihn hat, darf die Regeln dieses Projekts
ändern – mehr nicht, aber das reicht, um die Tür aufzumachen. Deshalb:

- Nur in GitHub-Secrets ablegen, nirgends sonst.
- Kommt er abhanden: in der Cloud-Konsole beim Dienstkonto unter **Schlüssel**
  löschen und einen neuen erzeugen. Der alte ist damit sofort wertlos.

Wer ganz ohne Schlüssel auskommen will, kann stattdessen **Workload Identity
Federation** einrichten: GitHub weist sich dann mit einem kurzlebigen Token
aus, und es gibt nichts, was gestohlen werden könnte. Der Preis sind rund ein
Dutzend zusätzliche Schritte in der Cloud-Konsole
(<https://github.com/google-github-actions/auth#workload-identity-federation>).
Für ein Familienprojekt mit einem einzigen Dienstkonto ist der Schlüssel der
vernünftigere Kompromiss.
