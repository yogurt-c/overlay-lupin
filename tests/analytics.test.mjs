import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { GameAnalytics } = require('../dist/main/analytics.js');

async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'lupin-analytics-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let time = Date.now();
  const requests = [];
  const settings = {
    directory, version: '0.9.6', platform: 'darwin', packaged: true,
    now: () => time,
    fetch: async (_url, init) => { requests.push(JSON.parse(init.body)); return { ok: true }; },
    ...options
  };
  const analytics = new GameAnalytics(settings);
  await analytics.ready;
  return { analytics, directory, requests, settings, advance: ms => { time += ms; } };
}

test('fresh installs default on, start does not send, development is excluded', async t => {
  const f = await fixture(t);
  assert.equal(await f.analytics.getEnabled(), true);
  assert.equal(f.requests.length, 0);
  assert.equal(f.analytics.recordStart({ gameId: 'soccer', mode: 'solo' }), undefined);
  f.analytics.recordStart({ gameId: 'tower', mode: 'room' });
  assert.equal(f.requests.length, 0);
  await f.analytics.flush();
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].events.length, 2);
  assert.notEqual(f.requests[0].events[0].event_id, f.requests[0].events[1].event_id);
  assert.equal(f.requests[0].events[0].installation_id, f.requests[0].events[1].installation_id);
  const dev = await fixture(t, { packaged: false });
  assert.equal(await dev.analytics.getEnabled(), true);
  dev.analytics.recordStart({ gameId: 'soccer', mode: 'solo' });
  await dev.analytics.flush();
  assert.equal(dev.requests.length, 0);
});

test('saved opt-out survives restart and prevents collection', async t => {
  const f = await fixture(t);
  await f.analytics.setEnabled(false);
  const restarted = new GameAnalytics(f.settings);
  assert.equal(await restarted.getEnabled(), false);
  restarted.recordStart({ gameId: 'soccer', mode: 'solo' });
  await restarted.flush();
  assert.equal(f.requests.length, 0);
});

test('offline retries persist IDs, back off, and survive a restart', async t => {
  let attempts = 0;
  const f = await fixture(t, { fetch: async () => { attempts++; throw new Error('offline'); } });
  await f.analytics.setEnabled(true);
  f.analytics.recordStart({ gameId: 'soccer', mode: 'duel' });
  await f.analytics.flush();
  await f.analytics.flush();
  assert.equal(attempts, 1);
  const saved = JSON.parse(await readFile(path.join(f.directory, 'game-analytics.json'), 'utf8'));
  const sent = [];
  const restarted = new GameAnalytics({ ...f.settings, fetch: async (_url, init) => {
    sent.push(JSON.parse(init.body)); return { ok: true };
  } });
  await restarted.ready;
  await restarted.flush();
  assert.equal(sent[0].events[0].event_id, saved.queue[0].event_id);
  await restarted.flush();
  assert.equal(sent.length, 1);
});

test('a slow server never blocks new starts; opt-out cancels and clears persisted records', async t => {
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const f = await fixture(t, { fetch: async (_url, init) => {
    entered();
    return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  } });
  await f.analytics.setEnabled(true);
  f.analytics.recordStart({ gameId: 'soccer', mode: 'solo' });
  const flushing = f.analytics.flush();
  await started;
  assert.equal(f.analytics.recordStart({ gameId: 'tower', mode: 'room' }), undefined);
  await f.analytics.setEnabled(false);
  await flushing;
  const saved = JSON.parse(await readFile(path.join(f.directory, 'game-analytics.json'), 'utf8'));
  assert.equal(saved.enabled, false);
  assert.deepEqual(saved.queue, []);
});

test('queue is bounded and expires; corrupt settings do not enable tracking', async t => {
  const f = await fixture(t, { fetch: async () => { throw new Error('offline'); } });
  await f.analytics.setEnabled(true);
  for (let i = 0; i < 1100; i++) f.analytics.recordStart({ gameId: 'soccer', mode: 'solo' });
  await f.analytics.flush();
  const file = path.join(f.directory, 'game-analytics.json');
  assert.equal(JSON.parse(await readFile(file, 'utf8')).queue.length, 1000);
  f.advance(8 * 24 * 60 * 60 * 1000);
  await f.analytics.flush();
  await f.analytics.setEnabled(true);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).queue.length, 0);
  await writeFile(file, '{broken');
  assert.equal(await new GameAnalytics(f.settings).getEnabled(), false);
});
