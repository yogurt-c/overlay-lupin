import { LOGICAL_HEIGHT } from '../../lib/ballsport/field.js';
import { drawBackgroundDots, drawPlayer } from '../../lib/ballsport/draw.js';
import { INK, OPPONENT_INK, VIEW_WIDTH } from '../../lib/ballsport/scene.js';
import { beginSketchFrame } from '../../lib/sketch.js';
import { drawDojo, drawFx, drawSwingArc } from './draw.js';
import { limbsFor } from './poses.js';
import { DOJO_X } from './field.js';
import type { FenceView } from './engine.js';
import type { Viewport } from '../types.js';

const DOT_SPACING = 28;
/** The dojo is narrower than the camera, so there is nothing to follow — it just sits centred. */
const CAMERA_X = DOJO_X - VIEW_WIDTH / 2;

function fieldTransform(viewport: Viewport): { scale: number; offsetX: number; offsetY: number } {
  const scale = Math.min(viewport.width / VIEW_WIDTH, viewport.height / LOGICAL_HEIGHT);
  return {
    scale,
    offsetX: (viewport.width - VIEW_WIDTH * scale) / 2,
    offsetY: (viewport.height - LOGICAL_HEIGHT * scale) / 2
  };
}

export function renderFenceScene(ctx: CanvasRenderingContext2D, view: FenceView, viewport: Viewport): void {
  ctx.setTransform(viewport.pixelRatio, 0, 0, viewport.pixelRatio, 0, 0);
  ctx.clearRect(0, 0, viewport.width, viewport.height);

  const { scale, offsetX, offsetY } = fieldTransform(viewport);
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  ctx.translate(-CAMERA_X, 0);

  beginSketchFrame();
  drawBackgroundDots(ctx, CAMERA_X, VIEW_WIDTH, DOT_SPACING, 'rgba(20,24,26,0.16)');
  drawDojo(ctx, DOJO_X, 'rgba(20,24,26,0.4)');

  // Trails go under both figures so a blade never draws over its own swoosh.
  drawSwingArc(ctx, view.remote.x, view.remote.y, view.remote.facing, view.remote.pose, OPPONENT_INK);
  drawSwingArc(ctx, view.local.x, view.local.y, view.local.facing, view.local.pose, INK);

  drawPlayer(ctx, { ...view.remote, color: OPPONENT_INK }, limbsFor);
  drawPlayer(ctx, { ...view.local, color: INK }, limbsFor);
  drawFx(ctx, view.fx, INK);

  ctx.restore();
}
