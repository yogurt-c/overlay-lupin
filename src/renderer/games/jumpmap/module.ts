import { JumpmapEngine } from './engine.js';
import { cameraTarget, followCamera, renderJumpmapScene } from './scene.js';
import type { Camera } from './scene.js';
import { createInputSource } from './input.js';
import { GOAL_Y, ROOM_CAPACITY, START_Y } from './field.js';
import type { JumpmapInput, JumpmapMemberPacket, JumpmapMemberPacketTagged, JumpmapWorld, PlayerView } from './types.js';
import type { GameMatch, GameModule, MatchHud, Viewport } from '../types.js';

const EMPTY_WORLD: JumpmapWorld = { phase: 'race', timerMs: 0, tick: 0, players: [] };
const NO_INPUT: JumpmapInput = { left: false, right: false, jump: false, down: false, attack: false };

function progressOf(player: PlayerView): number {
  const span = START_Y - GOAL_Y;
  const climbed = START_Y - player.y;
  return Math.max(0, Math.min(100, Math.round((climbed / span) * 100)));
}

/** Finishers first, ordered by who touched the goal first; everyone else by how high they've climbed. */
function ranked(world: JumpmapWorld): PlayerView[] {
  const finished = world.players.filter((p) => p.finish !== undefined).sort((a, b) => (a.finish ?? 0) - (b.finish ?? 0));
  const racing = world.players.filter((p) => p.finish === undefined).sort((a, b) => a.y - b.y);
  return [...finished, ...racing];
}

function statusFor(world: JumpmapWorld, myId: string): string {
  const me = world.players.find((p) => p.id === myId);
  if (!me) return '';
  const rank = ranked(world).findIndex((p) => p.id === myId) + 1;
  if (me.finish !== undefined) return `${rank}위 도착 · ${world.players.length}명`;
  return `${rank}위 · ${progressOf(me)}% 등반`;
}

function bannerFor(world: JumpmapWorld, myId: string): { banner: string; bannerKind: string } {
  const me = world.players.find((p) => p.id === myId);

  if (world.phase === 'grace') {
    if (me && me.finish !== undefined) return { banner: `${me.finish}위 도착!`, bannerKind: 'over' };
    return { banner: `1위 도착! ${Math.ceil(world.timerMs / 1000)}초 뒤 순위 마감`, bannerKind: 'small' };
  }
  if (world.phase === 'intermission') {
    return { banner: me && me.finish !== undefined ? `${me.finish}위로 이번 판 마감` : '이번 판 마감', bannerKind: 'over' };
  }
  return { banner: '', bannerKind: '' };
}

class JumpmapMatch implements GameMatch {
  /** Only set for the host — the authoritative simulation. */
  private engine: JumpmapEngine | null;
  /** Only meaningful for a member: the latest snapshot the host sent. */
  private world: JumpmapWorld = EMPTY_WORLD;
  private lastInput: JumpmapInput = NO_INPUT;

  private camera: Camera = { camX: 0, camY: 0 };
  private snapCamera = true;
  /** Free-running counter driving the walk-cycle animation — the only clock the poses have. */
  private anim = 0;

  constructor(
    private isHost: boolean,
    private myId: string,
    private myName: string
  ) {
    this.engine = isHost ? new JumpmapEngine() : null;
    this.engine?.ensurePlayer(myId, myName);
  }

  step(input: unknown): void {
    this.lastInput = (input as JumpmapInput) ?? NO_INPUT;
    this.anim += 0.16;
    if (!this.engine) return;
    this.engine.setInput(this.myId, this.lastInput);
    this.engine.step();
  }

  render(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const world = this.currentWorld();
    const me = world.players.find((p) => p.id === this.myId);
    const target = cameraTarget(me);
    this.camera = this.snapCamera ? target : followCamera(this.camera, target);
    this.snapCamera = false;

    renderJumpmapScene(ctx, world, this.myId, this.camera, viewport, this.anim);
  }

  hud(): MatchHud {
    const world = this.currentWorld();
    if (!world.players.some((p) => p.id === this.myId)) return { status: '', banner: '', bannerKind: '' };
    return { status: statusFor(world, this.myId), ...bannerFor(world, this.myId) };
  }

  isOver(): boolean {
    // No fixed end — the room stays open, cycling rounds, as long as anyone is in it.
    return false;
  }

  buildOutgoingPacket(): unknown {
    if (this.engine) return this.engine.snapshot();
    const packet: JumpmapMemberPacket = { name: this.myName, input: this.lastInput };
    return packet;
  }

  applyOpponentPacket(packet: unknown): void {
    if (this.engine) {
      const { from, name, input } = packet as JumpmapMemberPacketTagged;
      this.engine.ensurePlayer(from, name);
      this.engine.setInput(from, input);
    } else {
      this.world = packet as JumpmapWorld;
    }
  }

  removePeer(peerId: string): void {
    this.engine?.removePlayer(peerId);
  }

  private currentWorld(): JumpmapWorld {
    return this.engine ? this.engine.snapshot() : this.world;
  }
}

export const jumpmapModule: GameModule = {
  id: 'jumpmap',
  label: '점프맵',
  hint: '← → 이동 · Space 점프(공중에서 한 번 더로 에어점프) · ↓로 빠르게 낙하 · X로 짧게 밀쳐내기 · 제한시간 없이 깃발을 먼저 찍으면 1위, 이후 15초 그레이스 타임 동안 나머지 순위 확정 · 발판 밖으로 떨어져도 체크포인트에서 바로 리스폰',
  matching: 'room',
  roomCapacity: ROOM_CAPACITY,
  createMatch: (isHost, myId, myName) => new JumpmapMatch(isHost, myId, myName),
  createInputSource: (target) => createInputSource(target)
};
