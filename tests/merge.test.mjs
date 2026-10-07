/**
 * Headless checks for 동글동물 (solo merge game), run against the compiled
 * renderer output (`npm test` builds first).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { COOLDOWN_TICKS, DANGER_TICKS, GRACE_TICKS, MergeEngine, OVER_HOLD_TICKS } from '../dist/renderer/games/merge/engine.js';
import { MergeMatch, mergeModule } from '../dist/renderer/games/merge/module.js';
import { GAME_MODULES } from '../dist/renderer/games/registry.js';
import {
  BOX_BOTTOM, BOX_LEFT, BOX_RIGHT, FINALE_SCORE, LAST_KIND, NO_INPUT, RADII, SPAWN_KINDS, mergeScore
} from '../dist/renderer/games/merge/types.js';

const DROP = { left: false, right: false, drop: true };
const run = (engine, ticks, input = NO_INPUT) => { for (let i = 0; i < ticks; i++) engine.step(input); };

test('registered as a solo-only game', () => {
  assert.ok(GAME_MODULES.includes(mergeModule));
  assert.equal(mergeModule.soloOnly, true);
  assert.ok(mergeModule.createSoloMatch('me', 'me') instanceof MergeMatch);
  assert.equal(RADII.length, 11);
  assert.ok(RADII.every((r, i) => i === 0 || r > RADII[i - 1]), 'each stage is larger');
});

test('only the five smallest animals are handed out', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const e = new MergeEngine(seed);
    for (let i = 0; i < 6; i++) {
      const w = e.snapshot();
      seen.add(w.kind); seen.add(w.next);
      e.step(DROP); run(e, COOLDOWN_TICKS);
    }
  }
  assert.ok([...seen].every(k => k >= 0 && k < SPAWN_KINDS));
  assert.equal(seen.size, SPAWN_KINDS);
});

test('aim stays inside the box for the held animal', () => {
  const e = new MergeEngine(7);
  run(e, 200, { left: true, right: false, drop: false });
  assert.equal(e.snapshot().x, BOX_LEFT + RADII[e.snapshot().kind]);
  run(e, 200, { left: false, right: true, drop: false });
  assert.equal(e.snapshot().x, BOX_RIGHT - RADII[e.snapshot().kind]);
});

test('a drop hands over the previewed animal after the cooldown', () => {
  const e = new MergeEngine(3);
  const { next } = e.snapshot();
  e.step(DROP);
  assert.equal(e.snapshot().phase, 'cooldown');
  assert.equal(e.snapshot().balls.length, 1);
  run(e, COOLDOWN_TICKS);
  assert.equal(e.snapshot().phase, 'aim');
  assert.equal(e.snapshot().kind, next);
});

test('two touching twins merge into the next animal and score it', () => {
  const e = new MergeEngine(1);
  e.spawn(2, 140, BOX_BOTTOM - RADII[2]);
  e.spawn(2, 140 + RADII[2] * 2 - 0.5, BOX_BOTTOM - RADII[2]);
  e.spawn(4, 220, BOX_BOTTOM - RADII[4]);
  run(e, 30);
  const kinds = e.snapshot().balls.map(b => b[0]).sort();
  assert.deepEqual(kinds, [3, 4]);
  assert.equal(e.snapshot().score, mergeScore(3));
});

test('different animals rest side by side without merging', () => {
  const e = new MergeEngine(1);
  e.spawn(1, 120, BOX_BOTTOM - RADII[1]);
  e.spawn(2, 120 + RADII[1] + RADII[2], BOX_BOTTOM - RADII[2]);
  run(e, 120);
  assert.equal(e.snapshot().balls.length, 2);
  assert.equal(e.snapshot().score, 0);
});

test('two of the largest animal vanish for the finale bonus', () => {
  const e = new MergeEngine(1);
  const r = RADII[LAST_KIND];
  e.spawn(LAST_KIND, BOX_LEFT + r, BOX_BOTTOM - r);
  e.spawn(LAST_KIND, BOX_RIGHT - r, BOX_BOTTOM - r, -3, 0);
  run(e, 90);
  assert.equal(e.snapshot().balls.length, 0);
  assert.equal(e.snapshot().score, FINALE_SCORE);
});

test('a pile held above the danger line ends the run, then the match closes', () => {
  const e = new MergeEngine(1);
  [10, 9, 8, 7, 6, 5, 10, 9].forEach((kind, i) => e.spawn(kind, 160 + (i % 2 ? 4 : -4), 200 - i * 60));
  run(e, GRACE_TICKS + DANGER_TICKS + 120);
  assert.equal(e.snapshot().phase, 'over');
  assert.equal(e.isOver, false);
  run(e, OVER_HOLD_TICKS);
  assert.equal(e.isOver, true);
});

test('many random drops stay inside the walls and replay identically from a seed', () => {
  const play = () => {
    const e = new MergeEngine(42);
    let x = 0;
    for (let i = 0; i < 1500 && e.snapshot().phase !== 'over'; i++) {
      x = (x * 1103515245 + 12345) >>> 0;
      e.step({ left: x % 3 === 0, right: x % 3 === 1, drop: i % 50 === 0 });
    }
    return e.snapshot();
  };
  const a = play(), b = play();
  assert.deepEqual(a, b);
  assert.ok(a.score > 0, 'some merges happened');
  for (const [kind, x, y] of a.balls) {
    assert.ok(x >= BOX_LEFT + RADII[kind] - 1.5 && x <= BOX_RIGHT - RADII[kind] + 1.5, `x ${x} inside`);
    assert.ok(y <= BOX_BOTTOM - RADII[kind] + 1.5, `y ${y} above floor`);
  }
});

test('hud shows score and a game-over banner', () => {
  const m = new MergeMatch(5);
  assert.match(m.hud().status, /0점/);
  [10, 9, 8, 7, 6, 5, 10, 9].forEach((kind, i) => m.engine.spawn(kind, 160, 200 - i * 60));
  for (let i = 0; i < GRACE_TICKS + DANGER_TICKS + 120; i++) m.step(NO_INPUT);
  assert.equal(m.hud().bannerKind, 'over');
  assert.match(m.hud().banner, /게임 오버/);
});
