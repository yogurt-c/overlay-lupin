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
  radiusFor
} from '../dist/renderer/games/cell/arena.js';

const NO_INPUT = { up: false, down: false, left: false, right: false, boost: false };
let failures = 0;

function check(name, cond, extra = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failures += 1;
  console.log(`${mark}  ${name}${extra ? ` — ${extra}` : ''}`);
}

// 1. A player is lazily created on first sight, at the starting mass.
{
  const e = new CellEngine();
  e.ensurePlayer('a', '민지');
  const snap = e.snapshot();
  const a = snap.players.find((p) => p.id === 'a');
  check('처음 보는 플레이어는 시작 질량으로 생성된다', a?.mass === START_MASS, `mass=${a?.mass}`);
}

// 2. Moving right increases x over time.
{
  const e = new CellEngine();
  e.ensurePlayer('a', '민지');
  // Start at center: a random spawn near the right wall gets clamped and never moves right.
  Object.assign(e.players.get('a'), { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 });
  e.setInput('a', { ...NO_INPUT, right: true });
  const before = e.snapshot().players[0].x;
  for (let i = 0; i < 30; i++) e.step();
  const after = e.snapshot().players[0].x;
  check('오른쪽 입력을 주면 x가 증가한다', after > before, `${before} -> ${after}`);
}

// 3. A much bigger cell eats a much smaller one on contact.
{
  const e = new CellEngine();
  e.ensurePlayer('big', '큰세포');
  e.ensurePlayer('small', '작은세포');
  const big = e.players.get('big');
  const small = e.players.get('small');
  big.mass = 200;
  small.mass = START_MASS;
  small.x = big.x;
  small.y = big.y;
  e.step();
  const snap = e.snapshot();
  const s = snap.players.find((p) => p.id === 'small');
  const b = snap.players.find((p) => p.id === 'big');
  check('충분히 큰 세포는 접촉한 작은 세포를 먹는다', s.alive === false, `alive=${s.alive}`);
  check('먹으면 질량을 흡수한다', b.mass >= 200 + START_MASS - 1, `mass=${b.mass}`);
}

// 4. A cell within EAT_RATIO of another's mass does not eat it.
{
  const e = new CellEngine();
  e.ensurePlayer('a', 'A');
  e.ensurePlayer('b', 'B');
  const a = e.players.get('a');
  const b = e.players.get('b');
  a.mass = START_MASS + 1;
  b.mass = START_MASS;
  b.x = a.x;
  b.y = a.y;
  e.step();
  const snap = e.snapshot();
  check('비슷한 크기끼리는 먹지 않는다', snap.players.every((p) => p.alive), JSON.stringify(snap.players.map((p) => p.alive)));
}

// 5. An eaten player respawns at the starting mass after the delay.
{
  const e = new CellEngine();
  e.ensurePlayer('big', '큰세포');
  e.ensurePlayer('small', '작은세포');
  const big = e.players.get('big');
  const small = e.players.get('small');
  big.mass = 200;
  small.x = big.x;
  small.y = big.y;
  e.step();
  small.respawnAt = Date.now() - 1; // force the delay to have already elapsed
  e.food.length = 0; // a random respawn spot can land on a pellet and eat it in the same tick
  e.step();
  const snap = e.snapshot();
  const s = snap.players.find((p) => p.id === 'small');
  check('리스폰 시간이 지나면 다시 살아난다', s.alive === true && s.mass === START_MASS, `alive=${s.alive} mass=${s.mass}`);
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
  Object.assign(small.players.get('a'), { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 });
  const smallStartX = small.players.get('a').x;
  small.setInput('a', { ...NO_INPUT, right: true });

  const big = new CellEngine();
  big.ensurePlayer('a', 'A');
  Object.assign(big.players.get('a'), { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2, mass: START_MASS * 9 });
  const bigStartX = big.players.get('a').x;
  big.setInput('a', { ...NO_INPUT, right: true });

  for (let i = 0; i < 60; i++) {
    small.step();
    big.step();
  }
  const smallDist = small.players.get('a').x - smallStartX;
  const bigDist = big.players.get('a').x - bigStartX;
  check(
    '질량이 클수록 같은 입력에도 더 느리게 이동한다',
    bigDist < smallDist,
    `small=${smallDist.toFixed(1)} big=${bigDist.toFixed(1)}`
  );
}

// 9. Boosting moves a cell farther than the same input without boosting.
{
  const plain = new CellEngine();
  plain.ensurePlayer('a', 'A');
  Object.assign(plain.players.get('a'), { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2, mass: START_MASS * 4 });
  const plainStartX = plain.players.get('a').x;
  plain.setInput('a', { ...NO_INPUT, right: true });

  const boosted = new CellEngine();
  boosted.ensurePlayer('a', 'A');
  Object.assign(boosted.players.get('a'), { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2, mass: START_MASS * 4 });
  const boostedStartX = boosted.players.get('a').x;
  boosted.setInput('a', { ...NO_INPUT, right: true, boost: true });

  for (let i = 0; i < 30; i++) {
    plain.step();
    boosted.step();
  }
  const plainDist = plain.players.get('a').x - plainStartX;
  const boostedDist = boosted.players.get('a').x - boostedStartX;
  check('부스트를 쓰면 같은 입력에도 더 멀리 이동한다', boostedDist > plainDist, `plain=${plainDist.toFixed(1)} boosted=${boostedDist.toFixed(1)}`);
}

// 10. Boosting drains mass over time, on top of a floor at START_MASS.
{
  const e = new CellEngine();
  e.ensurePlayer('a', 'A');
  const a = e.players.get('a');
  a.mass = START_MASS * 4;
  e.setInput('a', { ...NO_INPUT, boost: true });
  for (let i = 0; i < 60; i++) e.step();
  check('부스트를 쓰면 질량이 줄어든다', a.mass < START_MASS * 4, `mass=${a.mass.toFixed(2)}`);
}

// 11. Boosting never drains mass below the starting mass.
{
  const e = new CellEngine();
  e.ensurePlayer('a', 'A');
  const a = e.players.get('a');
  a.mass = START_MASS;
  e.setInput('a', { ...NO_INPUT, boost: true });
  for (let i = 0; i < 120; i++) e.step();
  check('부스트로도 시작 질량 밑으로는 줄어들지 않는다', a.mass >= START_MASS, `mass=${a.mass.toFixed(2)}`);
}

// 12. A big food pellet eventually spawns and is worth much more than regular food.
{
  const e = new CellEngine();
  e.ensurePlayer('a', 'A');
  e.nextBigFoodAt = Date.now() - 1; // force the spawn timer to have already elapsed
  e.step();
  const hasBig = e.food.some((f) => f.big);
  check('시간이 지나면 큰 먹이가 생성된다', hasBig, `foodCount=${e.food.length}`);
}

// 13. Eating a big food pellet grants BIG_FOOD_MASS.
{
  const e = new CellEngine();
  e.ensurePlayer('a', 'A');
  const a = e.players.get('a');
  e.food.length = 0;
  e.food.push({ x: a.x, y: a.y, big: true });
  const before = a.mass;
  e.step();
  check('큰 먹이를 먹으면 질량이 크게 늘어난다', a.mass >= before + BIG_FOOD_MASS - 0.01, `before=${before} after=${a.mass}`);
}

// 14. Plain step() never spawns a bot on its own — only an explicit syncBotPopulation() call opts in.
{
  const e = new CellEngine();
  e.ensurePlayer('a', 'A');
  for (let i = 0; i < 5; i++) e.step();
  check('syncBotPopulation을 부르지 않으면 봇이 생기지 않는다', e.snapshot().players.length === 1, `count=${e.snapshot().players.length}`);
}

// 15. Alone, syncBotPopulation tops the room up to TARGET_POPULATION.
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

// 16. A second real player arriving does NOT yank a live bot out — syncBotPopulation only ever adds.
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

// 17. Once that room-is-full bot dies and its respawn timer elapses, it's culled instead of coming back.
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

// 18. A bot actually steers toward food instead of sitting still.
{
  const e = new CellEngine();
  e.ensurePlayer('a', 'A');
  e.syncBotPopulation();
  const bot = Array.from(e.players.values()).find((p) => p.isBot);
  e.food.length = 0;
  e.food.push({ x: bot.x + 200, y: bot.y });
  const startX = bot.x;
  for (let i = 0; i < 30; i++) e.step();
  check('봇은 가장 가까운 먹이 쪽으로 움직인다', bot.x > startX, `${startX} -> ${bot.x}`);
}

console.log(failures === 0 ? '전부 통과' : `${failures}개 실패`);
process.exit(failures === 0 ? 0 : 1);
