import {
  BALL_RADIUS,
  CEILING_Y,
  GOAL_LINE_LEFT,
  GOAL_LINE_RIGHT,
  GOAL_MARGIN,
  HEAD,
  KICK_FOOT,
  LEGS,
  TORSO,
  WORLD_WIDTH
} from './field.js';
import type { BallState } from './types.js';

/** Anything the ball can bounce off: a player, with the motion it carries. */
export interface Figure {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
}

const GRAVITY = 0.4;
const AIR_DRAG = 0.996;
const BOUNCE = 0.62;
const ROLL_DRAG = 0.985;
const MAX_SPEED = 16;
const REST_SPEED = 0.5;
const SPIN_PER_PIXEL = 0.05;

/** The ball rests on the ground line rather than sinking half of itself into it. */
export const REST_Y = -BALL_RADIUS;
/** Restitution against a goal frame or touchline. */
export const WALL_BOUNCE = 0.55;

const NET_DRAG = 0.78;
const NET_BOUNCE = 0.15;

const HEAD_BOUNCE = 1.12;
/**
 * A torso/leg touch is a block, not a header: it should absorb a dribble
 * rather than mirror it back near-elastically. At the old 0.9 this rebounded
 * an oncoming dribble harder than it arrived, so running the ball into a
 * standing opponent would rocket it back toward your own goal.
 */
const BODY_BOUNCE = 0.25;
const HEAD_PUSH = 1.7;
const BODY_PUSH = 0.9;
const KICK_POWER = 8.4;
const KICK_LIFT = 4.6;

/** Integrates one tick of free flight: gravity, drag, ground and ceiling. */
export function integrateBall(b: BallState): void {
  b.vy += GRAVITY;
  b.vx *= AIR_DRAG;

  const speed = Math.hypot(b.vx, b.vy);
  if (speed > MAX_SPEED) {
    b.vx = (b.vx / speed) * MAX_SPEED;
    b.vy = (b.vy / speed) * MAX_SPEED;
  }

  b.x += b.vx;
  b.y += b.vy;
  b.spin += b.vx * SPIN_PER_PIXEL;

  if (b.y >= REST_Y) {
    landOnGround(b);
  } else if (b.y <= CEILING_Y + BALL_RADIUS) {
    b.y = CEILING_Y + BALL_RADIUS;
    b.vy = Math.abs(b.vy) * BOUNCE;
  }
}

function landOnGround(b: BallState): void {
  b.y = REST_Y;
  b.vy = -b.vy * BOUNCE;
  b.vx *= ROLL_DRAG;
  if (Math.abs(b.vy) < REST_SPEED) b.vy = 0;
}

/**
 * Separating the ball out of a body can aim it straight down, so anything that
 * ends up pressed into the pitch squirts back out instead of sinking through.
 */
export function keepBallAbovePitch(b: BallState): void {
  if (b.y <= REST_Y) return;
  b.y = REST_Y;
  if (b.vy > 0) b.vy = -b.vy * BOUNCE;
}

interface BodyPart {
  x: number;
  y: number;
  r: number;
  bounce: number;
  push: number;
  isKick: boolean;
}

function partsOf(p: Figure, kicking: boolean): BodyPart[] {
  return [
    { x: p.x, y: p.y + HEAD.y, r: HEAD.r, bounce: HEAD_BOUNCE, push: HEAD_PUSH, isKick: false },
    { x: p.x, y: p.y + TORSO.y, r: TORSO.r, bounce: BODY_BOUNCE, push: BODY_PUSH, isKick: false },
    kicking
      ? {
          x: p.x + p.facing * KICK_FOOT.x,
          y: p.y + KICK_FOOT.y,
          r: KICK_FOOT.r,
          bounce: BODY_BOUNCE,
          push: BODY_PUSH,
          isKick: true
        }
      : { x: p.x, y: p.y + LEGS.y, r: LEGS.r, bounce: BODY_BOUNCE, push: BODY_PUSH, isKick: false }
  ];
}

/**
 * Resolves the ball against the deepest overlapping body circle only — hitting
 * head and torso in the same tick would otherwise double the impulse and send
 * the ball off unpredictably.
 */
export function collideBallWithFigure(b: BallState, p: Figure, kicking: boolean): void {
  let hit: BodyPart | null = null;
  let deepest = 0;
  let hitDistance = 0;

  for (const part of partsOf(p, kicking)) {
    const distance = Math.hypot(b.x - part.x, b.y - part.y);
    const depth = part.r + BALL_RADIUS - distance;
    if (depth > deepest) {
      hit = part;
      deepest = depth;
      hitDistance = distance;
    }
  }
  if (!hit) return;

  const nx = hitDistance > 0.001 ? (b.x - hit.x) / hitDistance : p.facing;
  const ny = hitDistance > 0.001 ? (b.y - hit.y) / hitDistance : -1;

  b.x = hit.x + nx * (hit.r + BALL_RADIUS);
  b.y = hit.y + ny * (hit.r + BALL_RADIUS);

  if (hit.isKick) {
    // A kick is a shot, not a bounce: it overrides whatever the ball was doing.
    b.vx = p.facing * KICK_POWER + p.vx;
    b.vy = -KICK_LIFT + Math.min(0, ny * 3);
    b.spin += p.facing * 0.6;
    return;
  }

  // Carry the player's own motion into the ball, but only the upward part of a
  // jump — a falling player shouldn't drag the ball into the ground.
  const carryX = p.vx;
  const carryY = p.vy < 0 ? p.vy * 0.6 : 0;
  const rvx = b.vx - carryX;
  const rvy = b.vy - carryY;
  const closing = rvx * nx + rvy * ny;
  if (closing < 0) {
    b.vx = carryX + rvx - (1 + hit.bounce) * closing * nx;
    b.vy = carryY + rvy - (1 + hit.bounce) * closing * ny;
  }
  b.vx += nx * hit.push;
  b.vy += ny * hit.push;
}

/**
 * The netting during a goal celebration: it swallows the ball's momentum so it
 * comes to rest inside the goal instead of rebounding back onto the pitch.
 */
export function settleBallInNet(b: BallState): void {
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
