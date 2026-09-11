import { Game } from '../../lib/ballsport/engine.js';
import type { Input, OpponentPacket } from '../../lib/ballsport/engine.js';
import { cameraTarget, followCamera, renderScene } from '../../lib/ballsport/scene.js';
import { limbsFor } from './draw.js';
import { soccerRules } from './ruleset.js';
import { createInputSource } from './input.js';
import { computeBotInput } from './bot.js';
import type { GameMatch, GameModule, MatchHud, Viewport } from '../types.js';

class SoccerMatch implements GameMatch {
  private game = new Game(soccerRules);
  /** Solo mode only: a second, independent engine playing the opposite side, fed by bot.ts instead of the network. */
  private bot: Game | null = null;
  private cameraX = 0;
  private snapCamera = true;

  constructor(isHost: boolean, vsBot = false) {
    this.game.startMatch(isHost);
    if (vsBot) {
      this.bot = new Game(soccerRules);
      this.bot.startMatch(!isHost);
    }
  }

  step(input: unknown): void {
    this.game.step(input as Input);
    if (this.bot) {
      const mySide: 1 | -1 = this.bot.isHost ? 1 : -1;
      this.bot.step(computeBotInput(this.bot.local, this.bot.ball, mySide));
      // Same exchange two networked peers would do each tick, just with no wire in between.
      this.game.applyOpponentPacket(this.bot.buildOutgoingPacket());
      this.bot.applyOpponentPacket(this.game.buildOutgoingPacket());
    }
  }

  render(ctx: CanvasRenderingContext2D, viewport: Viewport, alpha: number): void {
    const view = this.game.view(alpha);
    this.cameraX = this.snapCamera ? cameraTarget(view) : followCamera(this.cameraX, view);
    this.snapCamera = false;
    renderScene(ctx, view, this.cameraX, viewport, { drawField: this.game.drawField, limbsFor });
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
  matching: 'duel',
  createMatch: (isHost) => new SoccerMatch(isHost),
  createSoloMatch: () => new SoccerMatch(true, true),
  createInputSource: (target) => createInputSource(target)
};
