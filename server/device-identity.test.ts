import assert from 'node:assert/strict'
import test from 'node:test'
import { DEVICE_ID_PATTERN, hardwareDeviceId, resolveDeviceIdentity, type HardwareIdentity } from './device-identity.js'

const hardware: HardwareIdentity = {
  uuid: 'A1B2C3D4-1234-5678-90AB-123456789ABC',
  biosSerial: 'BIOS-EXAMPLE-42',
  baseboardSerial: 'BOARD-EXAMPLE-57',
}

test('hardware identity normalizes case, UUID braces and whitespace without exposing serials', async () => {
  const expected = hardwareDeviceId(hardware)
  assert.match(expected, DEVICE_ID_PATTERN)
  assert.equal(hardwareDeviceId({ uuid: ' {a1b2c3d4-1234-5678-90ab-123456789abc} ', biosSerial: ' bios-example-42 ', baseboardSerial: ' board-example-57 ' }), expected)
  assert.equal(hardwareDeviceId({ ...hardware, biosSerial: ' bios   example 42 ' }), hardwareDeviceId({ ...hardware, biosSerial: 'BIOS EXAMPLE 42' }))
  assert.equal(await resolveDeviceIdentity(async () => hardware), expected)
  for (const replacement of [
    { uuid: 'A1B2C3D4-1234-5678-90AB-123456789ABD' },
    { biosSerial: 'BIOS-OTHER-42' },
    { baseboardSerial: 'BOARD-OTHER-57' },
  ]) assert.notEqual(hardwareDeviceId({ ...hardware, ...replacement }), expected)
  assert.ok(!expected.includes('EXAMPLE'))
})

test('missing and dummy hardware identifiers fail explicitly instead of assigning a random code', async () => {
  const invalidIdentities: HardwareIdentity[] = [
    {}, { ...hardware, uuid: undefined }, { ...hardware, uuid: 'not-a-uuid' },
    { ...hardware, uuid: '00000000-0000-0000-0000-000000000000' },
    { ...hardware, uuid: 'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF' },
    { ...hardware, uuid: '03000200-0400-0500-0006-000700080009' },
    { uuid: hardware.uuid },
    { uuid: hardware.uuid, biosSerial: 'To Be Filled By O.E.M.', baseboardSerial: 'Default string' },
    { uuid: hardware.uuid, biosSerial: '00000000', baseboardSerial: 'System Serial Number' },
    { uuid: hardware.uuid, biosSerial: '1234567890', baseboardSerial: 'Not Applicable' },
  ]
  for (const identity of invalidIdentities) {
    await assert.rejects(resolveDeviceIdentity(async () => identity), { message: 'Server hardware identity is unavailable; trial licensing cannot start.' })
  }
  await assert.rejects(resolveDeviceIdentity(async () => { throw new Error('Hardware probe unavailable') }), /Hardware probe unavailable/)
})

test('one real serial suffices when the other serial is unavailable', () => {
  assert.match(hardwareDeviceId({ uuid: hardware.uuid, biosSerial: hardware.biosSerial }), DEVICE_ID_PATTERN)
  assert.equal(hardwareDeviceId({ uuid: hardware.uuid, biosSerial: hardware.biosSerial, baseboardSerial: 'Unknown' }), hardwareDeviceId({ uuid: hardware.uuid, biosSerial: hardware.biosSerial }))
})
