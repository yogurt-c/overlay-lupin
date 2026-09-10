import { CEILING_Y, HEAD, LEGS, TORSO } from './field.js';
import type { ActivePartSpec } from './rules.js';

/** Anything the ball can bounce off: a player, with the motion it carries. */
export interface Figure {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
}

/** The ball's own radius travels with it, so different games can use different-sized balls. */
export interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  r: number;
  /** Multiplies gravity for this ball only — a lighter/floatier ball for a game that wants a slower fall. Defaults to 1. */
  gravityScale?: number;
  /** Scales the bounce/push impulse from a passive (non-shot) body touch — below 1 softens casual contact. Defaults to 1. */
  touchScale?: number;
}

const GRAVITY = 0.4;
const AIR_DRAG = 0.996;
const BOUNCE = 0.62;
const ROLL_DRAG = 0.985;
const MAX_SPEED = 16;
const REST_SPEED = 0.5;
const SPIN_PER_PIXEL = 0.05;

/** Restitution against a rigid barrier — a goal frame, a net, a wall, a touchline. */
export const WALL_BOUNCE = 0.55;

const HEAD_BOUNCE = 1.12;
/**
 * A torso/leg touch is a block, not a header: it should absorb a dribble
 * rather than mirror it back near-elastically. At the old 0.9 this rebounded
 * an oncoming dribble harder than it arrived, so running the ball into a
 * standing opponent would rocket it back toward your own goal.
 */
export const BODY_BOUNCE = 0.25;
const HEAD_PUSH = 1.7;
export const BODY_PUSH = 0.9;

/** The ball rests on the ground line rather than sinking half of itself into it. */
function restY(b: BallState): number {
  return -b.r;
}

/** Integrates one tick of free flight: gravity, drag, ground and ceiling. */
export function integrateBall(b: BallState): void {
  b.vy += GRAVITY * (b.gravityScale ?? 1);
  b.vx *= AIR_DRAG;

  const speed = Math.hypot(b.vx, b.vy);
  if (speed > MAX_SPEED) {
    b.vx = (b.vx / speed) * MAX_SPEED;
    b.vy = (b.vy / speed) * MAX_SPEED;
  }

  b.x += b.vx;
  b.y += b.vy;
  b.spin += b.vx * SPIN_PER_PIXEL;

  if (b.y >= restY(b)) {
    landOnGround(b);
  } else if (b.y <= CEILING_Y + b.r) {
    b.y = CEILING_Y + b.r;
    b.vy = Math.abs(b.vy) * BOUNCE;
  }
}

function landOnGround(b: BallState): void {
  b.y = restY(b);
  b.vy = -b.vy * BOUNCE;
  b.vx *= ROLL_DRAG;
  if (Math.abs(b.vy) < REST_SPEED) b.vy = 0;
}

/**
 * Separating the ball out of a body can aim it straight down, so anything that
 * ends up pressed into the pitch squirts back out instead of sinking through.
 */
export function keepBallAbovePitch(b: BallState): void {
  if (b.y <= restY(b)) return;
  b.y = restY(b);
  if (b.vy > 0) b.vy = -b.vy * BOUNCE;
}

/** Confines the ball between two vertical barriers (side walls), bouncing off either. */
export function bounceOffWalls(b: BallState, minX: number, maxX: number): void {
  if (b.x - b.r < minX) {
    b.x = minX + b.r;
    b.vx = Math.abs(b.vx) * WALL_BOUNCE;
  } else if (b.x + b.r > maxX) {
    b.x = maxX - b.r;
    b.vx = -Math.abs(b.vx) * WALL_BOUNCE;
  }
}

interface BodyPart {
  x: number;
  y: number;
  r: number;
  bounce: number;
  push: number;
  /** Present only for parts that redirect the ball outright, like a shot — absent means a normal bounce. */
  shot?: { power: number; lift: number; spin: number; dir?: 1 | -1 };
}

/** The third body part is either a game-supplied active part (a kick foot, a dive reach, ...) or the default legs. */
function partsOf(p: Figure, active?: ActivePartSpec): BodyPart[] {
  const thirdPart: BodyPart = active
    ? {
        x: p.x + p.facing * active.anchor.x,
        y: p.y + active.anchor.y,
        r: active.anchor.r,
        bounce: active.bounce,
        push: active.push,
        shot: active.shot
      }
    : { x: p.x, y: p.y + LEGS.y, r: LEGS.r, bounce: BODY_BOUNCE, push: BODY_PUSH };

  return [
    { x: p.x, y: p.y + HEAD.y, r: HEAD.r, bounce: HEAD_BOUNCE, push: HEAD_PUSH },
    { x: p.x, y: p.y + TORSO.y, r: TORSO.r, bounce: BODY_BOUNCE, push: BODY_PUSH },
    thirdPart
  ];
}

/**
 * Resolves the ball against the deepest overlapping body circle only — hitting
 * head and torso in the same tick would otherwise double the impulse and send
 * the ball off unpredictably.
 */
export function collideBallWithFigure(b: BallState, p: Figure, active?: ActivePartSpec): void {
  let hit: BodyPart | null = null;
  let deepest = 0;
  let hitDistance = 0;

  for (const part of partsOf(p, active)) {
    const distance = Math.hypot(b.x - part.x, b.y - part.y);
    const depth = part.r + b.r - distance;
    if (depth > deepest) {
      hit = part;
      deepest = depth;
      hitDistance = distance;
    }
  }
  if (!hit) return;

  const nx = hitDistance > 0.001 ? (b.x - hit.x) / hitDistance : p.facing;
  const ny = hitDistance > 0.001 ? (b.y - hit.y) / hitDistance : -1;

  b.x = hit.x + nx * (hit.r + b.r);
  b.y = hit.y + ny * (hit.r + b.r);

  if (hit.shot) {
    // A shot overrides whatever the ball was doing, rather than just bouncing off it.
    const dir = hit.shot.dir ?? p.facing;
    b.vx = dir * hit.shot.power + p.vx;
    b.vy = -hit.shot.lift + Math.min(0, ny * 3);
    b.spin += dir * hit.shot.spin;
    return;
  }

  // Carry the player's own motion into the ball, but only the upward part of a
  // jump — a falling player shouldn't drag the ball into the ground.
  const touchScale = b.touchScale ?? 1;
  const carryX = p.vx;
  const carryY = p.vy < 0 ? p.vy * 0.6 : 0;
  const rvx = b.vx - carryX;
  const rvy = b.vy - carryY;
  const closing = rvx * nx + rvy * ny;
  if (closing < 0) {
    b.vx = carryX + rvx - (1 + hit.bounce * touchScale) * closing * nx;
    b.vy = carryY + rvy - (1 + hit.bounce * touchScale) * closing * ny;
  }
  b.vx += nx * hit.push * touchScale;
  b.vy += ny * hit.push * touchScale;
}
