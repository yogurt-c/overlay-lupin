import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reduceUpdater, INITIAL_UPDATER } from '../dist/main/update-state.js';
import { updateNotice, updateStatusText } from '../dist/shared/update.js';

const run = (events, from = INITIAL_UPDATER) => events.reduce(reduceUpdater, from);

test('background check that finds nothing stays silent', () => {
  const model = run([{ type: 'check', manual: false }, { type: 'not-available' }]);
  assert.deepEqual(model.state, { kind: 'idle' });
});

test('manual check reports checking, then latest', () => {
  const checking = run([{ type: 'check', manual: true }]);
  assert.deepEqual(checking.state, { kind: 'checking' });
  assert.deepEqual(reduceUpdater(checking, { type: 'not-available' }).state, { kind: 'latest' });
});

test('background check failure is swallowed', () => {
  const model = run([{ type: 'check', manual: false }, { type: 'error' }]);
  assert.deepEqual(model.state, { kind: 'idle' });
});

test('manual check failure is surfaced', () => {
  const model = run([{ type: 'check', manual: true }, { type: 'error' }]);
  assert.deepEqual(model.state, { kind: 'error', stage: 'check' });
});

test('available update downloads with progress and becomes ready', () => {
  const downloading = run([{ type: 'check', manual: false }, { type: 'available', version: '0.12.0' }]);
  assert.deepEqual(downloading.state, { kind: 'downloading', version: '0.12.0', percent: 0 });
  const progressed = reduceUpdater(downloading, { type: 'progress', percent: 42.7 });
  assert.deepEqual(progressed.state, { kind: 'downloading', version: '0.12.0', percent: 42 });
  assert.deepEqual(reduceUpdater(progressed, { type: 'downloaded', version: '0.12.0' }).state, { kind: 'ready', version: '0.12.0' });
});

test('progress is clamped and ignored outside a download', () => {
  const downloading = run([{ type: 'available', version: '1.0.0' }]);
  assert.equal(reduceUpdater(downloading, { type: 'progress', percent: 140 }).state.percent, 100);
  assert.equal(reduceUpdater(downloading, { type: 'progress', percent: Number.NaN }).state.percent, 0);
  assert.deepEqual(reduceUpdater(INITIAL_UPDATER, { type: 'progress', percent: 50 }).state, { kind: 'idle' });
});

test('download failure is surfaced even when the check was in the background', () => {
  const model = run([{ type: 'check', manual: false }, { type: 'available', version: '1.0.0' }, { type: 'error' }]);
  assert.deepEqual(model.state, { kind: 'error', stage: 'download' });
});

test('a successful background check clears an earlier error', () => {
  const failed = run([{ type: 'check', manual: true }, { type: 'error' }]);
  assert.deepEqual(run([{ type: 'check', manual: false }, { type: 'not-available' }], failed).state, { kind: 'idle' });
});

test('checks are ignored while downloading or ready', () => {
  const downloading = run([{ type: 'available', version: '1.0.0' }]);
  assert.equal(reduceUpdater(downloading, { type: 'check', manual: true }), downloading);
  const ready = reduceUpdater(downloading, { type: 'downloaded', version: '1.0.0' });
  assert.equal(reduceUpdater(ready, { type: 'check', manual: true }), ready);
});

test('reducer never mutates the previous model', () => {
  const before = run([{ type: 'available', version: '1.0.0' }]);
  const snapshot = structuredClone(before);
  reduceUpdater(before, { type: 'progress', percent: 10 });
  assert.deepEqual(before, snapshot);
});

test('notice is shown only for download, ready and error states', () => {
  assert.equal(updateNotice({ kind: 'idle' }), null);
  assert.equal(updateNotice({ kind: 'checking' }), null);
  assert.equal(updateNotice({ kind: 'latest' }), null);
  assert.equal(updateNotice({ kind: 'unsupported' }), null);
  assert.deepEqual(updateNotice({ kind: 'downloading', version: '1.0.0', percent: 30 }), {
    text: 'v1.0.0 받는 중', percent: 30, action: null
  });
  assert.deepEqual(updateNotice({ kind: 'ready', version: '1.0.0' }), { text: 'v1.0.0 준비됨', percent: null, action: 'install' });
  assert.equal(updateNotice({ kind: 'error', stage: 'download' }).action, 'retry');
  assert.equal(updateNotice({ kind: 'error', stage: 'check' }).action, 'retry');
});

test('settings status text covers every state', () => {
  assert.equal(updateStatusText({ kind: 'idle' }), '');
  assert.equal(updateStatusText({ kind: 'checking' }), '확인 중…');
  assert.equal(updateStatusText({ kind: 'latest' }), '최신 버전이에요.');
  assert.match(updateStatusText({ kind: 'unsupported' }), /개발 빌드/);
  assert.match(updateStatusText({ kind: 'downloading', version: '1.0.0', percent: 5 }), /5%/);
  assert.match(updateStatusText({ kind: 'ready', version: '1.0.0' }), /재시작/);
  assert.match(updateStatusText({ kind: 'error', stage: 'check' }), /확인하지 못했/);
  assert.match(updateStatusText({ kind: 'error', stage: 'download' }), /받지 못했/);
});
