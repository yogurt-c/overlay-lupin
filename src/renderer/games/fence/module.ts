import { FenceEngine } from './engine.js';
import { renderFenceScene } from './scene.js';
import { createInputSource } from './input.js';
import type { FenceInput, FencePacket } from './types.js';
import type { GameMatch, GameModule, MatchHud, Viewport } from '../types.js';

class FenceMatch implements GameMatch {
  private game = new FenceEngine();

  constructor(isHost: boolean) {
    this.game.startMatch(isHost);
  }

  step(input: unknown): void {
    this.game.step(input as FenceInput);
  }

  render(ctx: CanvasRenderingContext2D, viewport: Viewport, alpha: number): void {
    renderFenceScene(ctx, this.game.view(alpha), viewport);
  }

  hud(): MatchHud {
    return {
      status: `${this.game.myScore} : ${this.game.theirScore}`,
      banner: this.bannerText(),
      bannerKind: this.game.phase
    };
  }

  isOver(): boolean {
    return this.game.isOver;
  }

  buildOutgoingPacket(): unknown {
    return this.game.buildOutgoingPacket();
  }

  applyOpponentPacket(packet: unknown): void {
    this.game.applyOpponentPacket(packet as FencePacket);
  }

  private bannerText(): string {
    switch (this.game.phase) {
      case 'kickoff':
        return String(Math.max(1, Math.ceil(this.game.phaseTimer / 60)));
      case 'goal': {
        const { mine, theirs } = this.game.lastRound;
        if (mine && theirs) return '상호타';
        return mine ? '명중!' : '피격';
      }
      case 'over': {
        if (this.game.myScore === this.game.theirScore) return '무승부';
        return this.game.myScore > this.game.theirScore ? '승리' : '패배';
      }
      default:
        return '';
    }
  }
}

export const fenceModule: GameModule = {
  id: 'fence',
  label: '칼싸움',
  hint: '← → 이동 · ↑ 점프 · Space 베기(↓ 하단 · 전진 찌르기 · 공중 내려베기) · Shift 막기 · 먼저 5점 내면 승리',
  createMatch: (isHost) => new FenceMatch(isHost),
  createInputSource: (target) => createInputSource(target)
};
