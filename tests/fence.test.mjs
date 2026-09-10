/**
 * Headless checks for the fencing engine, run against the compiled renderer
 * output (`npm test` builds first). Same style as cell.test.mjs.
 *
 * The interesting property under test is that a cut is judged by the fencer
 * who takes it, so these tests drive one engine and feed it packets that
 * describe what the opponent is doing.
 */
import { FenceEngine } from '../dist/renderer/games/fence/engine.js';
import {
  ACTIVE,
  DOJO_X,
  GUARD_DROP_FRAMES,
  HIT_STUN_FRAMES,
  LIVES,
  RECOVER,
  STAGGER_FRAMES,
  WINDUP
} from '../dist/renderer/games/fence/field.js';

const NO_INPUT = { left: false, right: false, jump: false, down: false, action: false, guard: false };
let failures = 0;

function check(name, cond, extra = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failures += 1;
  console.log(`${mark}  ${name}${extra ? ` — ${extra}` : ''}`);
}

/**
 * Plants the opponent at `x` holding `pose`. Both the interpolated position
 * and the packet target have to be set: the engine lerps the opponent toward
 * their last packet every tick, so setting only one of the two would let them
 * drift back to their starting mark mid-test.
 */
function place(e, x, facing, pose) {
  e.applyOpponentPacket({ player: { x, y: 0, facing, pose }, hits: 0, parries: 0 });
  e.remote.x = x;
  e.remote.y = 0;
}

/** A client-side engine already in the 'play' phase, with the opponent `gap` pixels to its left. */
function playing(gap = 34) {
  const e = new FenceEngine();
  e.startMatch(false);
  e.phase = 'play';
  e.phaseTimer = 0;
  e.local.x = DOJO_X + gap / 2;
  place(e, DOJO_X - gap / 2, 1, 'idle');
  return e;
}

/** Feeds one tick where the opponent holds `pose`, standing still. */
function opponentDoes(e, pose, input = NO_INPUT) {
  place(e, e.remote.x, e.remote.facing, pose);
  e.step(input);
}

/* -------------------------------------------------- 1. reach and hit taking */

// 1. A high slash from within reach cuts an unguarded fencer.
{
  const e = playing(34);
  opponentDoes(e, 'slash');
  check('리치 안에서 들어온 베기는 무방비 상태를 맞힌다', e.hits === 1, `hits=${e.hits}`);
}

// 2. The same slash from too far away touches nothing.
{
  const e = playing(120);
  opponentDoes(e, 'slash');
  check('리치 밖에서는 베기가 닿지 않는다', e.hits === 0, `hits=${e.hits}`);
}

// 3. A thrust reaches from a distance a slash cannot.
{
  const slash = playing(52);
  opponentDoes(slash, 'slash');
  const thrust = playing(52);
  opponentDoes(thrust, 'thrust');
  check(
    '찌르기는 베기가 닿지 않는 거리에서도 닿는다',
    slash.hits === 0 && thrust.hits === 1,
    `slash=${slash.hits} thrust=${thrust.hits}`
  );
}

// 4. One swing can only score once, however many ticks it stays live.
{
  const e = playing(34);
  for (let i = 0; i < ACTIVE.slash + 4; i++) opponentDoes(e, 'slash');
  check('한 번의 휘두르기는 한 번만 판정된다', e.hits === 1, `hits=${e.hits}`);
}

// 5. A pose whose blade is not live never cuts, even at point-blank range.
{
  const e = playing(30);
  for (const pose of ['windup', 'after', 'idle', 'guardHigh']) opponentDoes(e, pose);
  check('칼날이 살아있지 않은 자세는 맞히지 못한다', e.hits === 0, `hits=${e.hits}`);
}

/* --------------------------------------------------------- 2. guard matrix */

/** Runs one attack against one guard and reports what happened. */
function exchange(attack, guardLow) {
  const e = playing(attack === 'thrust' ? 52 : 34);
  const input = { ...NO_INPUT, guard: true, down: guardLow };
  // Hold the guard long enough for it to actually cover.
  e.step(input);
  e.step(input);
  opponentDoes(e, attack, input);
  return { hit: e.hits, parry: e.parries };
}

const MATRIX = [
  ['베기', 'slash', false, 'parry'],
  ['베기', 'slash', true, 'hit'],
  ['하단 베기', 'slashLow', false, 'hit'],
  ['하단 베기', 'slashLow', true, 'parry'],
  ['찌르기', 'thrust', false, 'parry'],
  ['찌르기', 'thrust', true, 'parry'],
  ['내려베기', 'plunge', false, 'hit'],
  ['내려베기', 'plunge', true, 'hit']
];

for (const [label, attack, guardLow, expected] of MATRIX) {
  const { hit, parry } = exchange(attack, guardLow);
  const got = parry > 0 ? 'parry' : hit > 0 ? 'hit' : 'none';
  check(`${label} vs ${guardLow ? '하단' : '상단'} 가드 → ${expected === 'parry' ? '막힘' : '명중'}`, got === expected, `got=${got}`);
}

// 6. A guard that has not finished going up does not cover yet.
{
  const e = playing(34);
  opponentDoes(e, 'slash', { ...NO_INPUT, guard: true });
  check('막기는 올라가는 중에는 아직 못 막는다', e.hits === 1 && e.parries === 0, `hits=${e.hits} parries=${e.parries}`);
}

/* ------------------------------------------------------ 3. the punish window */

// 7. Being told your attack was parried locks you out for the stagger window.
{
  const e = playing(34);
  e.applyOpponentPacket({ player: { x: e.remote.x, y: 0, facing: 1, pose: 'guardHigh' }, hits: 0, parries: 1 });
  check('막혔다는 신고를 받으면 경직에 들어간다', e.local.stagger === STAGGER_FRAMES, `stagger=${e.local.stagger}`);

  e.step({ ...NO_INPUT, action: true });
  check('경직 중에는 공격을 시작할 수 없다', e.local.phase === null && e.local.pose === 'stagger', `pose=${e.local.pose}`);
}

// 8. Lowering the guard costs a few frames before the hands are free.
{
  const e = playing(34);
  const guard = { ...NO_INPUT, guard: true };
  e.step(guard);
  e.step(guard);
  e.step({ ...NO_INPUT, action: true });
  check('가드를 내린 직후에는 바로 베지 못한다', e.local.phase === null, `phase=${e.local.phase}`);
  check('가드 해제 경직이 걸려 있다', e.local.guardDrop === GUARD_DROP_FRAMES, `guardDrop=${e.local.guardDrop}`);
}

// 9. A swing runs windup -> active -> recover and only cuts in the middle.
{
  const e = playing(34);
  e.step({ ...NO_INPUT, action: true });
  check('공격은 준비 단계부터 시작한다', e.local.phase === 'windup', `phase=${e.local.phase}`);
  for (let i = 0; i < WINDUP.slash; i++) e.step(NO_INPUT);
  check('준비가 끝나면 칼날이 살아난다', e.local.pose === 'slash', `pose=${e.local.pose}`);
  for (let i = 0; i < ACTIVE.slash; i++) e.step(NO_INPUT);
  check('판정이 끝나면 후딜에 들어간다', e.local.pose === 'after', `pose=${e.local.pose}`);
  for (let i = 0; i < RECOVER.slash; i++) e.step(NO_INPUT);
  check('후딜이 끝나면 자유로워진다', e.local.phase === null, `phase=${e.local.phase}`);
}

/* ---------------------------------------------------------------- 4. 목숨 */

// 10. Lives come off both counters: mine from my own cuts, theirs from what they report.
{
  const e = playing(34);
  e.applyOpponentPacket({ player: { x: e.remote.x, y: 0, facing: 1, pose: 'idle' }, hits: 2, parries: 0 });
  opponentDoes(e, 'slash');
  check(
    '목숨은 양쪽의 피격 카운터에서 유도된다',
    e.myLives === LIVES - 1 && e.theirLives === LIVES - 2,
    `${e.myLives}:${e.theirLives}`
  );
}

// 11. A resent packet with the same counter cannot take a second life.
{
  const e = playing(34);
  const packet = { player: { x: e.remote.x, y: 0, facing: 1, pose: 'idle' }, hits: 1, parries: 0 };
  e.applyOpponentPacket(packet);
  e.applyOpponentPacket(packet);
  check('같은 카운터를 다시 받아도 목숨이 두 번 깎이지 않는다', e.theirLives === LIVES - 1, `theirLives=${e.theirLives}`);
}

// 12. A cut does not stop the fight — the phase stays 'play' until someone runs out.
{
  const e = new FenceEngine();
  e.startMatch(true);
  e.phase = 'play';
  e.phaseTimer = 0;
  e.local.x = DOJO_X - 17;
  place(e, DOJO_X + 17, -1, 'slash');
  e.step(NO_INPUT);
  check('피격이 나도 싸움은 이어진다', e.phase === 'play' && e.hits === 1, `phase=${e.phase} hits=${e.hits}`);

  e.hits = LIVES;
  e.step(NO_INPUT);
  check('목숨이 다 떨어지면 경기가 끝난다', e.phase === 'over' && e.myLives === 0, `phase=${e.phase}`);
}

// 13. Reeling from a cut makes you untouchable, so one flurry can only cost one life.
{
  const e = playing(30);
  for (let i = 0; i < 3; i++) {
    opponentDoes(e, 'slash');
    opponentDoes(e, 'idle');
  }
  check('경직 중에는 다시 베이지 않는다', e.hits === 1, `hits=${e.hits}`);
  check('경직이 걸려 있다', e.local.hitLock > 0 && e.local.pose === 'hit', `pose=${e.local.pose}`);
}

// 14. A cut throws the victim away from the attacker, which is what re-opens the distance.
{
  const e = playing(30);
  const before = e.local.x;
  opponentDoes(e, 'slash');
  for (let i = 0; i < 10; i++) opponentDoes(e, 'idle');
  check('피격당하면 뒤로 밀려난다', e.local.x > before + 2, `${before.toFixed(1)} -> ${e.local.x.toFixed(1)}`);
}

// 15. Both fencers cut inside the same banner window reads as a double touch.
{
  const e = playing(34);
  opponentDoes(e, 'slash');
  e.applyOpponentPacket({ player: { x: e.remote.x, y: 0, facing: 1, pose: 'idle' }, hits: 1, parries: 0 });
  check('상호타로 읽힌다', e.flash === 'both', `flash=${e.flash}`);
}

// 16. The banner message clears on its own instead of waiting for a round break.
{
  const e = playing(34);
  opponentDoes(e, 'slash');
  check('피격 문구가 뜬다', e.flash === 'take', `flash=${e.flash}`);
  for (let i = 0; i < HIT_STUN_FRAMES + 60; i++) opponentDoes(e, 'idle');
  check('문구는 알아서 사라진다', e.flash === 'none', `flash=${e.flash}`);
}

/* --------------------------------------------------------- 5. movement */

// 17. Retreating is slower than advancing.
{
  const forward = playing(120);
  const back = playing(120);
  // Both stand to the right of the opponent, so they face left.
  for (let i = 0; i < 40; i++) {
    forward.step({ ...NO_INPUT, left: true });
    back.step({ ...NO_INPUT, right: true });
  }
  const advanced = Math.abs(forward.local.x - (DOJO_X + 60));
  const retreated = Math.abs(back.local.x - (DOJO_X + 60));
  check('후진은 전진보다 느리다', retreated < advanced, `전진=${advanced.toFixed(1)} 후진=${retreated.toFixed(1)}`);
}

// 18. A fencer always turns to face the opponent.
{
  const e = playing(60);
  e.step(NO_INPUT);
  check('상대를 향해 자동으로 돌아선다', e.local.facing === -1, `facing=${e.local.facing}`);
}

console.log(failures === 0 ? '전부 통과' : `${failures}개 실패`);
process.exit(failures === 0 ? 0 : 1);
