import { jitter, roughLimb, roughSegment, roughStroke } from '../../lib/sketch.js';
import { ATTACK_SWING_FRAMES, INK_STYLE, PLATFORM_H, ZONE_STYLE, zoneAt } from './field.js';
import type { PlatformKind, PlatformSpec } from './field.js';
import { poseAt } from './types.js';
import type { PlayerView } from './types.js';

const HALO = 'rgba(255,255,255,0.9)';
/** Solid ink keeps the bat distinct from the fine runner outlines. */
const BAT_INK = INK_STYLE.dark;

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
    ctx.globalAlpha = 0.10;
    for (let x = Math.floor(camX / 250) * 250; x < camX + width + 60; x += 250) {
      ctx.save();
      ctx.translate(x + 45 + (Math.abs(y / 220) % 2) * 90, y + 70);
      ctx.rotate(-0.18);
      ctx.beginPath();
      if (zone === 'desk') {
        ctx.moveTo(-12, 13);
        ctx.quadraticCurveTo(-19, -13, 12, -16);
        ctx.quadraticCurveTo(21, 8, -12, 13);
        ctx.moveTo(-15, 18); ctx.lineTo(8, -10);
      } else if (zone === 'workshop') {
        ctx.moveTo(-24, 15); ctx.lineTo(-4, -17); ctx.lineTo(11, 5);
        ctx.moveTo(5, -3); ctx.lineTo(16, -12); ctx.lineTo(29, 14);
      } else {
        ctx.moveTo(-24, -5); ctx.quadraticCurveTo(3, -11, 22, -5);
        ctx.moveTo(-11, 6); ctx.quadraticCurveTo(11, 1, 32, 6);
      }
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}

/** Fill and outline an object against both light and dark desktop backgrounds. */
function outlined(ctx: CanvasRenderingContext2D, path: Path2D, fill: string, ink: string): void {
  ctx.fillStyle = fill;
  ctx.fill(path);
  ctx.strokeStyle = HALO; ctx.lineWidth = 4;
  ctx.stroke(path);
  ctx.strokeStyle = ink; ctx.lineWidth = 1.1;
  ctx.stroke(path);
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

/** A single gently bowed pencil line; fixed control points avoid frame-to-frame noise. */
function pencilLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath(); ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 + 0.7, x2, y2);
  ctx.stroke();
}

/** Sparse pencil objects: one contour, a soft underside, and one material cue. */
function drawBlock(ctx: CanvasRenderingContext2D, kind: PlatformKind, x: number, y: number, w: number, color: string): void {
  const zone = zoneAt(y);
  const moving = kind === 'moving';
  const plaza = w >= 140 || kind === 'start' || kind === 'goal';
  const cloud = zone === 'sky';
  const depth = plaza ? 24 : PLATFORM_H + 6;
  ctx.save(); ctx.translate(x, y);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const body = new Path2D();
  body.moveTo(0, 0); body.lineTo(w, 0);
  if (cloud) {
    body.quadraticCurveTo(w + 1, 12, w - 5, 15);
    const bumps = Math.max(2, Math.min(4, Math.round(w / 32)));
    for (let i = bumps; i > 0; i--) {
      body.quadraticCurveTo((i - 0.5) * (w - 10) / bumps + 5, 29,
        (i - 1) * (w - 10) / bumps + 5, 15);
    }
    body.quadraticCurveTo(-1, 12, 0, 0);
  } else if (zone === 'workshop') {
    // Low, rounded boulders: a broad flat foothold with an uneven stone underside.
    body.quadraticCurveTo(w - 1, 5, w - 2, 10);
    body.quadraticCurveTo(w - 4, depth - 1, w - 13, depth);
    body.lineTo(w * 0.58, depth + 2);
    body.quadraticCurveTo(w * 0.32, depth + 1, 10, depth - 2);
    body.quadraticCurveTo(2, depth - 3, 0, 9);
    body.lineTo(0, 0);
  } else {
    body.quadraticCurveTo(w + 0.6, 8, w - 1, depth - 5);
    body.quadraticCurveTo(w - 2, depth, w - 8, depth);
    body.quadraticCurveTo(w * 0.47, depth + 1, 8, depth - 0.5);
    body.quadraticCurveTo(0, depth, 0, depth - 7);
    body.quadraticCurveTo(-0.5, 6, 0, 0);
  }
  body.closePath();
  outlined(ctx, body, INK_STYLE.paper, INK_STYLE.graphite);
  ctx.save(); ctx.clip(body);
  ctx.fillStyle = INK_STYLE.wash;
  ctx.fillRect(0, depth - 4, w, 10);
  ctx.strokeStyle = INK_STYLE.hatch; ctx.lineWidth = 1;
  if (zone === 'desk') {
    // One cut end and a short grain stroke identify a log without dense rings.
    const end = new Path2D();
    end.ellipse(w - 7, depth / 2, 5, depth / 2 - 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = INK_STYLE.wash; ctx.fill(end); ctx.stroke(end);
    ctx.beginPath();
    ctx.ellipse(w - 7, depth / 2, 2, depth / 2 - 6, 0, -1.1, 1.5);
    ctx.stroke();
    if (!moving) pencilLine(ctx, 7, depth * 0.6, Math.max(15, w * 0.58), depth * 0.6 - 1);
  } else if (zone === 'workshop') {
    // A single softened facet instead of pegs, faces or repeated cracks.
    ctx.beginPath(); ctx.moveTo(w - 15, 4);
    ctx.quadraticCurveTo(w - 20, 8, w - 17, 12); ctx.stroke();
  }
  ctx.restore();

  if (moving) {
    // Wheels plus two quiet chevrons remain the shared movement cue.
    for (const wheelX of [12, w - 12]) {
      const wheel = new Path2D(); wheel.arc(wheelX, depth + 4, 3, 0, Math.PI * 2);
      outlined(ctx, wheel, INK_STYLE.paper, INK_STYLE.graphite);
    }
    ctx.strokeStyle = INK_STYLE.graphite; ctx.lineWidth = 1.2;
    for (const direction of [-1, 1]) {
      const cx = w / 2 + direction * 7;
      pencilLine(ctx, cx - direction * 3, 7, cx, 10);
      pencilLine(ctx, cx, 10, cx - direction * 3, 13);
    }
  }
  // The top stays precisely aligned with collision, even with a soft pencil contour.
  ctx.strokeStyle = color; ctx.globalAlpha = 0.72; ctx.lineWidth = 1.3;
  line(ctx, 0, 0, w, 0);
  ctx.restore();
}

/** Faint travel rail below a moving platform, with endpoints at its full extent. */
export function drawTravelRail(ctx: CanvasRenderingContext2D, spec: PlatformSpec): void {
  if (spec.kind !== 'moving') return;
  const cx = spec.x + spec.w / 2;
  const left = cx - (spec.amplitude ?? 0), right = cx + (spec.amplitude ?? 0);
  ctx.save();
  ctx.strokeStyle = INK_STYLE.graphite; ctx.globalAlpha = 0.45; ctx.lineWidth = 1;
  ctx.setLineDash([2, 9]);
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
  ctx.fillStyle = 'rgba(248,248,248,0.94)';
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
  ctx.strokeStyle = INK_STYLE.graphite; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.8;
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
    ctx.strokeStyle = INK_STYLE.ink; ctx.lineWidth = 1.8;
    for (const sx of [x + 16, x + w - 16]) {
      ctx.beginPath(); ctx.moveTo(sx, y + 7);
      for (let i = 1; i <= 5; i++) ctx.lineTo(sx + (i % 2 ? -5 : 5), y + 7 + i * (17 - compression) / 5);
      ctx.stroke();
    }
    ctx.fillStyle = INK_STYLE.shade; ctx.fillRect(x + 6, y + 25 - compression, w - 12, 4);
    const pad = new Path2D(); pad.roundRect(x, y, w, 11, [0, 0, 4, 4]);
    outlined(ctx, pad, INK_STYLE.paper, INK_STYLE.ink);
    ctx.strokeStyle = color; ctx.lineWidth = 2.1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke();
    ctx.strokeStyle = INK_STYLE.dark; ctx.lineWidth = 1.8;
    for (const cx of [x + w / 2 - 8, x + w / 2 + 8]) {
      ctx.beginPath(); ctx.moveTo(cx - 4, y + 7); ctx.lineTo(cx, y + 3); ctx.lineTo(cx + 4, y + 7);
      ctx.moveTo(cx, y + 3); ctx.lineTo(cx, y + 10); ctx.stroke();
    }
    ctx.restore();
  }
  if (kind === 'start') drawSign(ctx, x + w / 2, y + 35, 'START · 숲에서 하늘까지');
}

/** A larger checker flag marks the final landing. */
export function drawGoal(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, color: string): void {
  drawPlatform(ctx, 'goal', x, y, w, color);
  const poleX = x + w * 0.2;
  roughStroke(ctx, poleX, y, poleX, y - 53, 2.4, color, HALO);
  ctx.save();
  ctx.fillStyle = INK_STYLE.paper; ctx.fillRect(poleX, y - 53, 30, 20);
  ctx.fillStyle = INK_STYLE.dark;
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
    ctx.fillStyle = finish ? [INK_STYLE.graphite, INK_STYLE.graphite, INK_STYLE.hatch, INK_STYLE.shade][i % 4] : INK_STYLE.hatch;
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
  ctx.strokeStyle = BAT_INK;
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(pivotX, pivotY, length, startRad, rad);
  ctx.stroke();
  ctx.restore();

  roughStroke(ctx, pivotX, pivotY, tipX, tipY, 4.2, BAT_INK, HALO);
  ctx.beginPath();
  ctx.arc(tipX, tipY, 3.6, 0, Math.PI * 2);
  ctx.fillStyle = BAT_INK;
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
    roughSegment(ctx, -14, HEAD_Y, -6, HEAD_Y + 8, 2, INK_STYLE.dark, 1);
    roughSegment(ctx, -6, HEAD_Y, -14, HEAD_Y + 8, 2, INK_STYLE.dark, 1);
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
