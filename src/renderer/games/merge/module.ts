import type { GameMatch, GameModule, MatchHud, Viewport } from '../types.js';
import { MergeEngine } from './engine.js';
import { renderMerge } from './draw.js';
import { createInputSource } from './input.js';
import { ANIMAL_NAMES, LAST_KIND, NO_INPUT } from './types.js';
import type { MergeInput } from './types.js';

const BEST_KEY = 'overlay-lupin.merge.best';

/** Best score is a per-machine convenience; storage may be unavailable, and the game must not care. */
const storage = (): Storage | null => (typeof window === 'undefined' ? null : window.localStorage);
function loadBest(): number {
  try { return Number(storage()?.getItem(BEST_KEY)) || 0; } catch { return 0; }
}
function saveBest(score: number): void {
  try { storage()?.setItem(BEST_KEY, String(score)); } catch { /* storage unavailable */ }
}

export class MergeMatch implements GameMatch {
  readonly engine: MergeEngine;
  private best = loadBest();
  private recorded = false;

  constructor(seed?: number) { this.engine = new MergeEngine(seed); }

  step(input: unknown): void {
    this.engine.step((input ?? NO_INPUT) as MergeInput);
    const w = this.engine.snapshot();
    if (w.phase === 'over' && !this.recorded) {
      this.recorded = true;
      if (w.score > this.best) { this.best = w.score; saveBest(w.score); }
    }
  }

  render(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    renderMerge(ctx, this.engine.snapshot(), viewport, this.best);
  }

  hud(): MatchHud {
    const w = this.engine.snapshot();
    const top = w.balls.reduce((m, [kind]) => Math.max(m, kind), -1);
    const status = `동글동물 · ${w.score.toLocaleString()}점${top >= 0 ? ` · 최대 ${ANIMAL_NAMES[top]}` : ''}`;
    if (w.phase !== 'over') return { status, banner: '', bannerKind: '' };
    const record = w.score > 0 && w.score >= this.best ? ' · 최고 기록!' : '';
    return { status, banner: `게임 오버 · ${w.score.toLocaleString()}점${record}`, bannerKind: 'over' };
  }

  isOver(): boolean { return this.engine.isOver; }

  /** Solo only — nothing ever goes over the wire. */
  buildOutgoingPacket(): unknown { return null; }
  applyOpponentPacket(): void { /* solo only */ }
}

export const mergeModule: GameModule = {
  id: 'merge',
  label: '동글동물',
  hint: `← → 이동 · Space 떨어뜨리기 · 같은 동물끼리 닿으면 한 단계 큰 동물로 합쳐짐 · ${ANIMAL_NAMES[LAST_KIND]} 두 마리를 합치면 보너스 · 선 위에 오래 머물면 게임 오버`,
  soloOnly: true,
  // A stray invite for this game still gets a playable local board rather than a crash.
  createMatch: () => new MergeMatch(),
  createSoloMatch: () => new MergeMatch(),
  createInputSource
};
