import assert from 'node:assert/strict';
import { generateCourse, traceRoute, startTrace } from '../dist/renderer/games/jumpmap/generator.js';
import { WORLD_WIDTH, START_Y, GOAL_Y } from '../dist/renderer/games/jumpmap/field.js';
import { jumpmapModule } from '../dist/renderer/games/jumpmap/module.js';

const idle = { left: false, right: false, jump: false, down: false, attack: false };
const active = { ...idle, right: true, jump: true, attack: true };
const clone = value => JSON.parse(JSON.stringify(value));
function generate(seed) {
  const generator = generateCourse(seed);
  let previous = 0;
  for (;;) {
    const step = generator.next();
    if (step.done) return step.value;
    assert(step.value.percent >= previous && step.value.percent <= 90);
    previous = step.value.percent;
  }
}
function finish(generator) {
  let result = generator.next();
  while (!result.done) result = generator.next();
  return result.value;
}
const send = (host, guest, id = 'guest') => host.applyOpponentPacket({ from: id, ...clone(guest.buildOutgoingPacket()) });
function prepare(host, guest) {
  for (let i = 0; i < 2000; i++) {
    send(host, guest);
    if (host.loading) host.step(active);
    guest.applyOpponentPacket(clone(host.buildOutgoingPacket()));
    if (!host.loading && !guest.loading) return;
  }
  assert.fail('preparation did not complete');
}

const patterns = new Set();
const start = performance.now();
for (let seed = 0; seed < 100; seed++) {
  const course = generate(seed);
  assert.deepEqual(course, generate(seed), 'seed must reproduce identical geometry');
  assert.equal(course.platforms[0].id, 'start');
  assert.equal(course.platforms[0].y, START_Y);
  assert.equal(course.platforms.at(-1).id, 'goal');
  assert.equal(course.platforms.at(-1).y, GOAL_Y);
  assert.equal(new Set(course.platforms.map(p => p.id)).size, course.platforms.length);
  for (const p of course.platforms) {
    assert(p.x - (p.amplitude ?? 0) >= 0 && p.x + p.w + (p.amplitude ?? 0) <= WORLD_WIDTH);
    if (p.launchTargetId) assert(course.platforms.some(target => target.id === p.launchTargetId));
  }
  course.patterns.forEach(p => patterns.add(p));
  assert.equal(new Set(course.patterns).size, 9, `seed ${seed} must retain each challenge type`);
  const technical = course.platforms.filter(p => p.w < 74 && p.kind !== 'trampoline');
  assert(technical.filter(p => p.w <= 36).length >= 8, 'precision landings throughout the upper course');
  assert(course.platforms.filter(p => p.kind === 'moving').length >= 5, 'timing challenges cannot disappear during repair');
  assert(course.platforms.filter(p => p.kind === 'moving').every(p => p.amplitude >= 48));
  assert(course.platforms.filter(p => p.w >= 100).length <= 5, 'wide rest platforms should be occasional');
  const mainPlatforms = [course.platforms[0], ...course.route.map(id => course.platforms.find(p => p.id === id))];
  const rises = mainPlatforms.slice(1).map((p, i) => mainPlatforms[i].y - p.y);
  assert(new Set(rises).size >= 15, 'vary jump heights, not just horizontal positions');
  const longJumps = mainPlatforms.slice(1).filter((p, i) => Math.abs(p.x + p.w / 2 - mainPlatforms[i].x - mainPlatforms[i].w / 2) >= 115);
  assert(longJumps.length >= 8, 'require takeoff positioning on long traverses');
  for (const tick of [0, 60, 137, 279]) {
    const trace = { ...startTrace(), tick };
    assert(finish(traceRoute(course.platforms, course.route, trace)), `seed ${seed}, starting tick ${tick}`);
  }
  // Take every shortcut in a single continuous run, rather than checking isolated edges.
  let shortcutRoute = [...course.route];
  for (const p of course.platforms.filter(p => p.id.endsWith('short'))) {
    const prefix = p.id.replace('short', '');
    const index = shortcutRoute.indexOf(`${prefix}p0`);
    shortcutRoute.splice(index, 2, p.id);
  }
  assert(finish(traceRoute(course.platforms, shortcutRoute)), `shortcut route for seed ${seed}`);
}
assert.equal(patterns.size, 9);
assert.notDeepEqual(generate(100).platforms, generate(101).platforms);
console.log(`PASS 100 deterministic maps, bounds, 400 continuous main routes and 100 shortcut routes (${Math.round(performance.now() - start)}ms)`);

// Initial roster prevents a silent member from being left behind; all input is
// frozen until its complete map is acknowledged, with no countdown afterward.
{
  const host = jumpmapModule.createMatch(true, 'host', 'Host');
  const guest = jumpmapModule.createMatch(false, 'guest', 'Guest');
  host.setMembers([{ id: 'guest', name: 'Guest' }]);
  assert.equal(host.hud().status, '맵 생성 중 0%');
  for (let i = 0; i < 300; i++) { host.step(active); guest.step(active); }
  assert(host.loading && guest.loading);
  assert.equal(host.engine.snapshot().tick, 0);
  assert.equal(guest.sequence, 0);
  assert.equal(guest.prediction.snapshot().players[0].y, START_Y);
  assert.equal(host.progress, 90);
  prepare(host, guest);
  assert.deepEqual(host.platforms, guest.platforms);
  assert.equal(host.engine.phase, 'race');
  assert.equal(host.engine.snapshot().tick, 0);
  guest.step(active);
  assert.equal(guest.sequence, 1);
  assert(guest.prediction.snapshot().players[0].y < START_Y);
  host.step(active);
  assert(host.engine.snapshot().players.find(p => p.id === 'host').y < START_Y);
  console.log('PASS loading freezes input and starts immediately after map acknowledgement');
}

// Drop, reorder and duplicate actual map chunks. Neither a missing chunk nor an
// early world packet may start prediction on a partial/old map.
{
  const host = jumpmapModule.createMatch(true, 'host', 'Host');
  const guest = jumpmapModule.createMatch(false, 'guest', 'Guest');
  host.setMembers([{ id: 'guest', name: 'Guest' }]);
  while (!host.courseReady) host.step(idle);
  const packets = [];
  const total = Math.ceil(host.platforms.length / 4);
  for (let i = 0; i < total; i++) packets.push(clone(host.buildOutgoingPacket()));
  for (const packet of [...packets].reverse()) {
    if (packet.chunk.index === 2) continue;
    guest.applyOpponentPacket(packet); guest.applyOpponentPacket(packet);
    const bytes = Buffer.byteLength(JSON.stringify({ t: 'ROOM_WORLD', roomId: '12345678-1234-1234-1234-123456789012', payload: packet }));
    assert(bytes < 1472, `map chunk too large: ${bytes}`);
  }
  assert.equal(guest.courseReady, false);
  send(host, guest); host.step(idle);
  assert(host.loading);
  guest.applyOpponentPacket({ v: 1, courseId: host.courseId, tick: 10, phase: 'race', timerMs: 0, runners: [] });
  assert(guest.loading);
  guest.applyOpponentPacket(packets[2]);
  assert.equal(guest.progress, 100);
  assert(guest.loading, 'receiving geometry alone is not the start signal');
  const staleReady = { from: 'guest', ...guest.buildOutgoingPacket(), ready: null };
  send(host, guest);
  host.applyOpponentPacket(staleReady);
  host.step(idle);
  assert(!host.loading, 'old not-ready packets must not undo readiness');
  guest.applyOpponentPacket(clone(host.buildOutgoingPacket()));
  assert(!guest.loading);
  assert.deepEqual(guest.platforms, host.platforms);
  console.log('PASS map chunk loss/reordering, datagram budget and monotonic readiness');

  // New round replaces map and resets input sequences. Old map and race packets cannot rewind it.
  const oldWorld = clone(host.buildOutgoingPacket());
  const oldId = host.courseId;
  guest.step(active);
  host.engine.phase = 'intermission'; host.engine.timerMs = 1;
  host.step(idle);
  guest.applyOpponentPacket(clone(host.buildOutgoingPacket()));
  assert.equal(guest.courseId, oldId + 1);
  assert.equal(guest.pending.length, 0);
  assert.equal(guest.sequence, 0);
  guest.applyOpponentPacket(oldWorld);
  guest.applyOpponentPacket(packets[0]);
  assert.equal(guest.courseId, oldId + 1);
  assert(guest.loading && !guest.courseReady);
  prepare(host, guest);
  assert(!host.loading && !guest.loading);
  assert.deepEqual(guest.platforms, host.platforms);
  console.log('PASS fresh map per round, input reset and stale round rejection');
}

// Disconnecting while loading releases the barrier. A later join receives the
// current map while the existing race continues.
{
  const host = jumpmapModule.createMatch(true, 'host', 'Host');
  host.setMembers([{ id: 'gone', name: 'Gone' }]);
  while (!host.courseReady) host.step(idle);
  assert(host.loading);
  host.removePeer('gone'); host.step(idle);
  assert(!host.loading);
  const guest = jumpmapModule.createMatch(false, 'guest', 'Guest');
  let previous = host.engine.snapshot().tick;
  for (let i = 0; i < 1000 && guest.loading; i++) {
    send(host, guest); host.step(idle);
    guest.applyOpponentPacket(clone(host.buildOutgoingPacket()));
    assert(host.engine.snapshot().tick > previous);
    previous = host.engine.snapshot().tick;
  }
  assert(!guest.loading);
  assert.deepEqual(host.platforms, guest.platforms);
  send(host, guest); host.step(idle);
  assert(host.engine.players.has('guest'));
  console.log('PASS disconnected participant and mid-race join');
}

// Loading UI uses the actual percentage and a progress bar, with no countdown banner.
{
  const host = jumpmapModule.createMatch(true, 'host', 'Host');
  const text = [], bars = [];
  const context = { setTransform() {}, clearRect() {}, save() {}, restore() {},
    fillText(value) { text.push(value); }, fillRect(...args) { bars.push(args); } };
  host.progress = 47;
  host.render(context, { width: 260, height: 260, pixelRatio: 2 });
  assert(text.includes('맵 생성 중 47%'));
  assert(Math.abs(bars[1][2] - bars[0][2] * 0.47) < 1e-9);
  assert.equal(host.hud().banner, '');
  console.log('PASS loading percentage and progress bar rendering');
}
