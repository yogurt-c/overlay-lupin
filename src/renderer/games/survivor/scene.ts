/**
 * Camera, field and the on-canvas chrome for 뱀서.
 *
 * The level-up cards are drawn here rather than in the shell's HUD because
 * they need the canvas: three boxes a player reads and answers in a second,
 * without the eye leaving the field.
 */

import { beginSketchFrame } from '../../lib/sketch.js';
import { TICKS_PER_SECOND, VIEW_SCALE, WORLD_H, WORLD_W } from './arena.js';
import { drawChest, drawEnemy, drawGem, drawItem, drawPlayer, drawPool, drawShot, drawStrike } from './draw.js';
import type { SurvivorWorld } from './types.js';
import type { Viewport } from '../types.js';

const INK = '#14181a';
const PAPER = '#fbfaf7';
const RED = '#ff4a2b';
const FONT = '"Apple SD Gothic Neo", sans-serif';

export interface Camera { x: number; y: number; }

/** Eases the camera toward the midpoint of everyone still standing. */
export function followCamera(camera: Camera, world: SurvivorWorld, meId: string, snap: boolean): void {
  const alive = world.players.filter((p) => p.alive);
  const crowd = alive.length > 0 ? alive : world.players;
  const me = crowd.find((p) => p.id === meId);
  const focus = me ?? crowd[0];
  if (!focus) return;

  // Follow the local figure, but drift toward the group so partners stay on screen.
  const midX = crowd.reduce((sum, p) => sum + p.x, 0) / crowd.length;
  const midY = crowd.reduce((sum, p) => sum + p.y, 0) / crowd.length;
  const targetX = focus.x * 0.65 + midX * 0.35;
  const targetY = focus.y * 0.65 + midY * 0.35;

  if (snap) { camera.x = targetX; camera.y = targetY; return; }
  camera.x += (targetX - camera.x) * 0.12;
  camera.y += (targetY - camera.y) * 0.12;
}

export function renderScene(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  world: SurvivorWorld,
  camera: Camera,
  meId: string,
  phase: number,
  xpNeeded: number
): void {
  const { width, height } = viewport;
  // Reset the jitter generator so every frame inside one boil tick redraws the
  // same ink. Without this the strokes are re-rolled at 60Hz and the whole
  // field shimmers.
  beginSketchFrame();

  // The backing store is sized in device pixels, so every game sets this itself;
  // drawing in CSS pixels without it lands the field in a corner at Retina scale.
  ctx.setTransform(viewport.pixelRatio, 0, 0, viewport.pixelRatio, 0, 0);

  // The canvas stays transparent — this is an overlay, and whatever is behind it
  // (a spreadsheet, usually) is what makes the game invisible from across the desk.
  ctx.clearRect(0, 0, width, height);

  // Half the view in world units — the zoom is what makes these differ from pixels.
  const halfW = width / 2 / VIEW_SCALE;
  const halfH = height / 2 / VIEW_SCALE;
  const camX = clampCam(camera.x, halfW, WORLD_W);
  const camY = clampCam(camera.y, halfH, WORLD_H);

  ctx.save();
  ctx.translate(Math.round(width / 2), Math.round(height / 2));
  ctx.scale(VIEW_SCALE, VIEW_SCALE);
  ctx.translate(-camX, -camY);
  drawField(ctx);
  for (const pool of world.pools) drawPool(ctx, pool);
  for (const gem of world.gems) drawGem(ctx, gem);
  for (const chest of world.chests) drawChest(ctx, chest, phase);
  for (const item of world.items) drawItem(ctx, item, phase);
  for (const strike of world.strikes) drawStrike(ctx, strike);
  for (const enemy of world.enemies) drawEnemy(ctx, enemy, phase);
  for (const shot of world.shots) drawShot(ctx, shot);
  for (const player of world.players) drawPlayer(ctx, player, phase, player.id === meId);
  ctx.restore();

  drawXpBar(ctx, width, world, xpNeeded);
  if (world.phase === 'levelup') drawCards(ctx, width, height, world, meId);
}

const clampCam = (value: number, half: number, span: number): number =>
  span <= half * 2 ? span / 2 : Math.min(Math.max(value, half), span - half);

/**
 * Only the world edge is drawn. No grid of our own: the sheet behind the
 * overlay already supplies one, and painting a second grid over it is what
 * turns a transparent overlay into an obvious game window.
 */
function drawField(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(20,24,26,0.22)';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.strokeRect(0, 0, WORLD_W, WORLD_H);
  ctx.restore();
}

function drawXpBar(ctx: CanvasRenderingContext2D, width: number, world: SurvivorWorld, need: number): void {
  const h = 5;
  ctx.fillStyle = 'rgba(20,24,26,0.12)';
  ctx.fillRect(0, 0, width, h);
  const ratio = need > 0 ? Math.min(1, world.xp / need) : 0;
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, width * ratio, h);
}

function drawCards(ctx: CanvasRenderingContext2D, width: number, height: number, world: SurvivorWorld, meId: string): void {
  if (world.offers.length === 0) return;

  ctx.save();
  ctx.fillStyle = 'rgba(251,250,247,0.55)';
  ctx.fillRect(0, 0, width, height);

  const gap = 10;
  const cardW = Math.min(150, (width - gap * (world.offers.length + 1)) / world.offers.length);
  const cardH = 86;
  const totalW = cardW * world.offers.length + gap * (world.offers.length - 1);
  const x0 = (width - totalW) / 2;
  const y = height - cardH - 28;

  const mine = world.picks.find(([id]) => id === meId);
  const waiting = world.pendingIds.length;
  const total = world.players.filter((p) => p.alive).length;

  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  ctx.font = `800 15px ${FONT}`;
  ctx.fillText(mine ? '고름 · 기다리는 중' : '레벨 업', width / 2, y - 26);

  // Once you've chosen, the cards stop being a question — so the line under the
  // title switches from "pick one" to "who are we still waiting on".
  ctx.font = `600 11px ${FONT}`;
  if (mine && total > 1) {
    ctx.fillStyle = 'rgba(20,24,26,0.65)';
    ctx.fillText(`${total - waiting}/${total} 선택 완료`, width / 2, y - 10);
  } else if (world.pickDeadline > 0) {
    ctx.fillStyle = RED;
    ctx.fillText(`${Math.ceil(world.pickDeadline / TICKS_PER_SECOND)}초 뒤 자동 선택`, width / 2, y - 10);
  }

  world.offers.forEach((offer, i) => {
    const x = x0 + i * (cardW + gap);
    const chosen = mine?.[1] === i;
    const dimmed = mine !== undefined && !chosen;

    ctx.save();
    if (dimmed) ctx.globalAlpha = 0.35;
    ctx.fillStyle = PAPER;
    ctx.strokeStyle = chosen ? RED : INK;
    ctx.lineWidth = chosen ? 3.5 : 2;
    ctx.beginPath();
    ctx.roundRect(x, y, cardW, cardH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = RED;
    ctx.font = `700 11px ${FONT}`;
    ctx.fillText(`${i + 1}`, x + cardW / 2, y + 20);

    ctx.fillStyle = INK;
    ctx.font = `800 15px ${FONT}`;
    ctx.fillText(offer.label, x + cardW / 2, y + 45);

    ctx.fillStyle = 'rgba(20,24,26,0.6)';
    ctx.font = `400 11px ${FONT}`;
    ctx.fillText(offer.detail, x + cardW / 2, y + 66);

    if (chosen) {
      // A tick in the corner, so the choice reads even at a glance.
      ctx.strokeStyle = RED;
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x + cardW - 22, y + 13);
      ctx.lineTo(x + cardW - 16, y + 19);
      ctx.lineTo(x + cardW - 7, y + 7);
      ctx.stroke();
    }
    ctx.restore();
  });

  ctx.restore();
}
