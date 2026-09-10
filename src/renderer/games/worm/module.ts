import { ROOM_CAPACITY, WIN_KILLS } from './arena.js';
import { weaponAt } from './weapons.js';
import { WormEngine } from './engine.js';
import { carveCrater, generateTerrain } from './terrain.js';
import type { Terrain } from './terrain.js';
import { BURST_FRAMES, cameraTarget, followCamera, renderWormScene } from './scene.js';
import type { Burst } from './scene.js';
import { createInputSource } from './input.js';
import type { GameMatch, GameModule, MatchHud, Viewport } from '../types.js';
import { decodeCraters, decodeShells, poseAt } from './types.js';
import type { WormInput, WormMemberPacket, WormMemberPacketTagged, WormWorld } from './types.js';

const NO_INPUT: WormInput = { left: false, right: false, aimUp: false, aimDown: false, jump: false, fire: false };
const EMPTY_WORLD: WormWorld = { seed: 0, phase: 'play', worms: [], shells: [], items: [], craters: [], winnerId: null };

class WormMatch implements GameMatch {
  /** Set only for the host — the one authoritative simulation. */
  private engine: WormEngine | null;
  /** Meaningful only for a member: the latest snapshot the host sent. */
  private world: WormWorld = EMPTY_WORLD;
  /**
   * A member's own copy of the ground, grown from the host's seed and kept in
   * step by replaying crater events. The host reads its engine's terrain instead.
   */
  private mirroredTerrain: Terrain | null = null;
  private appliedCraterSeq = 0;

  private lastInput: WormInput = NO_INPUT;
  private bursts: Burst[] = [];
  private camera = { camX: 0, camY: 0 };
  private snapCamera = true;
  /** Free-running frame counter, the only clock the pose animations have. */
  private phase = 0;

  constructor(
    private isHost: boolean,
    private myId: string,
    private myName: string
  ) {
    this.engine = isHost ? new WormEngine() : null;
    this.engine?.ensureWorm(myId, myName);
  }

  step(input: unknown): void {
    this.lastInput = (input as WormInput) ?? NO_INPUT;
    this.phase += 1;

    for (const burst of this.bursts) burst.age += 1;
    this.bursts = this.bursts.filter((burst) => burst.age <= BURST_FRAMES);

    if (!this.engine) return;
    this.engine.setInput(this.myId, this.lastInput);
    this.engine.step();
    this.absorbCraters(this.engine.snapshot());
  }

  render(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const world = this.currentWorld();
    const terrain = this.currentTerrain();
    if (!terrain) return;

    const me = world.worms.find((worm) => worm.id === this.myId);
    const myIndex = world.worms.findIndex((worm) => worm.id === this.myId);
    const myShell = myIndex < 0 ? undefined : decodeShells(world.shells).find((shell) => shell.o === myIndex);
    const target = cameraTarget(me, myShell);
    this.camera = this.snapCamera ? target : followCamera(this.camera, target);
    this.snapCamera = false;

    renderWormScene(ctx, world, terrain, this.bursts, this.myId, this.camera, viewport, this.phase);
  }

  hud(): MatchHud {
    const world = this.currentWorld();
    const me = world.worms.find((worm) => worm.id === this.myId);
    if (!me) return { status: '', banner: '', bannerKind: '' };

    if (world.phase === 'over') {
      const won = world.winnerId === this.myId;
      return {
        status: `${me.kills}/${WIN_KILLS}킬`,
        banner: won ? '승리' : '패배',
        bannerKind: 'over'
      };
    }

    if (me.d !== undefined) {
      return {
        status: `${me.kills}/${WIN_KILLS}킬`,
        banner: `부활까지 ${Math.ceil(me.d / 1000)}초`,
        bannerKind: 'down'
      };
    }

    const parts = [`HP ${me.hp}`];
    if (me.w !== undefined) parts.push(`${weaponAt(me.w).label} ${me.a ?? 0}발`);
    if (me.s) parts.push(`쉴드 ${Math.ceil(me.s / 60)}초`);
    parts.push(`${me.kills}/${WIN_KILLS}킬`);

    return {
      status: parts.join(' · '),
      banner: poseAt(me.p) === 'taunt' ? '격추!' : '',
      bannerKind: 'kill'
    };
  }

  isOver(): boolean {
    if (this.engine) return this.engine.isOver;
    // A member follows the host's phase and lets the host's own clock end the match.
    return false;
  }

  buildOutgoingPacket(): unknown {
    if (this.engine) return this.engine.snapshot();
    const packet: WormMemberPacket = { name: this.myName, input: this.lastInput };
    return packet;
  }

  applyOpponentPacket(packet: unknown): void {
    if (this.engine) {
      const { from, name, input } = packet as WormMemberPacketTagged;
      this.engine.ensureWorm(from, name);
      this.engine.setInput(from, input);
      return;
    }

    const world = packet as WormWorld;
    this.world = world;
    if (!this.mirroredTerrain && world.seed) {
      this.mirroredTerrain = generateTerrain(world.seed);
    }
    this.absorbCraters(world);
  }

  removePeer(peerId: string): void {
    this.engine?.removeWorm(peerId);
  }

  /**
   * Applies every crater we haven't seen yet, and spawns its burst. The host
   * runs this too, purely for the visual — its terrain was already carved by
   * the engine, so `carveCrater` is skipped there.
   */
  private absorbCraters(world: WormWorld): void {
    for (const crater of decodeCraters(world.craters)) {
      if (crater.seq <= this.appliedCraterSeq) continue;
      this.appliedCraterSeq = crater.seq;
      this.bursts.push({ x: crater.x, y: crater.y, r: crater.r, age: 0 });
      if (!this.engine && this.mirroredTerrain) {
        this.mirroredTerrain = carveCrater(this.mirroredTerrain, crater.x, crater.y, crater.r);
      }
    }
  }

  private currentWorld(): WormWorld {
    return this.engine ? this.engine.snapshot() : this.world;
  }

  private currentTerrain(): Terrain | null {
    return this.engine ? this.engine.terrain : this.mirroredTerrain;
  }
}

export const wormModule: GameModule = {
  id: 'worm',
  label: '지렁포',
  hint: '← → 이동 · ↑ ↓ 각도 · Shift 점프 · Space 꾹 눌러 파워 충전, 떼면 발사 · 먼저 5킬',
  matching: 'room',
  roomCapacity: ROOM_CAPACITY,
  createMatch: (isHost, myId, myName) => new WormMatch(isHost, myId, myName),
  createInputSource: (target) => createInputSource(target)
};
