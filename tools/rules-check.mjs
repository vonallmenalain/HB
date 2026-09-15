#!/usr/bin/env node
/**
 * Prüft die Firestore-Regeln gegen den echten Emulator.
 *
 *   npm run rules:check        (braucht Java und lädt beim ersten Mal den Emulator)
 *
 * Die Regeln sind der einzige Teil dieser App, dessen Wirkung sich beim Ansehen
 * nicht überprüfen lässt: Eine Zeile, die richtig aussieht, kann die Tür
 * aufmachen oder die Familie aussperren. Beides fiele erst im Betrieb auf –
 * das eine peinlich, das andere ärgerlich.
 *
 * Bewusst nicht Teil von `npm test`: Der Emulator braucht Java und einen
 * Download von rund hundert Megabyte. Vor jeder Änderung an
 * `firestore.rules.tmpl` gehört er trotzdem einmal laufen gelassen.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const rules = readFileSync(join(root, 'firestore.rules'), 'utf8')

// Dieselbe Adresse, die `render-rules.mjs --probe` einsetzt.
const ADMIN = { sub: 'uid_admin', email: 'chef@example.test', email_verified: true }
/** Dieselbe Adresse, aber unbestätigt – etwa aus einer Passwort-Registrierung. */
const UNBESTAETIGT = { sub: 'uid_fake', email: 'chef@example.test', email_verified: false }
const KIND = { sub: 'uid_kind', email: 'kind@example.test', email_verified: true }
const FREMD = { sub: 'uid_fremd', email: 'fremd@example.test', email_verified: true }
const ABGELEHNT = { sub: 'uid_weg', email: 'weg@example.test', email_verified: true }

const env = await initializeTestEnvironment({
  projectId: 'demo-hb',
  firestore: { host: '127.0.0.1', port: 8181, rules },
})

const db = (token) => env.authenticatedContext(token.sub, token).firestore()

// Ausgangslage, an den Regeln vorbei angelegt.
await env.withSecurityRulesDisabled(async (ctx) => {
  const raw = ctx.firestore()
  await setDoc(doc(raw, 'allowlist/uid_kind'), { email: 'kind@example.test' })
  await setDoc(doc(raw, 'bookTitles/b_1'), { title: 'Alt' })
  await setDoc(doc(raw, 'accessRequests/uid_weg'), {
    uid: 'uid_weg',
    requestedAt: '2026-01-01',
    status: 'denied',
  })
})

const ergebnisse = []
const darf = async (name, fn) => pruefe(name, () => assertSucceeds(fn()))
const darfNicht = async (name, fn) => pruefe(name, () => assertFails(fn()))

async function pruefe(name, fn) {
  try {
    await fn()
    ergebnisse.push([true, name])
  } catch (error) {
    ergebnisse.push([false, `${name} → ${String(error).slice(0, 200)}`])
  }
}

// --- Administrator
await darf('Admin liest die Freigabeliste', () => getDocs(collection(db(ADMIN), 'allowlist')))
await darf('Admin gibt frei', () =>
  setDoc(doc(db(ADMIN), 'allowlist/uid_fremd'), { email: 'fremd@example.test' }))
await darf('Admin entzieht Zugriff', () => deleteDoc(doc(db(ADMIN), 'allowlist/uid_fremd')))
await darf('Admin trägt sich selbst ein (Bootstrap)', () =>
  setDoc(doc(db(ADMIN), 'allowlist/uid_admin'), { role: 'admin' }))
await darf('Admin liest offene Anfragen', () =>
  getDocs(collection(db(ADMIN), 'accessRequests')))
await darf('Admin liest die Hörhistorie', () => getDocs(collection(db(ADMIN), 'listening')))
await darf('Admin setzt Titel', () => setDoc(doc(db(ADMIN), 'bookTitles/b_1'), { title: 'Neu' }))

// Ohne diese Prüfung könnte sich jemand ein Passwortkonto mit derselben
// Adresse anlegen und wäre Administrator.
await darfNicht('Unbestätigte Adresse ist kein Admin', () =>
  getDocs(collection(db(UNBESTAETIGT), 'allowlist')))

// --- Freigegebenes Konto
await darfNicht('Kind sieht die Freigabeliste nicht', () =>
  getDocs(collection(db(KIND), 'allowlist')))
await darf('Kind sieht den eigenen Eintrag', () => getDoc(doc(db(KIND), 'allowlist/uid_kind')))
await darfNicht('Kind gibt sich nicht selbst frei', () =>
  setDoc(doc(db(KIND), 'allowlist/uid_kind'), { role: 'admin' }))
await darf('Kind liest Titel', () => getDoc(doc(db(KIND), 'bookTitles/b_1')))
await darfNicht('Kind ändert keine Titel', () =>
  setDoc(doc(db(KIND), 'bookTitles/b_1'), { title: 'Quatsch' }))
await darf('Kind schreibt eigene Profile', () =>
  setDoc(doc(db(KIND), 'users/uid_kind/profiles/p1'), { name: 'Emma' }))
await darf('Kind schreibt eigene Favoriten', () =>
  setDoc(doc(db(KIND), 'users/uid_kind/profiles/p1/favorites/b_1'), { addedAt: 'x' }))
await darfNicht('Kind liest fremde Profile nicht', () =>
  getDoc(doc(db(KIND), 'users/uid_admin/profiles/p1')))
await darf('Kind schreibt die eigene Historie', () =>
  setDoc(
    doc(db(KIND), 'listening/uid_kind_p1_b1'),
    { uid: 'uid_kind', bookId: 'b_1', plays: 1 },
    { merge: true },
  ))
await darfNicht('Kind schreibt keine fremde Historie', () =>
  setDoc(doc(db(KIND), 'listening/uid_admin_p1_b1'), { uid: 'uid_kind', bookId: 'b_1' }))
await darfNicht('Kind liest die Historie nicht', () =>
  getDocs(collection(db(KIND), 'listening')))

// --- Angemeldet, aber nicht freigegeben
await darf('Fremder stellt eine Anfrage', () =>
  setDoc(doc(db(FREMD), 'accessRequests/uid_fremd'), {
    uid: 'uid_fremd',
    email: 'fremd@example.test',
    name: 'Oma',
    requestedAt: '2026-01-01',
    status: 'pending',
  }))
await darfNicht('Fremder gibt sich nicht selbst frei', () =>
  setDoc(doc(db(FREMD), 'accessRequests/uid_fremd'), {
    uid: 'uid_fremd',
    requestedAt: '2026-01-01',
    status: 'approved',
  }))
await darfNicht('Fremder schreibt keine fremde Anfrage', () =>
  setDoc(doc(db(FREMD), 'accessRequests/uid_kind'), {
    uid: 'uid_fremd',
    requestedAt: '2026-01-01',
    status: 'pending',
  }))
await darfNicht('Fremder schmuggelt kein Zusatzfeld ein', () =>
  setDoc(doc(db(FREMD), 'accessRequests/uid_fremd'), {
    uid: 'uid_fremd',
    requestedAt: '2026-01-01',
    status: 'pending',
    role: 'admin',
  }))
await darfNicht('Abgelehnte Anfrage lässt sich nicht neu stellen', () =>
  setDoc(doc(db(ABGELEHNT), 'accessRequests/uid_weg'), {
    uid: 'uid_weg',
    requestedAt: '2026-02-02',
    status: 'pending',
  }))
await darfNicht('Fremder sieht keine Titel', () => getDoc(doc(db(FREMD), 'bookTitles/b_1')))
await darfNicht('Fremder schreibt keine Historie', () =>
  setDoc(doc(db(FREMD), 'listening/uid_fremd_p1_b1'), { uid: 'uid_fremd', bookId: 'b_1' }))
await darfNicht('Fremder schreibt keine eigenen Daten', () =>
  setDoc(doc(db(FREMD), 'users/uid_fremd/profiles/p1'), { name: 'X' }))

await env.cleanup()

for (const [ok, name] of ergebnisse) console.log(`${ok ? '✓' : '✗'} ${name}`)

const fehler = ergebnisse.filter(([ok]) => !ok).length
console.log(`\n${String(ergebnisse.length - fehler)}/${String(ergebnisse.length)} bestanden`)
process.exit(fehler === 0 ? 0 : 1)
