import test from 'node:test';
import assert from 'node:assert/strict';
import { GomokuEngine, winningLine } from '../dist/renderer/games/gomoku/engine.js';
import { chooseMove } from '../dist/renderer/games/gomoku/bot.js';
import { GomokuMatch } from '../dist/renderer/games/gomoku/module.js';
import { decodeWorld, encodeWorld, validCommand } from '../dist/renderer/games/gomoku/wire.js';
import { createInputSource } from '../dist/renderer/games/gomoku/input.js';
import { NO_INPUT } from '../dist/renderer/games/gomoku/types.js';
const cmd = (e, seq, kind = 'place', cell = 112) => ({ id: e.world.id, round: e.world.round, turn: e.world.turn, seq, kind, cell });
const press = (m, key) => { m.step({ ...NO_INPUT, [key]: true }); m.step(NO_INPUT); };
const sync = (a, b) => b.applyOpponentPacket(structuredClone(a.buildOutgoingPacket()));

test('legal turn order, occupied cells and board boundaries', () => {
  const e = new GomokuEngine('test', 0);
  for (const bad of [-1, 225, 1.5, NaN, Infinity]) assert.equal(e.place(0, bad), false);
  assert.equal(e.place(1, 112), false);
  assert.equal(e.place(0, 112), true);
  assert.equal(e.place(1, 112), false);
  assert.equal(e.place(1, 113), true);
  assert.equal(e.world.turn, 2);
});
test('five or more wins in all four directions including edges; rows do not wrap', () => {
  for (const [start, step] of [[0, 1], [14, 15], [0, 16], [14, 14]]) {
    for (const length of [5, 6]) {
      const board = Array(225).fill(0);
      for (let i = 0; i < length; i++) board[start + i * step] = 1;
      assert.equal(winningLine(board, start).length, length);
    }
  }
  const board = Array(225).fill(0);
  for (let i = 12; i < 17; i++) board[i] = 1;
  assert.deepEqual(winningLine(board, 14), []);
});
test('engine ends a five-stone match and rejects further moves', () => {
  const e = new GomokuEngine('test', 0);
  for (let x = 0; x < 4; x++) { e.place(0, x); e.place(1, 30 + x * 2); }
  assert.equal(e.place(0, 4), true);
  assert.equal(e.world.result, 1); assert.equal(e.world.reason, 'line');
  assert.equal(e.place(1, 35), false);
});
test('full board draws, but a winning last cell takes priority', () => {
  const e = new GomokuEngine('test', 0);
  e.world.board = Array.from({length:225}, (_, i) => (i % 15 + 2 * Math.floor(i / 15)) % 4 < 2 ? 1 : 2);
  for (let i = 0; i < 225; i++) assert.equal(winningLine(e.world.board, i).length, 0);
  const empty = e.world.board.indexOf(1); e.world.board[empty] = 0; e.world.turn = 224;
  e.place(0, empty); assert.equal(e.world.result, 3);
  const winner = new GomokuEngine('last', 0);
  winner.world.board = Array(225).fill(2); winner.world.board.fill(1, 0, 4); winner.world.board[4] = 0; winner.world.turn = 224;
  winner.place(0, 4); assert.equal(winner.world.result, 1);
});
test('undo removes the human turn and any AI response, preserving the AI opening', () => {
  for (const black of [0, 1]) {
    const e = new GomokuEngine('test', black);
    if (black === 1) { e.place(1, 112); assert.equal(e.undo(0), false); }
    const opening = e.world.turn;
    e.place(0, 111); assert.equal(e.undo(0), true); assert.equal(e.world.turn, opening);
    e.place(0, 111); e.place(1, 110); assert.equal(e.undo(0), true); assert.equal(e.world.turn, opening);
  }
});
test('all AI levels take wins and block immediate single threats', () => {
  for (const level of ['easy', 'normal', 'hard']) {
    const b = Array(225).fill(0); b[0] = 2; for (let i = 1; i <= 4; i++) b[i] = 1;
    assert.equal(chooseMove(b, 1, level), 5);
    assert.equal(chooseMove(b, 2, level), 5);
    assert.equal(b[5], 0, 'search must not mutate input');
    assert.equal(chooseMove(Array(225).fill(0), 1, level), 112);
  }
});
test('AI produces legal moves within a bounded budget on a midgame board', () => {
  const b = Array(225).fill(0);
  for (const [cell, stone] of [[112,1],[113,2],[97,1],[128,2],[98,1],[96,2]]) b[cell] = stone;
  const start = performance.now(); const cell = chooseMove(b, 1, 'hard');
  assert.ok(cell >= 0 && cell < 225 && b[cell] === 0);
  assert.ok(performance.now() - start < 1800);
});
test('commands acknowledge rejection, ignore duplicates and require both rematch votes', () => {
  const e = new GomokuEngine('test', 0);
  const wrong = cmd(e, 1); e.command(1, wrong); assert.equal(e.world.ack[1], 1); assert.equal(e.world.turn, 0);
  const first = cmd(e, 1); e.command(0, first); e.command(0, first); assert.equal(e.world.turn, 1);
  e.command(1, cmd(e, 2, 'resign')); assert.equal(e.world.result, 1);
  const old = cmd(e, 10);
  e.command(0, cmd(e, 2, 'rematch')); assert.equal(e.world.round, 1);
  e.command(1, cmd(e, 3, 'rematch')); assert.equal(e.world.round, 2); assert.equal(e.world.black, 1);
  e.command(0, old); assert.equal(e.world.turn, 0);
});
test('wire rejects malformed state and commands; full board stays below 1400 bytes', () => {
  const e = new GomokuEngine('wire', 0); e.place(0, 112);
  const p = encodeWorld(e.world); assert.deepEqual(decodeWorld(p), e.world);
  for (const mutation of [{board:'0'}, {black:3}, {turn:5}, {last:-1}, {ack:[NaN,0]}, {line:[225]}, {ready:[true]}]) assert.equal(decodeWorld({...p,...mutation}), null);
  assert.equal(validCommand({...cmd(e, 1), cell:225}), false);
  assert.equal(validCommand({...cmd(e, 1), seq:Infinity}), false);
  assert.ok(Buffer.byteLength(JSON.stringify(p)) < 1400);
});
test('two matches recover lost requests/snapshots, ignore reordered snapshots and keep final result', () => {
  const host = new GomokuMatch(true), guest = new GomokuMatch(false);
  const black = host.current().black;
  sync(host, guest);
  const mover = black === 0 ? host : guest;
  press(mover, 'place');
  if (mover === guest) {
    const request = guest.buildOutgoingPacket();
    // Lost first request: pending command remains available for the next send.
    assert.deepEqual(guest.buildOutgoingPacket(), request);
    sync(guest, host); sync(guest, host);
  }
  const old = structuredClone(host.buildOutgoingPacket());
  assert.equal(host.current().turn, 1);
  sync(host, guest); assert.deepEqual(guest.current(), host.current());
  const next = black === 0 ? guest : host;
  press(next, 'right'); press(next, 'place'); sync(guest, host);
  sync(host, guest); guest.applyOpponentPacket(old);
  assert.equal(host.current().turn, 2); assert.deepEqual(guest.current(), host.current());
  // Navigate host to the bottom menu and resign using only arrows + Space.
  for (let i = 0; i < 8; i++) press(host, 'down');
  press(host, 'right'); press(host, 'place'); press(host, 'right'); press(host, 'place');
  assert.equal(host.current().reason, 'resign');
  // Dropped winning snapshot: repeated snapshots still deliver the result.
  sync(host, guest); host.step(NO_INPUT); guest.step(NO_INPUT);
  assert.equal(guest.current().result, host.current().result);
  assert.equal(host.isOver(), false); assert.equal(guest.isOver(), false);
  press(host, 'place'); assert.equal(host.current().round, 1);
  sync(host, guest); press(guest, 'place'); sync(guest, host); sync(host, guest);
  host.step(NO_INPUT); guest.step(NO_INPUT);
  assert.equal(host.current().round, 2); assert.equal(host.current().black, 1 - black);
  assert.deepEqual(guest.current(), host.current());
  guest.applyOpponentPacket(old); assert.equal(guest.current().round, 2);
  guest.connectionLost(); press(guest, 'place'); assert.equal(guest.isOver(), true);
  host.dispose(); guest.dispose();
});
test('Space is buffered once per press, Enter is not bound, and blur clears movement', () => {
  const target = new EventTarget(); const source = createInputSource(target);
  const emit = (type, code) => { const e = new Event(type); Object.defineProperty(e, 'code', {value:code}); target.dispatchEvent(e); };
  emit('keydown','Space'); assert.equal(source.read().place, true);
  emit('keydown','Space'); assert.equal(source.read().place, false);
  emit('keyup','Space'); emit('keydown','Space'); assert.equal(source.read().place, true);
  emit('keydown','Enter'); assert.equal(source.read().place, false);
  emit('keydown','ArrowDown'); assert.equal(source.read().down, true);
  target.dispatchEvent(new Event('blur')); assert.deepEqual(source.read(), NO_INPUT);
});

test('disconnect immediately after a new round snapshot still offers keyboard exit', () => {
  const host = new GomokuMatch(true), guest = new GomokuMatch(false);
  sync(host, guest);
  const next = host.buildOutgoingPacket(); next.round = 2; next.revision++;
  guest.applyOpponentPacket(next); guest.connectionLost();
  press(guest, 'place'); assert.equal(guest.isOver(), true);
  host.dispose(); guest.dispose();
});
