import { Game } from './engine.js';
import type { Input } from './engine.js';
import type { OpponentPacket } from './types.js';
import { cameraTarget, followCamera, renderScene } from './scene.js';
import { createInputSource } from './input.js';
import type { GameMatch, GameModule, MatchHud, Viewport } from '../types.js';

class SoccerMatch implements GameMatch {
  private game = new Game();
  private cameraX = 0;
  private snapCamera = true;

  constructor(isHost: boolean) {
    this.game.startMatch(isHost);
  }

  step(input: unknown): void {
    this.game.step(input as Input);
  }

  render(ctx: CanvasRenderingContext2D, viewport: Viewport, alpha: number): void {
    const view = this.game.view(alpha);
    this.cameraX = this.snapCamera ? cameraTarget(view) : followCamera(this.cameraX, view);
    this.snapCamera = false;
    renderScene(ctx, view, this.cameraX, viewport, this.game.drawField);
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
    this.game.applyOpponentPacket(packet as OpponentPacket);
  }

  private bannerText(): string {
    switch (this.game.phase) {
      case 'kickoff':
        return String(Math.max(1, Math.ceil(this.game.phaseTimer / 60)));
      case 'goal':
        return this.scoredByMe() ? '골!' : '실점';
      case 'over':
        return this.game.myScore > this.game.theirScore ? '승리' : '패배';
      default:
        return '';
    }
  }

  private scoredByMe(): boolean {
    if (this.game.lastScorer === null) return false;
    return this.game.isHost ? this.game.lastScorer === 0 : this.game.lastScorer === 1;
  }
}

export const soccerModule: GameModule = {
  id: 'soccer',
  label: '축구',
  hint: '← → 이동 · ↑ 점프 · Space 슛 · 먼저 5골 넣으면 승리',
  createMatch: (isHost) => new SoccerMatch(isHost),
  createInputSource: (target) => createInputSource(target)
};
