/**
 * Headless checks for the worm artillery game, run against the compiled
 * renderer output (`npm test` builds first). Phase 1 covers terrain only:
 * generation must be reproducible from a seed and craters must stay inside
 * the world, because every later system reads from this one.
 */
import {
  BEDROCK_Y,
  COLUMN_COUNT,
  COLUMN_W,
  CRATER_RADIUS,
  MAX_CLIMB,
  HEAL_AMOUNT,
  ITEM_MAX,
  ITEM_PICKUP_RADIUS,
  MAX_SHELLS,
  ROCK_DEPTH,
  SHIELD_FRAMES,
  SKY_MARGIN,
  TERRAIN_FLOOR_Y,
  WORLD_WIDTH
} from '../dist/renderer/games/worm/arena.js';
import { carveCrater, createRng, generateTerrain, surfaceY } from '../dist/renderer/games/worm/terrain.js';
import { WormEngine } from '../dist/renderer/games/worm/engine.js';
import { wormModule } from '../dist/renderer/games/worm/module.js';
import { WEAPONS } from '../dist/renderer/games/worm/weapons.js';
import { ITEM_ORDER, rollItemKind } from '../dist/renderer/games/worm/items.js';
import { decodeCraters, decodeShells } from '../dist/renderer/games/worm/types.js';
import {
  BLAST_RADIUS,
  CHARGE_FRAMES,
  MAX_HP,
  MUZZLE_GRACE,
  SAFE_FALL,
  WIN_KILLS,
  WORM_HEIGHT
} from '../dist/renderer/games/worm/arena.js';

let failures = 0;

function check(name, cond, extra = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failures += 1;
  console.log(`${mark}  ${name}${extra ? ` — ${extra}` : ''}`);
}

/** Steepest height difference between neighbouring columns. */
function steepestStep(terrain) {
  let worst = 0;
  for (let i = 1; i < COLUMN_COUNT; i++) {
    worst = Math.max(worst, Math.abs(terrain.heights[i] - terrain.heights[i - 1]));
  }
  return worst;
}

// 1. The seed is the whole map: two clients must grow byte-identical terrain.
{
  const a = generateTerrain(12345);
  const b = generateTerrain(12345);
  const identical = a.heights.every((h, i) => h === b.heights[i]);
  check('같은 시드는 같은 지형을 만든다', identical);

  const other = generateTerrain(999);
  const differs = other.heights.some((h, i) => h !== a.heights[i]);
  check('다른 시드는 다른 지형을 만든다', differs);
}

// 2. The RNG itself must be deterministic, since everything above rests on it.
{
  const a = createRng(42);
  const b = createRng(42);
  const seq = [a(), a(), a(), a(), a()];
  const seq2 = [b(), b(), b(), b(), b()];
  check('같은 시드의 난수열이 일치한다', seq.every((v, i) => v === seq2[i]), seq.map((v) => v.toFixed(4)).join(' '));
  check('난수는 0 이상 1 미만', seq.every((v) => v >= 0 && v < 1));
}

// 3. Terrain always leaves sky above and rock below.
{
  let worstHigh = Infinity;
  let worstLow = -Infinity;
  for (let seed = 1; seed <= 200; seed++) {
    const t = generateTerrain(seed * 7919);
    for (const y of t.heights) {
      worstHigh = Math.min(worstHigh, y);
      worstLow = Math.max(worstLow, y);
    }
  }
  check('지형이 하늘 여백을 침범하지 않는다', worstHigh >= SKY_MARGIN, `최고점 y=${worstHigh.toFixed(1)}`);
  check('지형이 밴드 아래로 생성되지 않는다', worstLow <= TERRAIN_FLOOR_Y, `최저점 y=${worstLow.toFixed(1)}`);
  check(
    '가장 낮은 골짜기 밑에도 굴착할 암석이 남는다',
    BEDROCK_Y - worstLow >= ROCK_DEPTH,
    `두께 ${(BEDROCK_Y - worstLow).toFixed(0)}px`
  );
}

// 4. "지형지물좀 있고" — a map with no cliffs is just a hill, so check they exist.
{
  let mapsWithCliffs = 0;
  for (let seed = 1; seed <= 100; seed++) {
    if (steepestStep(generateTerrain(seed * 104729)) > MAX_CLIMB) mapsWithCliffs += 1;
  }
  check('생성된 지형에 오를 수 없는 절벽이 있다', mapsWithCliffs === 100, `${mapsWithCliffs}/100`);
}

// 5. surfaceY interpolates instead of snapping to columns.
{
  const t = generateTerrain(2024);
  const left = t.heights[10];
  const right = t.heights[11];
  const mid = surfaceY(t, 10 * COLUMN_W + COLUMN_W / 2);
  check('컬럼 사이를 보간한다', Math.abs(mid - (left + right) / 2) < 1e-9, `mid=${mid.toFixed(3)}`);
  check('컬럼 위치는 그 컬럼 값 그대로', Math.abs(surfaceY(t, 10 * COLUMN_W) - left) < 1e-9);
  check('월드 밖 좌표도 안전하게 처리된다', Number.isFinite(surfaceY(t, -50)) && Number.isFinite(surfaceY(t, WORLD_WIDTH + 50)));
}

// 6. A crater lowers the ground under it.
{
  const before = generateTerrain(555);
  const x = WORLD_WIDTH / 2;
  const y = surfaceY(before, x);
  const after = carveCrater(before, x, y, CRATER_RADIUS);
  check('크레이터가 지표면을 내린다', surfaceY(after, x) > surfaceY(before, x), `${surfaceY(before, x).toFixed(1)} -> ${surfaceY(after, x).toFixed(1)}`);
  check('내려간 깊이가 반경을 넘지 않는다', surfaceY(after, x) - surfaceY(before, x) <= CRATER_RADIUS + 0.01);
}

// 7. Carving is immutable — the host keeps replaying its crater log over snapshots.
{
  const before = generateTerrain(777);
  const snapshot = Float64Array.from(before.heights);
  carveCrater(before, 400, surfaceY(before, 400), CRATER_RADIUS);
  check('크레이터는 원본을 변형하지 않는다', before.heights.every((h, i) => h === snapshot[i]));
}

// 8. Columns outside the blast are untouched.
{
  const before = generateTerrain(888);
  const x = 600;
  const after = carveCrater(before, x, surfaceY(before, x), CRATER_RADIUS);
  const farColumn = Math.floor((x + CRATER_RADIUS + 4 * COLUMN_W) / COLUMN_W);
  check('반경 밖 컬럼은 그대로다', after.heights[farColumn] === before.heights[farColumn]);
}

// 9. Bedrock survives a direct pounding.
{
  let t = generateTerrain(1234);
  const x = 700;
  for (let i = 0; i < 60; i++) t = carveCrater(t, x, surfaceY(t, x), CRATER_RADIUS);
  check('반복 폭격에도 암반은 남는다', surfaceY(t, x) <= BEDROCK_Y + 1e-9, `y=${surfaceY(t, x).toFixed(1)}`);
}

// 9b. A blast buried in a cliff face must not take the clifftop with it.
{
  const before = generateTerrain(12345);
  let wall = -1;
  for (let i = 1; i < before.heights.length - 1; i++) {
    if (before.heights[i] - before.heights[i + 1] > 40) { wall = i + 1; break; }
  }
  check('테스트용 높은 절벽을 찾았다 (지형)', wall > 0, `column=${wall}`);

  // Detonate partway down the face — far below that column's own surface.
  const cliffTop = before.heights[wall];
  const faceY = cliffTop + 60;
  const after = carveCrater(before, wall * COLUMN_W, faceY, CRATER_RADIUS);
  const lost = after.heights[wall] - cliffTop;
  check(
    '절벽 옆면을 때려도 위쪽 땅이 통째로 사라지지 않는다',
    lost <= CRATER_RADIUS * 2 + 0.01,
    `${lost.toFixed(1)}px 깎임 (제한 ${CRATER_RADIUS * 2})`
  );
  check('그래도 절벽이 조금은 깎인다', lost > 0, `${lost.toFixed(1)}px`);
}

// 10. An airburst well above the ground doesn't scoop anything out.
{
  const before = generateTerrain(4321);
  const x = 800;
  const after = carveCrater(before, x, surfaceY(before, x) - CRATER_RADIUS * 3, CRATER_RADIUS);
  check('공중 폭발은 지형을 깎지 않는다', after.heights.every((h, i) => h === before.heights[i]));
}


/* ---------------------------------------------------------------- 전투 */

const HOLD = { left: false, right: false, aimUp: false, aimDown: false, jump: false, fire: true };
const IDLE = { left: false, right: false, aimUp: false, aimDown: false, jump: false, fire: false };
const RIGHT = { left: false, right: true, aimUp: false, aimDown: false, jump: false, fire: false };
const JUMP = { left: false, right: false, aimUp: false, aimDown: false, jump: true, fire: false };
const JUMP_RIGHT = { left: false, right: true, aimUp: false, aimDown: false, jump: true, fire: false };

/** Drops a live shell right on top of a worm, past the muzzle grace window. */
function shellOn(engine, worm, ownerId) {
  engine.shells.push({
    ownerId,
    x: worm.x,
    y: worm.y - WORM_HEIGHT / 2,
    vx: 0,
    vy: 1,
    age: MUZZLE_GRACE + 1,
    weapon: 'basic',
    hasSplit: false
  });
}

function ready(seed, ids) {
  const engine = new WormEngine(seed);
  for (const id of ids) engine.ensureWorm(id, id.toUpperCase());
  return engine;
}

/**
 * Spawn points are deliberately random on the host, so any test that cares
 * where a worm stands has to place it itself rather than inherit a spawn.
 */
function place(engine, id, x) {
  const worm = engine.worms.get(id);
  worm.x = x;
  worm.y = surfaceY(engine.terrain, x);
  worm.vy = 0;
  worm.airborne = false;
  return worm;
}

/**
 * The flattest stretch on the map. A firing test needs one: the lowest point is
 * the bottom of a valley, where a lobbed shot hits the wall beside it instead
 * of ever reaching its arc.
 */
function flatGround(engine) {
  let bestX = 0;
  let bestScore = Infinity;
  for (let i = 10; i < engine.terrain.heights.length - 10; i++) {
    let roughness = 0;
    for (let k = -8; k <= 8; k++) roughness += Math.abs(engine.terrain.heights[i + k] - engine.terrain.heights[i]);
    if (roughness < bestScore) {
      bestScore = roughness;
      bestX = i * COLUMN_W;
    }
  }
  return bestX;
}

/** The lowest ground on the map — the most open sky to fire a test shot into. */
function openGround(engine) {
  let bestX = 0;
  let lowest = -Infinity;
  for (let i = 0; i < engine.terrain.heights.length; i++) {
    if (engine.terrain.heights[i] > lowest) {
      lowest = engine.terrain.heights[i];
      bestX = i * COLUMN_W;
    }
  }
  return bestX;
}

// 11. The gauge fills and then waits. Only letting go fires.
{
  const e = ready(101, ['a']);
  const a = place(e, 'a', flatGround(e));
  e.setInput('a', HOLD);
  for (let i = 0; i < CHARGE_FRAMES; i++) e.step();
  check('충전 중에는 발사되지 않는다', e.shells.length === 0);
  check('게이지가 꽉 찼다', a.charge === CHARGE_FRAMES, `charge=${a.charge}`);

  // Keep holding well past full — it must still sit there.
  for (let i = 0; i < 120; i++) e.step();
  check('꽉 차도 안 떼면 안 나간다', e.shells.length === 0 && a.charge === CHARGE_FRAMES);

  e.setInput('a', IDLE);
  e.step();
  check('떼는 순간 나간다', e.shells.length === 1);
  check('발사 후 재장전이 걸린다', a.reload > 0, `reload=${a.reload}`);
}

// 12. Releasing early fires a weaker shot than holding to full.
{
  const weak = ready(101, ['a']);
  place(weak, 'a', flatGround(weak));
  weak.setInput('a', HOLD);
  for (let i = 0; i < 20; i++) weak.step();
  weak.setInput('a', IDLE);
  weak.step();
  const weakSpeed = Math.hypot(weak.shells[0].vx, weak.shells[0].vy);

  const strong = ready(101, ['a']);
  place(strong, 'a', flatGround(strong));
  strong.setInput('a', HOLD);
  for (let i = 0; i < CHARGE_FRAMES; i++) strong.step();
  strong.setInput('a', IDLE);
  strong.step();
  const strongSpeed = Math.hypot(strong.shells[0].vx, strong.shells[0].vy);

  check('빨리 떼면 약하게 나간다', weakSpeed < strongSpeed, `${weakSpeed.toFixed(2)} < ${strongSpeed.toFixed(2)}`);
}

// 13. The muzzle grace is what stops a shot detonating on the worm that fired it.
{
  const e = ready(202, ['a']);
  const a = place(e, 'a', openGround(e));
  e.shells.push({ ownerId: 'a', x: a.x, y: a.y - WORM_HEIGHT / 2, vx: 0, vy: 0, age: 0, weapon: 'basic', hasSplit: false });
  e.step();
  check('발사 직후에는 자기 포탄에 안 터진다', e.shells.length === 1 && a.hp === MAX_HP, `hp=${a.hp}`);

  e.shells[0].age = MUZZLE_GRACE + 1;
  e.step();
  check('유예가 끝나면 자기 포탄에도 맞는다', e.shells.length === 0 && a.hp < MAX_HP, `hp=${a.hp.toFixed(1)}`);
}

// 14. A hit digs the ground and logs a crater for members to replay.
{
  const e = ready(303, ['a']);
  const a = place(e, 'a', openGround(e));
  const before = surfaceY(e.terrain, a.x);
  shellOn(e, a, 'ghost');
  e.step();
  check('명중하면 지형이 파인다', surfaceY(e.terrain, a.x) > before, `${before.toFixed(1)} -> ${surfaceY(e.terrain, a.x).toFixed(1)}`);
  check('크레이터가 로그에 남는다', e.craters.length === 1 && e.craterSeq === 1);
}

// 15. Damage falls off with distance from the blast.
{
  const e = ready(404, ['near', 'far']);
  const near = e.worms.get('near');
  const far = e.worms.get('far');
  near.x = 700;
  near.y = surfaceY(e.terrain, near.x);
  far.x = near.x + BLAST_RADIUS - 6;
  far.y = surfaceY(e.terrain, far.x);

  shellOn(e, near, 'ghost');
  e.step();
  const nearDamage = MAX_HP - near.hp;
  const farDamage = MAX_HP - far.hp;
  check('폭심이 가장자리보다 아프다', nearDamage > farDamage, `${nearDamage.toFixed(1)} vs ${farDamage.toFixed(1)}`);
  check('가장자리도 피해는 들어간다', farDamage > 0, `${farDamage.toFixed(1)}`);
}

// 16. Out of HP, out of the fight — then back, whole.
{
  const e = ready(505, ['a', 'b']);
  const a = place(e, 'a', openGround(e));
  place(e, 'b', 60);
  a.hp = 5;
  shellOn(e, a, 'b');
  e.step();
  check('HP가 다하면 격추된다', !a.alive && a.hp === 0);
  check('격추 포즈로 바뀐다', a.pose === 'down', `pose=${a.pose}`);

  a.respawnAt = Date.now() - 1;
  e.step();
  check('부활하면 HP가 가득 찬다', a.alive && a.hp === MAX_HP);
}

// 17. Blowing yourself up is its own punishment; nobody collects.
{
  const e = ready(606, ['a', 'b']);
  const a = e.worms.get('a');
  const b = e.worms.get('b');
  b.x = 40;
  b.y = surfaceY(e.terrain, b.x);
  a.x = 1200;
  a.y = surfaceY(e.terrain, a.x);
  a.hp = 5;
  shellOn(e, a, 'a');
  e.step();
  check('자폭해도 죽는다', !a.alive);
  check('자폭은 아무에게도 킬을 주지 않는다', b.kills === 0 && a.kills === 0);
}

// 18. Falling hurts, and it is nobody's kill either.
{
  const e = ready(707, ['a']);
  const a = place(e, 'a', openGround(e));
  a.y = surfaceY(e.terrain, a.x) - (SAFE_FALL + 110);
  for (let i = 0; i < 240; i++) e.step();
  check('높은 데서 떨어지면 다친다', a.hp < MAX_HP, `hp=${a.hp.toFixed(1)}`);
  check('떨어진 뒤에는 땅에 붙는다', Math.abs(a.y - surfaceY(e.terrain, a.x)) < 0.6);
}

// 19. A short drop is free.
{
  const e = ready(707, ['a']);
  const a = place(e, 'a', openGround(e));
  a.y = surfaceY(e.terrain, a.x) - (SAFE_FALL - 12);
  for (let i = 0; i < 240; i++) e.step();
  check('짧게 떨어지면 안 다친다', a.hp === MAX_HP, `hp=${a.hp}`);
}

// 20. A cliff is a wall — that is the whole reason MAX_CLIMB exists.
{
  const e = ready(12345, ['a']);
  const a = e.worms.get('a');
  let wall = -1;
  for (let i = 1; i < e.terrain.heights.length - 1; i++) {
    // A step up to the right that is far too tall to walk.
    if (e.terrain.heights[i] - e.terrain.heights[i + 1] > 20) { wall = i; break; }
  }
  check('테스트용 절벽을 찾았다', wall > 0, `column=${wall}`);
  a.x = wall * 4 - 1;
  a.y = surfaceY(e.terrain, a.x);
  const startX = a.x;
  e.setInput('a', RIGHT);
  for (let i = 0; i < 120; i++) e.step();
  check('절벽은 걸어서 못 오른다', a.x - startX < 4, `${startX.toFixed(1)} -> ${a.x.toFixed(1)}`);
}

// 21. The hop clears a lip but never a cliff — that boundary is the design.
{
  const e = ready(12345, ['a']);
  const a = place(e, 'a', openGround(e));
  const groundY = a.y;
  let peak = groundY;
  e.setInput('a', JUMP);
  for (let i = 0; i < 60; i++) {
    e.step();
    peak = Math.min(peak, a.y);
  }
  const height = groundY - peak;
  check('Shift로 뛴다', height > 8, `${height.toFixed(1)}px`);
  check('뛰는 높이가 절벽보다 낮다', height < 22, `${height.toFixed(1)}px`);
  check('제자리 점프는 낙하 피해가 없다', a.hp === MAX_HP, `hp=${a.hp}`);
  check('한 번 눌러 한 번만 뛴다', !a.airborne && Math.abs(a.y - surfaceY(e.terrain, a.x)) < 0.6, `airborne=${a.airborne}`);
}

// 22. A jump must not turn a wall into a ramp, or blasting a path loses its point.
{
  const e = ready(12345, ['a']);
  let wall = -1;
  for (let i = 1; i < e.terrain.heights.length - 1; i++) {
    if (e.terrain.heights[i] - e.terrain.heights[i + 1] > 26) { wall = i; break; }
  }
  check('테스트용 높은 절벽을 찾았다', wall > 0, `column=${wall}`);
  const a = place(e, 'a', wall * COLUMN_W - 1);
  const startX = a.x;
  e.setInput('a', JUMP_RIGHT);
  for (let i = 0; i < 600; i++) e.step();
  check('점프해도 절벽은 못 넘는다', a.x - startX < 6, `${startX.toFixed(1)} -> ${a.x.toFixed(1)}`);
}

// 23. Jumping off a ledge still costs you the drop.
{
  const e = ready(707, ['a']);
  const a = place(e, 'a', openGround(e));
  a.y = surfaceY(e.terrain, a.x) - (SAFE_FALL + 120);
  a.airborne = false;
  e.setInput('a', JUMP);
  for (let i = 0; i < 240; i++) e.step();
  check('높은 데서 뛰어내리면 여전히 다친다', a.hp < MAX_HP, `hp=${a.hp.toFixed(1)}`);
}

// 23b. "바닥이 금방 드러난다" — the same spot has to swallow a real barrage first.
{
  const e = ready(2468, ['a']);
  const x = openGround(e);
  let shots = 0;
  while (surfaceY(e.terrain, x) < BEDROCK_Y - 0.5 && shots < 200) {
    e.shells.push({ ownerId: 'ghost', x, y: surfaceY(e.terrain, x), vx: 0, vy: 2, age: MUZZLE_GRACE + 1, weapon: 'basic', hasSplit: false });
    e.step();
    shots += 1;
  }
  check('가장 낮은 지점도 암반까지 여러 발이 필요하다', shots >= 9, `${shots}발`);
}

/* ------------------------------------------------------- 아이템과 무기 */

/** Drops a pickup right where a worm stands and lets the next tick collect it. */
function giveItem(engine, worm, kind) {
  engine.items.push({ kind, x: worm.x, y: worm.y });
  engine.step();
}

// 24. Picking a weapon up loads it; firing it dry hands the default back.
{
  const e = ready(1111, ['a']);
  const a = place(e, 'a', flatGround(e));
  giveItem(e, a, 'rocket');
  check('무기를 주우면 장착된다', a.weapon === 'rocket', `weapon=${a.weapon}`);
  check('탄약이 함께 들어온다', a.rounds === WEAPONS.rocket.rounds, `${a.rounds}발`);

  const seen = [];
  for (let shot = 0; shot < WEAPONS.rocket.rounds; shot++) {
    seen.push(a.rounds);
    e.setInput('a', HOLD);
    for (let i = 0; i < WEAPONS.rocket.chargeFrames; i++) e.step();
    e.setInput('a', IDLE);
    e.step();
    for (let i = 0; i < WEAPONS.rocket.reloadFrames + 2; i++) e.step();
  }
  check('쏠 때마다 탄약이 줄어든다', seen.join(',') === '3,2,1', seen.join(','));
  check('다 쓰면 기본 무기로 돌아온다', a.weapon === 'basic' && a.rounds === 0, `weapon=${a.weapon}`);
}

// 25. A shotgun is several shells from one press; a rocket is one.
{
  const e = ready(2222, ['a']);
  const a = place(e, 'a', flatGround(e));
  giveItem(e, a, 'shotgun');
  e.setInput('a', HOLD);
  for (let i = 0; i < WEAPONS.shotgun.chargeFrames; i++) e.step();
  e.setInput('a', IDLE);
  e.step();
  check('산탄은 한 번에 여러 발이 나간다', e.shells.length === WEAPONS.shotgun.shots, `${e.shells.length}발`);
  const angles = e.shells.map((sh) => Math.atan2(sh.vy, sh.vx));
  check('산탄이 부채꼴로 퍼진다', Math.max(...angles) - Math.min(...angles) > 0.1);
}

// 26. A cluster opens once, at the top of its arc, and its payload doesn't re-split.
{
  const e = ready(3333, ['a']);
  const a = place(e, 'a', flatGround(e));
  giveItem(e, a, 'cluster');
  e.setInput('a', HOLD);
  for (let i = 0; i < WEAPONS.cluster.chargeFrames; i++) e.step();
  e.setInput('a', IDLE);
  e.step();
  check('클러스터는 한 발로 나간다', e.shells.length === 1);

  let peak = 0;
  for (let i = 0; i < 400 && e.shells.length > 0; i++) {
    e.step();
    peak = Math.max(peak, e.shells.length);
  }
  check('정점에서 분열한다', peak >= WEAPONS.cluster.splitInto, `최대 ${peak}발`);
  check('파편은 다시 분열하지 않는다', peak <= WEAPONS.cluster.splitInto + 1, `최대 ${peak}발`);
}

// 27. Heal tops you up without overfilling.
{
  const e = ready(4444, ['a']);
  const a = place(e, 'a', openGround(e));
  a.hp = 30;
  giveItem(e, a, 'heal');
  check('회복 아이템이 HP를 올린다', a.hp === 30 + HEAL_AMOUNT, `hp=${a.hp}`);

  a.hp = MAX_HP - 5;
  giveItem(e, a, 'heal');
  check('최대치를 넘지 않는다', a.hp === MAX_HP, `hp=${a.hp}`);
}

// 28. The shield is total, and it runs out.
{
  const e = ready(5555, ['a']);
  const a = place(e, 'a', openGround(e));
  giveItem(e, a, 'shield');
  check('쉴드가 10초로 걸린다', a.shieldFrames > SHIELD_FRAMES - 5, `${a.shieldFrames}프레임`);

  shellOn(e, a, 'ghost');
  e.step();
  check('쉴드 중에는 피해가 0이다', a.hp === MAX_HP, `hp=${a.hp}`);

  a.shieldFrames = 0;
  shellOn(e, a, 'ghost');
  e.step();
  check('쉴드가 끝나면 다시 아프다', a.hp < MAX_HP, `hp=${a.hp.toFixed(1)}`);
}

// 29. "포탄으로 맞추면 사라지도록" — a blast has to deny the pickup.
{
  const e = ready(6666, ['a']);
  const a = place(e, 'a', 200);
  const spot = 900;
  e.items.push({ kind: 'rocket', x: spot, y: surfaceY(e.terrain, spot) });
  check('아이템이 맵에 있다', e.items.length === 1);

  e.shells.push({
    ownerId: 'ghost',
    x: spot,
    y: surfaceY(e.terrain, spot) - 2,
    vx: 0,
    vy: 2,
    age: MUZZLE_GRACE + 1,
    weapon: 'basic',
    hasSplit: false
  });
  e.step();
  check('폭발이 아이템을 없앤다', e.items.length === 0);
  void a;
}

// 30. Spawning stays rare and capped, however long a match runs.
{
  const e = ready(7777, ['a']);
  place(e, 'a', openGround(e));
  let peak = 0;
  // Ten minutes of match time.
  for (let i = 0; i < 60 * 60 * 10; i++) {
    e.step();
    peak = Math.max(peak, e.items.length);
    // Nobody walks over them, so they only ever accumulate.
    if (e.items.length > ITEM_MAX) break;
  }
  check('동시에 뜨는 아이템 수가 상한을 넘지 않는다', peak <= ITEM_MAX, `최대 ${peak}개`);
  check('10분이면 상한까지는 찬다', peak === ITEM_MAX, `최대 ${peak}개`);
}

// 31. The weight table has to reach every kind, and only those.
{
  const counts = new Map(ITEM_ORDER.map((k) => [k, 0]));
  let seed = 99;
  const rng = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = 0; i < 4000; i++) counts.set(rollItemKind(rng), counts.get(rollItemKind(rng)) ?? 0);
  const fresh = new Map(ITEM_ORDER.map((k) => [k, 0]));
  for (let i = 0; i < 4000; i++) {
    const kind = rollItemKind(rng);
    fresh.set(kind, fresh.get(kind) + 1);
  }
  check('모든 종류가 등장한다', ITEM_ORDER.every((k) => fresh.get(k) > 0), [...fresh].map(([k, v]) => `${k}:${v}`).join(' '));
  check('쉴드가 제일 드물다', ITEM_ORDER.every((k) => k === 'shield' || fresh.get(k) > fresh.get('shield')));
  void counts;
}

// 32. The shell cap is what keeps a six-way shotgun volley from blowing the packet.
{
  const ids = Array.from({ length: 6 }, (_, i) => `p${i}`);
  const e = ready(8888, ids);
  for (const id of ids) {
    const worm = e.worms.get(id);
    worm.weapon = 'shotgun';
    worm.rounds = 4;
    e.setInput(id, HOLD);
  }
  for (let i = 0; i < 600; i++) e.step();
  check('동시 비행 포탄이 상한을 넘지 않는다', e.shells.length <= MAX_SHELLS, `${e.shells.length}발`);
}

/* ------------------------------------------------------- 호스트 ↔ 멤버 */

// 24. The whole terrain sync rests on this: a member growing the map from the
//     seed and replaying crater events must land on the host's exact heightmap.
{
  const host = new WormEngine(31337);
  host.ensureWorm('h', 'H');
  const spots = [300, 720, 1100, 305];

  for (const x of spots) {
    host.shells.push({ ownerId: 'ghost', x, y: surfaceY(host.terrain, x) - 2, vx: 0, vy: 2, age: MUZZLE_GRACE + 1, weapon: 'basic', hasSplit: false });
    host.step();
  }

  const snapshot = host.snapshot();
  // A member starts from the seed alone and replays whatever the window carries.
  let mirrored = generateTerrain(snapshot.seed);
  for (const crater of decodeCraters(snapshot.craters)) {
    mirrored = carveCrater(mirrored, crater.x, crater.y, crater.r);
  }

  const identical = mirrored.heights.every((h, i) => h === host.terrain.heights[i]);
  check('멤버 지형이 호스트와 정확히 일치한다', identical, `크레이터 ${snapshot.craters.length}개 재생`);
  check('시드가 스냅샷에 실려 간다', snapshot.seed === 31337);
  check('스냅샷에 크레이터가 담겼다', decodeCraters(snapshot.craters).length === 4);
}

// 25. The crater window is the packet-loss insurance — it has to re-send, not just announce once.
{
  const host = new WormEngine(4242);
  host.ensureWorm('h', 'H');
  const first = [];
  for (let n = 0; n < 3; n++) {
    const x = 400 + n * 90;
    host.shells.push({ ownerId: 'ghost', x, y: surfaceY(host.terrain, x) - 2, vx: 0, vy: 2, age: MUZZLE_GRACE + 1, weapon: 'basic', hasSplit: false });
    host.step();
    first.push(host.snapshot().craters.length);
  }
  const latest = decodeCraters(host.snapshot().craters);
  check('오래된 크레이터가 다음 스냅샷에도 계속 실린다', latest.length === 3 && latest[0].seq === 1, `seq=${latest.map((c) => c.seq).join(',')}`);

  // A member that missed the first two snapshots still catches up from the latest one alone.
  let late = generateTerrain(4242);
  for (const crater of latest) late = carveCrater(late, crater.x, crater.y, crater.r);
  check('두 패킷을 놓친 멤버도 최신 하나로 따라잡는다', late.heights.every((h, i) => h === host.terrain.heights[i]));
}

// 26. A member match must speak the member half of the protocol, not the host half.
{
  const member = wormModule.createMatch(false, 'me', 'Me');
  member.step({ left: false, right: true, aimUp: false, aimDown: false, jump: false, fire: true });
  const outgoing = member.buildOutgoingPacket();
  check('멤버는 월드가 아니라 자기 입력만 보낸다', outgoing.input !== undefined && outgoing.worms === undefined, JSON.stringify(outgoing).slice(0, 60));
  check('멤버 패킷에 from 키가 없다', outgoing.from === undefined);

  const host = new WormEngine(5150);
  host.ensureWorm('other', 'Other');
  member.applyOpponentPacket(host.snapshot());
  check('호스트 스냅샷을 받아도 터지지 않는다', true);
  check('멤버는 스스로 경기를 끝내지 않는다', member.isOver() === false);
}

// 27. The host half: a tagged member packet spawns that member, mid-match and all.
{
  const host = wormModule.createMatch(true, 'h', 'Host');
  const before = host.buildOutgoingPacket().worms.length;
  host.applyOpponentPacket({
    from: 'late',
    name: 'Late',
    input: { left: false, right: false, aimUp: false, aimDown: false, jump: false, fire: false }
  });
  const after = host.buildOutgoingPacket().worms.length;
  check('중도 합류한 멤버가 그 자리에서 생성된다', after === before + 1, `${before} -> ${after}`);

  host.removePeer('late');
  check('나간 멤버는 월드에서 사라진다', host.buildOutgoingPacket().worms.length === before);
}

// 28. The packet budget the design rests on, measured rather than assumed.
{
  const ids = Array.from({ length: 6 }, () => crypto.randomUUID());
  const e = ready(909, ids);
  for (const id of ids) {
    const worm = e.worms.get(id);
    worm.name = 'MacBook-Pro-of-Someone';
    worm.weapon = 'cluster';
    worm.rounds = 3;
    worm.shieldFrames = SHIELD_FRAMES;
  }
  for (let i = 0; i < ITEM_MAX; i++) e.items.push({ kind: 'shield', x: 400 + i * 90, y: 300 });
  // 1472 is the largest UDP payload that still fits one 1500-byte Ethernet
  // frame; past it every snapshot fragments, and Wi-Fi loses fragments.
  const MTU_PAYLOAD = 1472;
  for (let i = 0; i < MAX_SHELLS; i++) {
    const worm = e.worms.get(ids[i % ids.length]);
    e.shells.push({ ownerId: worm.id, x: worm.x + i, y: worm.y - 40, vx: 3, vy: -2, age: 10, weapon: 'shotgun', hasSplit: false });
    if (i < 8) e.craters.push({ seq: i + 1, x: 700 + i * 13, y: 300, r: 22 });
  }
  const snap = e.snapshot();
  const bytes = Buffer.byteLength(JSON.stringify(snap));
  check('평면 배열이 제대로 복원된다', decodeShells(snap.shells).length === snap.shells.length / 4);
  check('크레이터도 복원된다', decodeCraters(snap.craters).length === snap.craters.length / 4);
  check('6인 최악 스냅샷이 MTU 안에 들어간다', bytes < MTU_PAYLOAD, `${bytes} / ${MTU_PAYLOAD} bytes`);
}

console.log(failures === 0 ? '\n전부 통과' : `\n${failures}개 실패`);
process.exit(failures === 0 ? 0 : 1);
