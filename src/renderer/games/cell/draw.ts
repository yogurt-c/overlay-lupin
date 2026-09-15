import { jitter, roughSegment } from '../../lib/sketch.js';
import { ARENA_HEIGHT, ARENA_WIDTH, radiusFor } from './arena.js';
import type { Squash, Swallow } from './effects.js';

const HALO = 'rgba(255,255,255,0.85)';
const NAME_COLOR = 'rgba(255,255,255,0.92)';
/** Below this on-screen radius a name would overflow the blot, so it's skipped rather than clipped. */
const MIN_RADIUS_FOR_NAME = 14;
const NAME_MAX_CHARS = 8;

function truncateName(name: string): string {
  return name.length > NAME_MAX_CHARS ? `${name.slice(0, NAME_MAX_CHARS - 1)}…` : name;
}

/** A 2D grid of small dots fixed in arena space, so a panning camera reads as motion. */
export function drawArenaDots(
  ctx: CanvasRenderingContext2D,
  camX: number,
  camY: number,
  viewSize: number,
  spacing: number,
  color: string
): void {
  const startX = Math.floor(camX / spacing) * spacing;
  const startY = Math.floor(camY / spacing) * spacing;
  ctx.fillStyle = color;
  for (let x = startX; x < camX + viewSize + spacing; x += spacing) {
    for (let y = startY; y < camY + viewSize + spacing; y += spacing) {
      ctx.beginPath();
      ctx.arc(x, y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** The arena's edge, so drifting toward it reads as a wall rather than empty space. */
export function drawArenaBounds(ctx: CanvasRenderingContext2D, color: string): void {
  roughSegment(ctx, 0, 0, ARENA_WIDTH, 0, 1.4, color, 1);
  roughSegment(ctx, ARENA_WIDTH, 0, ARENA_WIDTH, ARENA_HEIGHT, 1.4, color, 1);
  roughSegment(ctx, ARENA_WIDTH, ARENA_HEIGHT, 0, ARENA_HEIGHT, 1.4, color, 1);
  roughSegment(ctx, 0, ARENA_HEIGHT, 0, 0, 1.4, color, 1);
}

/** A tiny wobbly ink dot — the food a cell grows by passing over. `radius` lets a rare big pellet stand out. */
export function drawFoodDot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, radius = 2.4): void {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

const VIRUS_FILL = 'rgba(90,140,60,0.55)';
const VIRUS_OUTLINE = 'rgba(60,100,40,0.9)';

/** A spiky hazard blot — deliberately reads as dangerous, unlike the smooth food dots and cell blots. */
export function drawVirus(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.save();
  ctx.translate(x, y);

  ctx.beginPath();
  const spikes = 10;
  for (let i = 0; i <= spikes * 2; i++) {
    const angle = (i / (spikes * 2)) * Math.PI * 2;
    const rr = (i % 2 === 0 ? radius : radius * 0.6) + jitter(radius * 0.08);
    const px = Math.cos(angle) * rr;
    const py = Math.sin(angle) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = VIRUS_FILL;
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = VIRUS_OUTLINE;
  ctx.stroke();

  ctx.restore();
}

/**
 * Traces one blob's rim: a plain circle, plus however hard it's currently squashed. Deliberately no idle
 * jitter here — with a shared jitter generator that only re-rolls a few times a second (see `sketch.ts`), and
 * a cast of blobs whose count keeps changing (splits, merges, bots), each cell's slice of that shared random
 * stream shifts around from one re-roll to the next, reading as an idle shimmer rather than a steady shape.
 * A plain circle stays visually still except when something (a squash) actually happens to it.
 */
function traceBlob(
  ctx: CanvasRenderingContext2D,
  radius: number,
  squash: Squash | undefined
): void {
  ctx.beginPath();
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let rr = radius;
    if (squash) {
      // Flatten along whatever it ran into and bulge out the sides, so the volume reads as pushed around
      // rather than shrunk.
      const along = dx * squash.nx + dy * squash.ny;
      rr *= 1 - squash.amount * (0.55 * along * along - 0.3 * (1 - along * along));
    }
    if (i === 0) ctx.moveTo(dx * rr, dy * rr);
    else ctx.lineTo(dx * rr, dy * rr);
  }
  ctx.closePath();
}

/** A cell: a plain, still circle. `name` is whose cell this is — not who's a bot. */
export function drawCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  opts: { name?: string } = {}
): void {
  const { name } = opts;
  ctx.save();
  ctx.translate(x, y);

  traceBlob(ctx, radius, undefined);
  ctx.globalAlpha = 0.82;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = HALO;
  ctx.stroke();

  if (name && radius >= MIN_RADIUS_FOR_NAME) {
    ctx.font = `${Math.max(9, Math.min(13, radius * 0.42))}px Menlo, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = NAME_COLOR;
    ctx.fillText(truncateName(name), 0, 0);
  }

  ctx.restore();
}

/**
 * A blob part-way through being swallowed by another: it slides into the one absorbing it while stretching
 * along the way in and shrinking out of sight, so a merge reads as being sucked in rather than blinking out.
 */
export function drawSwallow(ctx: CanvasRenderingContext2D, s: Swallow): void {
  // Ease out, so most of the travel happens early and the tail end lingers as it disappears.
  const t = 1 - (1 - s.progress) * (1 - s.progress);
  const x = s.x + (s.toX - s.x) * t;
  const y = s.y + (s.toY - s.y) * t;
  const dx = s.toX - s.x;
  const dy = s.toY - s.y;
  const dist = Math.hypot(dx, dy);

  ctx.save();
  ctx.translate(x, y);
  // Stretched along the direction it's being pulled in — the same axis as a squash, but negative amount, so
  // `traceBlob` bulges where it would otherwise flatten.
  const squash: Squash | undefined =
    dist < 0.001 ? undefined : { nx: dx / dist, ny: dy / dist, amount: -0.35 * (1 - t) };
  traceBlob(ctx, radiusFor(s.mass) * (1 - t * 0.85), squash);
  ctx.globalAlpha = 0.82 * (1 - t);
  ctx.fillStyle = s.color;
  ctx.fill();
  ctx.restore();
}
