import { beginSketchFrame, roughStroke } from '../../lib/sketch.js';
import { drawAnimal, INK } from './characters.js';
import { ANIMAL_NAMES, BOX_BOTTOM, BOX_LEFT, BOX_RIGHT, BOX_TOP, DANGER_Y, DROP_Y, RADII } from './types.js';
import type { MergeWorld } from './types.js';
import type { Viewport } from '../types.js';

const HALO = 'rgba(255,255,255,0.94)', ALARM = '#9a4a3f', GUIDE = '#7a827c';
/** Merged animals pop in from this fraction of their size. */
const POP_FROM = 0.6, POP_TICKS = 8;

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size = 9, ink = INK): void {
  ctx.font = `${size}px Menlo, Consolas, monospace`;
  ctx.textAlign = 'center'; ctx.lineJoin = 'round';
  ctx.lineWidth = 3; ctx.strokeStyle = HALO; ctx.strokeText(value, x, y);
  ctx.fillStyle = ink; ctx.fillText(value, x, y);
}

export function renderMerge(ctx: CanvasRenderingContext2D, world: MergeWorld, viewport: Viewport, best: number): void {
  ctx.setTransform(viewport.pixelRatio, 0, 0, viewport.pixelRatio, 0, 0);
  ctx.clearRect(0, 0, viewport.width, viewport.height);
  const unit = Math.min(viewport.width / 320, viewport.height / 280);
  ctx.save();
  ctx.translate((viewport.width - 320 * unit) / 2, (viewport.height - 280 * unit) / 2);
  ctx.scale(unit, unit);
  beginSketchFrame();

  // A faint paper floor keeps the pile readable over any desktop.
  ctx.fillStyle = 'rgba(255,253,248,0.55)';
  ctx.fillRect(BOX_LEFT, BOX_TOP, BOX_RIGHT - BOX_LEFT, BOX_BOTTOM - BOX_TOP);

  const warn = world.danger > 0;
  ctx.save();
  ctx.setLineDash([4, 5]);
  ctx.globalAlpha = warn ? 0.5 + 0.5 * Math.abs(Math.sin(world.tick / 6)) : 0.45;
  ctx.strokeStyle = warn ? ALARM : GUIDE; ctx.lineWidth = warn ? 1.4 : 1;
  ctx.beginPath(); ctx.moveTo(BOX_LEFT, DANGER_Y); ctx.lineTo(BOX_RIGHT, DANGER_Y); ctx.stroke();
  ctx.restore();

  for (const [kind, x, y, angle, age] of world.balls) {
    const pop = age < POP_TICKS ? POP_FROM + (1 - POP_FROM) * age / POP_TICKS : 1;
    drawAnimal(ctx, kind, x, y, RADII[kind] * pop, angle);
  }

  roughStroke(ctx, BOX_LEFT, BOX_TOP, BOX_LEFT, BOX_BOTTOM, 2.2, INK, HALO);
  roughStroke(ctx, BOX_RIGHT, BOX_TOP, BOX_RIGHT, BOX_BOTTOM, 2.2, INK, HALO);
  roughStroke(ctx, BOX_LEFT, BOX_BOTTOM, BOX_RIGHT, BOX_BOTTOM, 2.4, INK, HALO);

  if (world.phase === 'aim') {
    const r = RADII[world.kind];
    ctx.save();
    ctx.globalAlpha = 0.4; ctx.setLineDash([3, 5]); ctx.strokeStyle = GUIDE; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(world.x, DROP_Y + r + 3); ctx.lineTo(world.x, BOX_BOTTOM - 2); ctx.stroke();
    ctx.restore();
    drawAnimal(ctx, world.kind, world.x, DROP_Y, r);
  }

  text(ctx, '점수', 35, 44, 8);
  text(ctx, world.score.toLocaleString(), 35, 58, 11);
  text(ctx, `최고 ${Math.max(best, world.score).toLocaleString()}`, 35, 74, 8);
  text(ctx, '다음', 285, 44, 8);
  drawAnimal(ctx, world.next, 285, 72, Math.min(RADII[world.next], 16));
  text(ctx, ANIMAL_NAMES[world.next], 285, 100, 8);
  text(ctx, '← → 이동 · Space 떨어뜨리기', 160, 276, 8);
  ctx.restore();
}
