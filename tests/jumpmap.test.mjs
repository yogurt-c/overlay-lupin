/**
 * Headless checks for the jump-map racer, run against the compiled renderer
 * output (`npm test` builds first). Same style as cell.test.mjs/worm.test.mjs.
 */
import { JumpmapEngine } from '../dist/renderer/games/jumpmap/engine.js';
import { jumpmapModule } from '../dist/renderer/games/jumpmap/module.js';
import {
  ATTACK_RANGE_X,
  GRAVITY,
  PLATFORMS,
  RESPAWN_WORLD_MARGIN,
  WORLD_HEIGHT,
  START_X,
  START_Y,
  WORLD_WIDTH,
  movingPlatformX
} from '../dist/renderer/games/jumpmap/field.js';

const NO_INPUT = { left: false, right: false, jump: false, down: false, attack: false };
let failures = 0;

function check(name, cond, extra = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failures += 1;
  console.log(`${mark}  ${name}${extra ? ` — ${extra}` : ''}`);
}

// 1. A runner is lazily created on first sight, standing on the start platform.
{
  const e = new JumpmapEngine();
  e.ensurePlayer('a', 'A');
  const p = e.players.get('a');
  check(
    '처음 참가하면 시작 발판 위에 놓인다',
    p.x === START_X && p.y === START_Y && p.standingOn === 'start',
    `x=${p.x} y=${p.y} standingOn=${p.standingOn}`
  );
}

// 2. Holding right increases x over time.
{
  const e = new JumpmapEngine();
  e.ensurePlayer('a', 'A');
  e.setInput('a', { ...NO_INPUT, right: true });
  const before = e.players.get('a').x;
  for (let i = 0; i < 10; i++) e.step();
  const after = e.players.get('a').x;
  check('오른쪽 입력을 주면 x가 증가한다', after > before, `${before} -> ${after}`);
}

// 3. Jumping lifts a runner into the air, and they come back down on their own.
{
  const e = new JumpmapEngine();
  e.ensurePlayer('a', 'A');
  const p = e.players.get('a');
  e.setInput('a', { ...NO_INPUT, jump: true });
  e.step();
  const airborneAfterJump = p.airborne;
  const yAfterJump = p.y;
  e.setInput('a', NO_INPUT);
  for (let i = 0; i < 200 && e.players.get('a').airborne; i++) e.step();
  check(
    '점프하면 공중에 뜬다',
    airborneAfterJump === true && yAfterJump < START_Y,
    `airborne=${airborneAfterJump} y=${yAfterJump}`
  );
  check('충분한 시간이 지나면 다시 발판에 내려선다', p.airborne === false, `airborne=${p.airborne}`);
}

// 4. Airborne presses cannot jump, and holding through landing cannot auto-jump.
{
  const e = new JumpmapEngine();
  e.ensurePlayer('a', 'A');
  const p = e.players.get('a');
  e.setInput('a', { ...NO_INPUT, jump: true });
  e.step(); // ground jump
  e.setInput('a', NO_INPUT);
  e.step(); // let the rising edge reset
  e.setInput('a', { ...NO_INPUT, jump: true });
  const risingVelocity = p.vy;
  e.step();
  check('상승 중 다시 눌러도 더블점프하지 않는다', Math.abs(p.vy - risingVelocity - GRAVITY) < 1e-9);
  e.setInput('a', NO_INPUT);
  while (p.vy < 0) e.step();
  const fallingVelocity = p.vy;
  e.setInput('a', { ...NO_INPUT, jump: true });
  e.step();
  check('낙하 중 다시 눌러도 공중점프하지 않는다', Math.abs(p.vy - fallingVelocity - GRAVITY) < 1e-9);
  for (let i = 0; i < 200 && e.players.get('a').airborne; i++) e.step();
  e.step();
  check('공중에서 누른 점프를 유지해도 착지 후 자동으로 뛰지 않는다', !p.airborne);
  e.setInput('a', NO_INPUT); e.step();
  e.setInput('a', { ...NO_INPUT, jump: true }); e.step();
  check('착지 후 새로 누르면 다시 점프할 수 있다', p.airborne && p.vy < 0);
}

// 5. Falling onto a platform lands the runner.
{
  const e = new JumpmapEngine();
  e.ensurePlayer('a', 'A');
  const plat = PLATFORMS.find((pl) => pl.id === 'p2');
  const p = e.players.get('a');
  Object.assign(p, { x: plat.x + plat.w / 2, y: plat.y - 30, vy: 0, airborne: true, standingOn: null });
  for (let i = 0; i < 40; i++) e.step();
  check(
    '낙하하다 발판에 닿으면 그 발판에 착지한다',
    p.standingOn === 'p2' && !p.airborne,
    `standingOn=${p.standingOn}`
  );
}

// 6. A trampoline launches much harder than a normal jump.
{
  const e = new JumpmapEngine();
  e.ensurePlayer('a', 'A');
  const plat = PLATFORMS.find((pl) => pl.id === 'trampoline1');
  const p = e.players.get('a');
  Object.assign(p, { x: plat.x + plat.w / 2, y: plat.y - 20, vy: 0, airborne: true, standingOn: null });
  let minVy = 0;
  for (let i = 0; i < 30; i++) {
    e.step();
    minVy = Math.min(minVy, p.vy);
  }
  check('트램폴린을 밟으면 크게 튕겨오른다', minVy < -10, `minVy=${minVy.toFixed(2)}`);
}

// 7. Touching the goal records a finish order and opens the grace window.
{
  const e = new JumpmapEngine();
  e.ensurePlayer('a', 'A');
  const goal = PLATFORMS.find((pl) => pl.id === 'goal');
  const p = e.players.get('a');
  Object.assign(p, { x: goal.x + goal.w / 2, y: goal.y - 20, vy: 0, airborne: true, standingOn: null });
  for (let i = 0; i < 20; i++) e.step();
  check('깃발에 닿으면 도착 순서가 기록된다', p.finish === 1, `finish=${p.finish}`);
}

// 8. With someone still on the course, grace waits for them or the clock — not a fixed 90s cap.
{
  const e = new JumpmapEngine();
  e.ensurePlayer('a', 'A');
  e.ensurePlayer('b', 'B');
  const goal = PLATFORMS.find((pl) => pl.id === 'goal');
  const a = e.players.get('a');
  Object.assign(a, { x: goal.x + goal.w / 2, y: goal.y - 20, vy: 0, airborne: true, standingOn: null });
  for (let i = 0; i < 20; i++) e.step();
  check('한 명만 도착하면 그레이스 타임 동안 방은 계속 진행된다', e.phase === 'grace', `phase=${e.phase}`);
  e.timerMs = 1; // fast-forward instead of waiting out the real 15s in a test
  e.step();
  check('그레이스 타임이 끝나면 정산 단계로 넘어간다', e.phase === 'intermission', `phase=${e.phase}`);
}

// 8b. If the one runner still racing leaves mid-grace, the remaining room is all finishers — grace ends on its own.
{
  const e = new JumpmapEngine();
  e.ensurePlayer('a', 'A');
  e.ensurePlayer('b', 'B');
  const goal = PLATFORMS.find((pl) => pl.id === 'goal');
  const a = e.players.get('a');
  Object.assign(a, { x: goal.x + goal.w / 2, y: goal.y - 20, vy: 0, airborne: true, standingOn: null });
  for (let i = 0; i < 20; i++) e.step();
  check('사전 조건: 그레이스 타임 진입', e.phase === 'grace', `phase=${e.phase}`);
  e.removePlayer('b'); // the only runner not yet finished disconnects
  e.step();
  check('아직 도착 못한 사람이 나가면 남은 전원 도착으로 그레이스가 끝난다', e.phase === 'intermission', `phase=${e.phase}`);
}

// 9. Once intermission runs out, the room resets for the next round rather than closing.
{
  const e = new JumpmapEngine();
  e.ensurePlayer('a', 'A');
  const p = e.players.get('a');
  p.finish = 1;
  p.x = 30;
  p.y = 500;
  e.phase = 'intermission';
  e.timerMs = 1;
  e.step();
  check('정산 시간이 끝나면 다음 판이 시작된다', e.phase === 'race' && p.finish === undefined, `phase=${e.phase} finish=${p.finish}`);
  check('다음 판은 다시 시작 지점에서 출발한다', p.x === START_X && p.y === START_Y, `x=${p.x} y=${p.y}`);
}

// 10. The attack key shoves anyone within range away, and stuns them briefly.
{
  const e = new JumpmapEngine();
  e.ensurePlayer('a', 'A');
  e.ensurePlayer('b', 'B');
  const a = e.players.get('a');
  const b = e.players.get('b');
  Object.assign(a, { x: 100, y: 500, standingOn: null, airborne: true });
  Object.assign(b, { x: 100 + ATTACK_RANGE_X - 4, y: 500, standingOn: null, airborne: true });
  e.setInput('a', { ...NO_INPUT, attack: true });
  e.step();
  check('공격키를 누르면 사거리 안의 상대가 밀려난다', b.knockVX > 0, `knockVX=${b.knockVX}`);
  check('밀려난 상대는 잠시 스턴 상태가 된다', b.stunTicks > 0, `stunTicks=${b.stunTicks}`);
}

// An unopposed hit should travel about one medium platform width in either direction.
for (const direction of [-1, 1]) {
  const e = new JumpmapEngine();
  e.ensurePlayer('attacker', 'A');
  e.ensurePlayer('target', 'B');
  const attacker = e.players.get('attacker');
  const target = e.players.get('target');
  Object.assign(attacker, { x: 480, y: 500, facing: direction, airborne: true, standingOn: null });
  const initialX = 480 + direction * 20;
  Object.assign(target, { x: initialX, y: 500, airborne: true, standingOn: null });
  e.setInput('attacker', { ...NO_INPUT, attack: true });
  let highestY = target.y;
  for (let tick = 0; tick < 60; tick++) {
    e.step();
    highestY = Math.min(highestY, target.y);
  }
  const distance = (target.x - initialX) * direction;
  check(`공격 시 ${direction < 0 ? '왼쪽' : '오른쪽'}으로 약 90만큼 날아간다`,
    distance > 85 && distance < 95, `distance=${distance.toFixed(1)}`);
  check('피격 시 위로 떠올랐다가 스턴이 풀린다', highestY < 490 && target.stunTicks === 0);
}

// 10b. A swing only lands on someone roughly in front — not on a runner standing behind you.
{
  const e = new JumpmapEngine();
  e.ensurePlayer('a', 'A');
  e.ensurePlayer('b', 'B');
  const a = e.players.get('a');
  const b = e.players.get('b');
  Object.assign(a, { x: 500, y: 500, facing: 1, standingOn: null, airborne: true });
  Object.assign(b, { x: 500 - (ATTACK_RANGE_X - 4), y: 500, standingOn: null, airborne: true }); // behind, to the left
  e.setInput('a', { ...NO_INPUT, attack: true });
  e.step();
  check('오른쪽을 보고 있으면 등 뒤의 상대는 맞지 않는다', b.knockVX === 0 && b.stunTicks === 0, `knockVX=${b.knockVX}`);
}

// 10c. A swing connects with only the one nearest target, even with several runners bunched up in range.
{
  const e = new JumpmapEngine();
  e.ensurePlayer('a', 'A');
  e.ensurePlayer('near', 'Near');
  e.ensurePlayer('far', 'Far');
  const a = e.players.get('a');
  const near = e.players.get('near');
  const far = e.players.get('far');
  Object.assign(a, { x: 500, y: 500, facing: 1 });
  Object.assign(near, { x: 512, y: 500 });
  Object.assign(far, { x: 524, y: 500 });
  e.setInput('a', { ...NO_INPUT, attack: true });
  e.step();
  check('여러 명이 뭉쳐 있어도 가장 가까운 한 명만 밀려난다', near.knockVX > 0 && far.knockVX === 0, `near=${near.knockVX} far=${far.knockVX}`);
}

// 10d. Someone already stunned from one shove can still be hit by a second attacker.
{
  const e = new JumpmapEngine();
  e.ensurePlayer('a', 'A');
  e.ensurePlayer('b', 'B');
  e.ensurePlayer('victim', 'V');
  const a = e.players.get('a');
  const b = e.players.get('b');
  const victim = e.players.get('victim');
  Object.assign(a, { x: 480, y: 500, facing: 1 });
  Object.assign(victim, { x: 495, y: 500 });
  e.setInput('a', { ...NO_INPUT, attack: true });
  e.step();
  const stunTicksAfterFirstHit = victim.stunTicks;
  // Pin the victim back down before the second swing — the first hit's own knockback drift
  // already nudged them this same tick, and that drift isn't what this check is about.
  Object.assign(victim, { x: 495, knockVX: 0 });
  Object.assign(b, { x: 500, y: 500, facing: -1 }); // facing the already-stunned victim from the other side
  e.setInput('a', NO_INPUT);
  e.setInput('b', { ...NO_INPUT, attack: true });
  e.step();
  check(
    '이미 스턴된 상대도 다른 공격에 다시 맞을 수 있다',
    stunTicksAfterFirstHit > 0 && victim.knockVX < 0,
    `firstStun=${stunTicksAfterFirstHit} knockVX=${victim.knockVX}`
  );
}

// 11. That shove has a cooldown — pressing again right away does nothing.
{
  const e = new JumpmapEngine();
  e.ensurePlayer('a', 'A');
  e.ensurePlayer('b', 'B');
  const a = e.players.get('a');
  const b = e.players.get('b');
  Object.assign(a, { x: 100, y: 500 });
  Object.assign(b, { x: 110, y: 500 });
  e.setInput('a', { ...NO_INPUT, attack: true });
  e.step();
  e.setInput('a', NO_INPUT);
  e.step(); // let the rising edge reset
  b.knockVX = 0;
  b.stunTicks = 0;
  e.setInput('a', { ...NO_INPUT, attack: true }); // still on cooldown
  e.step();
  check('공격은 쿨다운 중에는 다시 발동하지 않는다', b.knockVX === 0 && b.stunTicks === 0, `knockVX=${b.knockVX}`);
}

// 12. Long falls continue naturally; only leaving the whole course restarts the climb.
{
  const e = new JumpmapEngine();
  e.ensurePlayer('a', 'A');
  const p = e.players.get('a');
  const upper = PLATFORMS.find(pl => pl.id === 'sky-rest');
  Object.assign(p, { x: upper.x + upper.w / 2, y: upper.y - 1, vy: 1, airborne: true, standingOn: null });
  e.step();
  check('높은 발판에 먼저 착지한다', p.standingOn === upper.id);
  Object.assign(p, { x: 20, airborne: true, standingOn: null });
  for (let i = 0; i < 45; i++) e.step();
  check('발판 아래로 멀리 떨어져도 되돌아가지 않고 계속 낙하한다',
    p.y > upper.y + 170 && p.airborne && p.standingOn === null && p.x === 20);

  const lower = PLATFORMS.find(pl => pl.id === 'p2');
  Object.assign(p, { x: lower.x + lower.w / 2, y: lower.y - 5, vy: 10 });
  e.step();
  check('긴 낙하 도중 아래쪽 발판에 착지할 수 있다', p.standingOn === lower.id && p.y === lower.y);

  Object.assign(p, { x: 20, y: WORLD_HEIGHT + RESPAWN_WORLD_MARGIN - 15,
    airborne: true, standingOn: null, vy: 5 });
  e.step();
  check('맵 아래 경계를 넘기 전에는 낙하를 계속한다', p.x === 20 && p.airborne);
  Object.assign(p, { y: WORLD_HEIGHT + RESPAWN_WORLD_MARGIN + 1,
    knockVX: 3, stunTicks: 8, atkAnim: 5 });
  e.step();
  check('맵 아래로 떨어지면 이전 발판이 아닌 시작점에서 다시 시작한다',
    p.x === START_X && p.y === START_Y && p.standingOn === 'start');
  check('시작점 복귀 시 낙하·피격·착지 효과를 초기화한다',
    !p.airborne && p.vy === 0 && p.knockVX === 0 && p.stunTicks === 0 &&
    p.atkAnim === 0 && p.impact === undefined);
  e.setInput('a', { ...NO_INPUT, jump: true });
  e.step();
  check('시작점에서 다시 점프할 수 있다', p.airborne && p.vy < 0);
}

// 13. Removing a runner drops them from the snapshot entirely.
{
  const e = new JumpmapEngine();
  e.ensurePlayer('a', 'A');
  e.removePlayer('a');
  check('제거한 플레이어는 스냅샷에서 사라진다', e.snapshot().players.length === 0);
}

// 14. A moving platform's position is a pure function of the tick — the whole point being that a member can
// reproduce it locally instead of the host having to broadcast every platform's coordinates.
{
  const spec = PLATFORMS.find((pl) => pl.kind === 'moving');
  const x1 = movingPlatformX(spec, 100);
  const x2 = movingPlatformX(spec, 100);
  check('같은 tick이면 움직이는 발판 위치도 항상 같다', x1 === x2, `x1=${x1} x2=${x2}`);
}

// 15. The course is laid out bottom to top — no platform sits below the one before it in the list.
{
  let ordered = true;
  for (let i = 1; i < PLATFORMS.length; i++) {
    if (PLATFORMS[i].y > PLATFORMS[i - 1].y) ordered = false;
  }
  check('발판은 아래에서 위로 순서대로 배치돼 있다', ordered);
}

// 16. The module declares itself as a free-join room, not a duel — matching cell/tower's shape.
{
  check(
    'room 매칭이고 최대 6인이다',
    jumpmapModule.matching === 'room' && jumpmapModule.roomCapacity === 6,
    `matching=${jumpmapModule.matching} capacity=${jumpmapModule.roomCapacity}`
  );
}

// 17. The room itself never reports itself over — only a round resets, per resetRound().
{
  const match = jumpmapModule.createMatch(true, 'a', 'A');
  check('라운드가 반복돼도 방 자체는 끝나지 않는다', match.isOver() === false);
}

// Every intended hop is tested against the actual engine, including collisions with
// other platforms. Try several departure phases and takeoff positions: a moving
// platform may require waiting, but no branch should require impossible movement.
{
  const route = PLATFORMS.filter(p => !p.id.endsWith('-short'));
  const edges = route.slice(1).map((p, i) => [route[i], p]);
  const shortcuts = [
    ['desk-plaza', 'desk-short', 'desk-merge'],
    ['work-rest', 'work-short', 'work-merge'],
    ['sky-rest', 'sky-short', 'sky-merge']
  ];
  for (const ids of shortcuts) {
    const [from, shortcut, to] = ids.map(id => PLATFORMS.find(p => p.id === id));
    edges.push([from, shortcut], [shortcut, to]);
  }
  const unreachable = [];
  for (const [from, to] of edges) {
    let success = false;
    for (const phase of [0, 40, 80, 120, 160, 200, 240]) {
      for (const takeoff of [0.5, 0.15, 0.85]) {
        const e = new JumpmapEngine();
        for (let i = 0; i < phase; i++) e.step();
        e.ensurePlayer('a', 'A');
        const p = e.players.get('a');
        const x = movingPlatformX(from, phase) + from.w * takeoff;
        Object.assign(p, {
          x, y: from.y, standingOn: from.id
        });
        if (from.kind === 'trampoline') {
          Object.assign(p, { y: from.y - 1, vy: 1, airborne: true, standingOn: null });
        }
        for (let t = 0; t < 150; t++) {
          const target = movingPlatformX(to, phase + t + 1) + to.w / 2;
          e.setInput('a', {
            ...NO_INPUT, left: p.x > target + 2, right: p.x < target - 2,
            jump: t === 0 && from.kind !== 'trampoline'
          });
          e.step();
          if (p.impact?.platformId === to.id) {
            success = true;
            break;
          }
          if (t > 4 && !p.airborne) break;
        }
        if (success) break;
      }
      if (success) break;
    }
    if (!success) unreachable.push(`${from.id} → ${to.id}`);
  }
  check('우회로·지름길을 포함한 모든 연결 구간을 실제 점프로 통과할 수 있다', unreachable.length === 0,
    unreachable.length ? unreachable.join(', ') : `${edges.length}개 연결`);
  check('움직이는 발판도 이동 범위 전체가 월드 안에 있다', PLATFORMS.every(p =>
    p.x - (p.amplitude ?? 0) >= 0 && p.x + p.w + (p.amplitude ?? 0) <= WORLD_WIDTH));
}

// Landing effects must reach guests, expire, and clear on round reset.
{
  const e = new JumpmapEngine();
  e.ensurePlayer('a', 'A');
  const p = e.players.get('a');
  const platform = PLATFORMS.find(p => p.id === 'p2');
  Object.assign(p, { x: platform.x + platform.w / 2, y: platform.y - 1, vy: 1, airborne: true, standingOn: null });
  e.step();
  const snapshot = JSON.parse(JSON.stringify(e.snapshot()));
  check('착지 이벤트가 게스트에 전송할 스냅샷에 담긴다',
    snapshot.players[0].impact?.platformId === 'p2' && snapshot.players[0].impact?.tick === snapshot.tick);
  for (let i = 0; i < 45; i++) e.step();
  check('지난 착지 효과는 스냅샷에서 사라진다', e.snapshot().players[0].impact === undefined);
  Object.assign(p, { y: platform.y - 1, vy: 1, airborne: true, standingOn: null });
  e.step();
  e.phase = 'intermission'; e.timerMs = 1; e.step();
  check('다음 라운드에는 이전 착지 효과가 남지 않는다', p.impact === undefined);
}

console.log(`\n${failures === 0 ? '모든 테스트 통과' : `${failures}개 실패`}`);
process.exit(failures === 0 ? 0 : 1);
