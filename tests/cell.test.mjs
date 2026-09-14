/**
 * Headless checks for the cell-growing engine, run against the compiled
 * renderer output (`npm test` builds first). Same style as simulation.test.mjs.
 */
import { CellEngine } from '../dist/renderer/games/cell/engine.js';
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  START_MASS,
  RESPAWN_MS,
  BIG_FOOD_MASS,
  TARGET_POPULATION,
  SPLIT_MIN_MASS,
  MAX_CELLS_PER_PLAYER,
  MERGE_COOLDOWN_MS,
  VIRUS_POP_MASS,
  radiusFor
} from '../dist/renderer/games/cell/arena.js';

const NO_INPUT = { up: false, down: false, left: false, right: false, split: false };
let failures = 0;

function check(name, cond, extra = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failures += 1;
  console.log(`${mark}  ${name}${extra ? ` — ${extra}` : ''}`);
}

/** Every test manipulates a player's sole starting blob directly — a small helper avoids repeating `.cells[0]`. */
function soleCell(engine, id) {
  return engine.players.get(id).cells[0];
}

// 1. A player is lazily created on first sight, at the starting mass, as a single cell.
{
  const e = new CellEngine();
  e.ensurePlayer('a', '민지');
  const snap = e.snapshot();
  const a = snap.players.find((p) => p.id === 'a');
  check('처음 보는 플레이어는 시작 질량의 세포 하나로 생성된다', a?.cells.length === 1 && a.cells[0].mass === START_MASS, `cells=${JSON.stringify(a?.cells)}`);
}

// 2. Moving right increases x over time.
{
  const e = new CellEngine();
  e.ensurePlayer('a', '민지');
  // Start at center: a random spawn near the right wall gets clamped and never moves right.
  Object.assign(soleCell(e, 'a'), { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 });
  e.setInput('a', { ...NO_INPUT, right: true });
  const before = e.snapshot().players[0].cells[0].x;
  for (let i = 0; i < 30; i++) e.step();
  const after = e.snapshot().players[0].cells[0].x;
  check('오른쪽 입력을 주면 x가 증가한다', after > before, `${before} -> ${after}`);
}

// 3. A much bigger cell eats a much smaller one on contact.
{
  const e = new CellEngine();
  e.viruses.length = 0; // a big cell landing on a virus by pure spawn luck would immediately pop and break the mass assertion below
  e.ensurePlayer('big', '큰세포');
  e.ensurePlayer('small', '작은세포');
  const big = soleCell(e, 'big');
  const small = soleCell(e, 'small');
  big.mass = 200;
  small.mass = START_MASS;
  small.x = big.x;
  small.y = big.y;
  e.step();
  const snap = e.snapshot();
  const s = snap.players.find((p) => p.id === 'small');
  const b = snap.players.find((p) => p.id === 'big');
  check('충분히 큰 세포는 접촉한 작은 세포를 먹는다', s.alive === false, `alive=${s.alive}`);
  check('먹으면 질량을 흡수한다', b.cells[0].mass >= 200 + START_MASS - 1, `mass=${b.cells[0].mass}`);
}

// 4. A cell within EAT_RATIO of another's mass does not eat it.
{
  const e = new CellEngine();
  e.ensurePlayer('a', 'A');
  e.ensurePlayer('b', 'B');
  const a = soleCell(e, 'a');
  const b = soleCell(e, 'b');
  a.mass = START_MASS + 1;
  b.mass = START_MASS;
  b.x = a.x;
  b.y = a.y;
  e.step();
  const snap = e.snapshot();
  check('비슷한 크기끼리는 먹지 않는다', snap.players.every((p) => p.alive), JSON.stringify(snap.players.map((p) => p.alive)));
}

// 5. An eaten player respawns at the starting mass, as a single cell, after the delay.
{
  const e = new CellEngine();
  e.ensurePlayer('big', '큰세포');
  e.ensurePlayer('small', '작은세포');
  const big = soleCell(e, 'big');
  const small = soleCell(e, 'small');
  big.mass = 200;
  small.x = big.x;
  small.y = big.y;
  e.step();
  e.players.get('small').respawnAt = Date.now() - 1; // force the delay to have already elapsed
  e.food.length = 0; // a random respawn spot can land on a pellet and eat it in the same tick
  e.step();
  const snap = e.snapshot();
  const s = snap.players.find((p) => p.id === 'small');
  check(
    '리스폰 시간이 지나면 세포 하나로 다시 살아난다',
    s.alive === true && s.cells.length === 1 && s.cells[0].mass === START_MASS,
    `alive=${s.alive} cells=${JSON.stringify(s.cells)}`
  );
}

// 6. Removing a player drops them from the snapshot entirely.
{
  const e = new CellEngine();
  e.ensurePlayer('a', 'A');
  e.removePlayer('a');
  check('제거한 플레이어는 스냅샷에서 사라진다', e.snapshot().players.length === 0);
}

// 7. Radius grows slower than mass (area-based, not linear).
{
  check('질량이 늘어도 반지름은 더 느리게 늘어난다', radiusFor(4 * START_MASS) < 2 * radiusFor(START_MASS));
}

// 8. A bigger cell moves slower than a starting-size one under the same input.
// Both start at arena center, well clear of any edge clamp, so the only
// difference in distance traveled is the mass-based speed cap.
{
  const small = new CellEngine();
  small.ensurePlayer('a', 'A');
  Object.assign(soleCell(small, 'a'), { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 });
  const smallStartX = soleCell(small, 'a').x;
  small.setInput('a', { ...NO_INPUT, right: true });

  const big = new CellEngine();
  big.ensurePlayer('a', 'A');
  Object.assign(soleCell(big, 'a'), { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2, mass: START_MASS * 9 });
  const bigStartX = soleCell(big, 'a').x;
  big.setInput('a', { ...NO_INPUT, right: true });

  for (let i = 0; i < 60; i++) {
    small.step();
    big.step();
  }
  const smallDist = soleCell(small, 'a').x - smallStartX;
  const bigDist = soleCell(big, 'a').x - bigStartX;
  check(
    '질량이 클수록 같은 입력에도 더 느리게 이동한다',
    bigDist < smallDist,
    `small=${smallDist.toFixed(1)} big=${bigDist.toFixed(1)}`
  );
}

// 9. Pressing split divides a big-enough cell in half, adding a second cell to the player.
{
  const e = new CellEngine();
  e.ensurePlayer('a', 'A');
  const a = soleCell(e, 'a');
  a.mass = SPLIT_MIN_MASS;
  Object.assign(a, { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 });
  e.setInput('a', { ...NO_INPUT, right: true, split: true });
  e.step();
  const snap = e.players.get('a');
  check('스페이스바를 누르면 세포가 둘로 나뉜다', snap.cells.length === 2, `cells=${snap.cells.length}`);
  const totalMass = snap.cells.reduce((s, c) => s + c.mass, 0);
  check('분열해도 총 질량은 그대로다', Math.abs(totalMass - SPLIT_MIN_MASS) < 0.01, `total=${totalMass}`);
}

// 10. The split-off half launches forward, ending up farther from the origin than the half left behind.
{
  const e = new CellEngine();
  e.ensurePlayer('a', 'A');
  const a = soleCell(e, 'a');
  a.mass = SPLIT_MIN_MASS * 2;
  Object.assign(a, { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 });
  const originX = a.x;
  e.setInput('a', { ...NO_INPUT, right: true, split: true });
  e.step();
  e.setInput('a', NO_INPUT); // let momentum alone carry the pieces apart for the rest of the tick run
  for (let i = 0; i < 20; i++) e.step();
  const cells = e.players.get('a').cells;
  const farthest = Math.max(...cells.map((c) => c.x - originX));
  check('발사된 조각은 원래 자리보다 앞으로 날아간다', farthest > radiusFor(SPLIT_MIN_MASS), `farthest=${farthest.toFixed(1)}`);
}

// 11. Holding split doesn't keep splitting every tick — only the rising edge fires.
{
  const e = new CellEngine();
  e.ensurePlayer('a', 'A');
  soleCell(e, 'a').mass = SPLIT_MIN_MASS * 4;
  e.setInput('a', { ...NO_INPUT, split: true });
  for (let i = 0; i < 5; i++) e.step();
  check('스페이스바를 계속 누르고 있어도 매 틱 분열하지 않는다', e.players.get('a').cells.length === 2, `cells=${e.players.get('a').cells.length}`);
}

// 12. A cell too small to leave two viable halves doesn't split.
{
  const e = new CellEngine();
  e.ensurePlayer('a', 'A');
  soleCell(e, 'a').mass = SPLIT_MIN_MASS - 1;
  e.setInput('a', { ...NO_INPUT, split: true });
  e.step();
  check('너무 작은 세포는 분열하지 않는다', e.players.get('a').cells.length === 1, `cells=${e.players.get('a').cells.length}`);
}

// 13. Splitting never pushes a player over MAX_CELLS_PER_PLAYER.
{
  const e = new CellEngine();
  e.ensurePlayer('a', 'A');
  soleCell(e, 'a').mass = SPLIT_MIN_MASS * 64;
  const p = e.players.get('a');
  for (let round = 0; round < 6; round++) {
    e.setInput('a', { ...NO_INPUT, split: true });
    e.step();
    e.setInput('a', NO_INPUT);
    e.step(); // let the rising edge reset before the next press
  }
  check('아무리 나눠도 최대 개수를 넘지 않는다', p.cells.length <= MAX_CELLS_PER_PLAYER, `cells=${p.cells.length}`);
}

// 14. Two of a player's own split pieces never eat each other, no matter the size gap.
// Merge cooldown is left running so the merge step doesn't fold them together first —
// this test is isolating the eating rule, not the merge rule (see test 15/16 for that).
{
  const e = new CellEngine();
  e.ensurePlayer('a', 'A');
  const p = e.players.get('a');
  const stillCoolingDown = Date.now() + MERGE_COOLDOWN_MS;
  p.cells = [
    { id: 'x', x: 900, y: 600, vx: 0, vy: 0, mass: 200, mergeAt: stillCoolingDown, launchTicksLeft: 0, hasSeparated: true },
    { id: 'y', x: 900, y: 600, vx: 0, vy: 0, mass: START_MASS, mergeAt: stillCoolingDown, launchTicksLeft: 0, hasSeparated: true }
  ];
  e.step();
  check('자기 세포끼리는 서로 잡아먹지 않는다', e.players.get('a').cells.length === 2, `cells=${e.players.get('a').cells.length}`);
}

// 15. Once the merge cooldown passes, two overlapping sibling cells merge back into one.
{
  const e = new CellEngine();
  e.ensurePlayer('a', 'A');
  e.food.length = 0; // a stray pellet within the merged radius would otherwise make the resulting mass nondeterministic
  const p = e.players.get('a');
  p.cells = [
    { id: 'x', x: 900, y: 600, vx: 0, vy: 0, mass: 20, mergeAt: Date.now() - 1, launchTicksLeft: 0 },
    { id: 'y', x: 901, y: 600, vx: 0, vy: 0, mass: 20, mergeAt: Date.now() - 1, launchTicksLeft: 0 }
  ];
  e.step();
  const cells = e.players.get('a').cells;
  check('쿨다운이 지나고 겹치면 다시 합쳐진다', cells.length === 1 && Math.abs(cells[0].mass - 40) < 0.5, `cells=${JSON.stringify(cells)}`);
}

// 16. Before the merge cooldown expires, siblings that genuinely got away and came back stay separate.
{
  const e = new CellEngine();
  e.ensurePlayer('a', 'A');
  const p = e.players.get('a');
  p.cells = [
    { id: 'x', x: 900, y: 600, vx: 0, vy: 0, mass: 20, mergeAt: Date.now() + MERGE_COOLDOWN_MS, launchTicksLeft: 0, hasSeparated: true },
    { id: 'y', x: 901, y: 600, vx: 0, vy: 0, mass: 20, mergeAt: Date.now() + MERGE_COOLDOWN_MS, launchTicksLeft: 0, hasSeparated: true }
  ];
  e.step();
  check('쿨다운이 끝나기 전엔 실제로 떨어졌다 돌아온 세포는 겹쳐도 합쳐지지 않는다', e.players.get('a').cells.length === 2, `cells=${e.players.get('a').cells.length}`);
}

// 16b. A split pair that never actually got away from its sibling (e.g. launched straight into a wall) merges
// back immediately once its launch window ends, without waiting out the rest of the cooldown.
{
  const e = new CellEngine();
  e.ensurePlayer('a', 'A');
  e.food.length = 0; // a stray pellet within the merged radius would otherwise make the resulting mass nondeterministic
  const p = e.players.get('a');
  p.cells = [
    { id: 'x', x: 900, y: 600, vx: 0, vy: 0, mass: 20, mergeAt: Date.now() + MERGE_COOLDOWN_MS, launchTicksLeft: 0, hasSeparated: false },
    { id: 'y', x: 901, y: 600, vx: 0, vy: 0, mass: 20, mergeAt: Date.now() + MERGE_COOLDOWN_MS, launchTicksLeft: 0, hasSeparated: false }
  ];
  e.step();
  const cells = e.players.get('a').cells;
  check(
    '본체와 떨어지지 못하고 붙어있던 조각은 쿨다운을 기다리지 않고 바로 합쳐진다',
    cells.length === 1 && Math.abs(cells[0].mass - 40) < 0.5,
    `cells=${JSON.stringify(cells)}`
  );
}

// 17. A cell big enough to pop bursts into several pieces on touching a virus.
{
  const e = new CellEngine();
  e.food.length = 0; // a stray pellet at the virus spot would get eaten first and throw off the mass assertion below
  e.ensurePlayer('a', 'A');
  const p = e.players.get('a');
  const virus = e.viruses[0];
  // +1 so a tick's worth of passive decay can't nudge it back under the threshold before the virus check runs.
  const startMass = VIRUS_POP_MASS + 1;
  p.cells = [{ id: 'x', x: virus.x, y: virus.y, vx: 0, vy: 0, mass: startMass, mergeAt: 0, launchTicksLeft: 0 }];
  e.step();
  check('바이러스에 닿으면 큰 세포가 여러 조각으로 터진다', p.cells.length > 1, `cells=${p.cells.length}`);
  const totalMass = p.cells.reduce((s, c) => s + c.mass, 0);
  check('터져도 총 질량은 거의 유지된다', Math.abs(totalMass - startMass) < 1, `total=${totalMass.toFixed(1)}`);
}

// 18. A cell too small to trigger a virus just passes over it untouched.
{
  const e = new CellEngine();
  e.ensurePlayer('a', 'A');
  const p = e.players.get('a');
  const virus = e.viruses[0];
  p.cells = [{ id: 'x', x: virus.x, y: virus.y, vx: 0, vy: 0, mass: START_MASS, mergeAt: 0, launchTicksLeft: 0 }];
  e.step();
  check('작은 세포는 바이러스에 영향받지 않는다', p.cells.length === 1, `cells=${JSON.stringify(p.cells)}`);
}

// 19. A big food pellet eventually spawns and is worth much more than regular food.
{
  const e = new CellEngine();
  e.ensurePlayer('a', 'A');
  e.nextBigFoodAt = Date.now() - 1; // force the spawn timer to have already elapsed
  e.step();
  const hasBig = e.food.some((f) => f.big);
  check('시간이 지나면 큰 먹이가 생성된다', hasBig, `foodCount=${e.food.length}`);
}

// 20. Eating a big food pellet grants BIG_FOOD_MASS.
{
  const e = new CellEngine();
  e.ensurePlayer('a', 'A');
  const a = soleCell(e, 'a');
  e.food.length = 0;
  e.food.push({ x: a.x, y: a.y, big: true });
  const before = a.mass;
  e.step();
  check('큰 먹이를 먹으면 질량이 크게 늘어난다', soleCell(e, 'a').mass >= before + BIG_FOOD_MASS - 0.01, `before=${before} after=${soleCell(e, 'a').mass}`);
}

// 21. Plain step() never spawns a bot on its own — only an explicit syncBotPopulation() call opts in.
{
  const e = new CellEngine();
  e.ensurePlayer('a', 'A');
  for (let i = 0; i < 5; i++) e.step();
  check('syncBotPopulation을 부르지 않으면 봇이 생기지 않는다', e.snapshot().players.length === 1, `count=${e.snapshot().players.length}`);
}

// 22. Alone, syncBotPopulation tops the room up to TARGET_POPULATION.
{
  const e = new CellEngine();
  e.ensurePlayer('a', 'A');
  e.syncBotPopulation();
  const snap = e.snapshot();
  check(
    '혼자면 목표 인원수까지 봇으로 채운다',
    snap.players.length === TARGET_POPULATION,
    `count=${snap.players.length}`
  );
}

// 23. A second real player arriving does NOT yank a live bot out — syncBotPopulation only ever adds.
{
  const e = new CellEngine();
  e.ensurePlayer('a', 'A');
  e.syncBotPopulation();
  const beforeCount = e.players.size;
  e.ensurePlayer('b', 'B');
  e.syncBotPopulation();
  check(
    '사람이 늘어도 살아있는 봇은 즉시 제거되지 않는다',
    e.players.size === beforeCount + 1,
    `before=${beforeCount} after=${e.players.size}`
  );
}

// 24. Once that room-is-full bot dies and its respawn timer elapses, it's culled instead of coming back.
{
  const e = new CellEngine();
  e.ensurePlayer('a', 'A');
  e.syncBotPopulation();
  const bot = Array.from(e.players.values()).find((p) => p.isBot);
  bot.alive = false;
  bot.respawnAt = Date.now() - 1;
  e.ensurePlayer('b', 'B'); // now 2 humans -> bot target drops to 2, one bot is now surplus
  e.step();
  const bots = Array.from(e.players.values()).filter((p) => p.isBot);
  check(
    '리스폰 시점에 인원이 초과 상태면 되살리는 대신 정리한다',
    !e.players.has(bot.id) && bots.length === TARGET_POPULATION - 2,
    `hasBot=${e.players.has(bot.id)} bots=${bots.length}`
  );
}

// 25. A bot actually steers toward food instead of sitting still.
{
  const e = new CellEngine();
  e.ensurePlayer('a', 'A');
  e.syncBotPopulation();
  const bot = Array.from(e.players.values()).find((p) => p.isBot);
  const botCell = bot.cells[0];
  e.food.length = 0;
  e.food.push({ x: botCell.x + 200, y: botCell.y });
  const startX = botCell.x;
  for (let i = 0; i < 30; i++) e.step();
  check('봇은 가장 가까운 먹이 쪽으로 움직인다', botCell.x > startX, `${startX} -> ${botCell.x}`);
}

console.log(failures === 0 ? '전부 통과' : `${failures}개 실패`);
process.exit(failures === 0 ? 0 : 1);
