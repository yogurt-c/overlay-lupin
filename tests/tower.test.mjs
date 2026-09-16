import test from 'node:test';
import assert from 'node:assert/strict';
import decomp from 'poly-decomp';
import { ANIMALS } from '../dist/renderer/games/tower/animals.js';
import { bodyBounds, createAnimalBody, GEOMETRY, METRES_PER_PIXEL } from '../dist/renderer/games/tower/geometry.js';
import { planck } from '../dist/renderer/lib/tower-physics.js';
import { TowerBot, planPlacement } from '../dist/renderer/games/tower/bot.js';
import { TowerEngine } from '../dist/renderer/games/tower/engine.js';
import { TowerMatch, towerModule } from '../dist/renderer/games/tower/module.js';
import { NO_INPUT, PLATFORM_Y, MAX_ANIMALS } from '../dist/renderer/games/tower/types.js';
import { WorldAssembler, encodeWorld } from '../dist/renderer/games/tower/wire.js';
import { cameraTargetY } from '../dist/renderer/games/tower/draw.js';
import { createInputSource } from '../dist/renderer/games/tower/input.js';

const command = (turn = 0, seq = 1, x = 160, angle = 0) => ({ seq, turn, x, angle, drop: true });
/** Physics runs in metres; every assertion below is written in the game's pixels. */
const makeBody = (kind, x = 0, y = 0, angle = 0) =>
  createAnimalBody(planck.World({ gravity: planck.Vec2(0, 0) }), kind, x, y, angle);
const speed = body => body.getLinearVelocity().length() / METRES_PER_PIXEL / 60;
const velocity = body => ({ x: body.getLinearVelocity().x / METRES_PER_PIXEL / 60,
  y: body.getLinearVelocity().y / METRES_PER_PIXEL / 60 });
function untilSettled(engine, max = 1500) {
  for (let i = 0; i < max && engine.snapshot().phase === 'fall'; i++) engine.step();
  assert.notEqual(engine.snapshot().phase, 'fall', 'simulation must settle or collapse');
}

test('16 approved silhouettes decompose into matching finite compound bodies', () => {
  assert.equal(ANIMALS.length, 16);
  assert.equal(new Set(ANIMALS.map(a => a.id)).size, 16);
  for (const [i, a] of ANIMALS.entries()) {
    assert.ok(decomp.isSimple(a.vertices), a.id);
    const b = makeBody(i, 160, 100);
    assert.ok(GEOMETRY[i].parts.length > 1, `${a.id}: preserve concavities`);
    assert.ok(Number.isFinite(b.getMass()) && b.getMass() > 0 && b.getInertia() > 0);
    const { vertices, centre } = GEOMETRY[i];
    const box = bodyBounds(b);
    for (const axis of ['x', 'y']) {
      const offset = axis === 'x' ? 160 : 100;
      const lo = axis === 'x' ? box.minX : box.minY, hi = axis === 'x' ? box.maxX : box.maxY;
      assert.ok(Math.abs(lo - (Math.min(...vertices.map(v => v[axis])) - centre[axis] + offset)) < 0.2, `${a.id}: ink bounds match ${axis}`);
      assert.ok(Math.abs(hi - (Math.max(...vertices.map(v => v[axis])) - centre[axis] + offset)) < 0.2, `${a.id}: ink bounds match ${axis}`);
    }
    const before = box.maxX - box.minX;
    b.setAngle(Math.PI / 2);
    const turned = bodyBounds(b);
    assert.ok(Math.abs((turned.maxY - turned.minY) - before) < 0.2, `${a.id}: rotated shape`);
  }
});

test('turn advances only after contact and sustained rest; solo retains control', () => {
  for (const solo of [false, true]) {
    const e = new TowerEngine(solo, 42);
    e.command(0, command());
    for (let i = 0; i < 119; i++) e.step();
    assert.equal(e.snapshot().phase, 'fall');
    untilSettled(e);
    const w = e.snapshot();
    assert.equal(w.phase, 'aim'); assert.equal(w.score, 1); assert.equal(w.turn, 1);
    assert.equal(w.side, solo ? 0 : 1);
    assert.ok(bodyBounds(e.animals[0].body).maxY <= PLATFORM_Y + 1);
    assert.ok(w.y + GEOMETRY[w.kind].radius < bodyBounds(e.animals[0].body).minY);
  }
});

test('drop commands reject wrong player, stale turns, duplicates and invalid values', () => {
  const e = new TowerEngine(false, 1);
  e.command(1, command()); assert.equal(e.animals.length, 0);
  e.command(0, { ...command(), x: NaN });
  e.command(0, { ...command(), angle: Infinity });
  e.command(0, null); assert.equal(e.animals.length, 0);
  e.command(0, command()); e.command(0, command()); e.command(0, command(0, 2));
  assert.equal(e.animals.length, 1);
  untilSettled(e);
  e.command(1, command(0, 2)); assert.equal(e.animals.length, 1);
  e.command(1, command(1, 3)); assert.equal(e.animals.length, 2);
  e.command(1, command(1, 3)); assert.equal(e.animals.length, 2);
  assert.equal(e.snapshot().ack, 3);
});

test('host clamps aim and normalizes rotations', () => {
  const e = new TowerEngine();
  e.command(0, { seq: 1, turn: 0, x: 1e9, angle: 33 * Math.PI, drop: false });
  assert.equal(e.snapshot().x, 280);
  assert.ok(Math.abs(e.snapshot().angle) <= Math.PI);
});

test('missing the platform loses; result stays visible before match completion', () => {
  const e = new TowerEngine(false, 1);
  e.command(0, command(0, 1, 40)); untilSettled(e);
  assert.equal(e.snapshot().phase, 'over'); assert.equal(e.snapshot().loser, 0);
  assert.equal(e.snapshot().score, 0); assert.equal(e.isOver, false);
  for (let i = 0; i < 240; i++) e.step();
  assert.equal(e.isOver, true);
});

test('late collapse before next drop remains the previous dropper’s responsibility', () => {
  const e = new TowerEngine(false, 1);
  e.command(0, command()); untilSettled(e);
  assert.equal(e.snapshot().side, 1);
  e.animals[0].body.setPosition(planck.Vec2(400 * METRES_PER_PIXEL, 400 * METRES_PER_PIXEL)); e.step();
  assert.equal(e.snapshot().loser, 0);
});

test('second player’s off-platform drop loses for that player', () => {
  const e = new TowerEngine(false, 1);
  e.command(0, command()); untilSettled(e);
  e.command(1, command(1, 1, 280)); untilSettled(e);
  assert.equal(e.snapshot().loser, 1);
  assert.equal(e.snapshot().score, 1);
});

test('multiple seeded stacks rotate, settle or collapse without hanging', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const e = new TowerEngine(true, seed);
    let seq = 0;
    for (let turn = 0; turn < 8 && e.snapshot().phase !== 'over'; turn++) {
      e.command(0, command(turn, ++seq, 160, turn % 3 === 0 ? Math.PI / 12 : 0));
      untilSettled(e);
      assert.ok(e.snapshot().bodies.every(p => p.every(Number.isFinite)));
    }
  }
});

test('fragmented 64-animal state stays MTU safe and assembles out of order', () => {
  const w = new TowerEngine().snapshot();
  w.tick = 100; w.score = MAX_ANIMALS;
  w.bodies = Array.from({ length: MAX_ANIMALS }, (_, i) => [i % 16, i % 2, 279.99, -9000.333, Math.PI]);
  const packets = encodeWorld(w);
  for (const packet of packets) assert.ok(Buffer.byteLength(JSON.stringify({ t: 'POS', id: 'x'.repeat(36), payload: packet })) < 1200);
  const assembler = new WorldAssembler();
  for (const packet of packets.slice(1).reverse()) assert.equal(assembler.ingest(packet), null);
  const result = assembler.ingest(packets[0]);
  assert.equal(result.bodies.length, MAX_ANIMALS); assert.equal(result.tick, 100);
  assert.equal(assembler.ingest(packets[0]), null);
  assert.equal(assembler.ingest({ ...packets[0], total: 99999 }), null);
  assert.equal(assembler.ingest({}), null);
  assert.equal(assembler.ingest(null), null);
});

test('lost snapshot chunk is repaired by a new complete cycle, without mixing ticks', () => {
  const w = new TowerEngine().snapshot();
  w.tick = 10; w.bodies = Array.from({ length: 11 }, () => [0, 0, 160, 200, 0]);
  const old = encodeWorld(w), a = new WorldAssembler();
  assert.equal(a.ingest(old[0]), null);
  const next = encodeWorld({ ...w, tick: 20, x: 180 });
  assert.equal(a.ingest(next[1]), null);
  assert.equal(a.ingest(old[1]), null);
  assert.equal(a.ingest(next[0]).x, 180);
  assert.equal(a.ingest(old[0]), null);
});

test('client retains a drop through a lost send; host accepts it exactly once and acknowledges', () => {
  const host = new TowerMatch(true), guest = new TowerMatch(false);
  host.step({ ...NO_INPUT, drop: true });
  for (let i = 0; i < 200; i++) { host.step(NO_INPUT); guest.applyOpponentPacket(host.buildOutgoingPacket()); guest.step(NO_INPUT); }
  assert.match(guest.hud().status, /내 차례/);
  guest.step({ ...NO_INPUT, left: true, rotate: true, drop: true });
  const lost = guest.buildOutgoingPacket();
  guest.step(NO_INPUT);
  const retry = guest.buildOutgoingPacket();
  assert.deepEqual(retry, lost);
  host.applyOpponentPacket(retry); host.applyOpponentPacket(retry); host.step(NO_INPUT);
  const packet = host.buildOutgoingPacket();
  assert.equal(packet.world.bodies.length, 2); assert.equal(packet.world.phase, 'fall');
  assert.equal(packet.world.bodies[1][1], 1);
  guest.applyOpponentPacket(packet);
  assert.equal(guest.buildOutgoingPacket().cmd, null);
  assert.equal(guest.hud().status.split(' · ')[1], host.hud().status.split(' · ')[1]);
});

test('keyboard actions are edge triggered and clear on blur', () => {
  const target = new EventTarget(), input = createInputSource(target);
  function key(type, code, repeat = false) {
    const e = new Event(type, { cancelable: true }); Object.assign(e, { code, repeat }); target.dispatchEvent(e);
  }
  key('keydown', 'Space'); key('keydown', 'ArrowUp'); key('keydown', 'ArrowLeft');
  assert.deepEqual(input.read(), { left: true, right: false, rotate: true, rotateBack: false, drop: true });
  key('keydown', 'Space', true); assert.equal(input.read().drop, false);
  assert.equal(input.read().rotate, false);
  key('keyup', 'Space'); key('keydown', 'Space'); assert.equal(input.read().drop, true);
  target.dispatchEvent(new Event('blur')); assert.deepEqual(input.read(), NO_INPUT);
  key('keydown', 'Space'); input.clear(); assert.deepEqual(input.read(), NO_INPUT);
});

test('registry module provides both duel and solo factories', () => {
  assert.equal(towerModule.id, 'tower');
  const solo = towerModule.createSoloMatch('me', 'Me');
  assert.match(solo.hud().status, /내 차례/);
  solo.step({ ...NO_INPUT, drop: true });
  for (let i = 0; i < 200; i++) solo.step(NO_INPUT);
  assert.match(solo.hud().status, /1마리/);
});


test('camera pans upward as tower grows while keeping a fixed world scale', () => {
  const world = new TowerEngine().snapshot();
  assert.equal(cameraTargetY(world), 0);
  world.y = -300;
  const high = cameraTargetY(world);
  assert.ok(high < -300);
  assert.ok(world.y - GEOMETRY[world.kind].radius - high >= 64);
  world.y -= 100;
  assert.equal(cameraTargetY(world), high - 100);
});


test('down arrow rotates counterclockwise once per press and opposite inputs cancel', () => {
  const target = new EventTarget(), input = createInputSource(target);
  const match = new TowerMatch(true);
  function key(type, repeat = false) {
    const e = new Event(type, { cancelable: true });
    Object.assign(e, { code: 'ArrowDown', repeat }); target.dispatchEvent(e);
  }
  key('keydown'); match.step(input.read());
  assert.ok(Math.abs(match.buildOutgoingPacket().world.angle + Math.PI / 12) < 0.001);
  key('keydown', true); match.step(input.read());
  assert.ok(Math.abs(match.buildOutgoingPacket().world.angle + Math.PI / 12) < 0.001);
  key('keyup'); key('keydown'); match.step(input.read());
  assert.ok(Math.abs(match.buildOutgoingPacket().world.angle + Math.PI / 6) < 0.001);
  match.step({ ...NO_INPUT, rotate: true, rotateBack: true });
  assert.ok(Math.abs(match.buildOutgoingPacket().world.angle + Math.PI / 6) < 0.001);
  match.step({ ...NO_INPUT, rotate: true });
  assert.ok(Math.abs(match.buildOutgoingPacket().world.angle + Math.PI / 12) < 0.001);
  key('keyup'); key('keydown'); target.dispatchEvent(new Event('blur'));
  assert.deepEqual(input.read(), NO_INPUT);
});


test('bot waits, moves gradually, rotates in 15-degree steps and releases within a bounded turn', () => {
  const engine = new TowerEngine(false, 9), bot = new TowerBot(9);
  assert.equal(bot.step(engine.snapshot()), null, 'never act during player turn');
  engine.command(0, command()); untilSettled(engine);
  let released = false, moves = 0, turns = 0, firstAction = -1;
  for (let tick = 0; tick < 600; tick++) {
    const before = engine.snapshot(), action = bot.step(before);
    if (action) {
      if (firstAction < 0) firstAction = tick;
      assert.equal(action.turn, before.turn);
      assert.ok(Math.abs(action.x - before.x) <= 1.36);
      const da = Math.atan2(Math.sin(action.angle - before.angle), Math.cos(action.angle - before.angle));
      assert.ok(Math.abs(da) <= Math.PI / 12 + 1e-6);
      if (action.x !== before.x) moves++;
      if (Math.abs(da) > 0.01) turns++;
      engine.command(1, action);
      if (action.drop) { released = true; break; }
    }
    engine.step();
  }
  assert.ok(firstAction >= 34, 'look at the board before acting');
  assert.ok(moves > 1 && turns > 1, 'animate approach and rotation');
  assert.ok(released);
  assert.equal(bot.step(engine.snapshot()), null, 'do not interfere with falling bodies');
  untilSettled(engine);
  assert.equal(engine.snapshot().side, 0);
});

test('bot placement is based only on the snapshot, reproducible with a seed and varies across games', () => {
  const engine = new TowerEngine(false, 2);
  engine.command(0, command()); untilSettled(engine);
  const world = engine.snapshot(), original = JSON.stringify(world);
  const a = new TowerBot(123), b = new TowerBot(123), c = new TowerBot(456);
  let differs = false;
  for (let tick = 0; tick < 300; tick++) {
    const x = a.step(world), y = b.step(world), z = c.step(world);
    assert.deepEqual(x, y);
    if (JSON.stringify(x) !== JSON.stringify(z)) differs = true;
  }
  assert.ok(differs); assert.equal(JSON.stringify(world), original);
  const plan = planPlacement(world, () => 0.5);
  assert.ok(plan.x >= 40 && plan.x <= 280);
});

test('bot usually supports a second animal without stalling or bypassing physics', () => {
  let successes = 0, losses = 0;
  for (let seed = 1; seed <= 16; seed++) {
    const engine = new TowerEngine(false, seed), bot = new TowerBot(seed);
    engine.command(0, command()); untilSettled(engine);
    let finished = false;
    for (let tick = 0; tick < 1800; tick++) {
      const action = bot.step(engine.snapshot());
      if (action) engine.command(1, action);
      engine.step();
      const w = engine.snapshot();
      if (w.phase === 'over') { assert.equal(w.loser, 1); losses++; finished = true; break; }
      if (w.phase === 'aim' && w.side === 0) { assert.equal(w.score, 2); successes++; finished = true; break; }
    }
    assert.ok(finished, `seed ${seed} must not stall`);
  }
  assert.ok(successes >= 12, 'a reasonable opponent on an easy low stack');
  assert.equal(successes + losses, 16);
});

test('solo factory plays a real bot turn, ignores human controls on bot turn and returns win/loss', () => {
  const match = towerModule.createSoloMatch('me', 'Me');
  match.step({ ...NO_INPUT, drop: true });
  let sawBot = false, botPlaced = false, resolved = false;
  for (let tick = 0; tick < 1800; tick++) {
    const w = match.buildOutgoingPacket().world;
    if (w.side === 1) sawBot = true;
    if (w.bodies.length === 2) { botPlaced = true; assert.equal(w.bodies[1][1], 1); }
    if (w.phase === 'over') {
      assert.match(match.hud().banner, /승리|패배/); resolved = true; break;
    }
    if (botPlaced && w.side === 0) { assert.match(match.hud().status, /내 차례/); resolved = true; break; }
    match.step(w.side === 1 ? { ...NO_INPUT, left: true, drop: true, rotate: true } : NO_INPUT);
  }
  assert.ok(sawBot && botPlaced && resolved);
});

test('relative animal size reaches physics mass and inertia without losing small silhouettes', () => {
  const byId = id => ANIMALS.findIndex(a => a.id === id);
  const body = id => makeBody(byId(id));
  const longest = b => { const x = bodyBounds(b); return Math.max(x.maxX - x.minX, x.maxY - x.minY); };
  assert.ok(longest(body('elephant')) > longest(body('cat')) * 3);
  assert.ok(longest(body('hippo')) > longest(body('rabbit')) * 3);
  assert.ok(longest(body('giraffe')) > longest(body('bear')));
  assert.ok(longest(body('hedgehog')) >= 17.8);
  assert.ok(body('elephant').getMass() > body('cat').getMass() * 5);
  assert.ok(body('elephant').getInertia() > body('cat').getInertia() * 10);
  for (const [i] of ANIMALS.entries()) assert.ok(Math.abs(longest(makeBody(i)) - GEOMETRY[i].extent) < 0.2);
});


test('supported tower stops jittering and lets the new load wake contacts naturally', () => {
  const engine = new TowerEngine(false, 1);
  engine.command(0, command()); untilSettled(engine);
  const plan = planPlacement(engine.snapshot(), () => 0.5);
  engine.command(1, { ...command(1, 1), ...plan }); untilSettled(engine);
  assert.equal(engine.snapshot().score, 2);
  assert.ok(engine.animals.every(a => !a.body.isAwake()));
  const resting = engine.snapshot().bodies;
  for (let tick = 0; tick < 600; tick++) engine.step();
  assert.deepEqual(engine.snapshot().bodies, resting, 'no idle drift or rotation over ten seconds');
  engine.command(0, command(2, 2));
  assert.equal(engine.animals[0].body.isAwake(), false, 'old support is not force-woken');
  assert.equal(engine.animals[2].body.isAwake(), true, 'new load remains dynamic');
  for (let tick = 0; tick < 90; tick++) engine.step();
  assert.ok(engine.animals.some(a => a.body.isAwake()), 'a real contact may wake its support');
});

test('unsupported pieces never sleep in mid-air or turn into a fixed support', () => {
  const engine = new TowerEngine(false, 1);
  engine.command(0, command(0, 1, 40));
  for (let tick = 0; tick < 120 && engine.snapshot().phase !== 'over'; tick++) {
    assert.equal(engine.animals[0].body.isAwake(), true);
    engine.step();
  }
  assert.equal(engine.snapshot().phase, 'over');
  assert.equal(engine.snapshot().loser, 0);
});

test('landing never launches an animal with an impact impulse', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const engine = new TowerEngine(false, seed);
    engine.command(0, command(0, 1, seed % 2 ? 160 : 154, seed % 3 * Math.PI / 12));
    let peakHorizontal = 0, peakUpward = 0;
    for (let tick = 0; tick < 600 && engine.snapshot().phase !== 'aim' && engine.snapshot().phase !== 'over'; tick++) {
      engine.step();
      for (const { body } of engine.animals) {
        peakHorizontal = Math.max(peakHorizontal, Math.abs(velocity(body).x));
        peakUpward = Math.max(peakUpward, -velocity(body).y);
      }
    }
    assert.ok(peakHorizontal <= 4.51, `seed ${seed}: sideways launch ${peakHorizontal}`);
    assert.ok(peakUpward <= 8.01, `seed ${seed}: upward launch ${peakUpward}`);
  }
});

/**
 * The first drop lands on the bare platform, which never exercised this at all:
 * launches came from contacts between animals. Guard the signature directly, since
 * it is the failure a solver change would reintroduce quietly — a piece that had
 * come to rest must never suddenly outrun a free fall.
 */
test('a resting animal is never catapulted when the next piece lands on it', () => {
  const stream = (s) => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  let worstJump = 0, worstSeed = 0, jumps = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const engine = new TowerEngine(true, seed);
    const random = stream(seed * 7919 + 13);
    const lastSpeed = new Map();
    let seq = 1;
    for (let turn = 0; turn < 6; turn++) {
      const world = engine.snapshot();
      if (world.phase !== 'aim') break;
      const { x, angle } = planPlacement(world, random);
      engine.command(0, { seq: seq++, turn: world.turn, x, angle, drop: true });
      for (let tick = 0; tick < 1500 && engine.snapshot().phase === 'fall'; tick++) {
        engine.step();
        for (const { body } of engine.animals) {
          const now = speed(body), before = lastSpeed.get(body);
          if (before !== undefined && before < 0.5 && now - before > 1.5) {
            jumps++;
            if (now - before > worstJump) { worstJump = now - before; worstSeed = seed; }
          }
          lastSpeed.set(body, now);
        }
      }
    }
  }
  // A dropped animal tops out near 4.2px/step under gravity alone, so anything a
  // resting body gains beyond that came from stored contact impulse, not the fall.
  assert.ok(worstJump <= 4.5, `seed ${worstSeed}: resting animal jumped to ${worstJump.toFixed(2)}px/step`);
  assert.ok(jumps <= 2, `${jumps} resting animals were shoved by a landing (expected at most 2)`);
});
