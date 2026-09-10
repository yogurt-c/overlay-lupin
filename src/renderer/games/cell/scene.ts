import { beginSketchFrame } from '../../lib/sketch.js';
import { drawArenaBounds, drawArenaDots, drawCell, drawFoodDot } from './draw.js';
import { ARENA_HEIGHT, ARENA_WIDTH, VIEW_SIZE, radiusFor } from './arena.js';
import type { Viewport } from '../types.js';
import type { CellWorld } from './types.js';

const DOT_SPACING = 26;
export const INK = '#14181a';

/** A small, muted palette for anyone who isn't me — hashed from their id so it stays stable across ticks. */
const OTHER_COLORS = ['#6b5a45', '#55525f', '#6b4f3f', '#445157', '#5a5f43'];

function colorFor(id: string, myId: string): string {
  if (id === myId) return INK;
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return OTHER_COLORS[hash % OTHER_COLORS.length];
}

/** Centers the camera on (x, y), clamped so the view never runs past the arena edge. */
export function cameraFor(x: number, y: number): { camX: number; camY: number } {
  return {
    camX: Math.max(0, Math.min(ARENA_WIDTH - VIEW_SIZE, x - VIEW_SIZE / 2)),
    camY: Math.max(0, Math.min(ARENA_HEIGHT - VIEW_SIZE, y - VIEW_SIZE / 2))
  };
}

function fieldTransform(viewport: Viewport): { scale: number; offsetX: number; offsetY: number } {
  const scale = Math.min(viewport.width / VIEW_SIZE, viewport.height / VIEW_SIZE);
  return {
    scale,
    offsetX: (viewport.width - VIEW_SIZE * scale) / 2,
    offsetY: (viewport.height - VIEW_SIZE * scale) / 2
  };
}

export function renderCellScene(
  ctx: CanvasRenderingContext2D,
  world: CellWorld,
  myId: string,
  viewport: Viewport
): void {
  ctx.setTransform(viewport.pixelRatio, 0, 0, viewport.pixelRatio, 0, 0);
  ctx.clearRect(0, 0, viewport.width, viewport.height);

  const me = world.players.find((p) => p.id === myId);
  const { camX, camY } = cameraFor(me?.x ?? ARENA_WIDTH / 2, me?.y ?? ARENA_HEIGHT / 2);
  const { scale, offsetX, offsetY } = fieldTransform(viewport);

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  ctx.translate(-camX, -camY);

  beginSketchFrame();
  drawArenaDots(ctx, camX, camY, VIEW_SIZE, DOT_SPACING, 'rgba(20,24,26,0.14)');
  drawArenaBounds(ctx, 'rgba(20,24,26,0.3)');

  for (const dot of world.food) drawFoodDot(ctx, dot.x, dot.y, 'rgba(20,24,26,0.4)');

  // Draw smallest-first so a big cell never hides one it's about to pass.
  const alive = world.players.filter((p) => p.alive).sort((a, b) => a.mass - b.mass);
  for (const p of alive) drawCell(ctx, p.x, p.y, radiusFor(p.mass), colorFor(p.id, myId));

  ctx.restore();
}
