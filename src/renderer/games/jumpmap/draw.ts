import { jitter, roughLimb, roughSegment, roughStroke } from '../../lib/sketch.js';
import { ATTACK_SWING_FRAMES, PLATFORM_H, ZONE_STYLE, zoneAt } from './field.js';
import type { PlatformKind, PlatformSpec } from './field.js';
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

/** Sparse pencil doodles anchored to the world; the desktop remains visible. */
export function drawCourseDecor(ctx: CanvasRenderingContext2D, camX: number, camY: number, width: number, height: number): void {
  ctx.save();
  ctx.lineWidth = 1.2;
  for (let y = Math.floor(camY / 220) * 220; y < camY + height + 100; y += 220) {
    const zone = zoneAt(y);
    ctx.strokeStyle = ZONE_STYLE[zone].ink;
    ctx.globalAlpha = 0.17;
    for (let x = Math.floor(camX / 250) * 250; x < camX + width + 60; x += 250) {
      ctx.save();
      ctx.translate(x + 45 + (Math.abs(y / 220) % 2) * 90, y + 70);
      ctx.rotate(-0.18);
      ctx.beginPath();
      if (zone === 'desk') {
        // A small ruled notebook, never a solid rectangle that could look landable.
        ctx.moveTo(-22, -14); ctx.lineTo(-22, 16); ctx.lineTo(20, 16); ctx.lineTo(20, -14); ctx.closePath();
        for (let row = -7; row <= 9; row += 8) { ctx.moveTo(-12, row); ctx.lineTo(13, row); }
        ctx.moveTo(-17, -14); ctx.lineTo(-17, 16);
      } else if (zone === 'workshop') {
        ctx.moveTo(-18, -25); ctx.lineTo(-18, 25);
        ctx.moveTo(18, -25); ctx.lineTo(18, 25);
        ctx.moveTo(-18, -25); ctx.lineTo(18, 0); ctx.lineTo(-18, 25);
        ctx.moveTo(18, -25); ctx.lineTo(-18, 0); ctx.lineTo(18, 25);
      } else {
        ctx.moveTo(-24, -8); ctx.lineTo(25, -16); ctx.lineTo(7, 16); ctx.lineTo(-2, 2); ctx.closePath();
        ctx.moveTo(-2, 2); ctx.lineTo(25, -16);
        ctx.moveTo(-30, 12); ctx.lineTo(-40, 17);
        ctx.moveTo(-34, 3); ctx.lineTo(-48, 10);
      }
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}

/** The top is exactly the collision line. All texture and volume sit below it. */
function drawBlock(ctx: CanvasRenderingContext2D, kind: PlatformKind, x: number, y: number, w: number, color: string): void {
  const zone = zoneAt(y);
  const style = ZONE_STYLE[zone];
  const moving = kind === 'moving';
  const cloud = zone === 'sky' && kind === 'static';
  const fill = moving ? '#d9edf3' : style.fill;
  const side = moving ? '#a9cdd9' : style.side;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = moving ? '#446c7b' : style.ink;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + w, y);
  if (cloud) {
    ctx.lineTo(x + w, y + 11);
    const bumps = Math.max(3, Math.round(w / 23));
    for (let i = bumps; i > 0; i--) {
      ctx.quadraticCurveTo(x + (i - 0.5) * w / bumps, y + 29, x + (i - 1) * w / bumps, y + 14);
    }
  } else {
    ctx.lineTo(x + w - 3, y + PLATFORM_H + 6);
    ctx.lineTo(x + 3, y + PLATFORM_H + 6);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  if (!cloud) {
    ctx.fillStyle = side;
    ctx.fillRect(x + 3, y + 8, w - 6, PLATFORM_H + 2);
    ctx.globalAlpha = 0.45;
    for (let hatch = x + 10; hatch < x + w - 5; hatch += 14) {
      ctx.beginPath(); ctx.moveTo(hatch, y + 11); ctx.lineTo(hatch - 4, y + 16); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // One unbroken dark edge makes the landable surface readable on any desktop.
  ctx.strokeStyle = color; ctx.lineWidth = 2.1;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x + 5, y + 3); ctx.lineTo(x + w - 5, y + 3); ctx.stroke();
  if (moving) {
    for (const [cx, direction] of [[x + 15, -1], [x + w - 15, 1]]) {
      ctx.strokeStyle = '#446c7b'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(cx - direction * 4, y + 5); ctx.lineTo(cx + direction * 2, y + 9); ctx.lineTo(cx - direction * 4, y + 13); ctx.stroke();
    }
  }
  if (kind === 'start' || kind === 'goal') {
    ctx.fillStyle = color;
    for (let col = 0; col < Math.floor((w - 12) / 6); col++) {
      ctx.fillRect(x + 6 + col * 6, y + 6 + (col % 2) * 6, 6, 6);
    }
  }
  ctx.restore();
}

/** Faint travel rail below a moving platform, with endpoints at its full extent. */
export function drawTravelRail(ctx: CanvasRenderingContext2D, spec: PlatformSpec): void {
  if (spec.kind !== 'moving') return;
  const cx = spec.x + spec.w / 2;
  const left = cx - (spec.amplitude ?? 0), right = cx + (spec.amplitude ?? 0);
  ctx.save();
  ctx.strokeStyle = '#567e8a'; ctx.globalAlpha = 0.45; ctx.lineWidth = 1;
  ctx.setLineDash([3, 5]);
  ctx.beginPath(); ctx.moveTo(left, spec.y + 30); ctx.lineTo(right, spec.y + 30); ctx.stroke();
  ctx.setLineDash([]);
  for (const x of [left, right]) {
    ctx.beginPath(); ctx.arc(x, spec.y + 30, 2, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

export function drawSign(ctx: CanvasRenderingContext2D, x: number, y: number, label: string): void {
  ctx.save();
  ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const width = ctx.measureText(label).width + 14;
  ctx.fillStyle = 'rgba(255,252,242,0.94)';
  ctx.fillRect(x - width / 2, y - 7, width, 14);
  ctx.fillStyle = ZONE_STYLE[zoneAt(y)].ink;
  ctx.fillText(label, x, y);
  ctx.restore();
}

/** A short direction cue, not a promised ballistic trajectory. */
export function drawLaunchCue(ctx: CanvasRenderingContext2D, from: PlatformSpec, to: PlatformSpec): void {
  const x = from.x + from.w / 2;
  const dx = to.x + to.w / 2 - x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  ctx.save();
  ctx.translate(x, from.y - 38); ctx.rotate(Math.atan2(dy, dx));
  ctx.strokeStyle = '#b97438'; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.8;
  ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.min(length, 42), 0); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(34, -5); ctx.lineTo(42, 0); ctx.lineTo(34, 5); ctx.stroke();
  ctx.restore();
}

/** Platform-specific silhouettes. Compression only changes decoration below y. */
export function drawPlatform(ctx: CanvasRenderingContext2D, kind: PlatformKind, x: number, y: number, w: number,
  color: string, impactAge = Infinity): void {
  if (kind !== 'trampoline') {
    drawBlock(ctx, kind, x, y, w, color);
  } else {
    const compression = impactAge < 18 ? Math.sin(impactAge / 18 * Math.PI) * 6 : 0;
    ctx.save();
    ctx.strokeStyle = '#876749'; ctx.lineWidth = 1.8;
    for (const sx of [x + 16, x + w - 16]) {
      ctx.beginPath(); ctx.moveTo(sx, y + 7);
      for (let i = 1; i <= 5; i++) ctx.lineTo(sx + (i % 2 ? -5 : 5), y + 7 + i * (17 - compression) / 5);
      ctx.stroke();
    }
    ctx.fillStyle = '#e5ba7d'; ctx.fillRect(x + 6, y + 25 - compression, w - 12, 4);
    ctx.fillStyle = '#f6b76f'; ctx.strokeStyle = '#875732';
    ctx.beginPath(); ctx.roundRect(x, y, w, 8, [0, 0, 4, 4]); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = 2.1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke();
    ctx.strokeStyle = '#875732'; ctx.lineWidth = 1.5;
    for (const cx of [x + w / 2 - 8, x + w / 2 + 8]) {
      ctx.beginPath(); ctx.moveTo(cx - 3, y + 6); ctx.lineTo(cx, y + 3); ctx.lineTo(cx + 3, y + 6); ctx.stroke();
    }
    ctx.restore();
  }
  if (kind === 'start') drawSign(ctx, x + w / 2, y + 35, 'START · 책상에서 하늘까지');
}

/** A larger checker flag marks the final landing. */
export function drawGoal(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, color: string): void {
  drawPlatform(ctx, 'goal', x, y, w, color);
  const poleX = x + w * 0.2;
  roughStroke(ctx, poleX, y, poleX, y - 53, 2.4, color, HALO);
  ctx.save();
  ctx.fillStyle = '#fffaf0'; ctx.fillRect(poleX, y - 53, 30, 20);
  ctx.fillStyle = '#b85e4e';
  for (let row = 0; row < 4; row++) for (let col = 0; col < 6; col++) {
    if ((row + col) % 2 === 0) ctx.fillRect(poleX + col * 5, y - 53 + row * 5, 5, 5);
  }
  ctx.strokeStyle = color; ctx.lineWidth = 1;
  ctx.strokeRect(poleX, y - 53, 30, 20);
  ctx.restore();
  drawSign(ctx, x + w / 2, y + 35, 'FINISH');
}

export function drawLandingEffect(ctx: CanvasRenderingContext2D, x: number, y: number, age: number, finish: boolean): void {
  const duration = finish ? 45 : 18;
  if (age < 0 || age >= duration) return;
  ctx.save(); ctx.globalAlpha = 1 - age / duration;
  const count = finish ? 16 : 4;
  for (let i = 0; i < count; i++) {
    const direction = i % 2 === 0 ? -1 : 1;
    const drift = direction * (5 + age * (0.5 + (i % 4) * 0.25));
    const lift = finish ? -22 - age * (1.6 + (i % 3) * 0.6) + age * age * 0.045 : -2 - Math.sin(age / duration * Math.PI) * (5 + i);
    ctx.fillStyle = finish ? ['#ca8059', '#75a5ad', '#a398c4', '#dfba67'][i % 4] : '#af9b7c';
    ctx.fillRect(x + drift, y + lift, finish ? 3 : 2, finish ? 5 : 2);
  }
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
