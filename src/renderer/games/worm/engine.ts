import {
  AIM_MAX_DEG,
  AIM_MIN_DEG,
  AIM_SPEED_DEG,
  AIM_START_DEG,
  BARREL_LENGTH,
  BLAST_RADIUS,
  CHARGE_FRAMES,
  CRATER_RADIUS,
  DAMAGE_MAX,
  DAMAGE_MIN,
  FALL_DAMAGE_MAX,
  FALL_DAMAGE_PER_PX,
  JUMP_VELOCITY,
  MAX_CLIMB,
  MAX_HP,
  MOVE_SPEED,
  MUZZLE_GRACE,
  RELOAD_FRAMES,
  RESPAWN_MS,
  SAFE_FALL,
  SHELL_GRAVITY,
  SHELL_MAX_AGE,
  SHELL_SPEED_MIN,
  SHELL_SPEED_RANGE,
  WIN_KILLS,
  WORLD_WIDTH,
  WORM_GRAVITY,
  WORM_HALF_W,
  WORM_HEIGHT
} from './arena.js';
import { carveCrater, generateTerrain, randomSeed, surfaceY } from './terrain.js';
import type { Terrain } from './terrain.js';
import type { CraterEvent, Pose, WormInput, WormWorld } from './types.js';

/** How many recent craters ride along in every snapshot, so a lost packet self-heals. */
const CRATER_WINDOW = 8;
/** Frames a reaction pose holds before the worm goes back to idling. */
const HIT_POSE_FRAMES = 30;
const TAUNT_POSE_FRAMES = 90;
/** Celebration hold after the winning kill, before the match reports itself over. */
const OVER_FRAMES = 240;
/** Radius used for shell-versus-worm contact — a little forgiving, since worms are small. */
const WORM_HIT_RADIUS = 10;

const NO_INPUT: WormInput = { left: false, right: false, aimUp: false, aimDown: false, jump: false, fire: false };

interface EngineWorm {
  id: string;
  /** Host-side only: kept for a future name tag, deliberately left out of the
   *  snapshot because six names would push the packet past one Ethernet frame. */
  name: string;
  x: number;
  y: number;
  vy: number;
  aim: number;
  facing: 1 | -1;
  hp: number;
  alive: boolean;
  kills: number;
  charge: number;
  reload: number;
  pose: Pose;
  poseTimer: number;
  airborne: boolean;
  /** Last tick's jump key state, so a held key can't retrigger the hop. */
  jumpHeld: boolean;
  /** Where a fall began, so landing can price it. */
  fellFrom: number;
  respawnAt: number;
  /** Who gets the kill if this worm dies now; null after self-inflicted damage. */
  lastHitBy: string | null;
  input: WormInput;
}

interface EngineShell {
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
}

/**
 * The host-only authoritative simulation for one 지렁포 match. Members never
 * run this — they replay the snapshot it produces.
 */
export class WormEngine {
  terrain: Terrain;
  worms = new Map<string, EngineWorm>();
  shells: EngineShell[] = [];
  /** Sliding window of recent craters; `craterSeq` keeps counting past what the window holds. */
  craters: CraterEvent[] = [];
  craterSeq = 0;
  phase: 'play' | 'over' = 'play';
  winnerId: string | null = null;

  private overTimer = 0;

  constructor(seed: number = randomSeed()) {
    this.terrain = generateTerrain(seed);
  }

  get seed(): number {
    return this.terrain.seed;
  }

  /** True once the celebration has played out and the shell may close the match. */
  get isOver(): boolean {
    return this.phase === 'over' && this.overTimer <= 0;
  }

  /** Lazily creates a worm the first time we hear from someone — mid-match joiners need no separate path. */
  ensureWorm(id: string, name: string): void {
    const existing = this.worms.get(id);
    if (existing) {
      existing.name = name;
      return;
    }
    const x = this.openSpawnX();
    this.worms.set(id, {
      id,
      name,
      x,
      y: surfaceY(this.terrain, x),
      vy: 0,
      aim: AIM_START_DEG,
      facing: x < WORLD_WIDTH / 2 ? 1 : -1,
      hp: MAX_HP,
      alive: true,
      kills: 0,
      charge: 0,
      reload: 0,
      pose: 'idle',
      poseTimer: 0,
      airborne: false,
      jumpHeld: false,
      fellFrom: 0,
      respawnAt: 0,
      lastHitBy: null,
      input: NO_INPUT
    });
  }

  setInput(id: string, input: WormInput): void {
    const worm = this.worms.get(id);
    if (worm) worm.input = input;
  }

  removeWorm(id: string): void {
    this.worms.delete(id);
    this.shells = this.shells.filter((s) => s.ownerId !== id);
  }

  /** Advances the simulation by exactly one tick. */
  step(): void {
    if (this.phase === 'over') {
      if (this.overTimer > 0) this.overTimer -= 1;
      this.stepShells();
      return;
    }

    const now = Date.now();
    for (const worm of this.worms.values()) {
      if (!worm.alive) {
        if (now >= worm.respawnAt) this.respawn(worm);
        continue;
      }
      this.stepWorm(worm);
    }
    this.stepShells();
  }

  /* ------------------------------------------------------------ the worm */

  private stepWorm(worm: EngineWorm): void {
    if (worm.poseTimer > 0) worm.poseTimer -= 1;
    if (worm.reload > 0) worm.reload -= 1;

    this.stepWalk(worm);
    this.stepJump(worm);
    this.stepFall(worm);
    this.stepAim(worm);
    this.stepFire(worm);
    this.settlePose(worm);
  }

  /**
   * Walking follows the ground. A rise steeper than MAX_CLIMB is a wall and
   * blocks the step outright; a drop that steep is a ledge, so the worm walks
   * off it and gravity takes over from there.
   */
  private stepWalk(worm: EngineWorm): void {
    const direction = worm.input.left === worm.input.right ? 0 : worm.input.left ? -1 : 1;
    if (direction === 0) return;

    worm.facing = direction;
    const nextX = Math.max(WORM_HALF_W, Math.min(WORLD_WIDTH - WORM_HALF_W, worm.x + direction * MOVE_SPEED));
    if (worm.airborne) {
      // Drifting into a slope has to stop at it. Letting the move through and
      // relying on the fall step to sort it out would snap the worm up onto
      // whatever it hit, turning every cliff into a staircase.
      if (worm.y > surfaceY(this.terrain, nextX)) return;
      worm.x = nextX;
      return;
    }

    const nextGround = surfaceY(this.terrain, nextX);
    const rise = worm.y - nextGround;
    if (rise > MAX_CLIMB) return;

    worm.x = nextX;
    if (rise >= -MAX_CLIMB) worm.y = nextGround;
  }

  /**
   * A hop off solid ground. `fellFrom` is reset to the take-off point so the
   * worm doesn't bill itself for landing from its own jump — only for whatever
   * it jumped off.
   */
  private stepJump(worm: EngineWorm): void {
    // Edge-triggered: one hop per press. Holding the key down would otherwise
    // bunny-hop forever, which is exactly the mobility this hop is sized to avoid.
    const pressed = worm.input.jump && !worm.jumpHeld;
    worm.jumpHeld = worm.input.jump;
    if (!pressed || worm.airborne) return;

    const ground = surfaceY(this.terrain, worm.x);
    if (worm.y < ground - 0.5) return;

    worm.vy = JUMP_VELOCITY;
    worm.y = ground - 1;
    worm.airborne = true;
    worm.fellFrom = worm.y;
  }

  /** Gravity, and the price of a long drop once the ground comes back. */
  private stepFall(worm: EngineWorm): void {
    const ground = surfaceY(this.terrain, worm.x);

    if (worm.y < ground - 0.5) {
      if (!worm.airborne) {
        worm.airborne = true;
        worm.fellFrom = worm.y;
      }
      worm.vy += WORM_GRAVITY;
      worm.y = Math.min(ground, worm.y + worm.vy);
      if (worm.y < ground) return;
    } else if (worm.y > ground + 0.5) {
      // Below the surface can only mean the ground was blown out from over the
      // worm; ride it up rather than treating it as a landing.
      worm.y = ground;
      worm.vy = 0;
      return;
    }

    worm.y = ground;
    worm.vy = 0;
    if (!worm.airborne) return;

    const distance = worm.y - worm.fellFrom;
    worm.airborne = false;
    if (distance <= SAFE_FALL) return;
    const damage = Math.min(FALL_DAMAGE_MAX, (distance - SAFE_FALL) * FALL_DAMAGE_PER_PX);
    // Nobody is credited for gravity, so a fall death goes down as a suicide.
    this.applyDamage(worm, damage, null);
  }

  private stepAim(worm: EngineWorm): void {
    const direction = worm.input.aimUp === worm.input.aimDown ? 0 : worm.input.aimUp ? 1 : -1;
    if (direction === 0) return;
    worm.aim = Math.max(AIM_MIN_DEG, Math.min(AIM_MAX_DEG, worm.aim + direction * AIM_SPEED_DEG));
  }

  /** Holding fire fills the gauge; releasing launches, and a full gauge launches itself. */
  private stepFire(worm: EngineWorm): void {
    if (worm.input.fire && worm.reload <= 0) {
      worm.charge = Math.min(CHARGE_FRAMES, worm.charge + 1);
      if (worm.charge >= CHARGE_FRAMES) this.launch(worm);
      return;
    }
    if (worm.charge > 0) this.launch(worm);
  }

  private launch(worm: EngineWorm): void {
    const power = worm.charge / CHARGE_FRAMES;
    const speed = SHELL_SPEED_MIN + power * SHELL_SPEED_RANGE;
    const radians = (worm.aim * Math.PI) / 180;
    const dirX = Math.cos(radians) * worm.facing;
    const dirY = -Math.sin(radians);

    this.shells.push({
      ownerId: worm.id,
      x: worm.x + dirX * BARREL_LENGTH,
      y: worm.y - WORM_HEIGHT / 2 + dirY * BARREL_LENGTH,
      vx: dirX * speed,
      vy: dirY * speed,
      age: 0
    });

    worm.charge = 0;
    worm.reload = RELOAD_FRAMES;
  }

  private settlePose(worm: EngineWorm): void {
    if (worm.poseTimer > 0) return;
    if (worm.charge > 0) worm.pose = 'charge';
    else if (worm.airborne) worm.pose = 'jump';
    else if (worm.input.left !== worm.input.right) worm.pose = 'move';
    else worm.pose = 'idle';
  }

  /* ---------------------------------------------------------- the shells */

  private stepShells(): void {
    const survivors: EngineShell[] = [];

    for (const shell of this.shells) {
      shell.age += 1;
      shell.vy += SHELL_GRAVITY;
      shell.x += shell.vx;
      shell.y += shell.vy;

      if (shell.x < 0 || shell.x > WORLD_WIDTH || shell.age > SHELL_MAX_AGE) continue;

      // The sky is open — a steep shot may leave the top of the world and come back.
      if (shell.y >= surfaceY(this.terrain, shell.x)) {
        this.detonate(shell);
        continue;
      }

      const struck = this.wormStruckBy(shell);
      if (struck) {
        this.detonate(shell);
        continue;
      }

      survivors.push(shell);
    }

    this.shells = survivors;
  }

  /** A shell ignores the worm that fired it for a few ticks, or it would burst on its own muzzle. */
  private wormStruckBy(shell: EngineShell): EngineWorm | null {
    for (const worm of this.worms.values()) {
      if (!worm.alive) continue;
      if (worm.id === shell.ownerId && shell.age <= MUZZLE_GRACE) continue;
      const dx = shell.x - worm.x;
      const dy = shell.y - (worm.y - WORM_HEIGHT / 2);
      if (Math.hypot(dx, dy) <= WORM_HIT_RADIUS) return worm;
    }
    return null;
  }

  private detonate(shell: EngineShell): void {
    const { ownerId } = shell;
    // Round once, then use that point for everything. Members only ever receive
    // the rounded centre, so carving here with the raw float would leave every
    // client's ground a fraction off the host's — and drifting further with
    // every shot.
    const x = Math.round(shell.x);
    const y = Math.round(shell.y);

    this.craterSeq += 1;
    this.craters.push({ seq: this.craterSeq, x, y, r: CRATER_RADIUS });
    if (this.craters.length > CRATER_WINDOW) this.craters.shift();
    this.terrain = carveCrater(this.terrain, x, y, CRATER_RADIUS);

    for (const worm of this.worms.values()) {
      if (!worm.alive) continue;
      const distance = Math.hypot(x - worm.x, y - (worm.y - WORM_HEIGHT / 2));
      if (distance > BLAST_RADIUS) continue;
      const falloff = distance / BLAST_RADIUS;
      this.applyDamage(worm, DAMAGE_MAX + (DAMAGE_MIN - DAMAGE_MAX) * falloff, ownerId);
    }
  }

  /* --------------------------------------------------------- consequence */

  private applyDamage(worm: EngineWorm, amount: number, byId: string | null): void {
    worm.hp -= amount;
    worm.lastHitBy = byId === worm.id ? null : byId;
    worm.pose = 'hit';
    worm.poseTimer = HIT_POSE_FRAMES;
    if (worm.hp <= 0) this.kill(worm);
  }

  private kill(worm: EngineWorm): void {
    worm.hp = 0;
    worm.alive = false;
    worm.charge = 0;
    worm.airborne = false;
    worm.pose = 'down';
    worm.poseTimer = 0;
    worm.respawnAt = Date.now() + RESPAWN_MS;

    const killer = worm.lastHitBy === null ? null : this.worms.get(worm.lastHitBy);
    worm.lastHitBy = null;
    // Blowing yourself up, or falling, credits nobody — there is nothing to gloat about.
    if (!killer || killer.id === worm.id) return;

    killer.kills += 1;
    killer.pose = 'taunt';
    killer.poseTimer = TAUNT_POSE_FRAMES;

    if (killer.kills >= WIN_KILLS) {
      this.phase = 'over';
      this.winnerId = killer.id;
      this.overTimer = OVER_FRAMES;
    }
  }

  private respawn(worm: EngineWorm): void {
    const x = this.openSpawnX();
    worm.x = x;
    worm.y = surfaceY(this.terrain, x);
    worm.vy = 0;
    worm.hp = MAX_HP;
    worm.alive = true;
    worm.charge = 0;
    worm.reload = 0;
    worm.aim = AIM_START_DEG;
    worm.pose = 'idle';
    worm.poseTimer = 0;
    worm.airborne = false;
    worm.jumpHeld = false;
    worm.lastHitBy = null;
  }

  /** Picks the emptiest of a few candidate spots, so a respawn rarely lands in someone's lap. */
  private openSpawnX(): number {
    const margin = WORM_HALF_W * 4;
    const span = WORLD_WIDTH - margin * 2;
    let best = margin + Math.random() * span;
    let bestGap = -Infinity;

    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = margin + Math.random() * span;
      let nearest = Infinity;
      for (const worm of this.worms.values()) {
        if (!worm.alive) continue;
        nearest = Math.min(nearest, Math.abs(worm.x - candidate));
      }
      if (nearest > bestGap) {
        bestGap = nearest;
        best = candidate;
      }
    }
    return best;
  }

  /* ------------------------------------------------------------ snapshot */

  snapshot(): WormWorld {
    const now = Date.now();
    const order = Array.from(this.worms.values());
    const indexOf = new Map(order.map((worm, index) => [worm.id, index]));
    return {
      seed: this.terrain.seed,
      phase: this.phase,
      winnerId: this.winnerId,
      worms: order.map((worm) => ({
        id: worm.id,
        x: Math.round(worm.x),
        y: Math.round(worm.y),
        aim: Math.round(worm.aim),
        facing: worm.facing,
        hp: Math.max(0, Math.round(worm.hp)),
        alive: worm.alive,
        kills: worm.kills,
        charge: Math.round((worm.charge / CHARGE_FRAMES) * 100),
        pose: worm.pose,
        respawnInMs: worm.alive ? undefined : Math.max(0, worm.respawnAt - now)
      })),
      shells: this.shells.map((shell) => ({
        x: Math.round(shell.x),
        y: Math.round(shell.y),
        o: indexOf.get(shell.ownerId) ?? -1
      })),
      craters: this.craters.map((crater) => ({ ...crater }))
    };
  }
}
