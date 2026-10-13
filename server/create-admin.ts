import { loadServerConfig } from './config.js'
import { AuthInputError } from './auth/service.js'
import { createStores } from './storage/factory.js'

/**
 * Creates the first admin account on an empty installation. Reads AUTH_ADMIN_EMAIL, AUTH_ADMIN_PASSWORD and
 * AUTH_ADMIN_DISPLAY_NAME from the process environment (the installer sets them for this process only).
 * Exit codes: 0 created or already initialized, 1 failure, 2 invalid input.
 * With --check it only reports whether any account exists: exit 0 when initialized, 3 when empty.
 */
const config = loadServerConfig()
const stores = createStores(config.databaseUrl, { timeZone: config.timeZone })
try {
  if (process.argv.includes('--check')) {
    const initialized = await stores.auth.hasUsers()
    console.log(initialized ? 'initialized' : 'empty')
    process.exitCode = initialized ? 0 : 3
  } else {
    await createAdmin()
  }
} catch (error) {
  console.error(`Admin setup failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  await stores.close()
}

async function createAdmin(): Promise<void> {
  try {
    const outcome = await stores.auth.bootstrapAdmin()
    if (outcome === 'created') console.log(`Admin account created: ${process.env.AUTH_ADMIN_EMAIL?.trim().toLowerCase()}`)
    else console.log('Users already exist; no admin account was created.')
  } catch (error) {
    if (!(error instanceof AuthInputError)) throw error
    console.error(`Invalid admin details: ${error.message}`)
    process.exitCode = 2
  }
}
