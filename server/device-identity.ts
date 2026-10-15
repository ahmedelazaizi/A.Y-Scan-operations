import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'

export const DEVICE_ID_PATTERN = /^AYSCAN-HW2-[0-9A-F]{64}$/
export type HardwareIdentity = { uuid?: string | null; biosSerial?: string | null; baseboardSerial?: string | null }

const unavailableMessage = 'Server hardware identity is unavailable; trial licensing cannot start.'
const dummyIds = new Set([
  'NONE', 'UNKNOWN', 'NA', 'NOTAPPLICABLE', 'NOTAVAILABLE', 'NOTSPECIFIED', 'UNSPECIFIED',
  'DEFAULT', 'DEFAULTSTRING', 'SYSTEMSERIALNUMBER', 'SERIALNUMBER', 'BASEBOARDSERIALNUMBER',
  'TOBEFILLEDBYOEM', 'OEM', 'INVALID', '123456789', '1234567890', '0123456789',
  '03000200040005000006000700080009',
])

function normalizedSerial(serial: string | null | undefined): string | null {
  const normalized = serial?.trim().replace(/\s+/g, ' ').toUpperCase() ?? ''
  const compact = normalized.replace(/[^A-Z0-9]/g, '')
  if (!compact || dummyIds.has(compact) || /^(.)\1*$/.test(compact)) return null
  return normalized
}

export function hardwareDeviceId(identity: HardwareIdentity): string {
  const uuid = identity.uuid?.trim().replace(/^\{(.*)\}$/, '$1').toUpperCase() ?? ''
  if (!/^[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}$/.test(uuid) || !normalizedSerial(uuid)) throw new Error(unavailableMessage)
  const biosSerial = normalizedSerial(identity.biosSerial)
  const baseboardSerial = normalizedSerial(identity.baseboardSerial)
  if (!biosSerial && !baseboardSerial) throw new Error(unavailableMessage)
  const canonical = JSON.stringify(['ayscan-hardware-v2', uuid, biosSerial, baseboardSerial])
  return `AYSCAN-HW2-${createHash('sha256').update(canonical, 'utf8').digest('hex').toUpperCase()}`
}

async function windowsHardwareIdentity(): Promise<HardwareIdentity> {
  const script = "$ErrorActionPreference = 'Stop'; $product = Get-CimInstance Win32_ComputerSystemProduct; $bios = Get-CimInstance Win32_BIOS; $board = Get-CimInstance Win32_BaseBoard; [ordered]@{ uuid = [string]$product.UUID; biosSerial = [string]$bios.SerialNumber; baseboardSerial = [string]$board.SerialNumber } | ConvertTo-Json -Compress"
  const executable = path.win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  return new Promise((resolve, reject) => {
    execFile(executable, ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 15_000, maxBuffer: 16_384, encoding: 'utf8' }, (error, stdout) => {
      // Probe errors can contain serials in stdout/stderr; never expose either in logs.
      if (error) { reject(new Error(unavailableMessage)); return }
      try {
        const identity = JSON.parse(stdout.replace(/^\uFEFF/, '').trim()) as HardwareIdentity
        if (!identity || typeof identity !== 'object' || Object.values(identity).some((serial) => typeof serial !== 'string')) throw new Error(unavailableMessage)
        resolve(identity)
      } catch { reject(new Error(unavailableMessage)) }
    })
  })
}

export async function resolveDeviceIdentity(readHardware?: () => Promise<HardwareIdentity>): Promise<string> {
  if (readHardware) return hardwareDeviceId(await readHardware())
  // No machine-id fallback: a copied Linux filesystem is not proof of the same hardware.
  if (process.platform !== 'win32') throw new Error(unavailableMessage)
  return hardwareDeviceId(await windowsHardwareIdentity())
}
