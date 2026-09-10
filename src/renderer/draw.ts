import { BALL_RADIUS, GOAL_HEIGHT, GROUND_Y, HEAD, KICK_FOOT, WORLD_WIDTH } from './field.js';
import type { Pose } from './types.js';

export interface DrawPlayer {
  /** Ground-relative feet position: x in world units, y as the simulation's negative-is-up offset. */
  x: number;
  y: number;
  facing: 1 | -1;
  pose: Pose;
  /** Running animation phase, in radians. */
  anim: number;
  color: string;
}

const HALO = 'rgba(255,255,255,0.92)';

/*
 * The sketch look comes from jittering every stroke. Doing that with
 * Math.random() on every frame makes the whole scene vibrate at 60Hz, which
 * both looks broken and gives away that something is animating. Instead the
 * jitter is driven by a seeded generator that is reset to the same value for
 * every frame within a "boil" interval, so the drawing holds still and only
 * redraws itself a few times a second, like ink on paper.
 */
let rngState = 1;
let frameSeed = 1;

/** Advances the sketch's jitter pattern. Call this only a handful of times per second. */
export function advanceSketchSeed(): void {
  frameSeed = (frameSeed * 1664525 + 1013904223) >>> 0 || 1;
}

/** Resets the jitter generator so this frame reproduces the previous one exactly. */
export function beginSketchFrame(): void {
  rngState = frameSeed || 1;
}

function rnd(): number {
  rngState ^= rngState << 13;
  rngState ^= rngState >>> 17;
  rngState ^= rngState << 5;
  rngState >>>= 0;
  return rngState / 4294967296;
}

function jitter(amount: number): number {
  return (rnd() - 0.5) * amount;
}

function roughSegment(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  color: string,
  passes: number
): void {
  for (let p = 0; p < passes; p++) {
    const j = 1.3;
    ctx.beginPath();
    ctx.moveTo(x1 + jitter(j), y1 + jitter(j));
    ctx.quadraticCurveTo(
      (x1 + x2) / 2 + jitter(j * 1.3),
      (y1 + y2) / 2 + jitter(j * 1.3),
      x2 + jitter(j),
      y2 + jitter(j)
    );
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
}

/** A hand-drawn line with a white halo behind it, so it stays legible over any desktop. */
function roughStroke(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  color: string
): void {
  roughSegment(ctx, x1, y1, x2, y2, width + 4.5, HALO, 1);
  roughSegment(ctx, x1, y1, x2, y2, width, color, 2);
}

function roughLimb(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  width: number,
  color: string
): void {
  roughSegment(ctx, ax, ay, bx, by, width + 4.5, HALO, 1);
  roughSegment(ctx, bx, by, cx, cy, width + 4.5, HALO, 1);
  roughSegment(ctx, ax, ay, bx, by, width, color, 2);
  roughSegment(ctx, bx, by, cx, cy, width, color, 2);
}

const HIP_Y = -16;
const CHEST_Y = -32;
const LEG_LENGTH = 11;
const ARM_LENGTH = 10;
/** How far below the shoulder a relaxed hand hangs. */
const ARM_DROP = 14;

interface Limbs {
  legs: [number, number][];
  hands: [number, number][];
  lean: number;
}

/** Limb targets for each pose, in feet-space with +x already meaning "forward". */
function limbsFor(pose: Pose, anim: number): Limbs {
  const swing = Math.sin(anim);
  const lift = Math.cos(anim);

  switch (pose) {
    case 'run':
      return {
        legs: [
          [swing * LEG_LENGTH, -Math.max(0, lift) * 5],
          [-swing * LEG_LENGTH, -Math.max(0, -lift) * 5]
        ],
        hands: [
          [-swing * ARM_LENGTH, CHEST_Y + ARM_DROP - Math.abs(swing) * 3],
          [swing * ARM_LENGTH, CHEST_Y + ARM_DROP - Math.abs(swing) * 3]
        ],
        lean: 1.5
      };
    case 'jump':
      return {
        legs: [
          [9, -8],
          [-9, -3]
        ],
        hands: [
          [15, CHEST_Y - 2],
          [-14, CHEST_Y]
        ],
        lean: 0
      };
    case 'kick':
      return {
        legs: [
          [KICK_FOOT.x, KICK_FOOT.y],
          [-7, 0]
        ],
        hands: [
          [-15, CHEST_Y + 2],
          [12, CHEST_Y + 9]
        ],
        lean: -2
      };
    default: {
      const breathe = Math.sin(anim * 0.08) * 0.6;
      return {
        legs: [
          [5, 0],
          [-5, 0]
        ],
        hands: [
          [10, CHEST_Y + ARM_DROP - 2 + breathe],
          [-10, CHEST_Y + ARM_DROP - 2 + breathe]
        ],
        lean: 0
      };
    }
  }
}

function drawShadow(ctx: CanvasRenderingContext2D, x: number, height: number, radius: number): void {
  const fade = Math.max(0, 1 - height / 120);
  if (fade <= 0.02) return;
  ctx.save();
  ctx.globalAlpha = 0.14 * fade;
  ctx.fillStyle = '#14181a';
  ctx.beginPath();
  ctx.ellipse(x, GROUND_Y + 1, radius * (0.6 + fade * 0.5), 2.4 * fade + 1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Draws a big-headed stick figure standing on (x, GROUND_Y + y). */
export function drawPlayer(ctx: CanvasRenderingContext2D, player: DrawPlayer): void {
  const { x, y, facing, pose, anim, color } = player;
  drawShadow(ctx, x, -y, 11);

  ctx.save();
  ctx.translate(x, GROUND_Y + y);
  ctx.scale(facing, 1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const { legs, hands, lean } = limbsFor(pose, anim);

  for (const [fx, fy] of legs) {
    roughLimb(ctx, 0, HIP_Y, fx * 0.55 + 2, (HIP_Y + fy) / 2, fx, fy, 3.4, color);
  }
  roughStroke(ctx, lean, CHEST_Y, 0, HIP_Y, 4, color);
  for (const [hx, hy] of hands) {
    roughLimb(ctx, lean, CHEST_Y, (lean + hx) / 2 + 1, CHEST_Y + 5, hx, hy, 2.8, color);
  }

  drawHead(ctx, lean * 1.2, HEAD.y, HEAD.r, color);
  ctx.restore();
}

function drawHead(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r + 1.5, 0, Math.PI * 2);
  ctx.fillStyle = HALO;
  ctx.fill();

  for (let i = 0; i < 2; i++) {
    ctx.beginPath();
    ctx.arc(cx + jitter(1.3), cy + jitter(1.3), r, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.6;
    ctx.stroke();
  }

  // A face pointing the way the figure faces: reads as a character rather than a blob.
  ctx.fillStyle = color;
  for (const eyeX of [cx + r * 0.24, cx + r * 0.62]) {
    ctx.beginPath();
    ctx.arc(eyeX, cy - r * 0.12, 1.25, 0, Math.PI * 2);
    ctx.fill();
  }
  roughSegment(ctx, cx + r * 0.2, cy + r * 0.45, cx + r * 0.66, cy + r * 0.42, 1.6, color, 1);
}

/**
 * A grid of small dots fixed in world space, so panning the camera along a
 * wide field reads as motion instead of the pitch silently teleporting.
 * Only draws the slice currently in view.
 */
export function drawBackgroundDots(
  ctx: CanvasRenderingContext2D,
  cameraX: number,
  viewWidth: number,
  spacing: number,
  color: string
): void {
  const startX = Math.floor(cameraX / spacing) * spacing;
  const endX = cameraX + viewWidth + spacing;
  ctx.fillStyle = color;
  for (let x = startX; x < endX; x += spacing) {
    for (let y = spacing / 2; y < GROUND_Y; y += spacing) {
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Ground line plus a halfway marker, drawn only for the slice in view. */
export function drawPitch(ctx: CanvasRenderingContext2D, cameraX: number, viewWidth: number, color: string): void {
  const dashLen = 10;
  const gapLen = 8;
  const stride = dashLen + gapLen;
  const start = Math.max(0, Math.floor(cameraX / stride) * stride);
  const end = Math.min(WORLD_WIDTH, cameraX + viewWidth + stride);
  for (let x = start; x < end; x += stride) {
    roughSegment(ctx, x, GROUND_Y, Math.min(x + dashLen, WORLD_WIDTH), GROUND_Y, 2, color, 1);
  }

  const mid = WORLD_WIDTH / 2;
  if (mid > cameraX - 20 && mid < cameraX + viewWidth + 20) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    for (let y = GROUND_Y - 64; y < GROUND_Y; y += 12) {
      roughSegment(ctx, mid, y, mid, y + 6, 1.4, color, 1);
    }
    ctx.restore();
  }
}

/** A hand-drawn goal: two uprights, a crossbar, and a light net hatch. */
export function drawGoal(ctx: CanvasRenderingContext2D, frontX: number, backX: number, color: string): void {
  const top = GROUND_Y - GOAL_HEIGHT;
  const left = Math.min(frontX, backX);
  const right = Math.max(frontX, backX);

  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, right - left, GOAL_HEIGHT);
  ctx.clip();
  ctx.globalAlpha = 0.38;
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  for (let i = -GOAL_HEIGHT; i <= right - left; i += 8) {
    ctx.moveTo(left + i, top);
    ctx.lineTo(left + i + GOAL_HEIGHT, GROUND_Y);
  }
  for (let y = top; y <= GROUND_Y; y += 8) {
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
  }
  ctx.stroke();
  ctx.restore();

  roughStroke(ctx, frontX, GROUND_Y, frontX, top, 3, color);
  roughStroke(ctx, backX, GROUND_Y, backX, top, 2.2, color);
  roughStroke(ctx, frontX, top, backX, top, 3, color);
}

/** The ball: a wobbly ink blot whose marks rotate so its spin is visible. */
export function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, spin: number, color: string): void {
  drawShadow(ctx, x, -y - BALL_RADIUS, BALL_RADIUS);

  ctx.save();
  ctx.translate(x, GROUND_Y + y);

  ctx.beginPath();
  const steps = 11;
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const rr = BALL_RADIUS + jitter(BALL_RADIUS * 0.28);
    const px = Math.cos(angle) * rr;
    const py = Math.sin(angle) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = HALO;
  ctx.stroke();

  ctx.rotate(spin);
  ctx.fillStyle = HALO;
  for (const angle of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * BALL_RADIUS * 0.45, Math.sin(angle) * BALL_RADIUS * 0.45, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
