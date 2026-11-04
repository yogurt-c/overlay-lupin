import type { GameMatch, GameModule, MatchHud, Viewport } from '../types.js';
import { MergeEffects } from './effects.js';
import { formatTime, renderSlide } from './draw.js';
import { SlideEngine } from './engine.js';
import { createInputSource } from './input.js';
import { NO_INPUT, SLIDE_TICKS } from './types.js';
import type { Dir, MergeEvent, SlideInput } from './types.js';

const BEST_KEY = 'overlay-lupin.slide.best';

/** Best score is a per-machine convenience; storage may be unavailable, and the game must not care. */
const storage = (): Storage | null => (typeof window === 'undefined' ? null : window.localStorage);
function loadBest(): number {
  try { return Number(storage()?.getItem(BEST_KEY)) || 0; } catch { return 0; }
}
function saveBest(score: number): void {
  try { storage()?.setItem(BEST_KEY, String(score)); } catch { /* storage unavailable */ }
}

export class SlideMatch implements GameMatch {
  readonly engine: SlideEngine;
  readonly effects = new MergeEffects();
  private best = loadBest();
  /** The best that stood when this run started — beating it is a 신기록. */
  private runBaseline = this.best;
  private seenMoves = 0;
  private seenRuns: number;
  /** Merges wait for their tiles to land before they hit. */
  private pending: { at: number; merges: readonly MergeEvent[]; dir: Dir } | null = null;
  private hidden = false;

  constructor(seed?: number) {
    this.engine = new SlideEngine(seed);
    this.seenRuns = this.engine.runs;
  }

  get isRecord(): boolean { return this.engine.score > 0 && this.engine.score > this.runBaseline; }

  step(input: unknown): void {
    if (this.hidden) return;
    const e = this.engine;
    e.step((input ?? NO_INPUT) as SlideInput);

    if (e.runs !== this.seenRuns) {
      // 다시하기: a fresh run measures its 신기록 against the best so far.
      this.seenRuns = e.runs;
      this.runBaseline = this.best;
      this.pending = null;
      this.effects.clear();
    }
    if (e.moves !== this.seenMoves) {
      this.seenMoves = e.moves;
      // A move made before the last one landed fires the last one's hit immediately, so nothing is dropped.
      if (this.pending) this.effects.fire(this.pending.merges, this.pending.dir);
      this.pending = { at: e.moveTick + SLIDE_TICKS, merges: e.merges, dir: e.lastDir };
    }
    if (this.pending && e.tick >= this.pending.at) {
      this.effects.fire(this.pending.merges, this.pending.dir);
      this.pending = null;
    }
    this.effects.update();
    if (e.score > this.best) { this.best = e.score; saveBest(e.score); }
  }

  /** The clock and board freeze while the overlay is hidden. */
  visibilityChanged(visible: boolean): void { this.hidden = !visible; }

  render(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    renderSlide(ctx, this.engine, this.effects, viewport, { best: this.best, isRecord: this.isRecord });
  }

  hud(): MatchHud {
    const e = this.engine;
    return { status: `2048 · ${e.score.toLocaleString()}점 · ${formatTime(e.playTicks)}`, banner: '', bannerKind: '' };
  }

  isOver(): boolean { return this.engine.isOver; }

  /** Solo only — nothing ever goes over the wire. */
  buildOutgoingPacket(): unknown { return null; }
  applyOpponentPacket(): void { /* solo only */ }
}

export const slideModule: GameModule = {
  id: 'slide',
  label: '2048',
  hint: '← ↑ → ↓ 판 전체를 밀기 · 같은 숫자끼리 부딪히면 합쳐짐 · 2048을 만들면 성공 · 더 밀 수 없으면 끝',
  soloOnly: true,
  // A stray invite for this game still gets a playable local board rather than a crash.
  createMatch: () => new SlideMatch(),
  createSoloMatch: () => new SlideMatch(),
  createInputSource
};
