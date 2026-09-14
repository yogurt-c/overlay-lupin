import { beginSketchFrame } from '../../lib/sketch.js';
import { drawArenaBounds, drawArenaDots, drawCell, drawFoodDot, drawVirus } from './draw.js';
import { ARENA_HEIGHT, ARENA_WIDTH, VIEW_SIZE, VIRUS_RADIUS, radiusFor } from './arena.js';
import type { Viewport } from '../types.js';
import type { CellWorld } from './types.js';

const DOT_SPACING = 26;
export const INK = '#14181a';

const BIG_FOOD_COLOR = 'rgba(196,90,40,0.6)';
const BIG_FOOD_RADIUS = 6;

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

/** Mass-weighted center of all of "me"'s cells, so the camera tracks somewhere sane right after a split. */
function myCenter(cells: { x: number; y: number; mass: number }[]): { x: number; y: number } {
  const totalMass = cells.reduce((sum, c) => sum + c.mass, 0);
  if (totalMass <= 0) return { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 };
  return {
    x: cells.reduce((sum, c) => sum + c.x * c.mass, 0) / totalMass,
    y: cells.reduce((sum, c) => sum + c.y * c.mass, 0) / totalMass
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
  const center = myCenter(me?.cells ?? []);
  const { camX, camY } = cameraFor(center.x, center.y);
  const { scale, offsetX, offsetY } = fieldTransform(viewport);

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  ctx.translate(-camX, -camY);

  beginSketchFrame();
  drawArenaDots(ctx, camX, camY, VIEW_SIZE, DOT_SPACING, 'rgba(20,24,26,0.14)');
  drawArenaBounds(ctx, 'rgba(20,24,26,0.3)');

  for (const dot of world.food) {
    if (dot.big) drawFoodDot(ctx, dot.x, dot.y, BIG_FOOD_COLOR, BIG_FOOD_RADIUS);
    else drawFoodDot(ctx, dot.x, dot.y, 'rgba(20,24,26,0.4)');
  }

  for (const virus of world.viruses) drawVirus(ctx, virus.x, virus.y, VIRUS_RADIUS);

  // Flatten every alive player's blobs into one list, smallest-first, so a big cell never hides one it's about to pass.
  const blobs = world.players
    .filter((p) => p.alive)
    .flatMap((p) => p.cells.map((c) => ({ ...c, color: colorFor(p.id, myId), name: p.name })))
    .sort((a, b) => a.mass - b.mass);
  for (const b of blobs) drawCell(ctx, b.x, b.y, radiusFor(b.mass), b.color, b.name);

  ctx.restore();
}
