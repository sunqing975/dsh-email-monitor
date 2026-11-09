import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile(new URL('../src/activity-log.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
const { ActivityLog } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
const input = (id, extra = {}) => ({ id, source: 'manual', status: 'queued', message: 'Summary requested', ...extra })

function fixture() {
  const f = { opens: 0, closes: 0, writes: 0, active: 0, maxActive: 0, tables: { records: {} } }
  f.ctx = { storage: { backend: {
    names: () => ['primary', 'secondary'],
    get(name) {
      assert.equal(name, 'primary')
      return { kv: { async open(descriptor) {
        f.opens++
        assert.match(descriptor.name, /^[a-z][a-z0-9_]*$/)
        for (const table of descriptor.tables) assert.match(table, /^[a-z][a-z0-9_]*$/)
        assert.deepEqual(descriptor, { name: 'dsh_email_activity', version: 1, tables: ['records'], hasGlobal: false, layout: 'single' })
        return {
          async loadAll() { return { tables: structuredClone(f.tables) } },
          async putRecord(table, key, value) {
            f.active++; f.maxActive = Math.max(f.maxActive, f.active)
            try {
              await Promise.resolve()
              if (f.gate) await f.gate
              if (f.failWrite) throw new Error('KV write failed')
              f.writes++
              f.tables[table][key] = structuredClone(value)
            } finally { f.active-- }
          },
          async close() { assert.equal(f.active, 0); f.closes++ },
        }
      } } }
    },
  } } }
  f.log = new ActivityLog(f.ctx)
  return f
}

test('lazy first-backend KV journal persists metadata and reloads newest first', async () => {
  const f = fixture()
  assert.equal(f.opens, 0)
  assert.deepEqual(f.log.monitor, { state: 'waiting' })
  await f.log.record(input('a', { account: 'work', folder: 'INBOX', uid: 12, sessionId: 'session-1', body: 'private body', password: 'secret', error: new Error('private error') }))
  await f.log.record(input('b', { source: 'automatic', uid: 'opaque-id' }))
  const before = await f.log.list()
  assert.deepEqual(before.map(entry => entry.id), ['b', 'a'])
  assert.equal(before[1].uid, 12)
  assert.equal(before[0].uid, 'opaque-id')
  assert.equal(before[1].sessionId, 'session-1')
  assert.doesNotMatch(JSON.stringify(f.tables), /private body|secret|private error|password|body/)
  assert.deepEqual(Object.keys(f.tables.records), ['state'])
  await f.log.close()
  const reloaded = new ActivityLog(f.ctx)
  assert.deepEqual(await reloaded.list(), before)
  await reloaded.close()
  assert.equal(f.opens, 2)
  assert.equal(f.closes, 2)
})

test('deterministic IDs upsert, preserve creation time, refresh update time and move first', async () => {
  const f = fixture()
  f.tables.records.state = { entries: [{ ...input('same'), createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-02T00:00:00.000Z' }] }
  await f.log.record(input('other'))
  await f.log.record(input('same', { source: 'monitor', status: 'complete', message: 'Summary ready' }))
  const entries = await f.log.list()
  assert.equal(entries.length, 2)
  assert.equal(entries[0].id, 'same')
  assert.equal(entries[0].createdAt, '2020-01-01T00:00:00.000Z')
  assert.ok(entries[0].updatedAt > '2020-01-02T00:00:00.000Z')
  assert.equal(entries[0].status, 'complete')
  assert.equal(entries[0].message, 'Summary ready')
  await f.log.close()
})

test('concurrent writes serialize, keep 500 latest entries in one durable record and retain updated IDs', async () => {
  const f = fixture()
  await Promise.all(Array.from({ length: 550 }, (_, i) => f.log.record(input(String(i)))))
  assert.equal(f.maxActive, 1)
  assert.equal(f.opens, 1)
  const entries = await f.log.list()
  assert.equal(entries.length, 500)
  assert.deepEqual(entries.map(entry => entry.id), Array.from({ length: 500 }, (_, i) => String(549 - i)))
  assert.equal(f.tables.records.state.entries.length, 500)
  assert.deepEqual(Object.keys(f.tables.records), ['state'])
  await Promise.all(Array.from({ length: 10 }, (_, i) => f.log.record(input('100', { message: String(i) }))))
  assert.equal((await f.log.list())[0].message, '9')
  assert.equal((await f.log.list()).length, 500)
  await f.log.close()
  const reloaded = new ActivityLog(f.ctx)
  assert.equal((await reloaded.list()).length, 500)
  assert.equal((await reloaded.list())[0].id, '100')
  await reloaded.close()
})

test('inputs and returned entries are copies and list observes earlier queued writes', async () => {
  const f = fixture(), value = input('original')
  const write = f.log.record(value)
  value.id = 'mutated'; value.message = 'mutated'
  const reading = f.log.list()
  await write
  const entries = await reading
  assert.equal(entries[0].id, 'original')
  entries[0].message = 'tampered'; entries.push({ id: 'injected' })
  const next = await f.log.list()
  assert.equal(next.length, 1)
  assert.equal(next[0].message, 'Summary requested')
  assert.equal(f.tables.records.state.entries[0].message, 'Summary requested')
  await f.log.close()
})

test('failed writes reject without changing state or poisoning the queue', async () => {
  const f = fixture()
  await f.log.record(input('good'))
  f.failWrite = true
  await assert.rejects(f.log.record(input('bad')), /KV write failed/)
  assert.deepEqual((await f.log.list()).map(entry => entry.id), ['good'])
  f.failWrite = false
  await f.log.record(input('next'))
  assert.deepEqual((await f.log.list()).map(entry => entry.id), ['next', 'good'])
  await f.log.close()
})

test('close drains accepted writes, closes once and rejects subsequent work', async () => {
  const f = fixture()
  let release
  f.gate = new Promise(resolve => { release = resolve })
  const write = f.log.record(input('pending'))
  const closing = f.log.close()
  await assert.rejects(f.log.record(input('late')), /closed/)
  await assert.rejects(f.log.list(), /closed/)
  assert.equal(f.closes, 0)
  release()
  await Promise.all([write, closing, f.log.close()])
  assert.equal(f.tables.records.state.entries[0].id, 'pending')
  assert.equal(f.closes, 1)
  const unused = fixture()
  await unused.log.close()
  assert.equal(unused.opens, 0)
  assert.equal(unused.closes, 0)
})

test('missing backend fails safely and can be retried when storage becomes available', async () => {
  const f = fixture(), ctx = {}
  const log = new ActivityLog(ctx)
  await assert.rejects(log.list(), /storage unavailable/)
  ctx.storage = f.ctx.storage
  assert.deepEqual(await log.list(), [])
  await log.close()
})
