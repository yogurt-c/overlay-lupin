import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { SPECIES, ENVS, GOLDEN_CHANCE, SAVE_VERSION, isInsectSave } from '../dist/shared/insect.js';
import { InsectEngine, pickSpecies, inWindow, envOf, RING_TICKS, ALERT_RADIUS, REACH, SEAT_X, CATCH_TICKS, MISS_STUN } from '../dist/renderer/games/insect/engine.js';
import { validWorld } from '../dist/renderer/games/insect/module.js';
import { DRAWN_PLANS } from '../dist/renderer/games/insect/art.js';
const { InsectStore } = createRequire(import.meta.url)('../dist/main/insect-store.js');
const rng = seed => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const catchOf = (id = 'bug-1', extra = {}) => ({ id, speciesId: SPECIES[0].id, sizeMm: SPECIES[0].minMm, golden: false, caughtAt: '2026-10-23T00:00:00.000Z', favorite: false, released: false, ...extra });
const storeTest = fn => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lupin-insect-test-')); try { fn(new InsectStore(dir), dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); } };
/** An engine with spawning parked far in the future and one live insect of `name` at `x`. */
function field(name, x, extra = {}) {
  let n = 0; const e = new InsectEngine(rng(7), () => `c${++n}`, () => '2026-10-23T00:00:00.000Z');
  const s = SPECIES.find(s => s.name === name);
  const bug = { id: 99, speciesId: s.id, golden: false, sizeMm: s.minMm, x, y: s.env === 'ground' ? 176 : 140, hx: x, hy: 140, dir: 1, timer: 1e9, state: 'live', t: 0, alert: 0, seed: 0, glintAt: 1e9, pauseUntil: 0, reached: false, ...extra };
  e.world.bugs.push(bug); e.world.respawns.push(1e9, 1e9, 1e9, 1e9, 1e9, 1e9);
  return { e, s, bug };
}
/** One collector standing with the hoop right on the insect. */
function aim(e, id, bug, side = -1) { const p = e.ensure(id, id); p.facing = -side; p.x = bug.x + side * .045; return p; }
/** Steps until the ring around `bug` is inside (true) or outside (false) the catch window. */
function stepTo(e, bug, inside) { for (let i = 0; i < RING_TICKS * 2 && inWindow(bug, e.world.tick) !== inside; i++) e.step(); }
test('30 insects: 10 per habitat, each 4 일반 · 3 고급 · 2 희귀 · 1 전설, all real and drawable', () => {
  assert.equal(SPECIES.length, 30); assert.equal(new Set(SPECIES.map(s => s.id)).size, 30); assert.equal(new Set(SPECIES.map(s => s.name)).size, 30);
  for (const env of ENVS) assert.deepEqual([0, 1, 2, 3].map(r => SPECIES.filter(s => s.env === env && s.rarity === r).length), [4, 3, 2, 1]);
  assert.ok(!SPECIES.some(s => s.name === '지렁이'), 'earthworms are not insects');
  assert.deepEqual(SPECIES.filter(s => s.rarity === 3).map(s => s.name).sort(), ['붉은점모시나비', '소똥구리', '장수하늘소'].sort());
  assert.ok(SPECIES.every(s => Number.isInteger(s.minMm) && s.minMm > 0 && s.minMm < s.maxMm));
  assert.ok(SPECIES.every(s => DRAWN_PLANS.has(s.plan)));
});
test('each habitat rolls rarity 55/28/13/4 and favours species nobody has caught yet', () => {
  const random = rng(3), n = 200000;
  for (const env of ENVS) {
    const counts = [0, 0, 0, 0], ids = new Set();
    for (let i = 0; i < n; i++) { const s = pickSpecies(env, [], random); assert.equal(s.env, env); counts[s.rarity]++; ids.add(s.id); }
    assert.equal(ids.size, 10);
    [55, 28, 13, 4].forEach((w, r) => assert.ok(Math.abs(counts[r] / n * 100 - w) < 1, `${env} tier ${r}`));
  }
  // One unknown 일반 among three known ones carries weight 2 of 5 within the tier.
  const common = SPECIES.filter(s => s.env === 'air' && s.rarity === 0), known = common.slice(1).map(s => s.id);
  let fresh = 0; for (let i = 0; i < n; i++) if (pickSpecies('air', known, random).id === common[0].id) fresh++;
  assert.ok(Math.abs(fresh / n - .55 * 2 / 5) < .01);
});
test('seats fill far-apart spots first and the room holds four', () => {
  const e = new InsectEngine(rng(1));
  for (let i = 0; i < 4; i++) e.ensure('p' + i, 'player');
  assert.equal(e.ensure('overflow', 'no'), undefined);
  assert.deepEqual(e.world.players.map(p => p.x), [SEAT_X[0], SEAT_X[2], SEAT_X[1], SEAT_X[3]]);
});
test('the field holds players + 2 insects, at most 3 per habitat, never spawned under a net', () => {
  const e = new InsectEngine(rng(11));
  for (let i = 0; i < 4; i++) e.ensure('p' + i, 'p');
  for (let t = 0; t < 900; t++) { e.step(); for (const b of e.world.bugs.filter(b => b.state === 'enter' && b.t === 1)) assert.ok(e.world.players.every(p => Math.abs(p.x - b.x) > REACH)); }
  const live = e.world.bugs.filter(b => b.state !== 'flee');
  assert.equal(live.length, 6, 'four standing players cover every alert radius, yet the field still fills');
  for (const env of ENVS) assert.ok(live.filter(b => envOf(b) === env).length <= 3);
  assert.ok(validWorld(e.snapshot()));
  const solo = new InsectEngine(rng(5)); solo.ensure('me', 'me');
  for (let t = 0; t < 400; t++) { solo.step(); for (const b of solo.world.bugs.filter(b => b.state === 'enter' && b.t === 1)) assert.ok(Math.abs(b.x - solo.world.players[0].x) > ALERT_RADIUS); }
  assert.equal(solo.world.bugs.length, 3);
});
test('about one insect in fifty spawns 금색', () => {
  const e = new InsectEngine(rng(21)); e.ensure('me', 'me');
  let total = 0, gold = 0; const seen = new Set();
  for (let t = 0; t < 400000; t++) {
    e.step();
    for (const b of e.world.bugs) if (!seen.has(b.id)) { seen.add(b.id); total++; if (b.golden) gold++; }
    if (e.world.bugs.length >= 3) { e.world.bugs = []; e.world.respawns = []; } // keep it spawning
  }
  assert.ok(total > 2000); assert.ok(Math.abs(gold / total - GOLDEN_CHANCE) < .008, `${gold}/${total}`);
});
test('walking near an insect startles it; sneaking takes five times as long', () => {
  const ticksToFlee = sneak => {
    const { e, bug } = field('벼메뚜기', .5), p = e.ensure('me', 'me'), start = .5 - ALERT_RADIUS + .01;
    let t = 0; while (bug.state === 'live' && t < 3000) { p.x = start; e.input('me', 1, sneak, []); e.step(); t++; }
    return t;
  };
  const walk = ticksToFlee(false), sneak = ticksToFlee(true);
  assert.ok(walk > 60 && walk < 200, `walk ${walk}`); assert.ok(Math.abs(sneak / walk - 5) < .3, `ratio ${sneak / walk}`);
});
test('a swing inside the shrinking ring catches; outside it misses, stuns and spooks', () => {
  const hit = field('노랑나비', .5); const me = aim(hit.e, 'me', hit.bug);
  stepTo(hit.e, hit.bug, true); me.x = hit.bug.x - .045;
  hit.e.input('me', 0, false, [{ seq: 1, kind: 'swing', bug: 99, at: hit.e.world.tick }]);
  assert.equal(me.phase, 'catch'); assert.equal(hit.e.world.bugs.length, 0); assert.equal(me.bug.speciesId, hit.s.id);
  for (let i = 0; i < CATCH_TICKS; i++) hit.e.step();
  assert.equal(me.phase, 'result'); assert.equal(me.caught.id, me.bug.id);
  hit.e.input('me', 0, false, [{ seq: 2, kind: 'saved', catchId: me.bug.id }]);
  assert.equal(me.phase, 'free'); assert.ok(me.known.includes(hit.s.id));
  const miss = field('참매미', .5); const p = aim(miss.e, 'me', miss.bug);
  stepTo(miss.e, miss.bug, false);
  miss.e.input('me', 0, false, [{ seq: 1, kind: 'swing', bug: 99, at: miss.e.world.tick }]);
  assert.equal(p.phase, 'stun'); assert.equal(p.t, MISS_STUN); assert.equal(miss.bug.alert, 50); assert.equal(p.notice, '헛스윙!');
});
test('a swing is judged at the tick the swinger saw, so LAN lag never eats a well-timed press', () => {
  const late = field('참매미', .5); const p = aim(late.e, 'me', late.bug);
  stepTo(late.e, late.bug, true); const at = late.e.world.tick; for (let i = 0; i < 6; i++) late.e.step();
  late.e.input('me', 0, false, [{ seq: 1, kind: 'swing', bug: 99, at }]);
  assert.equal(p.phase, 'catch');
  const stale = field('참매미', .5); const q = aim(stale.e, 'me', stale.bug);
  stepTo(stale.e, stale.bug, true); const old = stale.e.world.tick; for (let i = 0; i < 50; i++) stale.e.step();
  assert.equal(inWindow(stale.bug, stale.e.world.tick - 20), false, 'even the oldest allowed tick is past the window');
  stale.e.input('me', 0, false, [{ seq: 1, kind: 'swing', bug: 99, at: old }]);
  assert.equal(q.phase, 'stun', 'a claim older than the latency allowance is clamped and misses');
});
test('only the first successful swing takes the insect', () => {
  const { e, bug } = field('참매미', .5); const a = aim(e, 'a', bug, -1), b = aim(e, 'b', bug, 1);
  stepTo(e, bug, true); const at = e.world.tick;
  e.input('a', 0, false, [{ seq: 1, kind: 'swing', bug: 99, at }]);
  e.input('b', 0, false, [{ seq: 1, kind: 'swing', bug: 99, at }]);
  assert.equal(a.phase, 'catch'); assert.equal(b.phase, 'stun'); assert.equal(b.bug, undefined); assert.equal(b.notice, '다른 사람이 먼저 잡았어요');
});
test('a startled insect flees, tells whoever was near, and is replaced later', () => {
  const { e, bug } = field('호랑나비', .5); const p = e.ensure('me', 'me'); e.world.respawns = [];
  bug.alert = 99.9; p.x = .45; e.input('me', 1, false, []); e.step();
  assert.equal(bug.state, 'flee'); assert.equal(p.notice, '놓쳤어요');
  for (let i = 0; i < 60; i++) e.step();
  assert.ok(!e.world.bugs.includes(bug)); assert.ok(e.world.respawns.length >= 1);
});
test('golden insects glint every 8–15 s while live and keep the flag through the catch', () => {
  const { e, bug } = field('참매미', .5, { golden: true, glintAt: 5 }); const p = e.ensure('me', 'me'); p.x = .1;
  const glints = []; for (let t = 0; t < 3000; t++) { e.step(); if (e.world.tick === bug.glintAt) glints.push(e.world.tick); }
  assert.ok(glints.length >= 3); glints.slice(1).forEach((g, i) => assert.ok(g - glints[i] >= 480 && g - glints[i] <= 912));
  aim(e, 'me', bug); stepTo(e, bug, true);
  e.input('me', 0, false, [{ seq: 1, kind: 'swing', bug: 99, at: e.world.tick }]); assert.equal(p.bug.golden, true);
});
test('world snapshots validate and reject tampered ones', () => {
  const e = new InsectEngine(rng(2)); e.ensure('a', 'a'); for (let t = 0; t < 200; t++) e.step();
  const w = e.snapshot(); assert.ok(validWorld(w)); assert.ok(w.bugs.length > 0);
  assert.equal(validWorld({ ...w, players: [...w.players, ...w.players] }), false);
  assert.equal(validWorld({ ...w, bugs: [{ ...w.bugs[0], speciesId: 'bug-9-9' }] }), false);
  assert.equal(validWorld({ ...w, players: [{ ...w.players[0], phase: 'result', bug: undefined }] }), false);
});
test('the collection saves catches with their gold flag, favourites, releases and merges imports', () => storeTest((s, dir) => {
  assert.equal(s.load().version, SAVE_VERSION);
  s.act({ kind: 'catch', bug: catchOf('a', { golden: true }) }); s.act({ kind: 'catch', bug: catchOf('a') });
  assert.equal(s.read().catches.length, 1); assert.equal(s.read().catches[0].golden, true);
  assert.throws(() => s.act({ kind: 'catch', bug: catchOf('b', { sizeMm: 9999 }) }));
  s.act({ kind: 'favorite', id: 'a' }); assert.throws(() => s.act({ kind: 'release', id: 'a' }), /즐겨찾기/);
  s.act({ kind: 'favorite', id: 'a' }); s.act({ kind: 'release', id: 'a' }); assert.equal(s.read().catches[0].released, true);
  const merged = s.merge({ version: SAVE_VERSION, profileId: 'other', catches: [catchOf('a'), catchOf('c', { golden: true })] });
  assert.deepEqual(merged.catches.map(c => [c.id, c.released, c.golden]), [['a', true, true], ['c', false, true]]);
  assert.throws(() => s.merge({ version: 9, catches: [] }));
  fs.writeFileSync(path.join(dir, 'insect-collection.json'), '{broken');
  assert.ok(isInsectSave(s.read()), 'a corrupt file falls back to the last good backup');
}));
