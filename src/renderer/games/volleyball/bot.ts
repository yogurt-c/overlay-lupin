/**
 * A lightweight rule-based pilot for solo mode, mirroring soccer/bot.ts: it
 * runs its own `Game` instance (see module.ts) and just needs an input each
 * tick, exactly like a real player. It leads the ball's own physics forward
 * a few frames to decide where to stand, dives for anything that drifts into
 * reach — grounded or still airborne from a jump, dive works the same either
 * way — and times a jump to get under anything overhead first — imperfect on
 * purpose (hesitation, a fuzzy read on the landing spot, and a real chance it
 * just doesn't commit) so it plays like a decent but beatable opponent
 * instead of a wall.
 */
import { integrateBall } from '../../lib/ballsport/ball.js';
import type { BallState } from '../../lib/ballsport/ball.js';
import type { Input } from '../../lib/ballsport/engine.js';
import { PLAYER_HALF } from '../../lib/ballsport/field.js';
import { DIVE_REACH } from './field.js';

/** How far ahead the bot projects the ball's free flight to decide where to stand. */
const PREDICT_FRAMES = 12;
/** Shorter lookahead used only for jump timing, so it leaves the ground just before the ball arrives instead of after. */
const JUMP_LEAD_FRAMES = 7;
/** Dead zone around its target spot so the bot doesn't jitter back and forth once it arrives. */
const MOVE_DEADZONE = 4;
/** Chance per tick it simply misses its footwork and stands pat instead of chasing — a human-ish reaction lapse. */
const HESITATE_CHANCE = 0.15;
/** How far its read on the ball's landing spot can drift off the real one, so it doesn't track a falling ball perfectly. */
const PREDICT_ERROR_PX = 12;

/** Horizontal/vertical reach of a dive, matching the dive anchor's own hitbox plus a little lead — checked regardless of grounded state, since dive works in the air too. */
const DIVE_RANGE_X = PLAYER_HALF + DIVE_REACH.r + 8;
const DIVE_RANGE_Y = -50;
/** Chance per tick it actually commits to the dive once everything lines up — imperfect on purpose. */
const DIVE_CHANCE = 0.7;

/** How high and how close the predicted ball needs to be before the bot bothers jumping to meet it. */
const JUMP_BALL_Y = -34;
const JUMP_RANGE_X = 26;

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

export function computeBotInput(self: BotSelf, ball: BallState): Input {
  const predicted = predictBall(ball, PREDICT_FRAMES);
  const readX = predicted.x + (Math.random() * 2 - 1) * PREDICT_ERROR_PX;

  const dx = readX - self.x;
  const wantMove: -1 | 0 | 1 = dx < -MOVE_DEADZONE ? -1 : dx > MOVE_DEADZONE ? 1 : 0;
  // A stray tick of standing still instead of chasing — costs positioning, nothing more.
  const wantDir: -1 | 0 | 1 = Math.random() < HESITATE_CHANCE ? 0 : wantMove;

  const grounded = self.y >= 0;
  const jumpPreview = predictBall(ball, JUMP_LEAD_FRAMES);
  const jump = grounded && Math.abs(jumpPreview.x - self.x) < JUMP_RANGE_X && jumpPreview.y < JUMP_BALL_Y;

  const ballDx = Math.abs(ball.x - self.x);
  const inDiveRange = ballDx < DIVE_RANGE_X && ball.y > DIVE_RANGE_Y;
  const action = inDiveRange && Math.random() < DIVE_CHANCE;

  return { left: wantDir === -1, right: wantDir === 1, jump, down: false, action };
}
