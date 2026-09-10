/**
 * Headless checks for the soccer match simulation, run against the compiled
 * renderer output (`npm test` builds first). The simulation deliberately has
 * no DOM or network dependency, so it can be stepped tick by tick from plain
 * Node.
 */
import { Game, STEP_MS, WIN_SCORE } from '../dist/renderer/lib/ballsport/engine.js';
import { DEFAULT_BALL_RADIUS, WORLD_WIDTH, HEAD, CEILING_Y } from '../dist/renderer/lib/ballsport/field.js';
import { GOAL_LINE_LEFT, GOAL_LINE_RIGHT, soccerRules } from '../dist/renderer/games/soccer/ruleset.js';

const BALL_RADIUS = DEFAULT_BALL_RADIUS;
const NONE = { left: false, right: false, jump: false, down: false, action: false };
let failures = 0;

function newGame() {
  return new Game(soccerRules);
}

function check(name, cond, extra = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failures += 1;
  console.log(`${mark}  ${name}${extra ? ` — ${extra}` : ''}`);
}

function run(game, frames, input = NONE) {
  for (let i = 0; i < frames; i++) game.step(input);
}

/** Drives the match past kickoff so the ball is live. */
function toPlay(game) {
  while (game.phase === 'kickoff') game.step(NONE);
}

// 1. Ball settles on the ground line, not half-buried in it.
{
  const g = newGame();
  g.startMatch(true);
  toPlay(g);
  g.remote.x = WORLD_WIDTH - 40;
  run(g, 300);
  check('공이 바닥선 위에 정지한다', Math.abs(g.ball.y - -BALL_RADIUS) < 0.6, `y=${g.ball.y.toFixed(2)}`);
  check('정지한 공은 튀지 않는다', Math.abs(g.ball.vy) < 0.01, `vy=${g.ball.vy.toFixed(3)}`);
}

// 2. Heading launches the ball; it does not stick to the player.
{
  const g = newGame();
  g.startMatch(true);
  toPlay(g);
  g.remote.x = WORLD_WIDTH - 40;
  g.ball = { x: g.local.x + 2, y: HEAD.y - HEAD.r - BALL_RADIUS + 3, vx: 0, vy: 2, spin: 0, r: BALL_RADIUS };
  run(g, 1);
  const launched = g.ball.vy < -1;
  run(g, 30);
  const dist = Math.hypot(g.ball.x - g.local.x, g.ball.y - HEAD.y);
  check('헤딩하면 공이 튕겨 오른다', launched, `vy=${g.ball.vy.toFixed(2)}`);
  check('공이 머리에 끼지 않는다', dist > HEAD.r + BALL_RADIUS, `dist=${dist.toFixed(1)}`);
}

// 3. A kick drives the ball forward much harder than a passive touch.
{
  const kickSpeed = (kick) => {
    const g = newGame();
    g.startMatch(true);
    toPlay(g);
    g.remote.x = WORLD_WIDTH - 40;
    g.local.vx = 0;
    g.ball = { x: g.local.x + 20, y: -8, vx: 0, vy: 0, spin: 0, r: BALL_RADIUS };
    run(g, 6, { ...NONE, action: kick });
    return g.ball.vx;
  };
  const withKick = kickSpeed(true);
  const withoutKick = kickSpeed(false);
  check('슛이 공을 앞으로 강하게 보낸다', withKick > 6, `vx=${withKick.toFixed(2)}`);
  check('슛이 일반 접촉보다 세다', withKick > withoutKick + 3, `${withKick.toFixed(2)} vs ${withoutKick.toFixed(2)}`);
}

// 3b. Dribbling the ball into a standing opponent should be a soft block, not
// a rocket back toward your own goal at higher speed than you were carrying it.
{
  const g = newGame();
  g.startMatch(true);
  toPlay(g);
  g.remote.x = 500;
  // Pin the opponent in place: without a fresh packet each tick, trackRemote()
  // lerps them back toward whatever position startMatch assigned at kickoff.
  g.remoteTarget = { x: 500, y: 0, facing: -1, pose: 'idle' };
  g.local.x = 440;
  g.local.vx = 3.1;
  g.ball = { x: 460, y: -9, vx: 3.1, vy: 0, spin: 0, r: BALL_RADIUS };

  let sawCollision = false;
  let worstReboundSpeed = 0;
  for (let i = 0; i < 40 && !sawCollision; i++) {
    const beforeVx = g.ball.vx;
    g.step({ ...NONE, right: true });
    if (g.ball.vx < 0 && beforeVx >= 0) {
      sawCollision = true;
      worstReboundSpeed = Math.abs(g.ball.vx);
    }
  }
  check('가만히 있는 상대와 부딪히면 공이 튕겨나온다', sawCollision, `worst=${worstReboundSpeed.toFixed(2)}`);
  check(
    '드리블 속도보다 더 세게 되돌아오지 않는다',
    worstReboundSpeed <= 3.1,
    `rebound=${worstReboundSpeed.toFixed(2)} vs dribble=3.10`
  );
}

// 4. Goals only count under the crossbar; above it the frame is solid.
{
  const g = newGame();
  g.startMatch(true);
  toPlay(g);
  g.remote.x = WORLD_WIDTH - 40;
  g.local.x = WORLD_WIDTH * 0.8;
  g.ball = { x: GOAL_LINE_LEFT + 30, y: -20, vx: -8, vy: 0, spin: 0, r: BALL_RADIUS };
  run(g, 12);
  check('크로스바 아래로 들어가면 득점', g.score[1] === 1 && g.phase === 'goal', `score=${g.score}, phase=${g.phase}`);

  const h = newGame();
  h.startMatch(true);
  toPlay(h);
  h.remote.x = WORLD_WIDTH - 40;
  h.local.x = WORLD_WIDTH * 0.8;
  h.ball = { x: GOAL_LINE_LEFT + 30, y: -120, vx: -8, vy: 0, spin: 0, r: BALL_RADIUS };
  run(h, 12);
  check('크로스바 위는 골대에 맞고 튕긴다', h.score[1] === 0 && h.ball.vx > 0, `score=${h.score}, vx=${h.ball.vx.toFixed(2)}`);
}

// 5. Goal freeze returns to kickoff with fresh positions.
{
  const g = newGame();
  g.startMatch(true);
  toPlay(g);
  g.remote.x = WORLD_WIDTH - 40;
  g.ball = { x: GOAL_LINE_RIGHT - 30, y: -20, vx: 9, vy: 0, spin: 0, r: BALL_RADIUS };
  run(g, 12);
  check('반대편 골도 득점된다', g.score[0] === 1, `score=${g.score}`);
  run(g, 40);
  check('세리머니 동안 공이 골대 안으로 굴러 들어간다', g.ball.x > GOAL_LINE_RIGHT, `x=${g.ball.x.toFixed(1)}`);
  check('공이 골망을 뚫고 나가지 않는다', g.ball.x <= WORLD_WIDTH - BALL_RADIUS + 0.01, `x=${g.ball.x.toFixed(1)}`);
  run(g, 60);
  check('골 후 킥오프로 복귀한다', g.phase === 'kickoff', `phase=${g.phase}`);
  check('킥오프에 공이 센터로 돌아간다', Math.abs(g.ball.x - WORLD_WIDTH / 2) < 0.01, `x=${g.ball.x}`);
}

// 6. Reaching the win score ends the match.
{
  const g = newGame();
  g.startMatch(true);
  g.score = [WIN_SCORE - 1, 0];
  toPlay(g);
  g.remote.x = WORLD_WIDTH - 40;
  g.ball = { x: GOAL_LINE_RIGHT - 30, y: -20, vx: 9, vy: 0, spin: 0, r: BALL_RADIUS };
  run(g, 12);
  check(`${WIN_SCORE}골이면 경기가 끝난다`, g.phase === 'over', `phase=${g.phase}`);
  check('종료 직후에는 isOver가 아직 false', g.isOver === false);
  run(g, 300);
  check('종료 연출이 끝나면 isOver', g.isOver === true);
}

// 7. Simulation is framerate-independent: the tick count is what matters, not wall time.
{
  const play = () => {
    const g = newGame();
    g.startMatch(true);
    toPlay(g);
    g.remote.x = WORLD_WIDTH - 40;
    for (let i = 0; i < 200; i++) {
      g.step({ left: false, right: true, jump: i % 40 === 0, down: false, action: i % 25 === 0 });
    }
    return `${g.local.x.toFixed(4)}|${g.ball.x.toFixed(4)}|${g.ball.y.toFixed(4)}`;
  };
  check('같은 틱 수는 같은 결과를 낸다', play() === play(), play());
  check('고정 타임스텝은 60Hz', Math.abs(STEP_MS - 1000 / 60) < 1e-9);
}

// 8. Ball stays inside the pitch under sustained abuse.
{
  const g = newGame();
  g.startMatch(true);
  toPlay(g);
  let inside = true;
  for (let i = 0; i < 3000; i++) {
    g.step({ left: i % 90 < 45, right: i % 90 >= 45, jump: i % 17 === 0, down: false, action: i % 13 === 0 });
    g.remote.x = 400 + Math.sin(i / 20) * 200;
    if (
      g.ball.x < -1 ||
      g.ball.x > WORLD_WIDTH + 1 ||
      g.ball.y < CEILING_Y - 1 ||
      g.ball.y > -BALL_RADIUS + 0.01
    ) {
      inside = false;
    }
  }
  check('공이 필드 밖으로 나가지 않는다', inside, `ball=(${g.ball.x.toFixed(1)}, ${g.ball.y.toFixed(1)})`);
  check('공이 바닥 아래로 파고들지 않는다', g.ball.y <= -BALL_RADIUS + 0.01, `y=${g.ball.y.toFixed(2)}`);
  check('선수가 필드 안에 머문다', g.local.x >= 0 && g.local.x <= WORLD_WIDTH, `x=${g.local.x.toFixed(1)}`);
}

// 8b. A figure standing right on top of the ball can't press it through the pitch.
{
  const g = newGame();
  g.startMatch(true);
  toPlay(g);
  g.remote.x = WORLD_WIDTH - 40;
  g.local.x = 300;
  g.ball = { x: 300, y: -BALL_RADIUS, vx: 0, vy: 0, spin: 0, r: BALL_RADIUS };
  run(g, 60);
  check('선수 밑에 깔린 공이 지면 아래로 안 내려간다', g.ball.y <= -BALL_RADIUS + 0.01, `y=${g.ball.y.toFixed(2)}`);
}

// 9. Client mirrors the host's score from its own point of view.
{
  const host = newGame();
  host.startMatch(true);
  const client = newGame();
  client.startMatch(false);
  host.score = [3, 1];
  const packet = host.buildOutgoingPacket();
  client.applyOpponentPacket(packet);
  check('호스트 관점 스코어', host.myScore === 3 && host.theirScore === 1);
  check('클라이언트 관점 스코어가 뒤집힌다', client.myScore === 1 && client.theirScore === 3);
  check('클라이언트는 world 상태를 받는다', packet.world !== undefined && client.phase === host.phase);
  check('클라이언트는 world를 보내지 않는다', client.buildOutgoingPacket().world === undefined);
}

// 10. Client ball reconciliation converges instead of teleporting every packet.
{
  const client = newGame();
  client.startMatch(false);
  client.phase = 'play';
  client.ball = { x: 400, y: -30, vx: 0, vy: 0, spin: 0, r: BALL_RADIUS };
  const authoritative = {
    player: { x: 300, y: 0, facing: 1, pose: 'run' },
    world: { ball: { x: 420, y: -30, vx: 1, vy: 0, spin: 0, r: BALL_RADIUS }, phase: 'play', timer: 0 },
    score: [0, 0]
  };
  client.applyOpponentPacket(authoritative);
  const nudged = client.ball.x;
  check('작은 오차는 부드럽게 보정된다', nudged > 400 && nudged < 420, `x=${nudged.toFixed(1)}`);

  authoritative.world.ball.x = 800;
  client.applyOpponentPacket(authoritative);
  check('큰 오차는 즉시 동기화된다', client.ball.x === 800, `x=${client.ball.x}`);
}

console.log(failures === 0 ? '\n전부 통과' : `\n실패 ${failures}건`);
process.exit(failures === 0 ? 0 : 1);
