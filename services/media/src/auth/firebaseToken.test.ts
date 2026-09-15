import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose'
import { beforeAll, describe, expect, it } from 'vitest'

import { InvalidIdTokenError, isUidAllowed, verifyFirebaseIdToken } from './firebaseToken.js'

const PROJECT_ID = 'hoerbuchkinder'
const KID = 'test-key'

let signingKey: CryptoKey
let keySet: ReturnType<typeof createLocalJWKSet>
let otherKey: CryptoKey

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true })
  signingKey = pair.privateKey
  const publicJwk = await exportJWK(pair.publicKey)
  keySet = createLocalJWKSet({ keys: [{ ...publicJwk, kid: KID, alg: 'RS256', use: 'sig' }] })

  const foreign = await generateKeyPair('RS256', { extractable: true })
  otherKey = foreign.privateKey
})

interface TokenOptions {
  sub?: string
  issuer?: string
  audience?: string
  email?: string
  expiresIn?: string
  key?: CryptoKey
  alg?: string
}

async function makeToken(options: TokenOptions = {}): Promise<string> {
  const payload: Record<string, unknown> = {}
  if (options.email !== undefined) payload.email = options.email

  const jwt = new SignJWT(payload)
    .setProtectedHeader({ alg: options.alg ?? 'RS256', kid: KID })
    .setIssuer(options.issuer ?? `https://securetoken.google.com/${PROJECT_ID}`)
    .setAudience(options.audience ?? PROJECT_ID)
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '1h')

  if (options.sub !== undefined) jwt.setSubject(options.sub)
  return jwt.sign(options.key ?? signingKey)
}

const verify = (token: string) => verifyFirebaseIdToken(token, { projectId: PROJECT_ID, keySet })

describe('verifyFirebaseIdToken', () => {
  it('nimmt ein gültiges Token an', async () => {
    const token = await makeToken({ sub: 'uid-1', email: 'papa@example.com' })
    await expect(verify(token)).resolves.toEqual({ uid: 'uid-1', email: 'papa@example.com' })
  })

  it('liefert null als E-Mail, wenn keine im Token steht', async () => {
    const token = await makeToken({ sub: 'uid-1' })
    await expect(verify(token)).resolves.toEqual({ uid: 'uid-1', email: null })
  })

  it('lehnt ein Token eines fremden Projekts ab', async () => {
    // Genau der Fall, gegen den die Prüfung schützt: ein anderswo gültiges
    // Firebase-Token darf hier nichts öffnen.
    const token = await makeToken({
      sub: 'uid-1',
      issuer: 'https://securetoken.google.com/fremdes-projekt',
      audience: 'fremdes-projekt',
    })
    await expect(verify(token)).rejects.toBeInstanceOf(InvalidIdTokenError)
  })

  it('lehnt ein Token mit falscher Zielgruppe ab', async () => {
    const token = await makeToken({ sub: 'uid-1', audience: 'etwas-anderes' })
    await expect(verify(token)).rejects.toBeInstanceOf(InvalidIdTokenError)
  })

  it('lehnt ein Token mit fremdem Schlüssel ab', async () => {
    const token = await makeToken({ sub: 'uid-1', key: otherKey })
    await expect(verify(token)).rejects.toBeInstanceOf(InvalidIdTokenError)
  })

  it('lehnt ein abgelaufenes Token ab', async () => {
    const token = await makeToken({ sub: 'uid-1', expiresIn: '-1h' })
    await expect(verify(token)).rejects.toBeInstanceOf(InvalidIdTokenError)
  })

  it('lehnt ein Token ohne Nutzerkennung ab', async () => {
    const token = await makeToken({})
    await expect(verify(token)).rejects.toThrow(/Nutzerkennung/)
  })

  it('lehnt Unsinn ab', async () => {
    await expect(verify('')).rejects.toBeInstanceOf(InvalidIdTokenError)
    await expect(verify('kein.token')).rejects.toBeInstanceOf(InvalidIdTokenError)
  })
})

describe('isUidAllowed', () => {
  it('lässt bei leerer Liste jeden verifizierten Nutzer durch', () => {
    expect(isUidAllowed('uid-1', [])).toBe(true)
  })

  it('prüft gegen die Liste, sobald eine da ist', () => {
    expect(isUidAllowed('uid-1', ['uid-1', 'uid-2'])).toBe(true)
    expect(isUidAllowed('uid-3', ['uid-1', 'uid-2'])).toBe(false)
  })
})
