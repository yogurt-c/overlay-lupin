import {
  ATTACK_COOLDOWN_TICKS,
  ATTACK_FRONT_SLOP,
  ATTACK_RANGE_X,
  ATTACK_RANGE_Y,
  ATTACK_SWING_FRAMES,
  FASTFALL_ACCEL,
  GRACE_MS,
  GRAVITY,
  INTERMISSION_MS,
  JUMP_VELOCITY,
  KNOCKBACK_DECAY,
  KNOCKBACK_REST_SPEED,
  KNOCKBACK_STUN_TICKS,
  KNOCKBACK_VX,
  KNOCKBACK_VY,
  MAX_FALL_SPEED,
  MOVE_SPEED,
  movingPlatformX,
  PLATFORMS,
  PLAYER_HALF_W,
  RESPAWN_WORLD_MARGIN,
  START_X,
  START_Y,
  TRAMPOLINE_VELOCITY,
  WORLD_HEIGHT,
  WORLD_WIDTH
} from './field.js';
import type { PlatformKind } from './field.js';
import { poseIndex } from './types.js';
import type { JumpmapInput, JumpmapWorld, Phase, RunnerState, InputFrame } from './types.js';

const TICK_MS = 1000 / 60;

const NO_INPUT: JumpmapInput = { left: false, right: false, jump: false, down: false, attack: false };

/** A platform's position for this tick, plus how far it moved since last tick — riders need the delta, not just the new spot. */
interface RuntimePlatform {
  id: string;
  kind: PlatformKind;
  x: number;
  y: number;
  w: number;
  deltaX: number;
}

interface EnginePlayer extends RunnerState {
  id: string;
  /** Names stay host-side rather than repeating in world packets. */
  name: string;
  input: JumpmapInput;
}

/**
 * Shared deterministic movement. Prediction runs only the local runner and
 * leaves hits, finish order, and round transitions to the authoritative host.
 */
export class JumpmapEngine {
  players = new Map<string, EnginePlayer>();
  phase: Phase = 'race';
  /** ms left in the current grace/intermission countdown; meaningless during a plain race. */
  timerMs = 0;

  private tick = 0;
  private remote = new Map<string, { ack: number; frames: InputFrame[] }>();

  constructor(private predicting = false) {}

  /** One sequenced sample represents one 60Hz input tick. Duplicates are harmless. */
  queueInputs(id: string, frames: InputFrame[]): void {
    let stream = this.remote.get(id);
    if (!stream) { stream = { ack: 0, frames: [] }; this.remote.set(id, stream); }
    for (const frame of frames) {
      if (!Number.isSafeInteger(frame.seq) || frame.seq <= stream.ack || frame.seq > stream.ack + 180) continue;
      if (!stream.frames.some(f => f.seq === frame.seq)) stream.frames.push(frame);
    }
    stream.frames.sort((a, b) => a.seq - b.seq);
  }

  restore(id: string, state: RunnerState, tick: number, phase: Phase): void {
    this.ensurePlayer(id, id);
    Object.assign(this.players.get(id)!, state, { finish: state.finish, impact: state.impact });
    this.tick = tick;
    this.phase = phase;
    this.updatePlatforms();
  }

  private finishSeq = 0;
  private platformRuntime = new Map<string, RuntimePlatform>();

  /** Lazily creates a runner the first time we hear from someone — mid-race joiners need no separate path. */
  ensurePlayer(id: string, name: string): void {
    const existing = this.players.get(id);
    if (existing) {
      existing.name = name;
      return;
    }
    this.players.set(id, {
      id,
      name,
      x: START_X,
      y: START_Y,
      vy: 0,
      facing: 1,
      airborne: false,
      knockVX: 0,
      stunTicks: 0,
      attackCooldown: 0,
      atkAnim: 0,
      jumpHeld: false,
      attackHeld: false,
      standingOn: 'start',
      pose: 'idle',
      poseTimer: 0,
      finish: undefined,
      input: NO_INPUT
    });
  }

  setInput(id: string, input: JumpmapInput): void {
    const player = this.players.get(id);
    if (player) player.input = input;
  }

  removePlayer(id: string): void {
    this.players.delete(id);
    this.remote.delete(id);
  }

  /** Advances the simulation by exactly one tick. */
  step(): void {
    this.tick += 1;
    this.updatePlatforms();

    if (this.phase === 'intermission') {
      for (const stream of this.remote.values()) {
        while (stream.frames[0]?.seq === stream.ack + 1) stream.ack = stream.frames.shift()!.seq;
      }
      if (this.predicting) return;
      this.timerMs -= TICK_MS;
      if (this.timerMs <= 0) this.resetRound();
      return;
    }

    for (const player of this.players.values()) {
      const stream = this.remote.get(player.id);
      // During packet gaps the last held input already advanced physics. Coalesce
      // redundant held samples on recovery, but preserve every input transition.
      // Never simulate multiple movement/gravity/platform ticks in one host tick.
      if (stream) {
        while (stream.frames.length > 4 && stream.frames[0].seq === stream.ack + 1 &&
          this.sameInput(stream.frames[0].input, player.input)) {
          stream.ack = stream.frames.shift()!.seq;
        }
        const next = stream.frames[0];
        if (next?.seq === stream.ack + 1) {
          stream.frames.shift();
          stream.ack = next.seq;
          player.input = next.input;
        }
      }
      this.stepPlayer(player);
    }

    if (!this.predicting && this.phase === 'grace') {
      this.timerMs -= TICK_MS;
      const everyone = Array.from(this.players.values());
      const allDone = everyone.length > 0 && everyone.every((p) => p.finish !== undefined);
      if (this.timerMs <= 0 || allDone) {
        this.phase = 'intermission';
        this.timerMs = INTERMISSION_MS;
      }
    }
  }

  /* --------------------------------------------------------- platforms */

  /** Moving platforms swing sinusoidally; everything else just holds still. */
  private updatePlatforms(): void {
    for (const spec of PLATFORMS) {
      const prevX = movingPlatformX(spec, this.tick - 1);
      const nextX = movingPlatformX(spec, this.tick);
      this.platformRuntime.set(spec.id, { id: spec.id, kind: spec.kind, x: nextX, y: spec.y, w: spec.w, deltaX: nextX - prevX });
    }
  }

  /* ------------------------------------------------------------ runner */

  private sameInput(a: JumpmapInput, b: JumpmapInput): boolean {
    return a.left === b.left && a.right === b.right && a.jump === b.jump &&
      a.down === b.down && a.attack === b.attack;
  }

  private stepPlayer(player: EnginePlayer): void {
    if (player.finish !== undefined) {
      if (player.poseTimer > 0) player.poseTimer -= 1;
      return;
    }

    if (player.attackCooldown > 0) player.attackCooldown -= 1;
    if (player.atkAnim > 0) player.atkAnim -= 1;

    // Ride whatever we're standing on before anything else moves us.
    if (player.standingOn) {
      const plat = this.platformRuntime.get(player.standingOn);
      if (plat && plat.kind === 'moving') player.x += plat.deltaX;
    }

    if (player.stunTicks > 0) {
      player.stunTicks -= 1;
    } else {
      this.applyWalk(player);
      this.applyJump(player);
      this.applyAttack(player);
    }

    if (Math.abs(player.knockVX) > KNOCKBACK_REST_SPEED) {
      player.x += player.knockVX;
      player.knockVX *= KNOCKBACK_DECAY;
    } else {
      player.knockVX = 0;
    }

    player.x = Math.max(PLAYER_HALF_W, Math.min(WORLD_WIDTH - PLAYER_HALF_W, player.x));

    this.applyGravityAndLanding(player);
    this.checkRespawn(player);
    this.settlePose(player);
  }

  private applyWalk(player: EnginePlayer): void {
    const direction = player.input.left === player.input.right ? 0 : player.input.left ? -1 : 1;
    if (direction === 0) return;
    player.facing = direction as 1 | -1;
    player.x += direction * MOVE_SPEED;
  }

  /**
   * Edge-triggered: one hop per press, same as every other game's jump.
   * Airborne presses are consumed without jumping; landing enables the next press.
   */
  private applyJump(player: EnginePlayer): void {
    const pressed = player.input.jump && !player.jumpHeld;
    player.jumpHeld = player.input.jump;
    if (!pressed || player.airborne) return;

    player.vy = JUMP_VELOCITY;
    player.airborne = true;
    player.standingOn = null;
  }

  /**
   * The only offense in the game: a short bat swing in front of the runner,
   * connecting with at most the one nearest target — never a crowd standing
   * behind you, and never everyone bunched up in a squeeze at once.
   */
  private applyAttack(player: EnginePlayer): void {
    const pressed = player.input.attack && !player.attackHeld;
    player.attackHeld = player.input.attack;
    if (!pressed || player.attackCooldown > 0) return;

    player.attackCooldown = ATTACK_COOLDOWN_TICKS;
    player.atkAnim = ATTACK_SWING_FRAMES;

    if (this.predicting) return; // Local swings are visual; only the host can hit another runner.

    let target: EnginePlayer | null = null;
    let bestDistance = Infinity;

    for (const other of this.players.values()) {
      if (other.id === player.id || other.finish !== undefined) continue;
      const dx = other.x - player.x;
      const dy = other.y - player.y;
      if (Math.abs(dx) > ATTACK_RANGE_X || Math.abs(dy) > ATTACK_RANGE_Y) continue;
      // The swing only reaches whoever is roughly ahead of the swinger, with a
      // little slop so someone standing almost dead-on still counts.
      if (dx * player.facing < -ATTACK_FRONT_SLOP) continue;

      const distance = Math.abs(dx) + Math.abs(dy);
      if (distance < bestDistance) {
        bestDistance = distance;
        target = other;
      }
    }

    if (!target) return;
    const dir = target.x - player.x >= 0 ? 1 : -1;
    target.knockVX = dir * KNOCKBACK_VX;
    target.vy = KNOCKBACK_VY;
    target.airborne = true;
    target.standingOn = null;
    target.stunTicks = KNOCKBACK_STUN_TICKS;
    target.pose = 'hit';
    target.poseTimer = KNOCKBACK_STUN_TICKS;
  }

  /**
   * Grounded runners stay pinned to whatever they're standing on (which may
   * itself be sliding sideways); everyone else falls, and a fall is checked
   * against every platform's *top* surface only, using where they were a
   * moment ago so a fast drop can't tunnel through one in a single tick.
   */
  private applyGravityAndLanding(player: EnginePlayer): void {
    const prevY = player.y;

    if (!player.airborne) {
      const plat = player.standingOn ? this.platformRuntime.get(player.standingOn) : undefined;
      const stillOver = plat && player.x + PLAYER_HALF_W > plat.x && player.x - PLAYER_HALF_W < plat.x + plat.w;
      if (plat && stillOver) {
        player.y = plat.y;
        return;
      }
      player.airborne = true;
      player.standingOn = null;
    }

    const fastFall = player.input.down;
    player.vy = Math.min(MAX_FALL_SPEED, player.vy + GRAVITY + (fastFall ? FASTFALL_ACCEL : 0));
    player.y += player.vy;

    if (player.vy < 0) return; // still rising — nothing to land on yet

    for (const plat of this.platformRuntime.values()) {
      const overlapsX = player.x + PLAYER_HALF_W > plat.x && player.x - PLAYER_HALF_W < plat.x + plat.w;
      if (!overlapsX) continue;
      if (!(prevY <= plat.y && player.y >= plat.y)) continue;
      this.land(player, plat);
      return;
    }
  }

  private land(player: EnginePlayer, plat: RuntimePlatform): void {
    player.impact = { platformId: plat.id, x: Math.round(player.x), tick: this.tick };
    player.y = plat.y;
    player.vy = 0;
    player.airborne = false;
    player.standingOn = plat.id;

    if (plat.kind === 'trampoline') {
      player.vy = TRAMPOLINE_VELOCITY;
      player.airborne = true;
      player.standingOn = null;
      return;
    }
    if (!this.predicting && plat.kind === 'goal' && player.finish === undefined) {
      this.finish(player);
    }
  }

  /** Falling below the entire course restarts the climb at the bottom. */
  private checkRespawn(player: EnginePlayer): void {
    if (player.finish !== undefined) return;
    if (player.y > WORLD_HEIGHT + RESPAWN_WORLD_MARGIN) {
      player.x = START_X;
      player.y = START_Y;
      player.standingOn = 'start';
      player.impact = undefined;
      player.atkAnim = 0;
      player.vy = 0;
      player.airborne = false;
      player.knockVX = 0;
      player.stunTicks = 0;
      player.pose = 'idle';
    }
  }

  private settlePose(player: EnginePlayer): void {
    if (player.stunTicks > 0) {
      player.pose = 'hit';
      return;
    }
    if (player.airborne) {
      player.pose = player.vy < 0 ? 'jump' : 'fall';
      return;
    }
    player.pose = player.input.left !== player.input.right ? 'move' : 'idle';
  }

  private finish(player: EnginePlayer): void {
    this.finishSeq += 1;
    player.finish = this.finishSeq;
    player.pose = 'finish';
    if (this.phase === 'race') {
      this.phase = 'grace';
      this.timerMs = GRACE_MS;
    }
  }

  /** Sends everyone back to the start for a fresh round — the room itself never closes. */
  private resetRound(): void {
    for (const player of this.players.values()) {
      player.x = START_X;
      player.y = START_Y;
      player.vy = 0;
      player.facing = 1;
      player.airborne = false;
      player.knockVX = 0;
      player.stunTicks = 0;
      player.attackCooldown = 0;
      player.atkAnim = 0;
      player.standingOn = 'start';
      player.finish = undefined;
      player.impact = undefined;
      player.pose = 'idle';
      player.poseTimer = 0;
    }
    this.finishSeq = 0;
    this.phase = 'race';
    this.timerMs = 0;
  }

  /* ------------------------------------------------------------ snapshot */

  private runnerState(player: EnginePlayer): RunnerState {
    const { id, name, input, ...state } = player;
    return { ...state, impact: state.impact && this.tick - state.impact.tick < 45 ? { ...state.impact } : undefined };
  }

  snapshot(withState = false): JumpmapWorld {
    return {
      phase: this.phase,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      tick: this.tick,
      players: Array.from(this.players.values()).map((player) => ({
        id: player.id,
        ...(withState ? { state: this.runnerState(player), ack: this.remote.get(player.id)?.ack ?? 0 } : {}),
        x: Math.round(player.x),
        y: Math.round(player.y),
        facing: player.facing,
        p: poseIndex(player.pose),
        finish: player.finish,
        atk: player.atkAnim > 0 ? player.atkAnim : undefined,
        impact: player.impact && this.tick - player.impact.tick < 45 ? player.impact : undefined
      }))
    };
  }
}
