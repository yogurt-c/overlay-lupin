import { INK } from '../merge/characters.js';
import { BOARD, BOARD_X, BOARD_Y, CELL, GAP, WIN_EXP } from './types.js';
import type { Dir, MergeEvent } from './types.js';

/**
 * Merge "impact". When tiles land, merges flash ink, punch out a shockwave
 * that shoves their neighbours, spray streaks and speed lines, and kick the
 * whole board in the slide direction. Everything scales with the tile's step,
 * so a 4 is a light tap while 2048 lands like a stamp; several merges in one
 * move stack into a combo.
 */

/** 0 for the smallest merge, 1 for 2048 and beyond. */
export const strength = (exp: number): number => Math.max(0, Math.min(1, (exp - 2) / (WIN_EXP - 2)));

export const cellX = (col: number): number => BOARD_X + GAP + col * (CELL + GAP) + CELL / 2;
export const cellY = (row: number): number => BOARD_Y + GAP + row * (CELL + GAP) + CELL / 2;

const DIR_VECTOR: Record<Dir, [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
const ACCENT = '#9a4a3f';

interface Streak { x: number; y: number; vx: number; vy: number; age: number; life: number; width: number; accent: boolean; }
interface Ring { x: number; y: number; from: number; to: number; age: number; life: number; width: number; }
interface Burst { x: number; y: number; angles: number[]; age: number; life: number; reach: number; }
interface Note { x: number; y: number; text: string; age: number; life: number; size: number; accent: boolean; }
interface Wave { row: number; col: number; s: number; age: number; }
interface Flash { row: number; col: number; age: number; life: number; }

export class MergeEffects {
  private streaks: Streak[] = [];
  private rings: Ring[] = [];
  private bursts: Burst[] = [];
  private notes: Note[] = [];
  private waves: Wave[] = [];
  private flashes: Flash[] = [];
  /** Directional board kick: a damped spring along the slide. */
  private kickX = 0;
  private kickY = 0;
  private kickAge = 99;
  /** Random rattle on top, for the heavy merges. */
  private rattle = 0;
  private t = 0;
  private boardFlash = 0;

  /** Called when the tiles of a move land; `merges` may be empty for a plain slide. */
  fire(merges: readonly MergeEvent[], dir: Dir): void {
    const [dx, dy] = DIR_VECTOR[dir];
    if (merges.length === 0) { this.kick(dx, dy, 0.9); return; }

    let top = 0;
    for (const m of merges) {
      const s = strength(m.exp), x = cellX(m.col), y = cellY(m.row);
      top = Math.max(top, s);

      const count = 8 + Math.round(s * 22);
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
        const speed = 2 + Math.random() * (1.5 + s * 4);
        this.streaks.push({
          x: x + Math.cos(angle) * CELL * 0.3, y: y + Math.sin(angle) * CELL * 0.3,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          age: 0, life: 12 + Math.round(Math.random() * 8 + s * 12),
          width: 0.8 + Math.random() * (0.6 + s * 1.6), accent: s > 0.45 && Math.random() < 0.35
        });
      }
      this.rings.push({ x, y, from: CELL * 0.45, to: CELL * (0.8 + s * 0.9), age: 0, life: 10 + Math.round(s * 8), width: 1.8 + s * 2.6 });
      if (s >= 0.45) this.rings.push({ x, y, from: CELL * 0.3, to: CELL * (1.1 + s * 1.2), age: -3, life: 16, width: 1.2 });
      if (s >= 0.3) {
        const n = 10 + Math.round(s * 10);
        this.bursts.push({ x, y, angles: Array.from({ length: n }, (_, i) => (i / n) * Math.PI * 2 + Math.random() * 0.25), age: 0, life: 8 + Math.round(s * 6), reach: CELL * (0.9 + s * 1.3) });
      }
      this.waves.push({ row: m.row, col: m.col, s, age: 0 });
      this.flashes.push({ row: m.row, col: m.col, age: 0, life: 4 + Math.round(s * 4) });
      this.notes.push({ x, y: y - CELL * 0.42, text: `+${m.gain.toLocaleString()}`, age: 0, life: 28 + Math.round(s * 12), size: 9 + s * 5, accent: s >= 0.45 });
    }

    const combo = merges.length;
    this.kick(dx, dy, 1.8 + top * 6 + (combo - 1) * 1.2);
    if (top >= 0.4 || combo >= 3) this.rattle = Math.max(this.rattle, top * 4 + (combo - 2) * 0.8);
    if (top >= 0.65) this.boardFlash = Math.max(this.boardFlash, 0.15 + (top - 0.65) * 0.8);
    if (combo >= 2) {
      this.notes.push({ x: BOARD_X + BOARD / 2, y: BOARD_Y + BOARD / 2, text: `콤보 x${combo}`, age: 0, life: 34, size: 12 + Math.min(combo, 6) * 1.5, accent: true });
    }
  }

  private kick(dx: number, dy: number, amount: number): void {
    const now = this.currentKick();
    this.kickX = now[0] + dx * amount;
    this.kickY = now[1] + dy * amount;
    this.kickAge = 0;
  }

  private currentKick(): [number, number] {
    // Snaps out at once, then springs back through centre a couple of times.
    const f = Math.exp(-this.kickAge / 4) * Math.cos(this.kickAge * 0.75);
    return [this.kickX * f, this.kickY * f];
  }

  update(): void {
    this.t++;
    this.kickAge++;
    this.rattle = this.rattle < 0.05 ? 0 : this.rattle * 0.82;
    this.boardFlash = this.boardFlash < 0.01 ? 0 : this.boardFlash * 0.82;
    for (const p of this.streaks) { p.age++; p.x += p.vx; p.y += p.vy; p.vx *= 0.86; p.vy = p.vy * 0.86 + 0.06; }
    for (const r of this.rings) r.age++;
    for (const b of this.bursts) b.age++;
    for (const n of this.notes) { n.age++; n.y -= n.age < 6 ? 1.4 : 0.4; }
    for (const w of this.waves) w.age++;
    for (const f of this.flashes) f.age++;
    this.streaks = this.streaks.filter((p) => p.age < p.life);
    this.rings = this.rings.filter((r) => r.age < r.life);
    this.bursts = this.bursts.filter((b) => b.age < b.life);
    this.notes = this.notes.filter((n) => n.age < n.life);
    this.waves = this.waves.filter((w) => w.age < 14);
    this.flashes = this.flashes.filter((f) => f.age < f.life);
  }

  clear(): void {
    this.streaks = []; this.rings = []; this.bursts = []; this.notes = []; this.waves = []; this.flashes = [];
    this.kickX = 0; this.kickY = 0; this.kickAge = 99; this.rattle = 0; this.boardFlash = 0;
  }

  /** Offset to apply to the whole board this frame. */
  offset(): [number, number] {
    const [kx, ky] = this.currentKick();
    if (this.rattle === 0) return [kx, ky];
    return [kx + Math.sin(this.t * 2.3) * this.rattle, ky + Math.cos(this.t * 3.1) * this.rattle * 0.8];
  }

  /** How far a tile is shoved by nearby shockwaves this frame. */
  nudge(row: number, col: number): [number, number] {
    let x = 0, y = 0;
    for (const w of this.waves) {
      const dc = col - w.col, dr = row - w.row;
      const dist = Math.hypot(dc, dr);
      if (dist === 0 || dist > 1.5) continue;
      const push = (1.8 + w.s * 5) / dist * Math.exp(-w.age / 3.2) * Math.min(1, (w.age + 1) / 2);
      x += (dc / dist) * push; y += (dr / dist) * push;
    }
    return [x, y];
  }

  /** 0..1: how strongly a freshly merged tile flashes ink. */
  tileFlash(row: number, col: number): number {
    const f = this.flashes.find((e) => e.row === row && e.col === col);
    return f ? 1 - f.age / f.life : 0;
  }

  get flashAlpha(): number { return this.boardFlash; }

  /** Speed lines and rings go under the tiles; streaks and notes above. */
  drawUnder(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (const b of this.bursts) {
      const k = b.age / b.life;
      ctx.globalAlpha = (1 - k) * 0.55;
      ctx.strokeStyle = INK; ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (const a of b.angles) {
        const inner = CELL * 0.55 + b.reach * k * 0.6, outer = CELL * 0.55 + b.reach * (0.4 + k * 0.6);
        ctx.moveTo(b.x + Math.cos(a) * inner, b.y + Math.sin(a) * inner);
        ctx.lineTo(b.x + Math.cos(a) * outer, b.y + Math.sin(a) * outer);
      }
      ctx.stroke();
    }
    for (const r of this.rings) {
      if (r.age < 0) continue;
      const k = r.age / r.life, ease = 1 - (1 - k) ** 3;
      ctx.globalAlpha = (1 - k) * 0.85;
      ctx.strokeStyle = INK; ctx.lineWidth = r.width * (1 - k * 0.7);
      ctx.beginPath(); ctx.arc(r.x, r.y, r.from + (r.to - r.from) * ease, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  drawOver(ctx: CanvasRenderingContext2D, label: (text: string, x: number, y: number, size: number, ink: string) => void): void {
    ctx.save();
    ctx.lineCap = 'round';
    for (const p of this.streaks) {
      const k = p.age / p.life;
      ctx.globalAlpha = 1 - k * k;
      ctx.strokeStyle = p.accent ? ACCENT : INK; ctx.lineWidth = p.width * (1 - k * 0.5);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 1.6, p.y - p.vy * 1.6); ctx.stroke();
    }
    ctx.restore();
    for (const n of this.notes) {
      const k = n.age / n.life;
      // Notes pop in oversized and settle, so the number itself lands with a hit.
      const pop = n.age < 5 ? 1.5 - 0.1 * n.age : 1;
      ctx.save();
      ctx.globalAlpha = k < 0.7 ? 1 : (1 - k) / 0.3;
      label(n.text, n.x, n.y, n.size * pop, n.accent ? ACCENT : INK);
      ctx.restore();
    }
  }
}
