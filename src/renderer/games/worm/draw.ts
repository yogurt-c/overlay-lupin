import { jitter, roughSegment } from '../../lib/sketch.js';
import { BEDROCK_Y, COLUMN_W, ITEM_RADIUS, MAX_HP, WORM_HALF_W, WORM_HEIGHT } from './arena.js';
import type { ItemKind } from './items.js';
import type { Terrain } from './terrain.js';
import { poseAt } from './types.js';
import type { Pose, WormView } from './types.js';

const HALO = 'rgba(255,255,255,0.9)';

/** A worm at rest is already smug; the other poses push off that baseline. */
interface Posture {
  /** Horizontal stretch, vertical squash — the classic squash-and-stretch pair. */
  scaleX: number;
  scaleY: number;
  /** Radians, applied about the worm's base. Positive leans backwards. */
  lean: number;
  /** Extra height off the ground, for the victory bounce. */
  lift: number;
  eye: 'smug' | 'wide' | 'shut' | 'dead' | 'gleeful';
  mouth: 'smirk' | 'grit' | 'grin' | 'flat';
}

/**
 * The pose vocabulary is the whole personality budget: no limbs, no faces
 * beyond an eye and a mouth line, because at 240x170 nothing smaller reads.
 * `phase` is a free-running frame counter so wobbles and bounces have somewhere
 * to come from.
 */
function postureFor(pose: Pose, facing: 1 | -1, charge: number, phase: number): Posture {
  switch (pose) {
    case 'move':
      return {
        scaleX: 1 + Math.sin(phase * 0.35) * 0.09,
        scaleY: 1 - Math.sin(phase * 0.35) * 0.09,
        lean: facing * 0.14,
        lift: 0,
        eye: 'smug',
        mouth: 'smirk'
      };
    case 'jump':
      // Stretched tall, the way anything springy looks mid-hop.
      return { scaleX: 0.9, scaleY: 1.14, lean: facing * 0.1, lift: 0, eye: 'wide', mouth: 'smirk' };
    case 'charge':
      return {
        scaleX: 1 + charge / 380,
        scaleY: 1 - charge / 520,
        lean: -facing * (0.1 + charge / 620),
        lift: 0,
        eye: 'wide',
        mouth: 'grit'
      };
    case 'hit':
      return { scaleX: 1.32, scaleY: 0.62, lean: 0, lift: 0, eye: 'shut', mouth: 'grit' };
    case 'down':
      return { scaleX: 1.25, scaleY: 0.5, lean: 0, lift: 0, eye: 'dead', mouth: 'flat' };
    case 'taunt':
      return {
        scaleX: 1 - Math.abs(Math.sin(phase * 0.3)) * 0.1,
        scaleY: 1 + Math.abs(Math.sin(phase * 0.3)) * 0.14,
        lean: Math.sin(phase * 0.3) * 0.2,
        lift: Math.abs(Math.sin(phase * 0.3)) * 7,
        eye: 'gleeful',
        mouth: 'grin'
      };
    default:
      return { scaleX: 1, scaleY: 1, lean: 0, lift: 0, eye: 'smug', mouth: 'smirk' };
  }
}

/** The ground: one wobbly stroke along the surface, solid ink beneath it. */
export function drawTerrain(
  ctx: CanvasRenderingContext2D,
  terrain: Terrain,
  camX: number,
  viewWidth: number,
  ink: string
): void {
  const first = Math.max(0, Math.floor(camX / COLUMN_W) - 1);
  const last = Math.min(terrain.heights.length - 1, Math.ceil((camX + viewWidth) / COLUMN_W) + 1);

  ctx.beginPath();
  ctx.moveTo(first * COLUMN_W, terrain.heights[first] + jitter(1.1));
  for (let i = first + 1; i <= last; i++) {
    ctx.lineTo(i * COLUMN_W, terrain.heights[i] + jitter(1.1));
  }

  ctx.lineTo(last * COLUMN_W, BEDROCK_Y + 40);
  ctx.lineTo(first * COLUMN_W, BEDROCK_Y + 40);
  ctx.closePath();
  ctx.fillStyle = 'rgba(20,24,26,0.13)';
  ctx.fill();

  // Redraw just the skyline on top, so the edge reads as a drawn line rather than a fill boundary.
  ctx.beginPath();
  ctx.moveTo(first * COLUMN_W, terrain.heights[first] + jitter(1.1));
  for (let i = first + 1; i <= last; i++) {
    ctx.lineTo(i * COLUMN_W, terrain.heights[i] + jitter(1.1));
  }
  ctx.lineWidth = 4.5;
  ctx.strokeStyle = HALO;
  ctx.stroke();
  ctx.lineWidth = 1.7;
  ctx.strokeStyle = ink;
  ctx.stroke();
}

export function drawShell(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, ink: string): void {
  ctx.beginPath();
  ctx.arc(x, y, radius + 1.4, 0, Math.PI * 2);
  ctx.fillStyle = HALO;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = ink;
  ctx.fill();
}

/**
 * A pickup: a hand-drawn crate with a glyph for what's inside. The glyphs are
 * shapes rather than letters — at this scale a letter is three pixels of mud.
 */
export function drawItem(ctx: CanvasRenderingContext2D, kind: ItemKind, x: number, y: number, phase: number): void {
  const bob = Math.sin(phase * 0.08 + x * 0.1) * 1.6;
  ctx.save();
  ctx.translate(x, y - ITEM_RADIUS - 2 + bob);

  const r = ITEM_RADIUS;
  ctx.beginPath();
  ctx.moveTo(-r + jitter(0.6), -r + jitter(0.6));
  ctx.lineTo(r + jitter(0.6), -r + jitter(0.6));
  ctx.lineTo(r + jitter(0.6), r + jitter(0.6));
  ctx.lineTo(-r + jitter(0.6), r + jitter(0.6));
  ctx.closePath();
  ctx.fillStyle = 'rgba(253,253,251,0.94)';
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = '#14181a';
  ctx.stroke();

  ctx.strokeStyle = '#14181a';
  ctx.fillStyle = '#14181a';
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  switch (kind) {
    case 'heal':
      // A cross.
      ctx.moveTo(0, -3.6);
      ctx.lineTo(0, 3.6);
      ctx.moveTo(-3.6, 0);
      ctx.lineTo(3.6, 0);
      ctx.stroke();
      break;
    case 'shield':
      // A shield outline.
      ctx.moveTo(0, -4);
      ctx.lineTo(3.4, -2);
      ctx.lineTo(3.4, 1.4);
      ctx.lineTo(0, 4.2);
      ctx.lineTo(-3.4, 1.4);
      ctx.lineTo(-3.4, -2);
      ctx.closePath();
      ctx.stroke();
      break;
    case 'shotgun':
      // Three diverging pellets.
      for (const angle of [-0.55, 0, 0.55]) {
        ctx.moveTo(-3.6, 0);
        ctx.lineTo(-3.6 + Math.cos(angle) * 7, Math.sin(angle) * 7);
      }
      ctx.stroke();
      break;
    case 'rocket':
      // A blunt warhead.
      ctx.moveTo(-3.8, -2.4);
      ctx.lineTo(1.6, -2.4);
      ctx.lineTo(4.2, 0);
      ctx.lineTo(1.6, 2.4);
      ctx.lineTo(-3.8, 2.4);
      ctx.closePath();
      ctx.fill();
      break;
    default:
      // Cluster: one round over its payload.
      ctx.arc(0, -2.6, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      for (const dx of [-3.2, 0, 3.2]) ctx.arc(dx, 2.8, 1.2, 0, Math.PI * 2);
      ctx.fill();
  }

  ctx.restore();
}

/** A shield reads as a ring that thins as it runs out, so everyone can see it lapse. */
export function drawShieldRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  remaining: number,
  total: number,
  phase: number
): void {
  const left = Math.max(0, Math.min(1, remaining / total));
  ctx.save();
  ctx.translate(x, y - WORM_HEIGHT * 0.55);
  ctx.beginPath();
  ctx.arc(0, 0, WORM_HEIGHT * 0.95 + Math.sin(phase * 0.18) * 0.8, 0, Math.PI * 2);
  ctx.lineWidth = 1 + left * 1.8;
  ctx.strokeStyle = `rgba(20,24,26,${0.25 + left * 0.45})`;
  ctx.stroke();
  ctx.restore();
}


/** An expanding ink ring; `progress` runs 0 to 1 over the burst's short life. */
export function drawBurst(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, progress: number): void {
  const eased = 1 - Math.pow(1 - progress, 2.2);
  ctx.beginPath();
  ctx.arc(x, y, radius * (0.35 + eased * 0.95), 0, Math.PI * 2);
  ctx.lineWidth = 3.2 * (1 - progress) + 0.6;
  ctx.strokeStyle = `rgba(20,24,26,${0.75 * (1 - progress)})`;
  ctx.stroke();
}

function drawEye(ctx: CanvasRenderingContext2D, kind: Posture['eye'], ink: string): void {
  if (kind === 'dead') {
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = ink;
    ctx.beginPath();
    ctx.moveTo(-2.2, -2.2);
    ctx.lineTo(2.2, 2.2);
    ctx.moveTo(2.2, -2.2);
    ctx.lineTo(-2.2, 2.2);
    ctx.stroke();
    return;
  }
  if (kind === 'shut' || kind === 'gleeful') {
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = ink;
    ctx.beginPath();
    if (kind === 'shut') {
      ctx.moveTo(-2.4, 0);
      ctx.lineTo(2.4, 0);
    } else {
      // A happy squint: the arc opens downward, the way a delighted eye creases.
      ctx.arc(0, 1.4, 2.6, Math.PI * 1.15, Math.PI * 1.85);
    }
    ctx.stroke();
    return;
  }

  const radius = kind === 'wide' ? 3.1 : 2.7;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#fdfdfb';
  ctx.fill();
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = ink;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(kind === 'wide' ? 0.2 : 0.9, kind === 'wide' ? 0 : 0.7, kind === 'wide' ? 1.1 : 1.4, 0, Math.PI * 2);
  ctx.fillStyle = ink;
  ctx.fill();

  // The heavy lid is what makes it read as smug rather than merely awake.
  if (kind === 'smug') {
    ctx.lineWidth = 2.1;
    ctx.strokeStyle = ink;
    ctx.beginPath();
    ctx.moveTo(-3.1, -1.1);
    ctx.lineTo(3.1, -1.9);
    ctx.stroke();
  }
}

function drawMouth(ctx: CanvasRenderingContext2D, kind: Posture['mouth']): void {
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = 'rgba(253,253,251,0.95)';
  ctx.beginPath();
  switch (kind) {
    case 'grin':
      ctx.arc(0, -1, 3.4, 0.2, Math.PI - 0.2);
      break;
    case 'grit':
      ctx.moveTo(-3, 0);
      ctx.lineTo(3, 0);
      break;
    case 'flat':
      ctx.moveTo(-2, 0);
      ctx.lineTo(2, 0);
      break;
    default:
      ctx.moveTo(-2.6, -0.6);
      ctx.quadraticCurveTo(0, 1.9, 3, -1.4);
  }
  ctx.stroke();
}

/** The bazooka: a single thick stroke whose angle is literally the aim. */
function drawBarrel(ctx: CanvasRenderingContext2D, aim: number, facing: 1 | -1, ink: string): void {
  const radians = (aim * Math.PI) / 180;
  const tipX = Math.cos(radians) * 15 * facing;
  const tipY = -Math.sin(radians) * 15;
  roughSegment(ctx, 0, 0, tipX, tipY, 5.6, HALO, 1);
  roughSegment(ctx, 0, 0, tipX, tipY, 3.4, ink, 1);
}

function drawHealthBar(ctx: CanvasRenderingContext2D, hp: number, ink: string): void {
  const width = 17;
  const height = 2.6;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(-width / 2 - 0.8, -0.8, width + 1.6, height + 1.6);
  ctx.fillStyle = 'rgba(20,24,26,0.2)';
  ctx.fillRect(-width / 2, 0, width, height);
  ctx.fillStyle = ink;
  ctx.fillRect(-width / 2, 0, width * Math.max(0, hp / MAX_HP), height);
}

/** The power gauge, drawn only under the worm you are actually holding the key for. */
function drawChargeGauge(ctx: CanvasRenderingContext2D, charge: number, ink: string): void {
  const width = 21;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(-width / 2 - 0.8, -0.8, width + 1.6, 4.2);
  ctx.fillStyle = 'rgba(20,24,26,0.18)';
  ctx.fillRect(-width / 2, 0, width, 2.6);
  ctx.fillStyle = ink;
  ctx.fillRect(-width / 2, 0, width * (charge / 100), 2.6);
}

export function drawWorm(
  ctx: CanvasRenderingContext2D,
  worm: WormView,
  ink: string,
  phase: number,
  isMe: boolean
): void {
  const posture = postureFor(poseAt(worm.p), worm.facing, worm.charge, phase);

  ctx.save();
  ctx.translate(worm.x, worm.y - posture.lift);
  ctx.rotate(posture.lean);
  ctx.scale(posture.scaleX, posture.scaleY);

  // Body: a fat bean standing on its base, jittered so it reads as ink.
  const halfWidth = WORM_HALF_W;
  const height = WORM_HEIGHT;
  ctx.beginPath();
  ctx.moveTo(-halfWidth + jitter(0.7), jitter(0.5));
  ctx.bezierCurveTo(
    -halfWidth - 1.6 + jitter(0.7), -height * 0.72,
    -halfWidth * 0.5 + jitter(0.7), -height - 1.5,
    0 + jitter(0.7), -height - 1.5
  );
  ctx.bezierCurveTo(
    halfWidth * 0.5 + jitter(0.7), -height - 1.5,
    halfWidth + 1.6 + jitter(0.7), -height * 0.72,
    halfWidth + jitter(0.7), jitter(0.5)
  );
  ctx.closePath();
  ctx.fillStyle = ink;
  ctx.fill();
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = HALO;
  ctx.stroke();

  ctx.save();
  ctx.translate(worm.facing * 2.4, -height * 0.68);
  ctx.scale(worm.facing, 1);
  drawEye(ctx, posture.eye, ink);
  ctx.restore();

  ctx.save();
  ctx.translate(worm.facing * 2.2, -height * 0.34);
  ctx.scale(worm.facing, 1);
  drawMouth(ctx, posture.mouth);
  ctx.restore();

  ctx.restore();

  if (worm.d === undefined) {
    ctx.save();
    ctx.translate(worm.x, worm.y - WORM_HEIGHT * 0.55 - posture.lift);
    drawBarrel(ctx, worm.aim, worm.facing, ink);
    ctx.restore();

    ctx.save();
    ctx.translate(worm.x, worm.y - WORM_HEIGHT - 11 - posture.lift);
    drawHealthBar(ctx, worm.hp, ink);
    ctx.restore();
  }

  if (isMe && worm.charge > 0) {
    ctx.save();
    ctx.translate(worm.x, worm.y + 5);
    drawChargeGauge(ctx, worm.charge, ink);
    ctx.restore();
  }
}

/** Points at something outside the camera, so a small window never hides the match. */
export function drawEdgeMarker(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  angle: number,
  color: string,
  strength: number
): void {
  ctx.save();
  ctx.translate(screenX, screenY);
  ctx.rotate(angle);
  ctx.globalAlpha = 0.25 + strength * 0.6;
  ctx.beginPath();
  ctx.moveTo(5.5, 0);
  ctx.lineTo(-3.5, 3.6);
  ctx.lineTo(-3.5, -3.6);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = HALO;
  ctx.stroke();
  ctx.restore();
}
