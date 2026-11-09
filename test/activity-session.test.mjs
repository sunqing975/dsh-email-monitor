import test from 'node:test'
import assert from 'node:assert/strict'
import { apply, MAILBOX_ROUTE } from '../lib/index.js'

const entry = (id, extra = {}) => ({
  id, source: 'manual', status: 'submitted', message: '已提交到会话',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  ...extra,
})

// Install the actual application and use its registered connection route. The
// monitor's separate polling injection is intentionally inactive in this fixture.
function install(t, entries, projection = async () => null) {
  const routes = [], tools = [], disposers = [], effects = []
  const calls = { projections: [], create: 0, resume: 0, sessionGet: 0, writes: 0, closes: 0 }
  const tables = { records: { state: { entries: structuredClone(entries) } } }
  const sessionController = {
    async projections(args, signal) {
      calls.projections.push({ args, signal })
      return projection(args, signal)
    },
    async create() { calls.create++; assert.fail('activity lookup must not create a session') },
    async resume() { calls.resume++; assert.fail('activity lookup must not resume a session') },
  }
  const ctx = {
    settings: { register: () => ({ get: () => ({}) }), describe: () => [] },
    tools: { register: tool => tools.push(tool) },
    storage: { backend: {
      names: () => ['primary'],
      get(name) {
        assert.equal(name, 'primary')
        return { kv: { async open(descriptor) {
          assert.equal(descriptor.name, 'dsh_email_activity')
          return {
            async loadAll() { return { tables: structuredClone(tables) } },
            async putRecord() { calls.writes++; assert.fail('reading activity must not rewrite its journal') },
            async close() { calls.closes++ },
          }
        } } }
      },
    } },
    effect(fn) { effects.push(fn()) },
    on(event, fn) { if (event === 'dispose') disposers.push(fn) },
    get(name) { return name === 'storage' ? this.storage : undefined },
    inject(services, callback) {
      if (services.join(',') === 'connection') {
        callback({ connection: { fetch: { register: route => routes.push(route) } } })
      } else if (services.join(',') === 'sessionController,sessions,configEditor') {
        callback({
          sessionController,
          sessions: { get() { calls.sessionGet++; return undefined }, async flush() { assert.fail('lookup must not flush a session') } },
          configEditor: {}, tools: ctx.tools, effect: ctx.effect,
        })
      }
    },
  }
  apply(ctx, {})
  const disposeEffects = async () => {
    for (const dispose of effects.splice(0).reverse()) if (typeof dispose === 'function') await dispose()
  }
  t.after(async () => {
    await disposeEffects()
    for (const dispose of disposers.reverse()) await dispose()
  })
  const route = routes.find(row => row.path === MAILBOX_ROUTE)
  assert.ok(route, 'application must register the mailbox connection route')
  const activity = tools.find(tool => tool.name === 'email_activity')
  assert.ok(activity, 'application must register email_activity with session services')
  return {
    calls, activity, disposeEffects,
    async action(body) {
      const response = await route.fetch(new Request('http://localhost' + MAILBOX_ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-dsh-email-mailbox': '1' },
        body: JSON.stringify(body),
      }))
      assert.equal(response.status, 200)
      const result = await response.json()
      assert.equal(result.ok, true)
      return result.value
    },
  }
}

test('plugin effect disposal releases the activity unit without a synthetic dispose event', async t => {
  const f = install(t, [])
  await f.action({ action: 'activityList' })
  assert.equal(f.calls.closes, 0)
  await f.disposeEffects()
  assert.equal(f.calls.closes, 1)
  await assert.rejects(f.activity.execute({}), /closed/)
})

function assertLookupOnly(calls) {
  assert.equal(calls.create, 0)
  assert.equal(calls.resume, 0)
  assert.equal(calls.sessionGet, 0, 'cold session availability must use projections rather than the hot session registry')
  assert.equal(calls.writes, 0)
}

test('installed activitySession returns a friendly unavailable result for a removed session without resurrecting it', async t => {
  const recorded = entry('removed', { sessionId: 'session-removed' })
  const f = install(t, [recorded])
  assert.deepEqual(await f.action({ action: 'activitySession', id: 'removed' }), {
    available: false, message: '关联会话已被移除，处理记录仍然保留',
  })
  assert.equal(f.calls.projections.length, 1)
  assert.deepEqual(f.calls.projections[0].args, { sessionId: 'session-removed' })
  assert.ok(f.calls.projections[0].signal instanceof AbortSignal)
  assert.deepEqual((await f.action({ action: 'activityList' })).entries, [recorded])
  assertLookupOnly(f.calls)
})

test('installed activitySession recognizes an existing cold projection without creating or resuming a session', async t => {
  const f = install(t, [entry('cold', { sessionId: 'session-cold' })], async () => ({
    sessionId: 'session-cold', status: 'cold',
  }))
  assert.deepEqual(await f.action({ action: 'activitySession', id: 'cold' }), {
    available: true, sessionId: 'session-cold',
  })
  assert.deepEqual(f.calls.projections.map(call => call.args), [{ sessionId: 'session-cold' }])
  assertLookupOnly(f.calls)
})

test('installed activitySession handles missing records and unlinked records without checking projections', async t => {
  const f = install(t, [entry('unlinked')])
  for (const id of ['missing', 'unlinked']) {
    assert.deepEqual(await f.action({ action: 'activitySession', id }), {
      available: false, message: '这条记录尚未关联会话',
    })
  }
  assert.equal(f.calls.projections.length, 0)
  assertLookupOnly(f.calls)
})

test('installed activitySession projection failures produce a safe retry message', async t => {
  const f = install(t, [entry('failure', { sessionId: 'session-failure' })], async () => {
    throw new Error('private storage failure: secret-token')
  })
  assert.deepEqual(await f.action({ action: 'activitySession', id: 'failure' }), {
    available: false, message: '暂时无法检查关联会话，请稍后重试',
  })
  assertLookupOnly(f.calls)
})

test('installed email_activity defaults to 20, clamps integer limits to 1–100 and defaults invalid limits', async t => {
  const entries = Array.from({ length: 125 }, (_, i) => entry('activity-' + i, {
    updatedAt: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(),
  }))
  const f = install(t, entries)
  const newestFirst = [...entries].reverse()
  const cases = [
    [undefined, 20], [{}, 20], [{ limit: 7 }, 7], [{ limit: 1 }, 1],
    [{ limit: 100 }, 100], [{ limit: 999 }, 100], [{ limit: 0 }, 1],
    [{ limit: -10 }, 1], [{ limit: 1.5 }, 20], [{ limit: '5' }, 20],
    [{ limit: null }, 20], [{ limit: NaN }, 20], [{ limit: Infinity }, 20],
  ]
  for (const [args, count] of cases) {
    const result = await f.activity.execute(args)
    assert.deepEqual(result.entries, newestFirst.slice(0, count), 'limit ' + String(args?.limit))
    assert.equal(result.monitor.state, 'disabled')
  }
  const result = await f.activity.execute({ limit: 1 })
  result.entries[0].message = 'tampered'
  result.monitor.state = 'tampered'
  const again = await f.activity.execute({ limit: 1 })
  assert.equal(again.entries[0].message, '已提交到会话')
  assert.equal(again.monitor.state, 'disabled')
  assert.equal((await f.action({ action: 'activityList' })).entries.length, 100)
  assertLookupOnly(f.calls)
})
