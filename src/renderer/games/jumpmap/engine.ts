import {
  AIR_JUMP_VELOCITY,
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
  RESPAWN_FALL_MARGIN,
  RESPAWN_WORLD_MARGIN,
  START_X,
  START_Y,
  TRAMPOLINE_VELOCITY,
  WORLD_HEIGHT,
  WORLD_WIDTH
} from './field.js';
import type { PlatformKind } from './field.js';
import { poseIndex } from './types.js';
import type { JumpmapInput, JumpmapWorld, Phase, Pose, PlayerView } from './types.js';

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

interface EnginePlayer {
  id: string;
  /** Host-side only — left out of the snapshot the same way every other game's roster does. */
  name: string;
  x: number;
  y: number;
  vy: number;
  facing: 1 | -1;
  airborne: boolean;
  /** One extra hop per airborne spell — cleared the moment a runner lands. */
  airJumped: boolean;
  /** Decaying horizontal drift from a shove; separate from the direct, input-driven walk. */
  knockVX: number;
  stunTicks: number;
  attackCooldown: number;
  /** Frames left in the shove swing's visual. */
  atkAnim: number;
  jumpHeld: boolean;
  attackHeld: boolean;
  /** Platform id currently underfoot, or null while airborne. */
  standingOn: string | null;
  checkpointX: number;
  checkpointY: number;
  checkpointPlatformId: string;
  pose: Pose;
  poseTimer: number;
  /** This round's finish order; undefined until the runner touches the goal. */
  finish?: number;
  input: JumpmapInput;
  impact?: PlayerView['impact'];
}

/**
 * The host-only authoritative simulation for one 점프맵 room. Members never
 * run this — they replay the snapshot it produces.
 */
export class JumpmapEngine {
  players = new Map<string, EnginePlayer>();
  phase: Phase = 'race';
  /** ms left in the current grace/intermission countdown; meaningless during a plain race. */
  timerMs = 0;

  private tick = 0;
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
      airJumped: false,
      knockVX: 0,
      stunTicks: 0,
      attackCooldown: 0,
      atkAnim: 0,
      jumpHeld: false,
      attackHeld: false,
      standingOn: 'start',
      checkpointX: START_X,
      checkpointY: START_Y,
      checkpointPlatformId: 'start',
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
  }

  /** Advances the simulation by exactly one tick. */
  step(): void {
    this.tick += 1;
    this.updatePlatforms();

    if (this.phase === 'intermission') {
      this.timerMs -= TICK_MS;
      if (this.timerMs <= 0) this.resetRound();
      return;
    }

    for (const player of this.players.values()) this.stepPlayer(player);

    if (this.phase === 'grace') {
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
   * Edge-triggered: one hop per press, same as every other game's jump. The
   * second press while still airborne spends the one air-jump instead.
   */
  private applyJump(player: EnginePlayer): void {
    const pressed = player.input.jump && !player.jumpHeld;
    player.jumpHeld = player.input.jump;
    if (!pressed) return;

    if (!player.airborne) {
      player.vy = JUMP_VELOCITY;
      player.airborne = true;
      player.standingOn = null;
      player.airJumped = false;
    } else if (!player.airJumped) {
      player.vy = AIR_JUMP_VELOCITY;
      player.airJumped = true;
    }
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
    target.airJumped = true; // a shove doesn't hand out a free extra hop
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
    player.airJumped = false;
    player.standingOn = plat.id;
    player.checkpointX = player.x;
    player.checkpointY = plat.y;
    player.checkpointPlatformId = plat.id;

    if (plat.kind === 'trampoline') {
      player.vy = TRAMPOLINE_VELOCITY;
      player.airborne = true;
      player.standingOn = null;
      return;
    }
    if (plat.kind === 'goal' && player.finish === undefined) {
      this.finish(player);
    }
  }

  /** Fell too far past the last thing stood on, with nothing caught in between — back to the checkpoint. */
  private checkRespawn(player: EnginePlayer): void {
    if (player.finish !== undefined) return;
    if (player.y - player.checkpointY > RESPAWN_FALL_MARGIN || player.y > WORLD_HEIGHT + RESPAWN_WORLD_MARGIN) {
      player.x = player.checkpointX;
      player.y = player.checkpointY;
      player.vy = 0;
      player.airborne = false;
      player.airJumped = false;
      player.knockVX = 0;
      player.stunTicks = 0;
      player.standingOn = player.checkpointPlatformId;
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
      player.airJumped = false;
      player.knockVX = 0;
      player.stunTicks = 0;
      player.attackCooldown = 0;
      player.atkAnim = 0;
      player.standingOn = 'start';
      player.checkpointX = START_X;
      player.checkpointY = START_Y;
      player.checkpointPlatformId = 'start';
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

  snapshot(): JumpmapWorld {
    return {
      phase: this.phase,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      tick: this.tick,
      players: Array.from(this.players.values()).map((player) => ({
        id: player.id,
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
