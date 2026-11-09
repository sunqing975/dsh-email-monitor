import test from 'node:test'
import assert from 'node:assert/strict'
import { monitorControls } from '../lib/monitor-controls.js'
import { EmailMailboxBackend } from '../lib/mailbox-web.js'

test('monitor settings edit actual entry and preserve account credentials', async () => {
  const entry = { id: 'include:tool-email', options: { id: 'tool-email', name: 'dsh-email-monitor' } }
  const unrelated = { id: 'other:tool-email', options: { id: 'tool-email', name: 'dsh-email-monitor' } }
  let raw = { password: 'private', accountsYaml: 'retained', incomingMonitorEnabled: false }
  const config = { incomingMonitorEnabled: false }
  const action = monitorControls({ configEditor: { entries: () => [unrelated, entry], async edit(target, change) {
    assert.equal(target, entry); raw = change(raw); Object.assign(config, raw)
  } } }, {}, config)
  assert.equal((await action({ action: 'monitorGet' })).enabled, false)
  const result = await action({ action: 'monitorSave', enabled: false, account: '', folder: 'INBOX', pollSeconds: 60, cwd: '/tmp' })
  assert.equal(result.cwd, '/tmp')
  assert.equal(raw.password, 'private'); assert.equal(raw.accountsYaml, 'retained')
  assert.equal((await action({ action: 'monitorGet' })).pollSeconds, 60)
  await assert.rejects(action({ action: 'monitorSave', enabled: false, pollSeconds: 29 }), /Interval/)
  await assert.rejects(action({ action: 'monitorSave', enabled: false, pollSeconds: 60, cwd: 'relative' }), /absolute/)
})

test('focused mailbox blocks mutation before accessing the mail pool and dispatches shared assistant action', async () => {
  let touched = false
  const backend = new EmailMailboxBackend({ getEffectiveSettings() { touched = true; throw new Error('unexpected') } })
  backend.assistantOnly = true
  for (const action of ['mark', 'trashConfirm', 'folderDelete', 'replyDraft']) await assert.rejects(backend.action({ action }), /Only reading/)
  backend.assistantAction = async body => ({ sessionId: body.requestId })
  assert.deepEqual(await backend.action({ action: 'suggest', requestId: 'same' }), { sessionId: 'same' })
  for (const action of ['activityList', 'activitySession']) assert.deepEqual(await backend.action({ action, requestId: 'same' }), { sessionId: 'same' })
  assert.equal(touched, false)
})
