import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto'

const SCHEME = 'scrypt'
const KEY_LENGTH = 64
const SALT_BYTES = 16
const DEFAULT_PARAMETERS = { N: 16384, r: 8, p: 1 } as const
export const MIN_PASSWORD_LENGTH = 10
export const MAX_PASSWORD_LENGTH = 200

function deriveKey(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, { ...options, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })
}

/** Returns a self-describing hash: scrypt$N$r$p$salt$key (base64url segments). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES)
  const { N, r, p } = DEFAULT_PARAMETERS
  const key = await deriveKey(password, salt, { N, r, p })
  return [SCHEME, N, r, p, salt.toString('base64url'), key.toString('base64url')].join('$')
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [scheme, nText, rText, pText, saltText, keyText] = storedHash.split('$')
  const N = Number(nText)
  const r = Number(rText)
  const p = Number(pText)
  if (scheme !== SCHEME || !saltText || !keyText || ![N, r, p].every(Number.isSafeInteger)) return false
  const expected = Buffer.from(keyText, 'base64url')
  const actual = await deriveKey(password, Buffer.from(saltText, 'base64url'), { N, r, p })
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

/** A real hash of a random value, verified against when the account does not exist to keep timing uniform. */
let dummyHash: Promise<string> | null = null
export function getDummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(24).toString('base64url'))
  return dummyHash
}

export function passwordPolicyError(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  if (password.length > MAX_PASSWORD_LENGTH) return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`
  if (!/[A-Za-z؀-ۿ]/.test(password) || !/\d/.test(password)) return 'Password must contain letters and digits.'
  return null
}
