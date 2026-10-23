import { beginSketchFrame, roughSegment, roughStroke, wobble } from '../../lib/sketch.js';
import type { Viewport } from '../types.js';
import type { Side, World } from './types.js';
import { stoneFor } from './types.js';
const INK = '#14181a', PAPER = '#fffefa', FADED = '#7a827c', ACCENT = '#9a4a3f', EMBER = '#e2795f';
const HALO = 'rgba(255,255,255,0.92)', GRID = 'rgba(20,24,26,0.38)', GRID_HALO = 'rgba(255,255,255,0.3)';
/** Board geometry: no coordinate labels, so the grid takes the space the old header used (status lives in the shell HUD). */
const GAP = 15, SPAN = GAP * 14, LEFT = (320 - SPAN) / 2, TOP = 33, STONE_R = 6.3;
const STAR_POINTS = [48, 56, 112, 168, 176];
/** How long the ring around a freshly placed stone keeps spreading, so the opponent's move is hard to miss. */
export const RIPPLE_TICKS = 45;
export interface Presentation {
  cursor: number; menu: boolean; selected: number; actions: string[];
  setup: boolean; pending: number | null; message: string; lastAge: number;
  /** Footer shown while placing stones: the move keys plus this mode's shortcuts. */
  controls: string;
}
const at = (cell: number): [number, number] => [LEFT + cell % 15 * GAP, TOP + Math.floor(cell / 15) * GAP];
function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size = 9, color = INK): void {
  ctx.font = `${size}px Menlo, Consolas, monospace`; ctx.textAlign = 'center';
  ctx.lineWidth = 3; ctx.strokeStyle = HALO; ctx.strokeText(s, x, y); ctx.fillStyle = color; ctx.fillText(s, x, y);
}
/** A hand-drawn stone: a wobbling rim with a halo so black and white both read over any desktop. */
function stone(ctx: CanvasRenderingContext2D, cell: number, color: number, alpha = 1): void {
  const [x, y] = at(cell), seed = (cell * 37 % 100) / 100;
  ctx.save(); ctx.globalAlpha = alpha; ctx.beginPath();
  for (let k = 0; k <= 12; k++) {
    const a = k / 12 * Math.PI * 2, r = STONE_R + wobble(seed, a) * 0.45;
    if (k) ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.strokeStyle = HALO; ctx.lineWidth = 3.2; ctx.stroke();
  ctx.fillStyle = color === 1 ? INK : PAPER; ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.stroke();
  if (color === 1) roughSegment(ctx, x - 3, y - 2, x - 0.5, y - 3.6, 1, 'rgba(255,255,255,0.5)', 1);
  else roughSegment(ctx, x - 2, y + 3, x + 2.5, y + 2, 0.8, 'rgba(20,24,26,0.25)', 1);
  ctx.restore();
}
function drawBoard(ctx: CanvasRenderingContext2D): void {
  // Frame first: its halo would otherwise erase the ends of the grid lines where they meet it.
  roughStroke(ctx, LEFT, TOP, LEFT + SPAN, TOP, 1.8, INK, HALO);
  roughStroke(ctx, LEFT, TOP + SPAN, LEFT + SPAN, TOP + SPAN, 1.8, INK, HALO);
  roughStroke(ctx, LEFT, TOP, LEFT, TOP + SPAN, 1.8, INK, HALO);
  roughStroke(ctx, LEFT + SPAN, TOP, LEFT + SPAN, TOP + SPAN, 1.8, INK, HALO);
  // No floor under the board: a faint halo keeps the grid readable on dark desktops without showing on light ones.
  for (let i = 1; i < 14; i++) {
    roughSegment(ctx, LEFT, TOP + i * GAP, LEFT + SPAN, TOP + i * GAP, 2.4, GRID_HALO, 1);
    roughSegment(ctx, LEFT + i * GAP, TOP, LEFT + i * GAP, TOP + SPAN, 2.4, GRID_HALO, 1);
  }
  for (let i = 1; i < 14; i++) {
    roughSegment(ctx, LEFT, TOP + i * GAP, LEFT + SPAN, TOP + i * GAP, 0.8, GRID, 1);
    roughSegment(ctx, LEFT + i * GAP, TOP, LEFT + i * GAP, TOP + SPAN, 0.8, GRID, 1);
  }
  for (const cell of STAR_POINTS) {
    const [x, y] = at(cell);
    ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
  }
}
function drawLastMove(ctx: CanvasRenderingContext2D, w: World, age: number): void {
  const [x, y] = at(w.last);
  if (age < RIPPLE_TICKS) {
    const t = age / RIPPLE_TICKS;
    ctx.save(); ctx.globalAlpha = (1 - t) * 0.8;
    ctx.beginPath(); ctx.arc(x, y, STONE_R + 1 + t * 7, 0, Math.PI * 2);
    ctx.strokeStyle = ACCENT; ctx.lineWidth = 1.6 * (1 - t) + 0.4; ctx.stroke();
    ctx.restore();
  }
  ctx.beginPath(); ctx.arc(x, y, 1.9, 0, Math.PI * 2);
  ctx.fillStyle = w.board[w.last] === 1 ? EMBER : ACCENT; ctx.fill();
}
function drawCursor(ctx: CanvasRenderingContext2D, cell: number): void {
  const [x, y] = at(cell), c = STONE_R + 1.8;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    for (const [color, width] of [[HALO, 4], [ACCENT, 1.6]] as const) {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
      ctx.moveTo(x + sx * c, y + sy * (c - 4)); ctx.lineTo(x + sx * c, y + sy * c); ctx.lineTo(x + sx * (c - 4), y + sy * c);
      ctx.stroke();
    }
  }
}
export function renderGomoku(ctx: CanvasRenderingContext2D, viewport: Viewport, w: World | null, side: Side, ui: Presentation): void {
  ctx.setTransform(viewport.pixelRatio, 0, 0, viewport.pixelRatio, 0, 0);
  ctx.clearRect(0, 0, viewport.width, viewport.height);
  const scale = Math.min(viewport.width / 320, viewport.height / 280);
  ctx.save(); ctx.translate((viewport.width - 320 * scale) / 2, (viewport.height - 280 * scale) / 2); ctx.scale(scale, scale);
  beginSketchFrame(); ctx.lineCap = ctx.lineJoin = 'round';
  if (ui.setup) {
    text(ctx, '오 목', 160, 106, 30);
    roughStroke(ctx, 132, 118, 188, 118, 1.4, INK, HALO);
    text(ctx, '다섯 알을 나란히, 한 수씩 천천히.', 160, 146, 10);
    text(ctx, 'AI 난이도를 골라주세요', 160, 181, 10, FADED);
  } else if (w) {
    drawBoard(ctx);
    w.board.forEach((v, cell) => { if (v) stone(ctx, cell, v); });
    if (w.last >= 0) drawLastMove(ctx, w, ui.lastAge);
    if (ui.pending !== null) stone(ctx, ui.pending, stoneFor(w, side), 0.45);
    if (!ui.menu && !w.result) {
      if (!w.board[ui.cursor] && ui.pending === null) stone(ctx, ui.cursor, stoneFor(w, side), 0.28);
      drawCursor(ctx, ui.cursor);
    }
    if (w.line.length) {
      const [ax, ay] = at(w.line[0]), [bx, by] = at(w.line[w.line.length - 1]);
      roughStroke(ctx, ax, ay, bx, by, 2.2, ACCENT, HALO);
    }
  }
  const menuY = ui.setup ? 211 : 265;
  ui.actions.forEach((label, i) => {
    const x = 160 + (i - (ui.actions.length - 1) / 2) * 76, on = ui.menu && i === ui.selected;
    if (on) roughStroke(ctx, x - 22, menuY + 5, x + 22, menuY + 5, 1.6, INK, HALO);
    text(ctx, label, x, menuY, on ? 10 : 9, on ? INK : FADED);
  });
  text(ctx, ui.message || (ui.setup ? '← → 선택 · Space 시작' : ui.menu ? '← → 선택 · Space 확인' : ui.controls), 160, 278, 7.5, FADED);
  ctx.restore();
}
