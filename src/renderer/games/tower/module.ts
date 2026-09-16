import type { GameModule, GameMatch, MatchHud, Viewport } from '../types.js';
import { TowerBot } from './bot.js';
import { TowerEngine, clampX, validCommand, wrapAngle } from './engine.js';
import { createInputSource } from './input.js';
import { renderTower } from './draw.js';
import { WorldAssembler, encodeWorld } from './wire.js';
import { NO_INPUT } from './types.js';
import type { AimCommand, TowerInput, TowerWorld, Side } from './types.js';
import type { TowerPacket } from './wire.js';

export class TowerMatch implements GameMatch {
  private engine: TowerEngine | null;
  private world: TowerWorld | null = null;
  private side: Side;
  private seq = 0;
  private aimTurn = -1;
  private aim = { x: 160, angle: 0 };
  private pending: AimCommand | null = null;
  private packets: TowerPacket[] = [];
  private assembler = new WorldAssembler();
  private visual = { bodies: [] as { x: number; y: number; angle: number }[], cameraY: 0 };

  private bot: TowerBot | null;

  constructor(isHost: boolean, private vsBot = false, extreme = false) {
    this.engine = isHost ? new TowerEngine(false, undefined, extreme) : null;
    this.bot = isHost && vsBot ? new TowerBot() : null;
    this.side = isHost ? 0 : 1;
  }
  private current(): TowerWorld | null { return this.engine?.snapshot() ?? this.world; }

  step(raw: unknown): void {
    const input = (raw ?? NO_INPUT) as TowerInput;
    const w = this.current();
    if (w?.phase === 'aim' && w.side === this.side) {
      if (this.aimTurn !== w.turn) {
        this.aimTurn = w.turn; this.aim = { x: w.x, angle: w.angle }; this.pending = null;
      }
      // Spending a token the world no longer credits would only stall the aim on an ack that changes nothing.
      const swap = !!input.swap && w.swaps[this.side] > 0;
      if (!this.pending?.drop && !this.pending?.swap
        && (input.left || input.right || input.rotate || input.rotateBack || input.drop || swap)) {
        this.aim.x = clampX(this.aim.x + (Number(input.right) - Number(input.left)) * 1.5);
        if (input.rotate || input.rotateBack) {
          const direction = Number(!!input.rotate) - Number(!!input.rotateBack);
          this.aim.angle = wrapAngle(this.aim.angle + direction * Math.PI / 12);
        }
        const command = { seq: ++this.seq, turn: w.turn, ...this.aim, drop: !!input.drop, swap };
        if (this.engine) this.engine.command(this.side, command);
        else this.pending = command;
      }
    }
    if (this.bot && this.engine) {
      const command = this.bot.step(this.engine.snapshot());
      if (command) this.engine.command(1, command);
    }
    this.engine?.step();
  }

  render(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const w = this.current();
    const aim = w?.phase === 'aim' && w.side === this.side && this.aimTurn === w.turn ? this.aim : null;
    renderTower(ctx, w, viewport, this.side, aim, this.visual, this.vsBot);
  }

  hud(): MatchHud {
    const w = this.current();
    if (!w) return { status: '동물탑 · 연결 중', banner: '', bannerKind: '' };
    const mode = w.extreme ? '극한 · ' : '';
    let status = `${mode}${w.side === this.side ? '내 차례' : this.vsBot ? '봇 차례' : '상대 차례'} · ${w.score}마리`;
    let banner = '';
    if (w.phase === 'over') {
      status = `동물탑 · ${mode}${w.score}마리`;
      banner = w.complete ? '64마리 완성!' : w.loser === this.side ? '패배' : '승리';
    }
    return { status, banner, bannerKind: w.phase === 'over' ? 'over' : '' };
  }

  isOver(): boolean { return this.engine?.isOver ?? false; }

  buildOutgoingPacket(): unknown {
    if (this.engine) {
      if (!this.packets.length) this.packets = encodeWorld(this.engine.snapshot());
      return this.packets.shift()!;
    }
    // Keep edge-triggered commands until acknowledged, even across a lost UDP packet or an off-send tick.
    return { t: 'tower-input', cmd: this.pending };
  }

  applyOpponentPacket(packet: unknown): void {
    if (this.engine) {
      const p = packet as { t?: string; cmd?: unknown } | null;
      if (p?.t === 'tower-input' && validCommand(p.cmd)) this.engine.command(1, p.cmd);
    } else {
      const world = this.assembler.ingest(packet);
      if (!world) return;
      this.world = world;
      if (this.pending && (world.ack >= this.pending.seq || world.turn !== this.pending.turn)) this.pending = null;
    }
  }
}

export const EXTREME_VARIANT = 'extreme';

export const towerModule: GameModule = {
  id: 'tower', label: '동물탑',
  hint: '← → 이동 · ↑ ↓ 회전 · Space 놓기 · R 동물 변경(3회) · 번갈아 쌓고 떨어뜨리면 패배 · 혼자하기는 봇 대전',
  variants: [
    { id: 'normal', label: '일반', hint: '시간 제한 없이 원하는 만큼 자리를 고를 수 있습니다.' },
    { id: EXTREME_VARIANT, label: '극한', hint: '5초 안에 놓지 않으면 그 자리에 그대로 떨어집니다.' }
  ],
  createMatch: (isHost, _myId, _myName, variant) => new TowerMatch(isHost, false, variant === EXTREME_VARIANT),
  createSoloMatch: (_myId, _myName, variant) => new TowerMatch(true, true, variant === EXTREME_VARIANT),
  createInputSource
};
