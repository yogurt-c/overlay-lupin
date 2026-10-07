/**
 * Camera, field and the on-canvas chrome for 뱀서.
 *
 * The level-up cards are drawn here rather than in the shell's HUD because
 * they need the canvas: three boxes a player reads and answers in a second,
 * without the eye leaving the field.
 */

import { beginSketchFrame } from '../../lib/sketch.js';
import { TICKS_PER_SECOND, VIEW_SCALE, WORLD_H, WORLD_W, clockText } from './arena.js';
import { drawChest, drawEnemy, drawGem, drawItem, drawPlayer, drawPool, drawShot, drawStrike } from './draw.js';
import type { RunResult, SurvivorWorld } from './types.js';
import type { Viewport } from '../types.js';

const INK = '#14181a';
const PAPER = '#fbfaf7';
const RED = '#ff4a2b';
const FONT = '"Apple SD Gothic Neo", sans-serif';

export interface Camera { x: number; y: number; }

/** Set once the run is over: what to show, and how long until the shell leaves. */
export interface Ending {
  result: RunResult | null;
  framesLeft: number;
}

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
  xpNeeded: number,
  ending: Ending
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
  if (ending.result) drawResult(ctx, width, height, ending.result, ending.framesLeft);
  else if (world.phase === 'levelup') drawCards(ctx, width, height, world, meId);
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
  // My cards, not the room's: everyone levels together but each shelf differs.
  const cards = world.offers.find((set) => set.id === meId)?.cards ?? [];
  if (cards.length === 0) return;

  ctx.save();
  ctx.fillStyle = 'rgba(251,250,247,0.55)';
  ctx.fillRect(0, 0, width, height);

  const gap = 10;
  const cardW = Math.min(150, (width - gap * (cards.length + 1)) / cards.length);
  const cardH = 86;
  const totalW = cardW * cards.length + gap * (cards.length - 1);
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

  cards.forEach((offer, i) => {
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

/** The result panel's metrics. The overlay is 320x280 by default — and can be
 * dragged down to 160x120 — so every number here is small on purpose, and
 * anything that doesn't fit is dropped rather than drawn past the edge. */
const PANEL_MARGIN = 8;
const PANEL_MAX_W = 304;
const PANEL_PAD_TOP = 12;
const TITLE_H = 30;
const STATS_H = 18;
const DIVIDER_H = 13;
const CAPTION_H = 13;
const ITEM_H = 15;
const FOOTER_H = 20;
const PANEL_RADIUS = 12;
/** Side padding inside the panel — the divider's inset and the text's limit. */
const PANEL_INSET = 22;
/** Panel width a two-item line needs; below it the shelf goes one per line. */
const TWO_PER_ROW_W = 284;

/**
 * The end of a run, which is the only screen in this game that is allowed to
 * be a screen. Ten minutes of picks end up as a list of what the build became,
 * because that list — not the banner — is what a player wants to see.
 *
 * Drawn as a card rather than a full-screen wash: this is still an overlay, and
 * whatever is behind it stays readable the same way it does mid-run.
 */
function drawResult(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  result: RunResult,
  framesLeft: number
): void {
  const panel = layoutResult(width, height, result);

  ctx.save();
  ctx.fillStyle = PAPER;
  ctx.strokeStyle = result.survived ? INK : RED;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(panel.x, panel.y, panel.w, panel.h, PANEL_RADIUS);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  drawResultHead(ctx, panel, result);
  drawResultBody(ctx, panel);

  // Nobody has to press anything — the shell leaves on its own, so say when.
  ctx.fillStyle = 'rgba(20,24,26,0.55)';
  ctx.font = `600 10px ${FONT}`;
  text(ctx, `${Math.ceil(framesLeft / TICKS_PER_SECOND)}초 뒤 돌아갑니다`, panel, panel.y + panel.h - 8);
  ctx.restore();
}

function drawResultHead(ctx: CanvasRenderingContext2D, panel: ResultPanel, result: RunResult): void {
  let y = panel.y + PANEL_PAD_TOP + TITLE_H - 8;

  ctx.fillStyle = result.survived ? INK : RED;
  ctx.font = `800 26px ${FONT}`;
  text(ctx, result.survived ? '버텼다' : '전멸', panel, y);

  y += STATS_H;
  ctx.fillStyle = INK;
  ctx.font = `700 12px ${FONT}`;
  text(ctx, `${clockText(result.ticks)} 생존 · Lv.${result.level} · ${result.kills}킬`, panel, y);

  y += 8;
  ctx.strokeStyle = 'rgba(20,24,26,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(panel.x + PANEL_INSET, y);
  ctx.lineTo(panel.x + panel.w - PANEL_INSET, y);
  ctx.stroke();
}

function drawResultBody(ctx: CanvasRenderingContext2D, panel: ResultPanel): void {
  let y = panel.y + PANEL_PAD_TOP + TITLE_H - 8 + STATS_H + 8 + 14;
  for (const line of panel.lines) {
    if (line.caption) {
      ctx.fillStyle = 'rgba(20,24,26,0.5)';
      ctx.font = `700 9px ${FONT}`;
    } else {
      ctx.fillStyle = INK;
      ctx.font = `600 12px ${FONT}`;
    }
    text(ctx, line.text, panel, y);
    y += line.height;
  }
}

/**
 * Centred in the panel, and never wider than it. The `maxWidth` argument is the
 * point: these strings are Korean labels of unknown width in whatever font the
 * machine has, and the panel can be 144px wide. Without it a long line runs
 * straight through the border.
 */
function text(ctx: CanvasRenderingContext2D, value: string, panel: ResultPanel, y: number): void {
  ctx.fillText(value, panel.x + panel.w / 2, y, panel.w - PANEL_INSET * 2);
}

export interface ResultPanel {
  x: number;
  y: number;
  w: number;
  h: number;
  lines: PanelLine[];
}

/**
 * Where the panel sits and what fits inside it. Separate from the drawing so a
 * test can check the geometry at every window size the overlay allows without
 * a canvas.
 */
export function layoutResult(width: number, height: number, result: RunResult): ResultPanel {
  const head = PANEL_PAD_TOP + TITLE_H + STATS_H + DIVIDER_H;
  const w = Math.min(width - PANEL_MARGIN * 2, PANEL_MAX_W);
  const room = height - PANEL_MARGIN * 2 - head - FOOTER_H;
  const lines = fitLines(shelfLines(result, w >= TWO_PER_ROW_W ? 2 : 1), room);
  const h = head + lines.reduce((sum, line) => sum + line.height, 0) + FOOTER_H;
  return {
    x: (width - w) / 2,
    y: Math.max(PANEL_MARGIN, (height - h) / 2),
    w,
    h,
    lines
  };
}

export interface PanelLine { text: string; caption: boolean; height: number; }

/**
 * The build, as lines: a small caption per shelf then its contents, wrapped by
 * count rather than by measured width. The labels here are all short, and a
 * count kept from the panel's width keeps its height knowable before anything
 * is drawn.
 */
function shelfLines(result: RunResult, perRow: number): PanelLine[] {
  const lines: PanelLine[] = [];
  for (const [title, items] of [['무기', result.weapons], ['아이템', result.passives]] as const) {
    if (items.length === 0) continue;
    lines.push({ text: title, caption: true, height: CAPTION_H });
    for (let i = 0; i < items.length; i += perRow) {
      // Levels ride along as plain numbers — "Lv." six times over is noise.
      const text = items.slice(i, i + perRow).map((it) => `${it.label} ${it.level}`).join(' · ');
      lines.push({ text, caption: false, height: ITEM_H });
    }
  }
  return lines;
}

/** Keeps what fits in `room` pixels, and never leaves a caption with nothing under it. */
function fitLines(lines: PanelLine[], room: number): PanelLine[] {
  const kept: PanelLine[] = [];
  let used = 0;
  for (const line of lines) {
    if (used + line.height > room) break;
    kept.push(line);
    used += line.height;
  }
  while (kept.length > 0 && kept[kept.length - 1].caption) kept.pop();
  return kept;
}
