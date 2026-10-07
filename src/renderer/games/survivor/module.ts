/**
 * 뱀서 — the module the shell talks to.
 *
 * Multiplayer runs in input lockstep: every client owns a full simulation, the
 * host owns the clock and the player list, and the only thing on the wire is
 * what each player pressed. Nothing about the swarm travels, which is why two
 * hundred enemies cost the same as two.
 *
 * The host also ships its own bodies and a checksum. Lockstep should make both
 * redundant; they exist so a drift shows up as a marker in the HUD instead of
 * as one player dying on someone else's screen.
 */

import { RESULT_HOLD_FRAMES, ROOM_CAPACITY, RUN_TICKS, TICKS_PER_SECOND, clockText } from './arena.js';
import { SurvivorEngine } from './engine.js';
import { createInputSource } from './input.js';
import {
  FRAME_WINDOW,
  FrameQueue,
  PICK_MASK,
  packInput,
  unpackInput,
  validHostPacket,
  validMemberPacket
} from './lockstep.js';
import type { HostPacket, MemberPacket } from './lockstep.js';
import { followCamera, renderScene } from './scene.js';
import type { Camera } from './scene.js';
import { NO_INPUT } from './types.js';
import type { RunResult, SurvivorInput, SurvivorWorld } from './types.js';
import type { GameMatch, GameModule, MatchHud, Viewport } from '../types.js';

/** A member this far behind can never catch up one tick at a time. */
const CATCH_UP_LIMIT = 2 * TICKS_PER_SECOND;
/** Ticks a member may replay in a single frame while closing a gap. */
const CATCH_UP_PER_FRAME = 4;
/**
 * How far behind a member is allowed to sit before it starts replaying extra
 * ticks. Network jitter alone can park a client a few ticks back, and at one
 * tick per frame it would stay there — which shows up as a level and an
 * experience bar that never quite match the host's.
 */
const CATCH_UP_SLACK = 2;

const EMPTY_WORLD: SurvivorWorld = {
  seed: 0, tick: 0, phase: 'run', players: [], enemies: [], gems: [], strikes: [],
  shots: [], pools: [], chests: [], items: [],
  xp: 0, level: 1, kills: 0, offers: [], pendingIds: [], picks: [], evolved: null, reaper: false,
  pickDeadline: -1, survived: false
};

/** Time left in the run — the HUD counts down, the way the original does. */
const clock = (tick: number): string => clockText(RUN_TICKS - tick);

class SurvivorMatch implements GameMatch {
  /** Every client has one. A member's is built from the host's first packet. */
  private engine: SurvivorEngine | null;
  private camera: Camera = { x: 0, y: 0 };
  private snapCamera = true;
  private lastInput: SurvivorInput = NO_INPUT;
  /** Free-running frame counter — the only clock the wing flaps have. */
  private phase = 0;
  /** Frames since the run ended, and the summary drawn over them. */
  private overFrames = 0;
  private result: RunResult | null = null;

  // Host side.
  /** Latest input heard from each member, applied until a newer one arrives. */
  private memberBits = new Map<string, number>();
  private names = new Map<string, string>();
  /** Recent frames, newest last — the loss window every packet repeats. */
  private frames: number[][] = [];
  private frameBase = 1;

  // Member side.
  /** Frames this client has applied — the unit the host's checksum is keyed to. */
  private appliedFrame = 0;
  /**
   * Card choices are taps: the input source reports them for the one tick the
   * key went down. A member only sends twice per frame, so an unlatched tap
   * lands between sends and is simply lost — which reads as "my level-up
   * choice did nothing". Held here until a packet actually carries it.
   */
  private latchedPicks = 0;
  private queue = new FrameQueue();
  private hostFrame = 0;
  private hostSum: { frame: number; sum: number } | null = null;
  private desynced = false;

  constructor(
    private isHost: boolean,
    private myId: string,
    private myName: string,
    solo: boolean
  ) {
    // A room can't hang on an absent player, so only a room times the card pick.
    this.engine = isHost ? new SurvivorEngine(Date.now() & 0x7fffffff, !solo) : null;
    this.engine?.ensurePlayer(myId, myName);
    this.names.set(myId, myName);
  }

  setMembers(members: { id: string; name: string }[]): void {
    for (const m of members) this.names.set(m.id, m.name);
    if (!this.isHost || !this.engine) return;
    for (const m of members) this.engine.ensurePlayer(m.id, m.name);
  }

  removePeer(peerId: string): void {
    this.memberBits.delete(peerId);
    if (this.isHost) this.engine?.removePlayer(peerId);
  }

  step(input: unknown): void {
    this.lastInput = (input as SurvivorInput) ?? NO_INPUT;
    if (!this.isHost) this.latchedPicks |= packInput(this.lastInput) & PICK_MASK;
    this.phase += 1;
    if (!this.engine) return;
    if (this.isHost) this.stepHost();
    else this.stepMember();
    this.trackEnding(this.engine);
  }

  /**
   * The engine freezes on 'over', so the result is read once and then held for
   * a few seconds of frames — see RESULT_HOLD_FRAMES for why the shell can't
   * be told immediately.
   */
  private trackEnding(engine: SurvivorEngine): void {
    if (engine.runPhase() !== 'over') return;
    if (!this.result) {
      const world = engine.snapshot();
      const mine = engine.loadout(this.myId);
      this.result = {
        survived: world.survived,
        ticks: world.tick,
        level: world.level,
        kills: world.kills,
        weapons: mine.weapons,
        passives: mine.passives
      };
    }
    this.overFrames += 1;
  }

  /** The host simulates on its own clock and records the frame it just used. */
  private stepHost(): void {
    const engine = this.engine!;
    const ids = engine.playerIds();
    const frame: number[] = [];
    for (const id of ids) {
      const bits = id === this.myId ? packInput(this.lastInput) : (this.memberBits.get(id) ?? 0);
      engine.setInput(id, unpackInput(bits));
      frame.push(bits);
    }
    engine.step();

    this.frames.push(frame);
    if (this.frames.length > FRAME_WINDOW) {
      this.frames.shift();
      this.frameBase += 1;
    }
  }

  /**
   * A member replays the host's frames and nothing else. It never steps a tick
   * it hasn't heard about — that is what keeps the two swarms identical.
   */
  private stepMember(): void {
    const engine = this.engine!;

    if (this.queue.backlog(this.hostFrame) > CATCH_UP_LIMIT) {
      // Too far gone to replay. Jump to the live edge and let the checksum
      // report the swarm as drifted rather than freeze the game.
      this.queue.skipTo(Math.max(1, this.hostFrame - FRAME_WINDOW + 1));
      this.desynced = true;
    }

    const behind = this.queue.backlog(this.hostFrame);
    const budget = behind > CATCH_UP_SLACK ? Math.min(CATCH_UP_PER_FRAME, behind) : 1;
    for (let i = 0; i < budget; i++) {
      const frame = this.queue.take();
      if (!frame) break;
      const ids = engine.playerIds();
      ids.forEach((id, index) => engine.setInput(id, unpackInput(frame[index] ?? 0)));
      engine.step();
      this.appliedFrame += 1;
      this.verifyChecksum();
    }
  }

  /**
   * Compares fingerprints at the same *frame*, not the same simulation tick —
   * a level-up pause produces frames without advancing the tick, so the two
   * counters part ways the first time anyone levels.
   */
  private verifyChecksum(): void {
    if (!this.hostSum || this.hostSum.frame !== this.appliedFrame) return;
    this.desynced = this.engine!.checksum() !== this.hostSum.sum;
    this.hostSum = null;
  }

  render(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const world = this.world();
    // Nothing about this camera reaches the simulation. It eases toward the
    // local figure and carries the local window's size, so the engine rings its
    // own fixed frame instead — see `SPAWN_HALF_W`.
    followCamera(this.camera, world, this.myId, this.snapCamera);
    this.snapCamera = false;
    renderScene(ctx, viewport, world, this.camera, this.myId, this.phase, this.need(), {
      result: this.result,
      framesLeft: Math.max(0, RESULT_HOLD_FRAMES - this.overFrames)
    });
  }

  hud(): MatchHud {
    const drift = this.desynced ? ' · 동기화 어긋남' : '';

    // Once the run is over the countdown and a 0 HP bar say nothing useful —
    // what lasted is the only number worth keeping on the line.
    if (this.result) {
      const status = `생존 ${clockText(this.result.ticks)} · Lv.${this.result.level} · ${this.result.kills}킬${drift}`;
      return {
        status,
        banner: this.result.survived ? '버텼다' : '전멸',
        bannerKind: this.result.survived ? 'win' : 'lose'
      };
    }

    const world = this.world();
    const alive = world.players.filter((p) => p.alive).length;
    const me = world.players.find((p) => p.id === this.myId);
    // A dead player in a room keeps watching, so the line says so rather than
    // sitting on a 0 that looks like a bug.
    const own = !me ? '-' : me.alive ? `HP ${Math.ceil(me.hp)}/${Math.round(me.maxHp)}` : '관전';
    const status = `${own} · ${clock(world.tick)} · Lv.${world.level} · ${world.kills}킬` +
      (world.players.length > 1 ? ` · 생존 ${alive}/${world.players.length}` : '') + drift;

    // The reaper comes first: it is the only warning that it is over, and an
    // evolution opened seconds before ten minutes would otherwise bury it.
    if (world.reaper) return { status, banner: '사신이 왔다', bannerKind: 'lose' };
    // An evolution is the payoff of a whole build — it gets its own shout.
    if (world.evolved) return { status, banner: `${world.evolved} 진화`, bannerKind: 'win' };
    return { status, banner: '', bannerKind: '' };
  }

  isOver(): boolean {
    return this.result !== null && this.overFrames >= RESULT_HOLD_FRAMES;
  }

  buildOutgoingPacket(): unknown {
    if (!this.isHost) {
      // Movement is a hold, so the live value is right; picks ride the latch.
      const bits = (packInput(this.lastInput) & ~PICK_MASK) | this.latchedPicks;
      this.latchedPicks = 0;
      const packet: MemberPacket = { t: 'svi', bits, name: this.myName };
      return packet;
    }

    const engine = this.engine!;
    const ids = engine.playerIds();
    const world = engine.snapshot();
    const packet: HostPacket = {
      t: 'svf',
      seed: world.seed,
      ids,
      names: ids.map((id) => this.names.get(id) ?? ''),
      base: this.frameBase,
      frames: this.frames,
      bodies: ids.map((id) => {
        const p = world.players.find((row) => row.id === id);
        return [Math.round(p?.x ?? 0), Math.round(p?.y ?? 0), Math.round(p?.hp ?? 0), p?.alive ? 1 : 0];
      }),
      sum: engine.checksum()
    };
    return packet;
  }

  applyOpponentPacket(packet: unknown): void {
    if (this.isHost) {
      const tagged = packet as MemberPacket & { from?: string };
      if (typeof tagged?.from !== 'string' || !validMemberPacket(packet)) return;
      if (tagged.name) this.names.set(tagged.from, tagged.name);
      this.engine?.ensurePlayer(tagged.from, this.names.get(tagged.from) ?? '');
      this.memberBits.set(tagged.from, tagged.bits);
      return;
    }

    if (!validHostPacket(packet)) return;
    this.adoptRoster(packet);

    // Joining a run already in progress: the frames that built the host's
    // swarm are long gone, so this client starts its own from the live edge.
    // Bodies, level and the clock still come from the host — only the swarm
    // around them is this client's own. Flagged, because it is a real drift.
    // Two ways to end up unable to replay: joining a run in progress, or losing
    // so many datagrams in a row that the hole falls out of the host's window.
    // Both are repaired the same way — jump to the live edge and say so.
    if (packet.base > this.queue.nextTick) {
      const skipped = packet.base - this.queue.nextTick;
      this.queue.skipTo(packet.base);
      this.appliedFrame += skipped;
      this.desynced = true;
    }

    this.queue.ingest(packet);
    this.hostFrame = packet.base + packet.frames.length - 1;
    this.hostSum = { frame: this.hostFrame, sum: packet.sum };

    // Drift insurance, and only that. A member usually trails the host by a
    // tick or two, so copying the host's *current* bodies onto an earlier tick
    // would itself cause the drift this is meant to repair. It runs only once
    // the checksum says the swarms have already parted ways.
    if (!this.desynced) return;
    const engine = this.engine!;
    packet.ids.forEach((id, i) => {
      const [x, y, hp, alive] = packet.bodies[i];
      engine.reconcile(id, x, y, hp, alive === 1);
    });
  }

  /** Builds this member's engine and player list to match the host's, in order. */
  private adoptRoster(packet: HostPacket): void {
    if (!this.engine) {
      this.engine = new SurvivorEngine(packet.seed, true);
      this.snapCamera = true;
    }
    const engine = this.engine;
    packet.ids.forEach((id, i) => {
      this.names.set(id, packet.names[i] || this.names.get(id) || '');
      engine.ensurePlayer(id, this.names.get(id) ?? '');
    });
    // Anyone the host dropped goes too, or the two swarms chase different crowds.
    for (const id of engine.playerIds()) {
      if (!packet.ids.includes(id)) engine.removePlayer(id);
    }
  }

  private world(): SurvivorWorld {
    return this.engine ? this.engine.snapshot() : EMPTY_WORLD;
  }

  private need(): number {
    return this.engine ? this.engine.xpNeeded() : 1;
  }
}

export const survivorModule: GameModule = {
  id: 'survivor',
  label: '뱀서',
  hint: '← → ↑ ↓ 이동 · 공격은 자동 · 레벨업은 1 2 3',
  matching: 'room',
  roomCapacity: ROOM_CAPACITY,
  createMatch: (isHost, myId, myName) => new SurvivorMatch(isHost, myId, myName, false),
  createSoloMatch: (myId, myName) => new SurvivorMatch(true, myId, myName, true),
  createInputSource
};
