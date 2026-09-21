import { jitter, roughLimb, roughSegment, roughStroke } from '../../lib/sketch.js';
import { ATTACK_SWING_FRAMES, PLATFORM_H } from './field.js';
import type { PlatformKind } from './field.js';
import { poseAt } from './types.js';
import type { PlayerView } from './types.js';

const HALO = 'rgba(255,255,255,0.9)';
/** A worn baseball-bat brown — a prop's own color, not tied to whichever runner is swinging it. */
const BAT_WOOD = '#7a5433';

/** A dot fixed in world space so a scrolling camera reads as motion, not a silently teleporting backdrop. */
export function drawBackgroundDots(
  ctx: CanvasRenderingContext2D,
  camX: number,
  camY: number,
  viewWidth: number,
  viewHeight: number,
  spacing: number,
  color: string
): void {
  const startX = Math.floor(camX / spacing) * spacing;
  const endX = camX + viewWidth + spacing;
  const startY = Math.floor(camY / spacing) * spacing;
  const endY = camY + viewHeight + spacing;
  ctx.fillStyle = color;
  for (let y = startY; y < endY; y += spacing) {
    for (let x = startX; x < endX; x += spacing) {
      ctx.beginPath();
      ctx.arc(x, y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * The puffy, faintly cloud-like block every platform is built from: a top
 * edge that hugs the collision line closely (so it still visually reads as
 * "the surface you're standing on"), and a scalloped, bulging underside that
 * carries all of the volume.
 */
function drawCloudBlock(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  const bumps = Math.max(3, Math.round(w / 30));
  const step = w / bumps;

  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h + 7, Math.max(6, w / 2 - 6), 5, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#14181a';
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(x, y + 2);
  for (let i = 0; i <= bumps; i++) {
    const px = x + step * i;
    const wob = i === 0 || i === bumps ? 0 : Math.sin(i * 1.7) * 2;
    ctx.lineTo(px, y + wob);
  }
  for (let i = bumps; i >= 0; i--) {
    const px = x + step * i;
    const bulge = h + 6 + Math.sin(i * 1.3 + 1) * 3;
    if (i === bumps) ctx.lineTo(px, y + bulge);
    else ctx.quadraticCurveTo(x + step * (i + 0.5), y + bulge + 4, px, y + bulge);
  }
  ctx.closePath();
  ctx.fillStyle = '#fbf8ef';
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = color;
  ctx.stroke();

  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.moveTo(x + 5, y + 3);
  ctx.lineTo(x + w - 5, y + 3);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.restore();
}

/** One platform, drawn a little differently per kind so its role reads at a glance. */
export function drawPlatform(
  ctx: CanvasRenderingContext2D,
  kind: PlatformKind,
  x: number,
  y: number,
  w: number,
  color: string
): void {
  drawCloudBlock(ctx, x, y, w, PLATFORM_H, color);

  if (kind === 'moving') {
    roughSegment(ctx, x - 9, y - 5, x - 2, y, 1.6, color, 1);
    roughSegment(ctx, x + w + 9, y - 5, x + w + 2, y, 1.6, color, 1);
  } else if (kind === 'trampoline') {
    ctx.save();
    ctx.globalAlpha = 0.85;
    roughSegment(ctx, x + w * 0.12, y, x + w / 2, y - PLATFORM_H, 3, '#3e7a57', 1);
    roughSegment(ctx, x + w / 2, y - PLATFORM_H, x + w * 0.88, y, 3, '#3e7a57', 1);
    ctx.restore();
  }
}

/** The flag a runner has to touch to finish the round. */
export function drawGoal(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, color: string): void {
  drawPlatform(ctx, 'goal', x, y, w, color);
  const poleX = x + w * 0.28;
  roughStroke(ctx, poleX, y, poleX, y - 40, 2.4, color, HALO);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(poleX, y - 40);
  ctx.lineTo(poleX + 27, y - 32);
  ctx.lineTo(poleX, y - 24);
  ctx.closePath();
  ctx.fillStyle = '#bd4438';
  ctx.strokeStyle = '#bd4438';
  ctx.lineWidth = 1;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

const HIP_Y = -13;
const CHEST_Y = -26;
const HEAD_Y = -34;
const HEAD_R = 8.5;

/** Where the legs/arms reach for one pose — feet-space, +x already meaning "the way the runner faces". */
function limbsFor(pose: string, anim: number): { legs: [number, number][]; hands: [number, number][] } {
  const swing = Math.sin(anim) * 6;
  switch (pose) {
    case 'move':
      return { legs: [[6 + swing, 0], [-6 - swing, 0]], hands: [[-5 - swing, CHEST_Y + 8], [5 + swing, CHEST_Y + 8]] };
    case 'jump':
      return { legs: [[4, HIP_Y + 6], [-3, HIP_Y + 8]], hands: [[-7, CHEST_Y - 4], [8, CHEST_Y - 8]] };
    case 'fall':
      return { legs: [[5, HIP_Y + 9], [-5, HIP_Y + 9]], hands: [[-8, CHEST_Y], [8, CHEST_Y - 2]] };
    case 'hit':
      return { legs: [[8, 2], [-2, HIP_Y + 4]], hands: [[-9, CHEST_Y + 6], [10, CHEST_Y + 10]] };
    case 'finish':
      return { legs: [[3, 0], [-3, 0]], hands: [[-9, HEAD_Y], [9, HEAD_Y]] };
    default:
      return { legs: [[3, 0], [-3, 0]], hands: [[-4, CHEST_Y + 6], [4, CHEST_Y + 6]] };
  }
}

/** The bat swings through one continuous arc as `atk` counts down — the only offense in the game. */
function drawBatSwing(ctx: CanvasRenderingContext2D, atk: number): void {
  const progress = (ATTACK_SWING_FRAMES - atk) / ATTACK_SWING_FRAMES;
  const startDeg = -70;
  const endDeg = 55;
  const angleDeg = startDeg + (endDeg - startDeg) * progress;
  const rad = (angleDeg * Math.PI) / 180;
  const startRad = (startDeg * Math.PI) / 180;
  const pivotX = 4;
  const pivotY = CHEST_Y + 2;
  const length = 24;
  const tipX = pivotX + Math.cos(rad) * length;
  const tipY = pivotY + Math.sin(rad) * length;

  ctx.save();
  ctx.globalAlpha = 0.24;
  ctx.strokeStyle = BAT_WOOD;
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(pivotX, pivotY, length, startRad, rad);
  ctx.stroke();
  ctx.restore();

  roughStroke(ctx, pivotX, pivotY, tipX, tipY, 4.2, BAT_WOOD, HALO);
  ctx.beginPath();
  ctx.arc(tipX, tipY, 3.6, 0, Math.PI * 2);
  ctx.fillStyle = BAT_WOOD;
  ctx.fill();
}

/**
 * One runner, drawn a little bigger than life — head first, since a stick
 * figure this small reads mainly by its silhouette.
 */
export function drawRunner(
  ctx: CanvasRenderingContext2D,
  player: PlayerView,
  color: string,
  anim: number
): void {
  const pose = poseAt(player.p);
  const atk = player.atk ?? 0;

  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.scale(player.facing, 1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const { legs, hands } = limbsFor(pose, anim);
  for (const [fx, fy] of legs) {
    roughLimb(ctx, 0, HIP_Y, fx * 0.5, (HIP_Y + fy) / 2, fx, fy, 3, color, HALO);
  }
  roughStroke(ctx, 0, CHEST_Y, 0, HIP_Y, 3.6, color, HALO);
  for (const [hx, hy] of hands) {
    roughLimb(ctx, 0, CHEST_Y, hx * 0.5, CHEST_Y + 4, hx, hy, 2.4, color, HALO);
  }

  drawHead(ctx, 0, HEAD_Y, HEAD_R, color);

  if (atk > 0) drawBatSwing(ctx, atk);
  if (pose === 'hit') {
    ctx.save();
    ctx.globalAlpha = 0.7;
    roughSegment(ctx, -14, HEAD_Y, -6, HEAD_Y + 8, 2, '#bd4438', 1);
    roughSegment(ctx, -6, HEAD_Y, -14, HEAD_Y + 8, 2, '#bd4438', 1);
    ctx.restore();
  }

  ctx.restore();
}

function drawHead(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r + 1.5, 0, Math.PI * 2);
  ctx.fillStyle = HALO;
  ctx.fill();

  for (let i = 0; i < 2; i++) {
    ctx.beginPath();
    ctx.arc(cx + jitter(1.2), cy + jitter(1.2), r, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4;
    ctx.stroke();
  }

  ctx.fillStyle = color;
  for (const eyeX of [cx + r * 0.22, cx + r * 0.6]) {
    ctx.beginPath();
    ctx.arc(eyeX, cy - r * 0.1, 1.15, 0, Math.PI * 2);
    ctx.fill();
  }
}
