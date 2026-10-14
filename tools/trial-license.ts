import { generateKeyPairSync, sign } from 'node:crypto'
import { mkdir, open, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const root = process.cwd()
const args = process.argv.slice(2)
const command = args[0]
const secrets = path.join(root, 'secrets')
const privateDir = path.join(os.homedir(), '.ay-scan')
const privatePath = path.join(privateDir, 'trial-private.pem')
if (command === 'keygen') {
  await mkdir(secrets, { recursive: true })
  await mkdir(privateDir, { recursive: true })
  const publicPath = path.join(secrets, 'trial-public.pem')
  try {
    await readFile(privatePath)
    throw new Error('Key files already exist; refusing to overwrite.')
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  try {
    await readFile(publicPath)
    throw new Error('Key files already exist; refusing to overwrite.')
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  const pair = generateKeyPairSync('ed25519')
  const priv = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const pub = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const handle = await open(privatePath, 'wx', 0o600)
  await handle.writeFile(priv, 'utf8'); await handle.close()
  await writeFile(publicPath, pub, { flag: 'wx' })
  console.log(`Generated private signing key at ${privatePath} and public key at secrets/trial-public.pem. Keep the private key offline.`)
} else if (command === 'issue') {
  const idFlag = args.indexOf('--installation-id')
  const id = idFlag >= 0 ? args[idFlag + 1] : undefined
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error('Usage: pnpm trial:issue -- --installation-id <uuid>')
  const privateKey = await readFile(privatePath, 'utf8')
  const body = JSON.stringify({ version: 1, installationId: id, edition: 'trial', recordLimit: 50, issuedAt: new Date().toISOString() })
  const payload = Buffer.from(body).toString('base64url')
  const signature = sign(null, Buffer.from(body), privateKey).toString('base64url')
  console.log(`${payload}.${signature}`)
} else throw new Error('Usage: pnpm trial:keygen | pnpm trial:issue -- --installation-id <uuid>')
