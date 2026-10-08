/**
 * Headless checks for the GitHub Pages trial (docs/play/), run against the
 * compiled renderer output (`npm test` builds first).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { TRIAL_GAMES, resolveTrialGame, splitHint } from '../dist/renderer/web/trial-games.js';

const fakeWindow = { addEventListener() {} };

test('trial offers soccer, sword fight and animal tower', () => {
  assert.deepEqual(TRIAL_GAMES.map((mod) => mod.id), ['soccer', 'fence', 'tower']);
});

test('resolveTrialGame picks the requested game and falls back to the first one', () => {
  assert.equal(resolveTrialGame('tower').id, 'tower');
  assert.equal(resolveTrialGame(null).id, 'soccer');
  assert.equal(resolveTrialGame('worm').id, 'soccer');
});

test('splitHint keeps parenthesised separators inside one line', () => {
  assert.deepEqual(
    splitHint('← → 이동 · Space 베기(↓ 하단 · 공중 내려베기) · Shift 막기'),
    ['← → 이동', 'Space 베기(↓ 하단 · 공중 내려베기)', 'Shift 막기']
  );
});

for (const mod of TRIAL_GAMES) {
  test(`${mod.id} runs a solo match against the bot with no input`, () => {
    assert.equal(typeof mod.createSoloMatch, 'function');
    const match = mod.createSoloMatch('web-trial', '나');
    const input = mod.createInputSource(fakeWindow);
    for (let tick = 0; tick < 60 * 20 && !match.isOver(); tick += 1) match.step(input.read());
    assert.equal(typeof match.hud().status, 'string');
  });
}
