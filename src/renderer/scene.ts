import { GOAL_LINE_LEFT, GOAL_LINE_RIGHT, GOAL_MARGIN, LOGICAL_HEIGHT, WORLD_WIDTH } from './field.js';
import { beginSketchFrame, drawBackgroundDots, drawBall, drawGoal, drawPitch, drawPlayer } from './draw.js';
import type { ViewState } from './game.js';

/** Width of the camera's visible slice of the wide world — not the field itself. */
export const VIEW_WIDTH = 320;

const DOT_SPACING = 28;
const CAMERA_LERP = 0.12;
/** The camera leads with the ball but keeps enough weight on you to stay in shot. */
const BALL_WEIGHT = 0.65;

export const INK = '#14181a';
export const OPPONENT_INK = '#7a5433';

export interface Viewport {
  /** CSS pixel size of the canvas. */
  width: number;
  height: number;
  pixelRatio: number;
}

/** Where the camera wants to be for this frame, clamped to the pitch. */
export function cameraTarget(view: ViewState): number {
  const focus = view.ball.x * BALL_WEIGHT + view.local.x * (1 - BALL_WEIGHT);
  return Math.max(0, Math.min(WORLD_WIDTH - VIEW_WIDTH, focus - VIEW_WIDTH / 2));
}

export function followCamera(current: number, view: ViewState): number {
  const target = cameraTarget(view);
  return current + (target - current) * CAMERA_LERP;
}

/** Maps the camera viewport onto the real window, letterboxed rather than stretched. */
function fieldTransform(viewport: Viewport): { scale: number; offsetX: number; offsetY: number } {
  const scale = Math.min(viewport.width / VIEW_WIDTH, viewport.height / LOGICAL_HEIGHT);
  return {
    scale,
    offsetX: (viewport.width - VIEW_WIDTH * scale) / 2,
    offsetY: (viewport.height - LOGICAL_HEIGHT * scale) / 2
  };
}

/** Draws one complete frame of the match, clearing whatever was there before. */
export function renderScene(
  ctx: CanvasRenderingContext2D,
  view: ViewState,
  cameraX: number,
  viewport: Viewport
): void {
  ctx.setTransform(viewport.pixelRatio, 0, 0, viewport.pixelRatio, 0, 0);
  ctx.clearRect(0, 0, viewport.width, viewport.height);

  const { scale, offsetX, offsetY } = fieldTransform(viewport);
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  ctx.translate(-cameraX, 0);

  beginSketchFrame();
  drawBackgroundDots(ctx, cameraX, VIEW_WIDTH, DOT_SPACING, 'rgba(20,24,26,0.16)');
  drawPitch(ctx, cameraX, VIEW_WIDTH, 'rgba(20,24,26,0.4)');
  drawGoal(ctx, GOAL_LINE_LEFT, GOAL_MARGIN, INK);
  drawGoal(ctx, GOAL_LINE_RIGHT, WORLD_WIDTH - GOAL_MARGIN, INK);

  drawPlayer(ctx, { ...view.remote, color: OPPONENT_INK });
  drawPlayer(ctx, { ...view.local, color: INK });
  drawBall(ctx, view.ball.x, view.ball.y, view.ball.spin, INK);

  ctx.restore();
}
