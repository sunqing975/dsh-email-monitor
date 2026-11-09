import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { EmailSettingsSchema, toSettingsBase, validateSettingsValue } from '../lib/settings.js'
import { createEmailRuntime } from '../lib/runtime.js'
import { EmailSettingsBackend } from '../lib/web.js'

test('legacy popup preference remains compatible without replacing credentials or IMAP sessions', async t => {
  assert.equal(EmailSettingsSchema({}).newMailPopup, true)
  assert.equal(EmailSettingsSchema(toSettingsBase({ newMailPopup: false })).newMailPopup, false)
  assert.throws(() => validateSettingsValue({ newMailPopup: 'false' }), /布尔/)
  let value = { provider: 'qq', user: 'me@example.test', password: 'fixture-secret', newMailPopup: true }, revision = 1
  const refs = Object.fromEntries(Object.keys(value).map(key => [key, { get: () => value[key] }]))
  const ctx = { fiber: { entry: { options: { id: 'email' } } }, settings: {
    describe: () => [{ ns: 'email', user: value, revision }],
    async update(_ns, patch, expected) { assert.equal(expected, revision); value = { ...value, ...patch }; revision++ },
  }, effect: fn => fn() }
  let created = 0
  const runtime = createEmailRuntime(ctx, refs, () => { created++; return { startIdleSweep() {}, dispose() {} } })
  t.after(() => runtime.dispose())
  const pool = runtime.getPool()
  await new EmailSettingsBackend(ctx, runtime.settingsScope, refs).save({ newMailPopup: false }, revision)
  assert.equal(value.newMailPopup, false)
  assert.equal(value.password, 'fixture-secret')
  assert.equal(runtime.getPool(), pool)
  assert.equal(created, 1)
  assert.equal((await new EmailSettingsBackend(ctx, runtime.settingsScope, refs).snapshot()).settings.value.newMailPopup, false)
})

test('focused client has no independent browser mail watcher', () => {
  const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /startWhaleWidget|updateWhalePreference/)
  assert.match(source, /monitorGet/)
  assert.match(source, /monitorSave/)
})
