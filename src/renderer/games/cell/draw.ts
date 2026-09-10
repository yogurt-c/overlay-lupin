import { jitter, roughSegment } from '../../lib/sketch.js';
import { ARENA_HEIGHT, ARENA_WIDTH } from './arena.js';

const HALO = 'rgba(255,255,255,0.85)';

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

/** A tiny wobbly ink dot — the food a cell grows by passing over. */
export function drawFoodDot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.beginPath();
  ctx.arc(x, y, 2.4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

/** A cell: a wobbly ink blot, same hand-drawn technique as the soccer ball. */
export function drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);

  ctx.beginPath();
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const rr = radius + jitter(radius * 0.1);
    const px = Math.cos(angle) * rr;
    const py = Math.sin(angle) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.globalAlpha = 0.82;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = HALO;
  ctx.stroke();

  ctx.restore();
}
