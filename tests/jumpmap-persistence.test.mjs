import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { PersonalRecord } from '../dist/renderer/games/jumpmap/records.js';
const require = createRequire(import.meta.url);
const { JumpmapRecords } = require('../dist/main/jumpmap-records.js');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jumpmap-persistence-'));
try {
  const store = new JumpmapRecords(directory);
  const legacy = new Map([['overlay-lupin.jumpmap.best.v1.solo', '1200']]);
  globalThis.window = {
    localStorage: { getItem: key => legacy.get(key) ?? null },
    overlayLupin: { jumpmapRecord: (mode, ticks) => store.update(mode, ticks) }
  };
  const solo = new PersonalRecord(true);
  assert.equal(solo.best, 1200, 'migrate legacy browser storage');
  solo.finish(1100);
  assert.equal(solo.best, 1100);
  const multi = new PersonalRecord(false);
  multi.finish(1800);

  // Fresh OS process with no browser storage must recover both times from disk.
  const script = `const { JumpmapRecords } = require(process.argv[1]);
    const store = new JumpmapRecords(process.argv[2]);
    process.stdout.write(JSON.stringify([store.update('solo'), store.update('multi')]));`;
  const reloaded = JSON.parse(execFileSync(process.execPath, ['-e', script,
    require.resolve('../dist/main/jumpmap-records.js'), directory], { encoding: 'utf8' }));
  assert.deepEqual(reloaded, [{ ok: true, best: 1100 }, { ok: true, best: 1800 }]);
  window.localStorage.getItem = () => { throw Error('browser storage unavailable'); };
  assert.equal(new PersonalRecord(true).best, 1100);
  assert.equal(new PersonalRecord(false).best, 1800);
  assert.equal(store.update('solo', 2000).best, 1100, 'slower records cannot overwrite best');
  for (const invalid of [0, -1, Infinity, 1.5, '100']) assert.equal(store.update('solo', invalid).ok, false);
  assert.equal(store.update('../escape', 100).ok, false);
  window.overlayLupin.jumpmapRecord = () => ({ ok: false });
  const failed = new PersonalRecord(true);
  failed.finish(100);
  assert.match(failed.detail(100, true), /기록 저장 실패/, 'never silently claim durable storage');
  assert.equal(store.update('solo').best, 1100);
  console.log('PASS disk persistence across processes, legacy migration, mode separation and visible write failure');
} finally {
  delete globalThis.window;
  fs.rmSync(directory, { recursive: true, force: true });
}
