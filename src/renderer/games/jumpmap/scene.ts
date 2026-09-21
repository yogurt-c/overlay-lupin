import { beginSketchFrame } from '../../lib/sketch.js';
import { movingPlatformX, PLATFORMS, VIEW_HEIGHT, VIEW_WIDTH, WORLD_HEIGHT, WORLD_TOP, WORLD_WIDTH, ZONE_STYLE, zoneAt } from './field.js';
import { drawBackgroundDots, drawCourseDecor, drawGoal, drawLandingEffect, drawLaunchCue, drawPlatform, drawRunner, drawSign, drawTravelRail } from './draw.js';
import type { JumpmapWorld } from './types.js';
import type { Viewport } from '../types.js';

export const INK = '#181818';

/** Muted inks for everyone who isn't me, hashed from their id so a colour never swaps mid-race. */
const OTHER_INKS = ['#505050', '#606060', '#707070', '#585858', '#686868'];

const CAMERA_LERP = 0.18;

export interface Camera {
  camX: number;
  camY: number;
}

export function colorFor(id: string, myId: string): string {
  if (id === myId) return INK;
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return OTHER_INKS[hash % OTHER_INKS.length];
}

/** Where the camera wants to sit, clamped so it never scrolls past either edge of the course. */
export function cameraTarget(me: { x: number; y: number } | undefined): Camera {
  const anchor = me ?? { x: WORLD_WIDTH / 2, y: (WORLD_TOP + WORLD_HEIGHT) / 2 };
  return {
    camX: Math.max(0, Math.min(WORLD_WIDTH - VIEW_WIDTH, anchor.x - VIEW_WIDTH / 2)),
    camY: Math.max(WORLD_TOP, Math.min(WORLD_HEIGHT - VIEW_HEIGHT, anchor.y - VIEW_HEIGHT / 2))
  };
}

export function followCamera(current: Camera, target: Camera): Camera {
  return {
    camX: current.camX + (target.camX - current.camX) * CAMERA_LERP,
    camY: current.camY + (target.camY - current.camY) * CAMERA_LERP
  };
}

/** Maps the fixed logical course onto the window, letterboxed rather than stretched. */
function fieldTransform(viewport: Viewport): { scale: number; offsetX: number; offsetY: number } {
  const scale = Math.min(viewport.width / VIEW_WIDTH, viewport.height / VIEW_HEIGHT);
  return {
    scale,
    offsetX: (viewport.width - VIEW_WIDTH * scale) / 2,
    offsetY: (viewport.height - VIEW_HEIGHT * scale) / 2
  };
}

/** Draws one complete frame of the race, clearing whatever was there before. */
export function renderJumpmapScene(
  ctx: CanvasRenderingContext2D,
  world: JumpmapWorld,
  myId: string,
  camera: Camera,
  viewport: Viewport,
  anim: number
): void {
  ctx.setTransform(viewport.pixelRatio, 0, 0, viewport.pixelRatio, 0, 0);
  ctx.clearRect(0, 0, viewport.width, viewport.height);

  const { scale, offsetX, offsetY } = fieldTransform(viewport);
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.rect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  ctx.clip();
  ctx.translate(-camera.camX, -camera.camY);

  beginSketchFrame();
  ctx.save();
  ctx.globalAlpha = 0.18;
  drawBackgroundDots(ctx, camera.camX, camera.camY, VIEW_WIDTH, VIEW_HEIGHT, 28, ZONE_STYLE[zoneAt(camera.camY + VIEW_HEIGHT / 2)].ink);
  ctx.restore();
  drawCourseDecor(ctx, camera.camX, camera.camY, VIEW_WIDTH, VIEW_HEIGHT);

  for (const spec of PLATFORMS) {
    if (spec.y < camera.camY - 60 || spec.y > camera.camY + VIEW_HEIGHT + 90) continue;
    const x = movingPlatformX(spec, world.tick);
    drawTravelRail(ctx, spec);
    if (spec.launchTargetId) {
      const target = PLATFORMS.find((p) => p.id === spec.launchTargetId);
      if (target) drawLaunchCue(ctx, spec, target);
    }
    const impactAge = world.players.reduce((age, player) => player.impact?.platformId === spec.id
      ? Math.min(age, world.tick - player.impact.tick) : age, Infinity);
    if (spec.kind === 'goal') drawGoal(ctx, x, spec.y, spec.w, INK);
    else drawPlatform(ctx, spec.kind, x, spec.y, spec.w, INK, impactAge);
    if (spec.label) drawSign(ctx, x + spec.w / 2, spec.y + 36, spec.label);
  }

  // Finished runners stand still at the goal — drawing them first keeps an
  // incoming jumper from being hidden behind someone already celebrating.
  const ordered = [...world.players].sort((a, b) => Number(a.finish !== undefined) - Number(b.finish !== undefined));
  for (const player of ordered) {
    drawRunner(ctx, player, colorFor(player.id, myId), anim);
    if (player.impact) {
      const spec = PLATFORMS.find((p) => p.id === player.impact?.platformId);
      if (spec) drawLandingEffect(ctx, player.impact.x, spec.y, world.tick - player.impact.tick, spec.kind === 'goal');
    }
  }

  ctx.restore();
}
