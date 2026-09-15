#!/usr/bin/env node
/**
 * Erzeugt `firestore.rules` aus `firestore.rules.tmpl`.
 *
 *   HB_ADMIN_EMAIL=… npm run rules
 *
 * Die Adresse des Administrators steht in den Regeln, aber nicht im
 * Repository: Es ist öffentlich, und eine private Adresse gehört dort nicht
 * hinein (KONZEPT §9.3). Sie kommt deshalb aus einem Geheimnis – in GitHub aus
 * `secrets.HB_ADMIN_EMAIL`, von Hand aus der Umgebung.
 *
 * Fehlt sie, bricht dieses Werkzeug ab, statt Regeln mit einem Platzhalter zu
 * erzeugen. Die wären nicht etwa unsicher, sondern schlimmer: Sie sähen
 * richtig aus, und niemand wäre mehr Administrator.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const template = join(root, 'firestore.rules.tmpl')
const target = join(root, 'firestore.rules')
const PLACEHOLDER = '__ADMIN_EMAIL__'

/**
 * `--probe` erzeugt Regeln mit einer erfundenen Adresse.
 *
 * Für den Emulator-Durchlauf und für den CI-Schritt, der nur wissen will, ob
 * sich die Vorlage überhaupt erzeugen lässt. Deployt wird damit nie.
 */
const probe = process.argv.includes('--probe')
const email = probe
  ? 'chef@example.test'
  : (process.env.HB_ADMIN_EMAIL ?? '').trim().toLowerCase()

if (email === '') {
  console.error(
    'HB_ADMIN_EMAIL fehlt. Ohne die Adresse des Administrators wären die Regeln\n' +
      'zwar gültig, aber niemand könnte Zugänge freigeben.\n\n' +
      '  HB_ADMIN_EMAIL=name@example.com npm run rules',
  )
  process.exit(1)
}

// Kein Rundum-Schutz, sondern die Fehler, die tatsächlich passieren: ein
// versehentliches Leerzeichen, ein Zeilenumbruch, ein Apostroph, der die
// Zeichenkette in den Regeln sprengen würde.
if (!/^[^\s'"\\@]+@[^\s'"\\@]+\.[^\s'"\\@]+$/.test(email)) {
  console.error(`HB_ADMIN_EMAIL sieht nicht wie eine E-Mail-Adresse aus: ${email}`)
  process.exit(1)
}

const source = await readFile(template, 'utf8')
if (!source.includes(PLACEHOLDER)) {
  console.error(`In ${template} steht kein ${PLACEHOLDER} – da stimmt etwas nicht.`)
  process.exit(1)
}

const rendered = source.replaceAll(PLACEHOLDER, email)
await writeFile(target, rendered, 'utf8')

console.log(`firestore.rules geschrieben (Administrator: ${email})`)
