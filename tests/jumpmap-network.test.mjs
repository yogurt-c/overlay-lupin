import assert from 'node:assert/strict';
import { jumpmapModule } from '../dist/renderer/games/jumpmap/module.js';
import { JumpmapEngine } from '../dist/renderer/games/jumpmap/engine.js';
import { encodeWorld, decodeWorld } from '../dist/renderer/games/jumpmap/wire.js';
import { createInputSource } from '../dist/renderer/games/jumpmap/input.js';
import { advanceSendClock } from '../dist/renderer/lib/send-clock.js';
import { PLATFORMS, START_Y, movingPlatformX, WORLD_HEIGHT, RESPAWN_WORLD_MARGIN } from '../dist/renderer/games/jumpmap/field.js';
const idle = { left: false, right: false, jump: false, down: false, attack: false };
const right = { ...idle, right: true };
const clone = value => JSON.parse(JSON.stringify(value));
const makePair = () => ({ host: jumpmapModule.createMatch(true, 'host', 'Host'), guest: jumpmapModule.createMatch(false, 'guest', 'Guest') });
const sendInput = (host, guest) => host.applyOpponentPacket({ from: 'guest', ...clone(guest.buildOutgoingPacket()) });
const view = (host, id = 'guest') => decodeWorld(host.buildOutgoingPacket()).players.find(p => p.id === id);

// No host response is necessary for local motion, including a complete short tap.
{
  const { host, guest } = makePair();
  const before = guest.renderWorld().players[0];
  guest.step({ ...right, jump: true });
  const after = guest.renderWorld().players[0];
  assert(after.x > before.x && after.y < before.y);
  guest.step(idle);
  sendInput(host, guest);
  host.step(idle);
  assert(view(host).y < START_Y, 'jump survives release before the next send');
  const ack = view(host).ack;
  sendInput(host, guest); // retransmit exactly the same samples
  host.step(idle);
  assert.equal(view(host).ack, ack + 1);
  host.step(idle);
  assert.equal(view(host).ack, ack + 1, 'duplicate samples are never consumed twice');
  console.log('PASS immediate local movement and reliable short input');
}

// Key taps even shorter than a physics tick are retained; blur clears them.
{
  const handlers = {};
  const input = createInputSource({ addEventListener: (name, fn) => { handlers[name] = fn; } });
  const event = { code: 'ArrowUp', preventDefault() {} };
  handlers.keydown(event); handlers.keyup(event);
  assert.equal(input.read().jump, true);
  assert.equal(input.read().jump, false);
  handlers.keydown(event); handlers.blur();
  assert.equal(input.read().jump, false);
  console.log('PASS sub-tick input buffering and focus loss');
}

// Delayed, dropped and reordered packets. The host must eventually consume every
// frame exactly once and the guest must retire all acknowledged input history.
{
  const { host, guest } = makePair();
  const toHost = [], toGuest = [];
  let lastTick = -1;
  let peakPending = 0;
  for (let tick = 0; tick < 360; tick++) {
    const active = tick < 240;
    if (active) guest.step({ ...idle, right: tick % 120 < 50, left: tick % 120 >= 70,
      jump: tick % 45 === 1, attack: tick % 60 === 1 });
    if (tick % 2 === 0 && tick % 14 !== 0) {
      toHost.push({ due: tick + (tick % 6 === 0 ? 7 : 3), packet: { from: 'guest', ...clone(guest.buildOutgoingPacket()) } });
    }
    for (let i = toHost.length - 1; i >= 0; i--) if (toHost[i].due <= tick) host.applyOpponentPacket(toHost.splice(i, 1)[0].packet);
    host.step(idle);
    if (tick % 2 === 0 && tick % 10 !== 0) toGuest.push({ due: tick + (tick % 6 === 0 ? 8 : 3), packet: clone(host.buildOutgoingPacket()) });
    for (let i = toGuest.length - 1; i >= 0; i--) if (toGuest[i].due <= tick) guest.applyOpponentPacket(toGuest.splice(i, 1)[0].packet);
    assert(guest.receivedTick >= lastTick, 'old snapshots never rewind the client');
    lastTick = guest.receivedTick;
    peakPending = Math.max(peakPending, guest.pending.length);
    const me = guest.renderWorld().players.find(p => p.id === 'guest');
    assert(Number.isFinite(me.x) && Number.isFinite(me.y));
  }
  assert.equal(view(host).ack, 240);
  assert.equal(guest.pending.length, 0);
  assert(peakPending < 40, `input backlog grew to ${peakPending}`);
  console.log(`PASS latency/loss/reordering recovery (peak pending ${peakPending} ticks)`);
}

// Shared physics replay includes platform carrying, jump, landing, knockback and respawn.
for (const scenario of ['moving', 'jump', 'knockback', 'respawn']) {
  const engine = new JumpmapEngine();
  engine.ensurePlayer('guest', 'Guest');
  const player = engine.players.get('guest');
  const platform = PLATFORMS.find(p => p.kind === 'moving');
  if (scenario === 'moving') Object.assign(player, { x: movingPlatformX(platform, 0) + platform.w / 2, y: platform.y, standingOn: platform.id });
  if (scenario === 'knockback') Object.assign(player, { airborne: true, standingOn: null, vy: -4, knockVX: 8, stunTicks: 12 });
  if (scenario === 'respawn') Object.assign(player, { y: WORLD_HEIGHT + RESPAWN_WORLD_MARGIN + 5, airborne: true, standingOn: null });
  const snapshot = engine.snapshot(true);
  const prediction = new JumpmapEngine(true);
  prediction.restore('guest', snapshot.players[0].state, snapshot.tick, snapshot.phase);
  for (let tick = 0; tick < 90; tick++) {
    const input = { ...idle, jump: scenario === 'jump' && tick === 0 };
    engine.setInput('guest', input); prediction.setInput('guest', input);
    engine.step(); prediction.step();
    assert.deepEqual(prediction.snapshot(), engine.snapshot(), scenario);
  }
}
console.log('PASS shared movement replay: moving platform, jump/landing, knockback, respawn');

// Only the host may decide hits and finish order.
{
  const prediction = new JumpmapEngine(true);
  prediction.ensurePlayer('a', 'A'); prediction.ensurePlayer('b', 'B');
  prediction.setInput('a', { ...idle, attack: true }); prediction.step();
  assert.equal(prediction.players.get('b').knockVX, 0);
  assert(prediction.players.get('a').atkAnim > 0);
  const goal = PLATFORMS.find(p => p.kind === 'goal');
  Object.assign(prediction.players.get('a'), { x: goal.x + goal.w / 2, y: goal.y - 1, vy: 1, airborne: true, standingOn: null });
  prediction.step();
  assert.equal(prediction.players.get('a').finish, undefined);
  console.log('PASS host-only hit and finish authority');
}

// Interpolation fills the intermediate position, and stale worlds cannot rewind it.
{
  const { guest } = makePair();
  const world = tick => ({ phase: 'race', timerMs: 0, tick, players: [{ id: 'other', x: tick * 3, y: 100, facing: 1, p: 1 }] });
  guest.applyOpponentPacket(world(10)); guest.applyOpponentPacket(world(12));
  guest.displayTick = 11;
  assert.equal(guest.renderWorld().players.find(p => p.id === 'other').x, 33);
  guest.applyOpponentPacket(world(9));
  assert.equal(guest.currentWorld().tick, 12);
  console.log('PASS remote interpolation and stale snapshot rejection');
}

// Network payload must fit the usual 1472-byte UDP payload even with six players.
{
  const engine = new JumpmapEngine();
  for (let i = 0; i < 6; i++) {
    const id = `12345678-1234-1234-1234-12345678901${i}`;
    engine.ensurePlayer(id, 'Long player name that should not ride in the world');
    Object.assign(engine.players.get(id), { x: 912.123456789, y: -2500.123456789, vy: -10.123456789, knockVX: 8.123456789,
      attackCooldown: 30, stunTicks: 12, atkAnim: 10, impact: { platformId: PLATFORMS[20].id, x: 912, tick: 12345678 } });
  }
  const world = engine.snapshot(true); world.tick = 12345678;
  for (const p of world.players) p.ack = 12345678;
  const packet = encodeWorld(world);
  const bytes = Buffer.byteLength(JSON.stringify({ t: 'ROOM_WORLD', roomId: '12345678-1234-1234-1234-123456789012', payload: packet }));
  assert(bytes < 1472, `world packet is ${bytes} bytes`);
  assert.equal(decodeWorld(clone(packet)).players.length, 6);
  console.log(`PASS six-player world packet (${bytes} bytes)`);
}

for (const hz of [60, 120, 144]) {
  let previous = 0, sends = 0;
  for (let frame = 1; frame <= hz * 10; frame++) {
    const next = advanceSendClock(previous, frame * 1000 / hz, 1000 / 30);
    if (next > previous) sends++;
    previous = next;
  }
  assert.equal(sends, 300, `${hz}Hz send cadence`);
}
console.log('PASS 30Hz send cadence at 60/120/144Hz');

// A packet burst must not make remote physics run faster than the host clock.
{
  const { host, guest } = makePair();
  for (let i = 0; i < 12; i++) guest.step(right);
  sendInput(host, guest);
  let previous = view(host).x;
  for (let i = 0; i < 12; i++) {
    host.step(idle);
    const next = view(host).x;
    assert(next - previous <= 3, 'jitter recovery must not double movement speed');
    previous = next;
  }
  assert.equal(view(host).ack, 12);
  console.log('PASS backlog recovery preserves 60Hz movement speed');
}

// Reconciliation restores full authoritative state and replays only outstanding input.
{
  const { host, guest } = makePair();
  guest.step(right); sendInput(host, guest); host.step(idle);
  guest.step({ ...right, jump: true }); guest.step(idle);
  const packet = clone(host.buildOutgoingPacket());
  const world = decodeWorld(packet);
  const me = world.players.find(p => p.id === 'guest');
  const expected = new JumpmapEngine(true);
  expected.restore('guest', me.state, world.tick, world.phase);
  for (const frame of guest.pending.filter(f => f.seq > me.ack)) {
    expected.setInput('guest', frame.input); expected.step();
  }
  guest.applyOpponentPacket(packet);
  assert.deepEqual(guest.prediction.snapshot(), expected.snapshot());
  assert.deepEqual(guest.pending.map(f => f.seq), [2, 3]);
  // A confirmed respawn/round transition snaps rather than dragging the runner across the course.
  host.engine.phase = 'intermission'; host.engine.timerMs = 100;
  host.step(idle); guest.applyOpponentPacket(clone(host.buildOutgoingPacket()));
  assert.equal(guest.prediction.phase, 'intermission');
  host.engine.timerMs = 1; host.step(idle);
  guest.applyOpponentPacket(clone(host.buildOutgoingPacket()));
  assert.equal(guest.prediction.phase, 'race');
  assert.deepEqual(guest.correction, { x: 0, y: 0 });
  console.log('PASS authoritative reconciliation, pending replay, and round transition');
}

// Bound memory while offline and recover without dropping sequence numbers.
{
  const { host, guest } = makePair();
  for (let i = 0; i < 250; i++) guest.step(idle);
  assert.equal(guest.pending.length, 180);
  assert.equal(guest.sequence, 180);
  for (let i = 0; i < 30; i++) {
    sendInput(host, guest); host.step(idle);
    guest.applyOpponentPacket(clone(host.buildOutgoingPacket()));
  }
  assert.equal(guest.pending.length, 0);
  guest.step(right); sendInput(host, guest); host.step(idle);
  assert.equal(view(host).ack, 181);
  console.log('PASS bounded disconnect history and sequence recovery');
}
