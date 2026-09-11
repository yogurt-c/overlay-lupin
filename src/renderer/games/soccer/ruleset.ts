import { CEILING_Y, DEFAULT_BALL_RADIUS, PLAYER_HALF, WORLD_WIDTH } from '../../lib/ballsport/field.js';
import { BODY_BOUNCE, BODY_PUSH, WALL_BOUNCE } from '../../lib/ballsport/ball.js';
import type { BallState } from '../../lib/ballsport/ball.js';
import type { ActivePartSpec, GameRules, RuleActor } from '../../lib/ballsport/rules.js';
import type { Input } from '../../lib/ballsport/engine.js';
import { drawGoal } from './draw.js';
import { INK } from '../../lib/ballsport/scene.js';
import { KICK_FOOT } from './field.js';
import type { Pose } from './types.js';

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

function activePartFor(pose: string, facing: 1 | -1, side: 1 | -1): ActivePartSpec | undefined {
  if ((pose as Pose) !== 'kick') return undefined;
  return {
    anchor: { x: KICK_FOOT.x, y: KICK_FOOT.y, r: KICK_FOOT.r },
    bounce: BODY_BOUNCE,
    push: BODY_PUSH,
    shot: { power: KICK_POWER, lift: KICK_LIFT, spin: 0.6 }
  };
}

function stepAction(p: RuleActor, input: Input, side: 1 | -1, defaultPose: string): ActivePartSpec | undefined {
  if (p.actionCooldown > 0) p.actionCooldown -= 1;
  if (p.actionTimer > 0) {
    p.actionTimer -= 1;
  } else if (input.action && p.actionCooldown <= 0) {
    p.actionTimer = KICK_ACTIVE_FRAMES;
    p.actionCooldown = KICK_ACTIVE_FRAMES + KICK_RECOVER_FRAMES;
  }

  if (p.actionTimer <= 0) {
    p.pose = defaultPose;
    return undefined;
  }
  const kickPose: Pose = 'kick';
  p.pose = kickPose;
  return activePartFor(kickPose, p.facing, side);
}

/** Goal mouths only count below the crossbar; the frame above it is solid. */
function resolveRound(b: BallState): 0 | 1 | null {
  const underBar = b.y > -GOAL_HEIGHT + b.r;

  if (b.x - b.r <= GOAL_LINE_LEFT) {
    if (underBar) return 1;
    b.x = GOAL_LINE_LEFT + b.r;
    b.vx = Math.abs(b.vx) * WALL_BOUNCE;
  } else if (b.x + b.r >= GOAL_LINE_RIGHT) {
    if (underBar) return 0;
    b.x = GOAL_LINE_RIGHT - b.r;
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

  const backOfLeftNet = GOAL_MARGIN + b.r;
  const backOfRightNet = WORLD_WIDTH - GOAL_MARGIN - b.r;
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
    ballY: CEILING_Y * 0.85,
    ballR: DEFAULT_BALL_RADIUS
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
  drawField,
  // 3, 2, 1 카운트다운이 끝나고 플레이가 시작될 때까지 제자리에서 움직일 수 없다.
  freezeDuringKickoff: true
};
