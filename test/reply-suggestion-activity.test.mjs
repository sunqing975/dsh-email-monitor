import test from 'node:test'
import assert from 'node:assert/strict'
import { createReplySuggestion } from '../lib/reply-suggestion.js'

test('manual activity retains session association on submission and failure without mail contents', async () => {
  const rows = []
  const runtime = {
    getEffectiveSettings: () => ({ defaultAccount: 'work', accounts: new Map([['work', { imap: {}, inboxFolder: 'INBOX' }]]) }),
    getPool: () => ({ read: async () => ({ account: 'work', folder: 'INBOX', uid: 3, text: 'private body', subject: 'private subject', attachments: [] }) }),
  }
  let fail = true
  const sessions = { create: async () => 'session-1', rename: async () => {}, checkpoint: async () => {}, prompt: async () => { if (fail) throw new Error('secret upstream error') } }
  const suggest = createReplySuggestion(runtime, sessions, () => '/work', { activity: { record: async row => rows.push(row) } })
  const request = { uid: 3, requestId: 'request-1' }
  await assert.rejects(suggest(request, new AbortController().signal))
  assert.equal(rows.at(-1).status, 'failed')
  assert.equal(rows.at(-1).sessionId, 'session-1')
  fail = false
  await suggest(request, new AbortController().signal)
  assert.equal(rows.at(-1).status, 'submitted')
  assert.equal(new Set(rows.map(row => row.id)).size, 1)
  assert.doesNotMatch(JSON.stringify(rows), /private body|private subject|secret upstream/)
})
