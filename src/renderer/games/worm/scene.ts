import { beginSketchFrame } from '../../lib/sketch.js';
import { SHIELD_FRAMES, VIEW_HEIGHT, VIEW_WIDTH, WORLD_HEIGHT, WORLD_WIDTH } from './arena.js';
import { itemAt } from './items.js';
import { weaponAt } from './weapons.js';
import { drawBurst, drawEdgeMarker, drawItem, drawShell, drawShieldRing, drawTerrain, drawWorm } from './draw.js';
import type { Terrain } from './terrain.js';
import type { Viewport } from '../types.js';
import { decodeItems, decodeShells } from './types.js';
import type { WormWorld } from './types.js';

export const INK = '#14181a';

/** Muted inks for everyone who isn't me, hashed from their id so a colour never swaps mid-match. */
const OTHER_INKS = ['#7a5433', '#55525f', '#3f5b63', '#6b4f3f', '#4f5a3d'];

/**
 * The camera leans toward my own shell so I can watch where it lands, but
 * keeps most of its weight on me — this is a real-time brawl, and drifting off
 * my own worm to admire a shot is how you get hit.
 */
const SHELL_WEIGHT = 0.3;
const CAMERA_LERP = 0.16;

/** How long a crater's burst animation plays, in frames. */
export const BURST_FRAMES = 16;

export interface Burst {
  x: number;
  y: number;
  r: number;
  age: number;
}

export function colorFor(id: string, myId: string): string {
  if (id === myId) return INK;
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return OTHER_INKS[hash % OTHER_INKS.length];
}

/** Where the camera wants to sit this frame, clamped so it never runs past the world. */
export function cameraTarget(
  me: { x: number; y: number } | undefined,
  myShell: { x: number; y: number } | undefined
): { camX: number; camY: number } {
  const anchor = me ?? { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
  const weight = me && myShell ? SHELL_WEIGHT : 0;
  const focusX = anchor.x * (1 - weight) + (myShell?.x ?? anchor.x) * weight;
  const focusY = anchor.y * (1 - weight) + (myShell?.y ?? anchor.y) * weight;

  return {
    camX: Math.max(0, Math.min(WORLD_WIDTH - VIEW_WIDTH, focusX - VIEW_WIDTH / 2)),
    camY: Math.max(0, Math.min(WORLD_HEIGHT - VIEW_HEIGHT, focusY - VIEW_HEIGHT / 2))
  };
}

export function followCamera(
  current: { camX: number; camY: number },
  target: { camX: number; camY: number }
): { camX: number; camY: number } {
  return {
    camX: current.camX + (target.camX - current.camX) * CAMERA_LERP,
    camY: current.camY + (target.camY - current.camY) * CAMERA_LERP
  };
}

/** Maps the camera slice onto the window, letterboxed rather than stretched — window size never widens the view. */
function fieldTransform(viewport: Viewport): { scale: number; offsetX: number; offsetY: number } {
  const scale = Math.min(viewport.width / VIEW_WIDTH, viewport.height / VIEW_HEIGHT);
  return {
    scale,
    offsetX: (viewport.width - VIEW_WIDTH * scale) / 2,
    offsetY: (viewport.height - VIEW_HEIGHT * scale) / 2
  };
}

/**
 * Anything worth tracking that sits outside the camera gets pinned to the
 * nearest edge. Without this a 240x170 window would simply lose the match.
 */
function drawOffscreenMarkers(
  ctx: CanvasRenderingContext2D,
  world: WormWorld,
  myId: string,
  camX: number,
  camY: number
): void {
  const centreX = camX + VIEW_WIDTH / 2;
  const centreY = camY + VIEW_HEIGHT / 2;
  const insetX = VIEW_WIDTH / 2 - 9;
  const insetY = VIEW_HEIGHT / 2 - 9;

  const targets: { x: number; y: number; color: string }[] = [];
  for (const worm of world.worms) {
    if (worm.id === myId || worm.d !== undefined) continue;
    targets.push({ x: worm.x, y: worm.y, color: colorFor(worm.id, myId) });
  }
  for (const shell of decodeShells(world.shells)) targets.push({ x: shell.x, y: shell.y, color: INK });

  for (const target of targets) {
    const dx = target.x - centreX;
    const dy = target.y - centreY;
    if (Math.abs(dx) <= insetX && Math.abs(dy) <= insetY) continue;

    // Push the direction vector out to whichever edge it crosses first.
    const scale = Math.min(insetX / Math.max(1e-6, Math.abs(dx)), insetY / Math.max(1e-6, Math.abs(dy)));
    const distance = Math.hypot(dx, dy);
    drawEdgeMarker(
      ctx,
      centreX + dx * scale,
      centreY + dy * scale,
      Math.atan2(dy, dx),
      target.color,
      Math.max(0, 1 - distance / (VIEW_WIDTH * 1.6))
    );
  }
}

/** Draws one complete frame of the match, clearing whatever was there before. */
export function renderWormScene(
  ctx: CanvasRenderingContext2D,
  world: WormWorld,
  terrain: Terrain,
  bursts: Burst[],
  myId: string,
  camera: { camX: number; camY: number },
  viewport: Viewport,
  phase: number
): void {
  ctx.setTransform(viewport.pixelRatio, 0, 0, viewport.pixelRatio, 0, 0);
  ctx.clearRect(0, 0, viewport.width, viewport.height);

  const { scale, offsetX, offsetY } = fieldTransform(viewport);
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  ctx.translate(-camera.camX, -camera.camY);

  beginSketchFrame();
  drawTerrain(ctx, terrain, camera.camX, VIEW_WIDTH, INK);

  for (const burst of bursts) {
    drawBurst(ctx, burst.x, burst.y, burst.r, Math.min(1, burst.age / BURST_FRAMES));
  }

  for (const item of decodeItems(world.items)) drawItem(ctx, itemAt(item.k), item.x, item.y, phase);

  // Dead worms first, so a corpse never hides a live one about to shoot.
  const ordered = [...world.worms].sort((a, b) => Number(a.d === undefined) - Number(b.d === undefined));
  for (const worm of ordered) {
    drawWorm(ctx, worm, colorFor(worm.id, myId), phase, worm.id === myId);
    if (worm.d === undefined && worm.s) drawShieldRing(ctx, worm.x, worm.y, worm.s, SHIELD_FRAMES, phase);
  }

  for (const shell of decodeShells(world.shells)) {
    drawShell(ctx, shell.x, shell.y, weaponAt(shell.w).drawRadius, INK);
  }

  drawOffscreenMarkers(ctx, world, myId, camera.camX, camera.camY);

  ctx.restore();
}
