/**
 * Headless checks for 2048 (solo sliding merge game), run against the
 * compiled renderer output (`npm test` builds first).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SlideEngine } from '../dist/renderer/games/slide/engine.js';
import { SlideMatch, slideModule } from '../dist/renderer/games/slide/module.js';
import { MergeEffects, strength } from '../dist/renderer/games/slide/effects.js';
import { formatTime, tileFontSize } from '../dist/renderer/games/slide/draw.js';
import { ACTIVE_GAMES } from '../dist/renderer/games/registry.js';
import { NO_INPUT, PROMPT_DELAY, WIN_EXP } from '../dist/renderer/games/slide/types.js';

const press = (key) => ({ ...NO_INPUT, [key]: true });
const idle = (engine, ticks) => { for (let i = 0; i < ticks; i++) engine.step(NO_INPUT); };
const EMPTY = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
const withRow = (row) => [row, ...EMPTY.slice(1)];

test('registered as a solo-only game in the main row', () => {
  assert.ok(ACTIVE_GAMES.includes(slideModule));
  assert.equal(slideModule.soloOnly, true);
  assert.ok(slideModule.createSoloMatch('me', 'me') instanceof SlideMatch);
});

test('a run starts with two small tiles', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const e = new SlideEngine(seed);
    assert.equal(e.tiles.length, 2);
    assert.ok(e.tiles.every((t) => t.exp === 1 || t.exp === 2));
  }
});

test('pairs merge toward the wall and score the new value', () => {
  const e = new SlideEngine(7);
  e.setBoard(withRow([1, 1, 1, 1]));
  assert.equal(e.move('left'), true);
  assert.deepEqual(e.board()[0].slice(0, 2), [2, 2]);
  assert.equal(e.score, 8);
  assert.equal(e.merges.length, 2);
  assert.equal(e.ghosts.length, 4);
  assert.equal(e.tiles.length, 3, 'two merged tiles plus one new tile');
});

test('a tile merges at most once per move', () => {
  const e = new SlideEngine(3);
  e.setBoard(withRow([2, 1, 1, 0]));
  e.move('left');
  assert.deepEqual(e.board()[0].slice(0, 2), [2, 2]);
  const e2 = new SlideEngine(3);
  e2.setBoard(withRow([0, 1, 1, 1]));
  e2.move('right');
  assert.deepEqual(e2.board()[0].slice(2), [1, 2], 'the pair nearest the wall merges first');
});

test('every direction slides the right way', () => {
  const e = new SlideEngine(5);
  e.setBoard([[0, 0, 0, 0], [0, 3, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  e.move('down');
  assert.equal(e.board()[3][1], 3);
  e.setBoard([[0, 0, 0, 0], [0, 3, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  e.move('up');
  assert.equal(e.board()[0][1], 3);
  e.setBoard([[0, 0, 0, 0], [0, 3, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  e.move('right');
  assert.equal(e.board()[1][3], 3);
});

test('a move that changes nothing spawns nothing', () => {
  const e = new SlideEngine(9);
  e.setBoard(withRow([1, 2, 0, 0]));
  const moves = e.moves;
  assert.equal(e.move('left'), false);
  assert.equal(e.tiles.length, 2);
  assert.equal(e.moves, moves);
});

test('a stuck full board cannot move', () => {
  const e = new SlideEngine(1);
  e.setBoard([[1, 2, 1, 2], [2, 1, 2, 1], [1, 2, 1, 2], [2, 1, 2, 1]]);
  assert.equal(e.canMove(), false);
  e.setBoard([[1, 2, 1, 2], [2, 1, 2, 1], [1, 2, 1, 2], [2, 1, 2, 2]]);
  assert.equal(e.canMove(), true);
});

function engineAtWin() {
  const e = new SlideEngine(11);
  e.setBoard(withRow([WIN_EXP - 1, WIN_EXP - 1, 0, 0]));
  e.step(press('left'));
  assert.equal(e.phase, 'won');
  return e;
}

test('making 2048 pauses on a card; 계속하기 resumes and never asks again', () => {
  const e = engineAtWin();
  const clock = e.playTicks;
  e.step(press('confirm'));
  assert.equal(e.phase, 'won', 'keys are ignored until the card is on screen');
  idle(e, PROMPT_DELAY);
  assert.equal(e.playTicks, clock, 'the clock stops on the card');
  e.step(press('confirm'));
  assert.equal(e.phase, 'play');
  assert.equal(e.won, true);
  e.setBoard(withRow([WIN_EXP - 1, WIN_EXP - 1, 0, 0]));
  e.step(press('left'));
  assert.equal(e.phase, 'play', 'a second 2048 does not interrupt');
});

test('끝내기 on the card ends the match', () => {
  const e = engineAtWin();
  idle(e, PROMPT_DELAY);
  e.step(press('right'));
  assert.equal(e.choice, 1);
  e.step(press('confirm'));
  assert.equal(e.isOver, true);
  const q = engineAtWin();
  idle(q, PROMPT_DELAY);
  q.step(press('quit'));
  assert.equal(q.isOver, true, 'Q quits from the card');
});

test('다시하기 after a loss starts a fresh run', () => {
  const e = new SlideEngine(13);
  e.score = 500;
  e.phase = 'over';
  const runs = e.runs;
  idle(e, PROMPT_DELAY);
  e.step(press('confirm'));
  assert.equal(e.phase, 'play');
  assert.equal(e.score, 0);
  assert.equal(e.playTicks, 0);
  assert.equal(e.tiles.length, 2);
  assert.equal(e.runs, runs + 1);
});

test('merge impact grows with the step', () => {
  assert.equal(strength(2), 0);
  assert.equal(strength(WIN_EXP), 1);
  assert.ok(strength(6) > strength(3));
  assert.equal(strength(WIN_EXP + 3), 1);
});

test('a bigger merge kicks the board and shoves neighbours harder', () => {
  const hit = (exp) => {
    const fx = new MergeEffects();
    fx.fire([{ row: 1, col: 1, exp, gain: 2 ** exp }], 'left');
    const [kx] = fx.offset();
    const [nx] = fx.nudge(1, 2);
    fx.update();
    return { kick: Math.abs(kx), shove: nx, flash: fx.tileFlash(1, 1) };
  };
  const small = hit(2), big = hit(WIN_EXP);
  assert.ok(big.kick > small.kick);
  assert.ok(big.shove > small.shove && small.shove > 0, 'the tile to the right is pushed right');
  assert.ok(small.flash > 0 && big.flash > 0);
  const plain = new MergeEffects();
  plain.fire([], 'down');
  assert.ok(plain.offset()[1] > 0, 'a plain slide still thuds toward the wall');
});

test('long numbers shrink to fit; time reads mm:ss', () => {
  assert.ok(tileFontSize(2) > tileFontSize(128));
  assert.ok(tileFontSize(128) > tileFontSize(2048));
  assert.ok(tileFontSize(2048) > tileFontSize(16384));
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(60 * 75), '01:15');
});

test('the match tracks best score and a 신기록 per run', () => {
  const m = new SlideMatch(17);
  m.engine.setBoard(withRow([3, 3, 0, 0]));
  m.step(press('left'));
  assert.equal(m.engine.score, 16);
  assert.equal(m.isRecord, true);
  for (let i = 0; i < PROMPT_DELAY; i++) m.step(NO_INPUT);
  m.engine.phase = 'over';
  for (let i = 0; i < PROMPT_DELAY; i++) m.step(NO_INPUT);
  m.step(press('confirm'));
  assert.equal(m.engine.score, 0);
  assert.equal(m.isRecord, false, 'a new run must beat the best it starts against');
  assert.match(m.hud().status, /2048 · 0점 · 00:00/);
});
