import { CellEngine } from './engine.js';
import { renderCellScene } from './scene.js';
import { resetCellEffects } from './effects.js';
import { createInputSource } from './input.js';
import type { CellInput, CellMemberPacket, CellMemberPacketTagged, CellPlayer, CellWorld } from './types.js';
import type { GameMatch, GameModule, MatchHud, Viewport } from '../types.js';

const EMPTY_WORLD: CellWorld = { players: [], food: [], viruses: [] };
const NO_INPUT: CellInput = { up: false, down: false, left: false, right: false, split: false };

function totalMass(p: CellPlayer): number {
  return p.cells.reduce((sum, c) => sum + c.mass, 0);
}

function statusFor(world: CellWorld, myId: string): string {
  const me = world.players.find((p) => p.id === myId);
  if (!me) return '';
  if (!me.alive) return `부활까지 ${Math.ceil((me.respawnInMs ?? 0) / 1000)}초`;

  const alive = world.players.filter((p) => p.alive).sort((a, b) => totalMass(b) - totalMass(a));
  const rank = alive.findIndex((p) => p.id === myId) + 1;
  return `${Math.round(totalMass(me))} · ${rank}위/${alive.length}`;
}

class CellMatch implements GameMatch {
  /** Only set for the host — the authoritative simulation. */
  private engine: CellEngine | null;
  /** Only meaningful for a member: the latest snapshot the host sent. */
  private world: CellWorld = EMPTY_WORLD;
  private lastInput: CellInput = NO_INPUT;

  constructor(
    private isHost: boolean,
    private myId: string,
    private myName: string
  ) {
    this.engine = isHost ? new CellEngine() : null;
    this.engine?.ensurePlayer(myId, myName);
    // Squash/swallow state is module-level, so a previous match's leftovers would otherwise pop up in this one.
    resetCellEffects();
  }

  step(input: unknown): void {
    this.lastInput = input as CellInput;
    if (!this.engine) return;
    this.engine.setInput(this.myId, this.lastInput);
    this.engine.syncBotPopulation();
    this.engine.step();
  }

  render(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const world = this.engine ? this.engine.snapshot() : this.world;
    renderCellScene(ctx, world, this.myId, viewport);
  }

  hud(): MatchHud {
    const world = this.engine ? this.engine.snapshot() : this.world;
    return { status: statusFor(world, this.myId), banner: '', bannerKind: '' };
  }

  isOver(): boolean {
    // No fixed end — the room stays open as long as anyone is in it.
    return false;
  }

  buildOutgoingPacket(): unknown {
    if (this.engine) return this.engine.snapshot();
    const packet: CellMemberPacket = { name: this.myName, input: this.lastInput };
    return packet;
  }

  applyOpponentPacket(packet: unknown): void {
    if (this.engine) {
      const { from, name, input } = packet as CellMemberPacketTagged;
      this.engine.ensurePlayer(from, name);
      this.engine.setInput(from, input);
    } else {
      this.world = packet as CellWorld;
    }
  }

  removePeer(peerId: string): void {
    this.engine?.removePlayer(peerId);
  }
}

export const cellModule: GameModule = {
  id: 'cell',
  label: '세포키우기',
  hint: '← → ↑ ↓ 이동 · 스페이스바로 절반 분열해 앞으로 발사 · 점을 먹고 커지기 · 가끔 나타나는 큰 먹이는 고득점 · 초록 바이러스에 닿으면 큰 세포가 조각남 · 분열된 조각은 시간이 지나면 다시 합쳐짐 · 나보다 작은 세포는 먹고, 큰 세포는 피하기',
  matching: 'room',
  roomCapacity: 6,
  createMatch: (isHost, myId, myName) => new CellMatch(isHost, myId, myName),
  // Solo mode is just a host running alone — syncBotPopulation already fills the room with bots either way.
  createSoloMatch: (myId, myName) => new CellMatch(true, myId, myName),
  createInputSource: (target) => createInputSource(target)
};
