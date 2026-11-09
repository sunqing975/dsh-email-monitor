import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../templates/client.js', import.meta.url), 'utf8');
const activity = source.slice(source.indexOf('function MailActivity('), source.indexOf('function MailMonitorSettings('));

test('activity uses plugin-owned records and cancels active-only polling', () => {
  assert.match(activity, /if \(!active\) return;/);
  assert.match(activity, /mailboxApi\('activityList', \{\}, ctrl\.signal\)/);
  assert.match(activity, /setTimeout\(poll, 10000\)/);
  assert.match(activity, /ctrl\.abort\(\); clearTimeout\(timer\)/);
  assert.match(activity, /\}, \[active, refresh\]\)/);
  assert.doesNotMatch(activity, /session\/event|session\.events|listSessions|setInterval/);
});

test('linked sessions are checked before navigation with unavailable notice', () => {
  const check = activity.indexOf("mailboxApi('activitySession', { id: entry.id }, ctrl.signal)");
  const unavailable = activity.indexOf('!value?.available || !value.sessionId');
  const navigate = activity.indexOf('await emailWorkspace.openSession(value.sessionId)');
  assert.ok(check >= 0 && check < unavailable && unavailable < navigate);
  assert.match(activity, /The linked session was removed or is unavailable/);
  assert.match(activity, /sessionRequest\.current\?\.abort\(\)/);
  assert.match(activity, /catch \(e\) \{\s*if \(!ctrl\.signal\.aborted\) setNotice/);
});

test('activity tab retains mailbox and account tabs and explains submission', () => {
  assert.match(source, /id:'mailbox',label:dt\('浏览邮件','Mailbox'\)/);
  assert.match(source, /id:'activity',label:dt\('处理记录','Activity'\)/);
  assert.match(source, /id:'accounts',label:dt\('邮箱设置','Accounts'\)/);
  assert.match(source, /h\(MailActivity, \{ active: tab === 'activity' \}\)/);
  for (const field of ['entry.createdAt', 'entry.updatedAt', 'entry.source', 'entry.status', 'entry.message', 'entry.account', 'entry.folder', 'entry.uid', 'monitor.lastCheckedAt', 'monitor.nextCheckAt']) assert.ok(activity.includes(field), field);
  assert.match(activity, /it does not mean the model has finished/);
});
