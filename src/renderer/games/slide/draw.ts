import { beginSketchFrame, roughSegment } from '../../lib/sketch.js';
import { INK, PAPER } from '../merge/characters.js';
import { cellX, cellY, strength } from './effects.js';
import type { MergeEffects } from './effects.js';
import type { SlideEngine } from './engine.js';
import { BOARD, BOARD_X, BOARD_Y, CELL, POP_TICKS, SIZE, SLIDE_TICKS, tileValue } from './types.js';
import type { Viewport } from '../types.js';

const HALO = 'rgba(255,255,255,0.94)', ACCENT = '#9a4a3f', GUIDE = '#7a827c';
const PANEL_X = 50;
const CELL_LINE = 'rgba(20,24,26,0.16)', CELL_HALO = 'rgba(255,255,255,0.25)', FRAME_LINE = 'rgba(20,24,26,0.3)';

export interface Records {
  best: number;
  /** This run has beaten the best score that stood when it started. */
  isRecord: boolean;
}

/** Long numbers shrink so 4- and 5-digit tiles still fit their cell. */
export const tileFontSize = (value: number): number => {
  const digits = String(value).length;
  return digits <= 2 ? 17 : digits === 3 ? 15 : digits === 4 ? 12 : 10;
};

export function formatTime(ticks: number): string {
  const total = Math.floor(ticks / 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size = 9, ink = INK): void {
  ctx.font = `${size}px Menlo, Consolas, monospace`;
  ctx.textAlign = 'center'; ctx.lineJoin = 'round';
  ctx.lineWidth = 3; ctx.strokeStyle = HALO; ctx.strokeText(value, x, y);
  ctx.fillStyle = ink; ctx.fillText(value, x, y);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function roughBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, width: number, color: string): void {
  roughSegment(ctx, x, y, x + w, y, width, color, 1);
  roughSegment(ctx, x + w, y, x + w, y + h, width, color, 1);
  roughSegment(ctx, x + w, y + h, x, y + h, width, color, 1);
  roughSegment(ctx, x, y + h, x, y, width, color, 1);
}

function drawTile(ctx: CanvasRenderingContext2D, exp: number, x: number, y: number, scale: number, flash = 0): void {
  if (scale <= 0.01) return;
  const size = CELL * scale, half = size / 2;
  const top = exp >= 11;
  roundRect(ctx, x - half, y - half, size, size, 6 * scale);
  // Like 오목's stones and grid: no solid plate, just a thin wash and a faint sketched outline,
  // so the board blends into the desktop and the number carries the tile.
  ctx.fillStyle = top ? 'rgba(154,74,63,0.07)' : `rgba(255,253,248,${Math.min(0.2, 0.06 + 0.013 * exp)})`;
  ctx.fill();
  if (flash > 0) {
    // Hit flash: the tile goes ink-dark for a few frames the moment it merges.
    ctx.globalAlpha = flash * 0.85;
    ctx.fillStyle = top ? ACCENT : INK; ctx.fill();
    ctx.globalAlpha = 1;
  }
  const lineAlpha = Math.min(0.42, 0.14 + 0.025 * exp);
  roughBox(ctx, x - half, y - half, size, size, 2, 'rgba(255,255,255,0.2)');
  roughBox(ctx, x - half, y - half, size, size, top ? 1.3 : 0.7 + exp * 0.03, top ? ACCENT : `rgba(42,38,34,${lineAlpha})`);
  const value = tileValue(exp);
  ctx.font = `bold ${Math.round(tileFontSize(value) * scale * 10) / 10}px Menlo, Consolas, monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  if (flash <= 0.45) {
    // A white halo keeps the bare number readable on dark desktops.
    ctx.lineWidth = 3; ctx.strokeStyle = HALO;
    ctx.strokeText(String(value), x, y + 1 * scale);
  }
  ctx.fillStyle = flash > 0.45 ? PAPER : top ? ACCENT : INK;
  ctx.fillText(String(value), x, y + 1 * scale);
  ctx.textBaseline = 'alphabetic';
}

const ease = (k: number): number => 1 - (1 - k) ** 3;

function drawBoard(ctx: CanvasRenderingContext2D, engine: SlideEngine, effects: MergeEffects): void {
  // No floor under the board, as on 오목: empty cells are faint sketched outlines with a light halo,
  // readable on dark desktops without showing on light ones.
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const x = cellX(c) - CELL / 2, y = cellY(r) - CELL / 2;
    roughBox(ctx, x, y, CELL, CELL, 2.2, CELL_HALO);
    roughBox(ctx, x, y, CELL, CELL, 0.7, CELL_LINE);
  }

  const since = engine.tick - engine.moveTick;
  const k = ease(Math.min(1, since / SLIDE_TICKS));
  const lerp = (from: number, to: number): number => from + (to - from) * k;

  effects.drawUnder(ctx);
  if (since < SLIDE_TICKS) {
    for (const g of engine.ghosts) drawTile(ctx, g.exp, lerp(cellX(g.fromCol), cellX(g.col)), lerp(cellY(g.fromRow), cellY(g.row)), 1);
  }
  for (const t of engine.tiles) {
    const age = engine.tick - t.born;
    if (t.born === engine.moveTick && age < SLIDE_TICKS) continue;
    let scale = 1;
    if (t.merged && age < SLIDE_TICKS + POP_TICKS) {
      // Lands oversized at once, then wobbles back like a struck spring; bigger steps punch harder.
      const p = (age - SLIDE_TICKS) / POP_TICKS;
      scale = 1 + (0.22 + 0.33 * strength(t.exp)) * Math.exp(-5 * p) * Math.cos(3 * Math.PI * p);
    } else if (!t.merged && t.born === engine.moveTick && age < SLIDE_TICKS * 2) {
      scale = 0.3 + 0.7 * ease((age - SLIDE_TICKS) / SLIDE_TICKS);
    }
    const [nx, ny] = effects.nudge(t.row, t.col);
    drawTile(ctx, t.exp, lerp(cellX(t.fromCol), cellX(t.col)) + nx, lerp(cellY(t.fromRow), cellY(t.row)) + ny, scale,
      t.merged ? effects.tileFlash(t.row, t.col) : 0);
  }

  // The frame is drawn as lightly as the cells: a faint halo and a thin grey line, no solid ink.
  roughBox(ctx, BOARD_X, BOARD_Y, BOARD, BOARD, 2.4, CELL_HALO);
  roughBox(ctx, BOARD_X, BOARD_Y, BOARD, BOARD, 1, FRAME_LINE);
}

function drawPanel(ctx: CanvasRenderingContext2D, engine: SlideEngine, records: Records): void {
  text(ctx, '점수', PANEL_X, 46, 8);
  text(ctx, engine.score.toLocaleString(), PANEL_X, 60, 11);
  text(ctx, '최고 점수', PANEL_X, 82, 8);
  text(ctx, Math.max(records.best, engine.score).toLocaleString(), PANEL_X, 96, 11, records.isRecord ? ACCENT : INK);
  if (records.isRecord) text(ctx, '신기록!', PANEL_X, 108, 8, ACCENT);
  text(ctx, '시간', PANEL_X, 130, 8);
  text(ctx, formatTime(engine.playTicks), PANEL_X, 144, 11);
  if (engine.maxExp > 0) {
    text(ctx, '최고 타일', PANEL_X, 166, 8);
    text(ctx, String(tileValue(engine.maxExp)), PANEL_X, 180, 11);
  }
}

function drawCard(ctx: CanvasRenderingContext2D, engine: SlideEngine, records: Records): void {
  const cx = BOARD_X + BOARD / 2, cy = BOARD_Y + BOARD / 2;
  const w = 184, h = 132, x = cx - w / 2, y = cy - h / 2;
  ctx.fillStyle = 'rgba(255,253,248,0.72)';
  ctx.fillRect(BOARD_X, BOARD_Y, BOARD, BOARD);
  roundRect(ctx, x, y, w, h, 8);
  ctx.fillStyle = PAPER; ctx.fill();
  roughBox(ctx, x, y, w, h, 1.8, INK);

  const won = engine.phase === 'won';
  if (won) {
    text(ctx, '2048', cx, y + 30, 20, ACCENT);
    text(ctx, '완성!', cx, y + 46, 10, ACCENT);
  } else {
    text(ctx, '더 밀 수 없어요', cx, y + 26, 11);
    text(ctx, `최고 타일 ${tileValue(engine.maxExp)}`, cx, y + 44, 9);
  }
  text(ctx, `점수 ${engine.score.toLocaleString()} · 시간 ${formatTime(engine.playTicks)}`, cx, y + 68, 9);
  text(ctx, records.isRecord ? '최고 점수 갱신!' : `최고 점수 ${records.best.toLocaleString()}`, cx, y + 82, 8, records.isRecord ? ACCENT : GUIDE);

  const labels = won ? ['계속하기', '끝내기'] : ['다시하기', '끝내기'];
  labels.forEach((label, i) => {
    const bx = cx + (i === 0 ? -42 : 42), by = y + 102, bw = 72, bh = 20;
    const chosen = engine.choice === i;
    roundRect(ctx, bx - bw / 2, by - bh / 2, bw, bh, 5);
    ctx.fillStyle = chosen ? INK : PAPER; ctx.fill();
    roughBox(ctx, bx - bw / 2, by - bh / 2, bw, bh, 1.2, INK);
    ctx.font = '9px Menlo, Consolas, monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = chosen ? PAPER : INK;
    ctx.fillText(label, bx, by + 3);
  });
  text(ctx, '← → 선택 · Space 확인 · Q 끝내기', cx, y + h - 6, 7, GUIDE);
}

export function renderSlide(ctx: CanvasRenderingContext2D, engine: SlideEngine, effects: MergeEffects, viewport: Viewport, records: Records): void {
  ctx.setTransform(viewport.pixelRatio, 0, 0, viewport.pixelRatio, 0, 0);
  ctx.clearRect(0, 0, viewport.width, viewport.height);
  const unit = Math.min(viewport.width / 320, viewport.height / 280);
  ctx.save();
  ctx.translate((viewport.width - 320 * unit) / 2, (viewport.height - 280 * unit) / 2);
  ctx.scale(unit, unit);
  beginSketchFrame();

  const [sx, sy] = effects.offset();
  ctx.save();
  ctx.translate(sx, sy);
  drawBoard(ctx, engine, effects);
  if (effects.flashAlpha > 0) {
    ctx.fillStyle = `rgba(255,253,248,${effects.flashAlpha})`;
    ctx.fillRect(BOARD_X, BOARD_Y, BOARD, BOARD);
  }
  effects.drawOver(ctx, (value, x, y, size, ink) => text(ctx, value, x, y, size, ink));
  ctx.restore();

  drawPanel(ctx, engine, records);
  if (engine.phase !== 'play' && engine.promptReady) drawCard(ctx, engine, records);
  else text(ctx, '← ↑ → ↓ 밀기 · 같은 숫자끼리 부딪히면 합쳐짐', 160, 270, 8);
  ctx.restore();
}
