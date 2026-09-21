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

/** Fill and outline an object against both light and dark desktop backgrounds. */
function outlined(ctx: CanvasRenderingContext2D, path: Path2D, fill: string, ink: string): void {
  ctx.fillStyle = fill;
  ctx.fill(path);
  ctx.strokeStyle = HALO; ctx.lineWidth = 4;
  ctx.stroke(path);
  ctx.strokeStyle = ink; ctx.lineWidth = 1.5;
  ctx.stroke(path);
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

/** All volume, paper folds and fittings stay below the exact landing surface. */
function drawBlock(ctx: CanvasRenderingContext2D, kind: PlatformKind, x: number, y: number, w: number, color: string): void {
  const zone = zoneAt(y);
  const style = ZONE_STYLE[zone];
  const moving = kind === 'moving';
  const plaza = w >= 170 || kind === 'start' || kind === 'goal';
  const depth = plaza ? 26 : PLATFORM_H + 6;
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = 'round';

  const body = new Path2D();
  body.moveTo(0, 0); body.lineTo(w, 0);
  if (zone === 'sky' && !moving && !plaza && w < 145) {
    // A paper-cut cloud: flat landing edge, scalloped underside.
    body.lineTo(w, 10);
    const bumps = Math.max(3, Math.round(w / 24));
    for (let i = bumps; i > 0; i--) {
      body.quadraticCurveTo((i - 0.5) * w / bumps, 29, (i - 1) * w / bumps, 13);
    }
  } else {
    body.lineTo(w, depth - 4); body.lineTo(w - 5, depth);
    body.lineTo(3, depth); body.lineTo(0, depth - 3);
  }
  body.closePath();
  outlined(ctx, body, style.fill, style.ink);
  ctx.save(); ctx.clip(body);
  ctx.fillStyle = style.side;
  ctx.fillRect(0, depth - 6, w, 6);
  ctx.strokeStyle = style.ink; ctx.lineWidth = 1;

  if (zone === 'desk') {
    if (w >= 145 || plaza) {
      // Book cover, page edges and a cloth spine. Plazas become a small stack.
      ctx.fillStyle = '#c58868'; ctx.fillRect(0, 0, w, 5);
      ctx.fillRect(0, depth - 4, w, 4);
      ctx.fillRect(0, 4, 10, depth - 8);
      ctx.strokeStyle = '#c0a783';
      for (let row = 9; row < depth - 4; row += 4) line(ctx, 15, row, w - 5, row);
      if (plaza) {
        ctx.fillStyle = '#799897'; ctx.fillRect(0, 15, w, 4);
        ctx.fillStyle = '#547777'; ctx.fillRect(w - 13, 18, 8, 8);
        ctx.fillStyle = '#b76259'; ctx.fillRect(w - 35, 4, 6, 9);
      }
    } else if (w >= 95) {
      // Wooden ruler; sparse ticks read at the native overlay size.
      ctx.fillStyle = '#e9c891'; ctx.fillRect(0, 0, w, depth - 5);
      ctx.strokeStyle = '#907049';
      for (let tick = 10, i = 0; tick < w - 5; tick += 10, i++) {
        line(ctx, tick, 3, tick, i % 5 === 0 ? 12 : 8);
      }
      ctx.globalAlpha = 0.3; line(ctx, 6, 15, w - 6, 15); ctx.globalAlpha = 1;
    } else {
      // Pink eraser with a blue paper sleeve.
      ctx.fillStyle = '#edb6ad'; ctx.fillRect(0, 0, w, depth - 5);
      ctx.fillStyle = '#8bacba'; ctx.fillRect(w * 0.27, 0, w * 0.46, depth);
      ctx.fillStyle = '#dce8e7'; ctx.fillRect(w * 0.27 + 3, 7, w * 0.46 - 6, 3);
    }
  } else if (zone === 'workshop') {
    if (w >= 120 && !plaza && !moving) {
      // Planked construction platform, with broad seams rather than fine noise.
      ctx.fillStyle = '#dcc39a'; ctx.fillRect(0, 0, w, depth - 5);
      ctx.strokeStyle = '#9b805b';
      for (let seam = 30; seam < w; seam += 36) line(ctx, seam, 2, seam, depth - 5);
      line(ctx, 7, 10, 23, 10); line(ctx, w - 29, 13, w - 9, 13);
    } else {
      // I-beam / workbench: flanges and a recessed web.
      ctx.fillStyle = '#728e94'; ctx.fillRect(0, 6, w, depth - 11);
      ctx.fillStyle = '#415e67'; ctx.fillRect(4, 7, w - 8, 3);
      ctx.fillStyle = '#d0dcd5'; ctx.fillRect(0, depth - 5, w, 3);
      for (const rivetX of [8, w - 8]) {
        ctx.beginPath(); ctx.arc(rivetX, depth / 2, 2, 0, Math.PI * 2);
        ctx.fillStyle = '#e5eeea'; ctx.fill();
      }
      if (plaza) {
        for (const end of [15, w - 43]) {
          ctx.fillStyle = '#e6bd66'; ctx.fillRect(end, 11, 28, 8);
          ctx.strokeStyle = '#586061'; ctx.lineWidth = 3;
          for (let stripe = 4; stripe < 26; stripe += 9) line(ctx, end + stripe, 12, end + stripe - 3, 18);
        }
      }
    }
  } else {
    // Folded paper and layered paper islands; folds never suggest a raised top.
    ctx.strokeStyle = '#c1b9d7';
    if (plaza || w >= 145 || moving) {
      line(ctx, 5, depth - 10, w - 6, depth - 10);
      line(ctx, 7, depth - 6, w - 4, depth - 6);
      ctx.beginPath(); ctx.moveTo(w - 23, 1); ctx.lineTo(w - 23, 12); ctx.lineTo(w - 5, 12); ctx.closePath();
      ctx.fillStyle = '#d6cbe9'; ctx.fill(); ctx.stroke();
      line(ctx, w - 23, 1, w - 5, 12);
      if (plaza) {
        ctx.fillStyle = '#b0a2ca'; ctx.fillRect(10, 8, 23, 5);
        ctx.fillStyle = '#d5c9e5'; ctx.fillRect(38, 8, 14, 5);
      }
    } else {
      ctx.globalAlpha = 0.6;
      line(ctx, 12, 8, 25, 11); line(ctx, w - 29, 11, w - 16, 7);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();

  if (moving) {
    // The same carriage, wheels and arrows identify movement in every chapter.
    ctx.strokeStyle = '#446c7b'; ctx.lineWidth = 2;
    line(ctx, 17, depth, 17, 26); line(ctx, w - 17, depth, w - 17, 26);
    for (const wheelX of [17, w - 17]) {
      const wheel = new Path2D(); wheel.arc(wheelX, 26, 3.5, 0, Math.PI * 2);
      outlined(ctx, wheel, '#638693', '#365561');
      ctx.fillStyle = '#e9f3f3'; ctx.fillRect(wheelX - 1, 25, 2, 2);
    }
    ctx.fillStyle = '#d9edf3'; ctx.fillRect(w / 2 - 17, 5, 34, 11);
    ctx.strokeStyle = '#365561'; ctx.lineWidth = 1.7;
    for (const direction of [-1, 1]) {
      const cx = w / 2 + direction * 10;
      line(ctx, cx - direction * 4, 7, cx, 10);
      line(ctx, cx, 10, cx - direction * 4, 13);
    }
  }
  if (kind === 'start' || kind === 'goal') {
    // A small finish strip leaves the object's material visible.
    ctx.fillStyle = kind === 'goal' ? '#b85e4e' : '#527c76';
    for (let col = 0; col < 8; col++) {
      ctx.fillRect(w / 2 - 20 + col * 5, 5 + (col % 2) * 5, 5, 5);
    }
  }
  // Crisp collision edge and an inset glint, shared by every material.
  ctx.strokeStyle = color; ctx.lineWidth = 2.1; line(ctx, 0, 0, w, 0);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1; line(ctx, 4, 2.5, w - 4, 2.5);
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
    const pad = new Path2D(); pad.roundRect(x, y, w, 11, [0, 0, 4, 4]);
    outlined(ctx, pad, '#f4ac59', '#875732');
    ctx.strokeStyle = color; ctx.lineWidth = 2.1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke();
    ctx.strokeStyle = '#754823'; ctx.lineWidth = 1.8;
    for (const cx of [x + w / 2 - 8, x + w / 2 + 8]) {
      ctx.beginPath(); ctx.moveTo(cx - 4, y + 7); ctx.lineTo(cx, y + 3); ctx.lineTo(cx + 4, y + 7);
      ctx.moveTo(cx, y + 3); ctx.lineTo(cx, y + 10); ctx.stroke();
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
