import { FenceEngine } from './engine.js';
import { renderFenceScene } from './scene.js';
import { createInputSource } from './input.js';
import { computeBotInput } from './bot.js';
import type { FenceInput, FencePacket } from './types.js';
import type { GameMatch, GameModule, MatchHud, Viewport } from '../types.js';

class FenceMatch implements GameMatch {
  private game = new FenceEngine();
  /** Solo mode only: a second, independent engine playing the opposite side, fed by bot.ts instead of the network. */
  private bot: FenceEngine | null = null;

  constructor(isHost: boolean, vsBot = false) {
    this.game.startMatch(isHost);
    if (vsBot) {
      this.bot = new FenceEngine();
      this.bot.startMatch(!isHost);
    }
  }

  step(input: unknown): void {
    this.game.step(input as FenceInput);
    if (this.bot) {
      this.bot.step(computeBotInput(this.bot.local, this.bot.remote));
      // Same exchange two networked peers would do each tick, just with no wire in between.
      this.game.applyOpponentPacket(this.bot.buildOutgoingPacket());
      this.bot.applyOpponentPacket(this.game.buildOutgoingPacket());
    }
  }

  render(ctx: CanvasRenderingContext2D, viewport: Viewport, alpha: number): void {
    renderFenceScene(ctx, this.game.view(alpha), viewport);
  }

  hud(): MatchHud {
    // No status line: how much fight is left is read off how red each figure has gone.
    return { status: '', banner: this.bannerText(), bannerKind: this.game.phase };
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
    if (this.game.phase === 'kickoff') return String(Math.max(1, Math.ceil(this.game.phaseTimer / 60)));
    if (this.game.phase === 'over') {
      if (this.game.myLives === this.game.theirLives) return '무승부';
      return this.game.myLives > this.game.theirLives ? '승리' : '패배';
    }
    switch (this.game.flash) {
      case 'both':
        return '상호타';
      case 'land':
        return '명중!';
      case 'take':
        return '피격';
      default:
        return '';
    }
  }
}

export const fenceModule: GameModule = {
  id: 'fence',
  label: '칼싸움',
  hint: '← → 이동 · ↑ 점프 · Space 베기(↓ 하단 · 공중 내려베기) · Shift 막기 · 목숨 5개, 다 잃으면 패배',
  createMatch: (isHost) => new FenceMatch(isHost),
  createSoloMatch: () => new FenceMatch(true, true),
  createInputSource: (target) => createInputSource(target)
};
