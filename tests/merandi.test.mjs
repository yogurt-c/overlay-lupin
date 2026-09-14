/**
 * Headless checks for the merandi map-wide celebration feature (레전더리+ draws), run against the
 * compiled renderer output (`npm test` builds first). Mirrors simulation.test.mjs's plain-Node,
 * no-framework style: step the engine directly, assert on its snapshot.
 */
import { MerandiEngine } from '../dist/renderer/games/merandi/engine.js';
import { CELEBRATION_MIN_GRADE, GRADES } from '../dist/renderer/games/merandi/data.js';
import { buildOutgoingPacket, encodeHeavyChunks, SnapshotAssembler } from '../dist/renderer/games/merandi/wire.js';

const STEP_MS = 1000 / 60;
let failures = 0;

function check(name, cond, extra = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failures += 1;
  console.log(`${mark}  ${name}${extra ? ` — ${extra}` : ''}`);
}

/** Forces rollGrade's single Math.random() draw (and every other random call in the same tick) to a
 * fixed value for the duration of `fn`, then restores the real Math.random no matter what. */
function withFixedRandom(value, fn) {
  const original = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

function newEngineWithPlayer() {
  const engine = new MerandiEngine();
  engine.ensurePlayer('p1', 'P1');
  return engine;
}

function drawOnce(engine, randomValue) {
  return withFixedRandom(randomValue, () => {
    engine.setInput('p1', { commands: [{ type: 'draw' }] });
    engine.step(STEP_MS);
    return engine.snapshot();
  });
}

// Cumulative GRADES probability boundaries, used to pick a Math.random() value that lands in a known
// grade bucket deterministically (see rollGrade in data.ts).
function cumulativeBoundary(gradeIndex) {
  let acc = 0;
  for (let i = 0; i <= gradeIndex; i++) acc += GRADES[i].prob;
  return acc;
}
const NORMAL_RANDOM = 0.1; // well inside grade 0 (노멀)
const LEGENDARY_RANDOM = (cumulativeBoundary(CELEBRATION_MIN_GRADE - 1) + cumulativeBoundary(CELEBRATION_MIN_GRADE)) / 2; // middle of grade 5 (레전더리)'s bucket

// 1. A sub-threshold draw (노멀) never creates a celebration.
{
  const engine = newEngineWithPlayer();
  const world = drawOnce(engine, NORMAL_RANDOM);
  const placedGrade = world.zones[0].slots.find((s) => s?.members.length)?.members[0]?.grade;
  check('노멀 뽑기는 축하 연출을 만들지 않는다', world.celebrations.length === 0, `grade=${placedGrade}`);
}

// 2. A 레전더리 draw creates exactly one celebration, tagged with the right zone/grade/archetype.
{
  const engine = newEngineWithPlayer();
  const world = drawOnce(engine, LEGENDARY_RANDOM);
  const c = world.celebrations[0];
  check('레전더리 뽑기는 축하 연출을 만든다', world.celebrations.length === 1);
  check('축하 연출의 등급이 실제로 뽑힌 등급과 일치한다', !!c && c.grade === CELEBRATION_MIN_GRADE, `grade=${c?.grade}`);
  check('축하 연출이 뽑은 플레이어의 zone에 붙는다', !!c && c.zoneLabel === 'P1', `zoneLabel=${c?.zoneLabel}`);
  // snapshot() is taken after this tick's step(), which already ran stepCelebrations once — so life
  // is one STEP_MS shy of maxLife here, not equal to it.
  check('축하 연출의 life가 생성 직후 maxLife에 거의 붙어있다', !!c && c.maxLife > 0 && c.life > c.maxLife - STEP_MS - 1e-6 && c.life <= c.maxLife, `life=${c?.life} maxLife=${c?.maxLife}`);
}

// 3. The celebration counts down and clears itself once its life runs out — same pattern as Shot.
{
  const engine = newEngineWithPlayer();
  let world = drawOnce(engine, LEGENDARY_RANDOM);
  const maxLife = world.celebrations[0].maxLife;
  let stillThereMidway = false;
  let ms = 0;
  while (ms < maxLife * 3 && world.celebrations.length > 0) {
    engine.step(STEP_MS);
    ms += STEP_MS;
    world = engine.snapshot();
    if (ms > maxLife * 0.4 && ms < maxLife * 0.6) stillThereMidway = world.celebrations.length === 1;
  }
  check('축하 연출은 절반쯤 지났을 때도 아직 남아있다', stillThereMidway);
  check('축하 연출은 maxLife가 지나면 스스로 사라진다', world.celebrations.length === 0, `after ${ms.toFixed(0)}ms`);
}

// 4. Round-trips through the wire encoding (quick-atom stream) without losing the celebration —
// it must survive being flattened to atoms and reassembled, same as any other quick-stream field.
{
  const engine = newEngineWithPlayer();
  const world = drawOnce(engine, LEGENDARY_RANDOM);
  const original = world.celebrations[0];

  const chunks = encodeHeavyChunks(world, 1);
  const packet = buildOutgoingPacket(world, chunks[0]);
  const assembler = new SnapshotAssembler();
  const decoded = assembler.ingest(packet);
  const c = decoded?.celebrations[0];

  check('와이어로 축하 연출이 통째로 전달된다', decoded?.celebrations.length === 1);
  check('와이어를 거쳐도 등급/계열/zone이 그대로다', !!c && c.grade === original.grade && c.arche === original.arche && c.zoneLabel === original.zoneLabel);
  check('와이어를 거쳐도 life가 (반올림 오차 내에서) 그대로다', !!c && Math.abs(c.life - original.life) <= 1, `life=${c?.life} vs ${original.life}`);
}

console.log(failures === 0 ? '\n전부 통과' : `\n실패 ${failures}건`);
process.exit(failures === 0 ? 0 : 1);
