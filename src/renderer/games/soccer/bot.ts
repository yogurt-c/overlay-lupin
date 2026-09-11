/**
 * A lightweight rule-based pilot for solo mode. It runs its own `Game`
 * instance (see module.ts) and just needs an input each tick, exactly like a
 * real player. It leads the ball's own physics forward a few frames to decide
 * where to stand (so it doesn't just trail wherever the ball already was),
 * and behaves differently depending on which third of the pitch the ball is
 * in: an emergency clear near its own goal, an eager shot near the attack
 * goal, and patient dribbling everywhere in between rather than kicking from
 * anywhere on the field.
 */
import { integrateBall } from '../../lib/ballsport/ball.js';
import type { BallState } from '../../lib/ballsport/ball.js';
import type { Input } from '../../lib/ballsport/engine.js';
import { PLAYER_HALF } from '../../lib/ballsport/field.js';
import { GOAL_LINE_LEFT, GOAL_LINE_RIGHT } from './ruleset.js';
import { KICK_FOOT } from './field.js';

/** How far ahead the bot projects the ball's free flight to decide where to stand. */
const PREDICT_FRAMES = 10;
/** Shorter lookahead used only for jump timing, so it leaves the ground just before the ball arrives instead of after. */
const JUMP_LEAD_FRAMES = 6;
/** Ball within this distance of the bot's own goal line is treated as an emergency, not a normal touch. */
const DEFEND_ZONE = 220;
/** Ball within this distance of the attack goal is worth shooting at on sight instead of dribbling closer first. */
const SHOOT_ZONE = 260;
/** How far behind the ball (on the bot's own goal side) it parks itself, so a kick while facing the attack goal actually connects. */
const APPROACH_OFFSET = 14;
/** Dead zone around that spot so the bot doesn't jitter back and forth once it arrives. */
const MOVE_DEADZONE = 4;
/** Horizontal/vertical reach of a kick attempt, matching the foot anchor's own hitbox plus a little lead. */
const KICK_RANGE_X = PLAYER_HALF + KICK_FOOT.r + 10;
const KICK_RANGE_Y = -22;
/** Chance per tick it actually attempts a kick once everything lines up — imperfect on purpose. */
const CLEAR_CHANCE = 0.65;
const SHOOT_CHANCE = 0.4;
/** How high and how close the predicted ball needs to be before the bot bothers jumping to contest it. */
const JUMP_BALL_Y = -30;
const JUMP_RANGE_X = 30;
/** Chance per tick the bot simply misses its footwork and stands pat instead of chasing — a human-ish reaction lapse. */
const HESITATE_CHANCE = 0.15;
/** How far its read on the ball's landing spot can drift off the real one, so it doesn't track a bouncing ball perfectly. */
const PREDICT_ERROR_PX = 10;

export interface BotSelf {
  x: number;
  y: number;
  facing: 1 | -1;
}

/** Clones the ball and lets the real physics carry it forward, instead of re-deriving gravity/drag by hand here. */
function predictBall(ball: BallState, frames: number): BallState {
  const sim: BallState = { ...ball };
  for (let i = 0; i < frames; i++) integrateBall(sim);
  return sim;
}

/**
 * `self` is the bot's own engine's `local`; `mySide` is that same engine's
 * side (1 if it's playing the host slot, -1 the client slot) — it also
 * happens to be the direction the bot must face to shoot at its attack goal,
 * since each side's attack goal sits on the far side of the pitch from where
 * it spawns.
 */
export function computeBotInput(self: BotSelf, ball: BallState, mySide: 1 | -1): Input {
  const attackDir = mySide;
  const defendGoalX = attackDir === 1 ? GOAL_LINE_LEFT : GOAL_LINE_RIGHT;
  const attackGoalX = attackDir === 1 ? GOAL_LINE_RIGHT : GOAL_LINE_LEFT;

  const predicted = predictBall(ball, PREDICT_FRAMES);
  const readX = predicted.x + (Math.random() * 2 - 1) * PREDICT_ERROR_PX;
  const nearOwnGoal = Math.abs(readX - defendGoalX) < DEFEND_ZONE;
  const nearAttackGoal = Math.abs(readX - attackGoalX) < SHOOT_ZONE;

  const ballDx = Math.abs(ball.x - self.x);
  const inKickRange = ballDx < KICK_RANGE_X && ball.y > KICK_RANGE_Y;
  const facingAttack = self.facing === attackDir;

  const targetX = readX - attackDir * APPROACH_OFFSET;
  const dx = targetX - self.x;
  const wantMove: -1 | 0 | 1 =
    inKickRange && !facingAttack ? attackDir : dx < -MOVE_DEADZONE ? -1 : dx > MOVE_DEADZONE ? 1 : 0;
  // A stray tick of standing still instead of chasing — nothing near goal depends on this, so it only costs positioning.
  const wantDir: -1 | 0 | 1 = Math.random() < HESITATE_CHANCE ? 0 : wantMove;

  const jumpPreview = predictBall(ball, JUMP_LEAD_FRAMES);
  const grounded = self.y >= 0;
  const jump = grounded && Math.abs(jumpPreview.x - self.x) < JUMP_RANGE_X && jumpPreview.y < JUMP_BALL_Y;

  // Away from both boxes the bot just dribbles the ball forward with its body instead of taking a kick from nowhere.
  const kickChance = nearOwnGoal ? CLEAR_CHANCE : nearAttackGoal ? SHOOT_CHANCE : 0;
  const action = inKickRange && facingAttack && Math.random() < kickChance;

  return { left: wantDir === -1, right: wantDir === 1, jump, down: false, action };
}
