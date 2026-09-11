import { GROUND_Y, HEAD } from './field.js';
import { jitter, roughLimb, roughSegment, roughStroke } from '../sketch.js';

export interface DrawPlayer {
  /** Ground-relative feet position: x in world units, y as the simulation's negative-is-up offset. */
  x: number;
  y: number;
  facing: 1 | -1;
  /** Opaque to this renderer — interpreted by the game's own `limbsFor`. */
  pose: string;
  /** Running animation phase, in radians. */
  anim: number;
  color: string;
  /** Ticks left in the current action pose's commit window, if any — only ever present for the locally-simulated figure. */
  actionTimer?: number;
}

/** Limb targets for one pose, in feet-space with +x already meaning "forward". */
export interface Limbs {
  legs: [number, number][];
  hands: [number, number][];
  lean: number;
  /** A held weapon as hilt then tip. Games whose figures carry nothing omit it. */
  blade?: [number, number][];
  /** Lowers the hip/chest/head anchors for a crouched stance. Omit for the standard standing height. */
  crouch?: number;
  /** 0..1 — fading ghost strokes trailing the figure, for a fast lunge/dash pose. Omit (or 0) for none. */
  trail?: number;
  /** 0..1 — a short burst of ink flicks at the feet, for a landing/impact moment. Omit (or 0) for none. */
  impact?: number;
}

const HALO = 'rgba(255,255,255,0.92)';

const HIP_Y = -16;
const CHEST_Y = -32;

export function drawShadow(ctx: CanvasRenderingContext2D, x: number, height: number, radius: number): void {
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

/**
 * Draws a big-headed stick figure standing on (x, GROUND_Y + y). `limbsFor` is
 * supplied by the game, since only it knows what each of its own poses looks
 * like (a kick, a dive, a spike, ...).
 */
export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  player: DrawPlayer,
  limbsFor: (pose: string, anim: number, actionTimer?: number) => Limbs
): void {
  const { x, y, facing, pose, anim, color, actionTimer } = player;
  drawShadow(ctx, x, -y, 11);

  ctx.save();
  ctx.translate(x, GROUND_Y + y);
  ctx.scale(facing, 1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const { legs, hands, lean, blade, crouch = 0, trail = 0, impact = 0 } = limbsFor(pose, anim, actionTimer);
  const hipY = HIP_Y + crouch;
  const chestY = CHEST_Y + crouch;

  if (trail > 0) drawMotionTrail(ctx, hipY, chestY, trail, color, HALO);

  for (const [fx, fy] of legs) {
    roughLimb(ctx, 0, hipY, fx * 0.55 + 2, (hipY + fy) / 2, fx, fy, 3.4, color, HALO);
  }
  roughStroke(ctx, lean, chestY, 0, hipY, 4, color, HALO);
  for (const [hx, hy] of hands) {
    roughLimb(ctx, lean, chestY, (lean + hx) / 2 + 1, chestY + 5, hx, hy, 2.8, color, HALO);
  }

  drawHead(ctx, lean * 1.2, HEAD.y + crouch * 0.6, HEAD.r, color);
  // Last, so a weapon reads as held in front of the body rather than behind it.
  if (blade) drawBlade(ctx, blade, color);
  if (impact > 0) drawImpactFlick(ctx, impact, color);
  ctx.restore();
}

/**
 * A few fading copies of the torso line, trailing behind (in local, already
 * facing-flipped space, so always -x) the figure — the same "ghost streak"
 * idea as drawBallTrail below, reused for a fast lunge instead of a fast ball.
 */
function drawMotionTrail(
  ctx: CanvasRenderingContext2D,
  hipY: number,
  chestY: number,
  intensity: number,
  color: string,
  halo: string
): void {
  const copies = 4;
  for (let i = 1; i <= copies; i++) {
    const back = i * 9;
    ctx.save();
    ctx.globalAlpha = (0.42 / i) * intensity;
    roughStroke(ctx, -back, chestY, -back * 0.6, hipY, 3.8, color, halo);
    ctx.restore();
  }
}

/** A quick fan of short ink flicks at the feet — a landing, not a lingering dust cloud. */
function drawImpactFlick(ctx: CanvasRenderingContext2D, intensity: number, color: string): void {
  const marks = 4;
  for (let i = 0; i < marks; i++) {
    const angle = -0.4 + (i / (marks - 1)) * 1.1;
    const len = 6 + jitter(2.5);
    ctx.save();
    ctx.globalAlpha = 0.55 * intensity;
    roughSegment(ctx, 0, 0, Math.cos(angle) * len, -Math.abs(Math.sin(angle)) * len * 0.4, 1.6, color, 1);
    ctx.restore();
  }
}

/** A slightly curved blade with a short crossguard, drawn hilt-to-tip. */
function drawBlade(ctx: CanvasRenderingContext2D, blade: [number, number][], color: string): void {
  const [[x1, y1], [x2, y2]] = blade;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  // The curve comes from bowing the midpoint off the hilt-tip line.
  const mx = (x1 + x2) / 2 + nx * 2.2;
  const my = (y1 + y2) / 2 + ny * 2.2;

  roughStroke(ctx, x1, y1, mx, my, 2.4, color, HALO);
  roughStroke(ctx, mx, my, x2, y2, 2, color, HALO);
  roughSegment(ctx, x1 + nx * 4, y1 + ny * 4, x1 - nx * 4, y1 - ny * 4, 2, color, 2);
  roughSegment(ctx, x1, y1, x1 - (dx / len) * 7, y1 - (dy / len) * 7, 2.6, color, 2);
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
export function drawPitch(
  ctx: CanvasRenderingContext2D,
  cameraX: number,
  viewWidth: number,
  worldWidth: number,
  color: string
): void {
  const dashLen = 10;
  const gapLen = 8;
  const stride = dashLen + gapLen;
  const start = Math.max(0, Math.floor(cameraX / stride) * stride);
  const end = Math.min(worldWidth, cameraX + viewWidth + stride);
  for (let x = start; x < end; x += stride) {
    roughSegment(ctx, x, GROUND_Y, Math.min(x + dashLen, worldWidth), GROUND_Y, 2, color, 1);
  }

  const mid = worldWidth / 2;
  if (mid > cameraX - 20 && mid < cameraX + viewWidth + 20) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    for (let y = GROUND_Y - 64; y < GROUND_Y; y += 12) {
      roughSegment(ctx, mid, y, mid, y + 6, 1.4, color, 1);
    }
    ctx.restore();
  }
}

/** Below this speed the ball is just moving, not flying — no trail. */
const TRAIL_MIN_SPEED = 6;
/** Speed at which the trail reaches its longest, most opaque look. */
const TRAIL_MAX_SPEED = 14;

/** A few fading streaks behind a fast-moving ball — the visual payoff for a hard kick or spike. */
function drawBallTrail(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  vx: number,
  vy: number,
  color: string
): void {
  const speed = Math.hypot(vx, vy);
  if (speed < TRAIL_MIN_SPEED) return;

  const strength = Math.min(1, (speed - TRAIL_MIN_SPEED) / (TRAIL_MAX_SPEED - TRAIL_MIN_SPEED));
  const dirX = -vx / speed;
  const dirY = -vy / speed;
  const len = r * (1.6 + strength * 2.2);

  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const spread = (i - 1) * (r * 0.42);
    const px = -dirY * spread;
    const py = dirX * spread;
    const alpha = (0.4 - i * 0.1) * (0.4 + strength * 0.6);
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.strokeStyle = color;
    ctx.lineWidth = r * (0.4 - i * 0.08);
    ctx.beginPath();
    ctx.moveTo(x + px, y + py);
    ctx.lineTo(x + px + dirX * len, y + py + dirY * len);
    ctx.stroke();
  }
  ctx.restore();
}

/** The ball: a wobbly ink blot whose marks rotate so its spin is visible. */
export function drawBall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  spin: number,
  color: string,
  vx = 0,
  vy = 0
): void {
  drawShadow(ctx, x, -y - r, r);
  drawBallTrail(ctx, x, GROUND_Y + y, r, vx, vy, color);

  ctx.save();
  ctx.translate(x, GROUND_Y + y);

  ctx.beginPath();
  const steps = 11;
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const rr = r + jitter(r * 0.28);
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
    ctx.arc(Math.cos(angle) * r * 0.45, Math.sin(angle) * r * 0.45, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
