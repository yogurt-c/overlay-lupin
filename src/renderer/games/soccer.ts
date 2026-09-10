import { BALL_RADIUS, CEILING_Y, KICK_FOOT, PLAYER_HALF, WORLD_WIDTH } from '../field.js';
import { BODY_BOUNCE, BODY_PUSH, WALL_BOUNCE } from '../ball.js';
import { drawGoal } from '../draw.js';
import { INK } from '../scene.js';
import type { BallState, Pose } from '../types.js';
import type { ActivePartSpec, GameRules, RuleActor } from './rules.js';
import type { Input } from '../game.js';

export const GOAL_MARGIN = 14;
export const GOAL_DEPTH = 24;
export const GOAL_HEIGHT = 64;
/** Goal lines — the mouth of each goal faces the middle of the pitch. */
export const GOAL_LINE_LEFT = GOAL_MARGIN + GOAL_DEPTH;
export const GOAL_LINE_RIGHT = WORLD_WIDTH - GOAL_LINE_LEFT;

const KICK_ACTIVE_FRAMES = 10;
const KICK_RECOVER_FRAMES = 20;
const KICK_POWER = 8.4;
const KICK_LIFT = 4.6;

const NET_DRAG = 0.78;
const NET_BOUNCE = 0.15;

function activePartFor(pose: Pose, facing: 1 | -1): ActivePartSpec | undefined {
  if (pose !== 'kick') return undefined;
  return {
    anchor: { x: KICK_FOOT.x, y: KICK_FOOT.y, r: KICK_FOOT.r },
    bounce: BODY_BOUNCE,
    push: BODY_PUSH,
    shot: { power: KICK_POWER, lift: KICK_LIFT, spin: 0.6 }
  };
}

function stepAction(p: RuleActor, input: Input): ActivePartSpec | undefined {
  if (p.actionCooldown > 0) p.actionCooldown -= 1;
  if (p.actionTimer > 0) {
    p.actionTimer -= 1;
  } else if (input.kick && p.actionCooldown <= 0) {
    p.actionTimer = KICK_ACTIVE_FRAMES;
    p.actionCooldown = KICK_ACTIVE_FRAMES + KICK_RECOVER_FRAMES;
  }

  if (p.actionTimer <= 0) return undefined;
  p.pose = 'kick';
  return activePartFor('kick', p.facing);
}

/** Goal mouths only count below the crossbar; the frame above it is solid. */
function resolveRound(b: BallState): 0 | 1 | null {
  const underBar = b.y > -GOAL_HEIGHT + BALL_RADIUS;

  if (b.x - BALL_RADIUS <= GOAL_LINE_LEFT) {
    if (underBar) return 1;
    b.x = GOAL_LINE_LEFT + BALL_RADIUS;
    b.vx = Math.abs(b.vx) * WALL_BOUNCE;
  } else if (b.x + BALL_RADIUS >= GOAL_LINE_RIGHT) {
    if (underBar) return 0;
    b.x = GOAL_LINE_RIGHT - BALL_RADIUS;
    b.vx = -Math.abs(b.vx) * WALL_BOUNCE;
  }
  return null;
}

/**
 * The netting during a goal celebration: it swallows the ball's momentum so it
 * comes to rest inside the goal instead of rebounding back onto the pitch.
 */
function settleBall(b: BallState): void {
  if (b.x < GOAL_LINE_LEFT || b.x > GOAL_LINE_RIGHT) {
    b.vx *= NET_DRAG;
    b.vy *= NET_DRAG;
  }

  const backOfLeftNet = GOAL_MARGIN + BALL_RADIUS;
  const backOfRightNet = WORLD_WIDTH - GOAL_MARGIN - BALL_RADIUS;
  if (b.x <= backOfLeftNet) {
    b.x = backOfLeftNet;
    b.vx = Math.abs(b.vx) * NET_BOUNCE;
  } else if (b.x >= backOfRightNet) {
    b.x = backOfRightNet;
    b.vx = -Math.abs(b.vx) * NET_BOUNCE;
  }
}

function resetPositions(mySide: 1 | -1) {
  const localX = mySide === 1 ? WORLD_WIDTH * 0.36 : WORLD_WIDTH * 0.64;
  return {
    localX,
    localY: 0,
    remoteX: WORLD_WIDTH - localX,
    remoteY: 0,
    ballX: WORLD_WIDTH / 2,
    ballY: CEILING_Y * 0.85
  };
}

function bounds(): { min: number; max: number } {
  return { min: PLAYER_HALF, max: WORLD_WIDTH - PLAYER_HALF };
}

function drawField(ctx: CanvasRenderingContext2D): void {
  drawGoal(ctx, GOAL_LINE_LEFT, GOAL_MARGIN, GOAL_HEIGHT, INK);
  drawGoal(ctx, GOAL_LINE_RIGHT, WORLD_WIDTH - GOAL_MARGIN, GOAL_HEIGHT, INK);
}

export const soccerRules: GameRules = {
  id: 'soccer',
  resetPositions,
  bounds,
  stepAction,
  activePartFor,
  resolveRound,
  settleBall,
  drawField
};
