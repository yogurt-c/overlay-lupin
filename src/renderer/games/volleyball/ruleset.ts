import { CEILING_Y, WORLD_WIDTH } from '../../lib/ballsport/field.js';
import { BODY_BOUNCE, BODY_PUSH, WALL_BOUNCE, bounceOffWalls } from '../../lib/ballsport/ball.js';
import type { BallState } from '../../lib/ballsport/ball.js';
import type { ActivePartSpec, GameRules, RuleActor } from '../../lib/ballsport/rules.js';
import type { Input } from '../../lib/ballsport/engine.js';
import { drawNet, drawWall } from './draw.js';
import { INK } from '../../lib/ballsport/scene.js';
import { BALL_RADIUS, DIVE_REACH, NET_GAP, NET_HEIGHT, NET_X, SERVE_JITTER, SPIKE_HAND, WALL_LEFT, WALL_RIGHT } from './field.js';
import type { Pose } from './types.js';

const ACTIVE_FRAMES = 10;
const RECOVER_FRAMES = 18;
/** Sustained for the whole dive window, not just the trigger tick, so the lunge actually covers ground. */
const DIVE_LUNGE_SPEED = 9;

/**
 * Power/lift per aerial variant. `lift` is subtracted from vy (see ball.ts),
 * so a negative lift adds downward speed instead of popping the ball up.
 */
const SHOT: Record<string, { power: number; lift: number; spin: number }> = {
  spike: { power: 4.5, lift: 1.5, spin: 0.4 },
  spikeForward: { power: 6.5, lift: 0.4, spin: 0.4 },
  spikeDown: { power: 4, lift: -4.5, spin: 0.4 },
  spikeUp: { power: 3, lift: 5.5, spin: 0.4 },
  tip: { power: 2, lift: 0.8, spin: 0.2 }
};

function activePartFor(pose: string, facing: 1 | -1, side: 1 | -1): ActivePartSpec | undefined {
  if ((pose as Pose) === 'dive') {
    return { anchor: DIVE_REACH, bounce: BODY_BOUNCE, push: BODY_PUSH };
  }
  const shot = SHOT[pose];
  if (!shot) return undefined;
  // `dir: side` — a shot always aims at the opponent's court, regardless of which way the figure happens to be facing.
  return { anchor: SPIKE_HAND, bounce: BODY_BOUNCE, push: BODY_PUSH, shot: { ...shot, dir: side } };
}

function stepAction(p: RuleActor, input: Input, side: 1 | -1, defaultPose: string): ActivePartSpec | undefined {
  if (p.actionCooldown > 0) p.actionCooldown -= 1;
  if (p.actionTimer > 0) {
    p.actionTimer -= 1;
  } else if (input.action && p.actionCooldown <= 0) {
    p.actionTimer = ACTIVE_FRAMES;
    p.actionCooldown = ACTIVE_FRAMES + RECOVER_FRAMES;

    const onGround = p.y >= 0;
    if (onGround) {
      const dive: Pose = 'dive';
      p.pose = dive;
    } else {
      const forwardHeld = (side === 1 && input.right) || (side === -1 && input.left);
      const backHeld = (side === 1 && input.left) || (side === -1 && input.right);
      let chosen: Pose;
      if (input.down) chosen = 'spikeDown';
      else if (forwardHeld) chosen = 'spikeForward';
      else if (input.jump) chosen = 'spikeUp';
      else if (backHeld) chosen = 'tip';
      else chosen = 'spike';
      p.pose = chosen;
    }
  }

  if (p.actionTimer <= 0) {
    p.pose = defaultPose;
    return undefined;
  }

  if ((p.pose as Pose) === 'dive') {
    p.vx = p.facing * DIVE_LUNGE_SPEED;
  }
  return activePartFor(p.pose, p.facing, side);
}

/** A net collision is just a one-sided wall: solid below its top edge, open above it. */
function stepBallExtra(b: BallState): void {
  bounceOffWalls(b, WALL_LEFT, WALL_RIGHT);

  const netTop = -NET_HEIGHT;
  if (b.y <= netTop + b.r) return;
  if (b.x + b.r <= NET_X || b.x - b.r >= NET_X) return;

  if (b.x < NET_X) {
    b.x = NET_X - b.r;
    b.vx = -Math.abs(b.vx) * WALL_BOUNCE;
  } else {
    b.x = NET_X + b.r;
    b.vx = Math.abs(b.vx) * WALL_BOUNCE;
  }
}

/** Whoever's court the ball lands on failed to return it — the other side scores. */
function resolveRound(b: BallState): 0 | 1 | null {
  if (b.y < -b.r) return null;
  return b.x < NET_X ? 1 : 0;
}

function resetPositions(mySide: 1 | -1) {
  const localX = mySide === 1 ? NET_X - 70 : NET_X + 70;
  const jitter = (Math.random() * 2 - 1) * SERVE_JITTER;
  return {
    localX,
    localY: 0,
    remoteX: WORLD_WIDTH - localX,
    remoteY: 0,
    ballX: NET_X + jitter,
    ballY: CEILING_Y * 0.4,
    ballR: BALL_RADIUS,
    ballGravityScale: 0.5,
    ballTouchScale: 0.65,
    ballServeVy: -6
  };
}

function bounds(mySide: 1 | -1): { min: number; max: number } {
  return mySide === 1 ? { min: WALL_LEFT, max: NET_X - NET_GAP } : { min: NET_X + NET_GAP, max: WALL_RIGHT };
}

function drawField(ctx: CanvasRenderingContext2D): void {
  drawWall(ctx, WALL_LEFT, INK);
  drawWall(ctx, WALL_RIGHT, INK);
  drawNet(ctx, NET_X, NET_HEIGHT, INK);
}

export const volleyballRules: GameRules = {
  id: 'volleyball',
  resetPositions,
  bounds,
  stepAction,
  activePartFor,
  stepBallExtra,
  resolveRound,
  drawField
};
