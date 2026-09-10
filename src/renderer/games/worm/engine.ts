import {
  AIM_MAX_DEG,
  AIM_MIN_DEG,
  AIM_SPEED_DEG,
  AIM_START_DEG,
  BARREL_LENGTH,
  FALL_DAMAGE_MAX,
  FALL_DAMAGE_PER_PX,
  JUMP_VELOCITY,
  MAX_CLIMB,
  MAX_HP,
  MOVE_SPEED,
  MUZZLE_GRACE,
  RESPAWN_MS,
  SAFE_FALL,
  SHELL_MAX_AGE,
  WIN_KILLS,
  WORLD_WIDTH,
  WORM_GRAVITY,
  WORM_HALF_W,
  WORM_HEIGHT
} from './arena.js';
import {
  HEAL_AMOUNT,
  ITEM_MAX,
  ITEM_PICKUP_RADIUS,
  ITEM_RADIUS,
  ITEM_SPAWN_CLEARANCE,
  ITEM_SPAWN_MAX_FRAMES,
  ITEM_SPAWN_MIN_FRAMES,
  MAX_SHELLS,
  SHIELD_FRAMES
} from './arena.js';
import { carveCrater, generateTerrain, randomSeed, surfaceY } from './terrain.js';
import type { Terrain } from './terrain.js';
import { WEAPONS, weaponIndex } from './weapons.js';
import type { Weapon, WeaponId } from './weapons.js';
import { itemIndex, rollItemKind, weaponFor } from './items.js';
import type { ItemKind } from './items.js';
import { poseIndex } from './types.js';
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
  weapon: WeaponId;
  /** Rounds left in a picked-up weapon; meaningless while on the default one. */
  rounds: number;
  shieldFrames: number;
}

interface EngineShell {
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  weapon: WeaponId;
  /** Cluster rounds split exactly once, at the top of their arc. */
  hasSplit: boolean;
}

interface EngineItem {
  kind: ItemKind;
  x: number;
  y: number;
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
  items: EngineItem[] = [];

  private overTimer = 0;
  private itemTimer = ITEM_SPAWN_MIN_FRAMES;

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
      input: NO_INPUT,
      weapon: 'basic',
      rounds: 0,
      shieldFrames: 0
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
    this.stepItems();
  }

  /* ------------------------------------------------------------ the worm */

  private stepWorm(worm: EngineWorm): void {
    if (worm.poseTimer > 0) worm.poseTimer -= 1;
    if (worm.reload > 0) worm.reload -= 1;
    if (worm.shieldFrames > 0) worm.shieldFrames -= 1;

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

  /**
   * Holding fire fills the gauge and nothing else — a full gauge sits there
   * until the key comes up. Firing itself at full would take the decision of
   * *when* to shoot away from the player, which is most of the aiming.
   */
  private stepFire(worm: EngineWorm): void {
    const weapon = WEAPONS[worm.weapon];
    if (worm.input.fire && worm.reload <= 0) {
      worm.charge = Math.min(weapon.chargeFrames, worm.charge + 1);
      return;
    }
    if (worm.charge > 0) this.launch(worm, weapon);
  }

  /** Fires whatever is held, then hands the worm back its default weapon once the rounds run out. */
  private launch(worm: EngineWorm, weapon: Weapon): void {
    const power = worm.charge / weapon.chargeFrames;
    const speed = weapon.speedMin + power * weapon.speedRange;

    for (let i = 0; i < weapon.shots; i++) {
      // Fan the shots evenly around the aim; a single shot lands dead centre.
      const offset = weapon.shots === 1 ? 0 : (i / (weapon.shots - 1) - 0.5) * weapon.spreadDeg;
      const radians = ((worm.aim + offset) * Math.PI) / 180;
      const dirX = Math.cos(radians) * worm.facing;
      const dirY = -Math.sin(radians);
      this.spawnShell({
        ownerId: worm.id,
        x: worm.x + dirX * BARREL_LENGTH,
        y: worm.y - WORM_HEIGHT / 2 + dirY * BARREL_LENGTH,
        vx: dirX * speed,
        vy: dirY * speed,
        age: 0,
        weapon: weapon.id,
        hasSplit: false
      });
    }

    worm.charge = 0;
    worm.reload = weapon.reloadFrames;

    if (weapon.rounds > 0) {
      worm.rounds -= 1;
      if (worm.rounds <= 0) {
        worm.weapon = 'basic';
        worm.rounds = 0;
      }
    }
  }

  /** The one place shells enter the world, so the cap can't be bypassed. */
  private spawnShell(shell: EngineShell): void {
    if (this.shells.length >= MAX_SHELLS) return;
    this.shells.push(shell);
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
      const weapon = WEAPONS[shell.weapon];
      shell.age += 1;
      shell.vy += weapon.gravity;
      shell.x += shell.vx;
      shell.y += shell.vy;

      if (shell.x < 0 || shell.x > WORLD_WIDTH || shell.age > SHELL_MAX_AGE) continue;

      // A cluster round opens at the top of its arc, where the payload has the
      // most room to spread before anything is in the way.
      if (weapon.splitInto && !shell.hasSplit && shell.vy >= 0) {
        this.split(shell, weapon.splitInto);
        continue;
      }

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

  /** Replaces a cluster round with its payload, fanned out and still carrying its speed. */
  private split(shell: EngineShell, count: number): void {
    for (let i = 0; i < count; i++) {
      const spread = (i / (count - 1) - 0.5) * 3.4;
      this.spawnShell({
        ownerId: shell.ownerId,
        x: shell.x,
        y: shell.y,
        vx: shell.vx * 0.6 + spread,
        vy: 0.6,
        age: 0,
        weapon: 'clusterlet',
        hasSplit: true
      });
    }
  }

  private detonate(shell: EngineShell): void {
    const { ownerId } = shell;
    const weapon = WEAPONS[shell.weapon];
    // Round once, then use that point for everything. Members only ever receive
    // the rounded centre, so carving here with the raw float would leave every
    // client's ground a fraction off the host's — and drifting further with
    // every shot.
    const x = Math.round(shell.x);
    const y = Math.round(shell.y);

    this.craterSeq += 1;
    this.craters.push({ seq: this.craterSeq, x, y, r: weapon.craterRadius });
    if (this.craters.length > CRATER_WINDOW) this.craters.shift();
    this.terrain = carveCrater(this.terrain, x, y, weapon.craterRadius);

    for (const worm of this.worms.values()) {
      if (!worm.alive) continue;
      const distance = Math.hypot(x - worm.x, y - (worm.y - WORM_HEIGHT / 2));
      if (distance > weapon.blastRadius) continue;
      const falloff = distance / weapon.blastRadius;
      this.applyDamage(worm, weapon.damageMax + (weapon.damageMin - weapon.damageMax) * falloff, ownerId);
    }

    // A blast takes any pickup it reaches with it, so a contested drop can be denied.
    this.items = this.items.filter((item) => Math.hypot(x - item.x, y - item.y) > weapon.blastRadius + ITEM_RADIUS);
  }

  /* ------------------------------------------------------------- pickups */

  /**
   * Pickups sit on the surface and are collected by walking over them. They
   * re-seat on the ground every tick, so blowing a hole under one drops it into
   * the crater instead of leaving it floating.
   */
  private stepItems(): void {
    if (this.itemTimer > 0) this.itemTimer -= 1;
    if (this.itemTimer <= 0) {
      this.itemTimer =
        ITEM_SPAWN_MIN_FRAMES + Math.floor(Math.random() * (ITEM_SPAWN_MAX_FRAMES - ITEM_SPAWN_MIN_FRAMES));
      if (this.items.length < ITEM_MAX) this.spawnItem();
    }

    const remaining: EngineItem[] = [];
    for (const item of this.items) {
      item.y = surfaceY(this.terrain, item.x);
      const taker = this.collectorOf(item);
      if (taker) this.grant(taker, item.kind);
      else remaining.push(item);
    }
    this.items = remaining;
  }

  private collectorOf(item: EngineItem): EngineWorm | null {
    for (const worm of this.worms.values()) {
      if (!worm.alive) continue;
      if (Math.hypot(worm.x - item.x, worm.y - item.y) <= ITEM_PICKUP_RADIUS) return worm;
    }
    return null;
  }

  private grant(worm: EngineWorm, kind: ItemKind): void {
    if (kind === 'heal') {
      worm.hp = Math.min(MAX_HP, worm.hp + HEAL_AMOUNT);
      return;
    }
    if (kind === 'shield') {
      worm.shieldFrames = SHIELD_FRAMES;
      return;
    }
    const weapon = weaponFor(kind);
    if (!weapon) return;
    worm.weapon = weapon;
    worm.rounds = WEAPONS[weapon].rounds;
  }

  /** Drops a pickup somewhere nobody is currently standing. */
  private spawnItem(): void {
    const margin = WORM_HALF_W * 4;
    const span = WORLD_WIDTH - margin * 2;
    let best = margin + Math.random() * span;
    let bestGap = -Infinity;

    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = margin + Math.random() * span;
      let nearest = Infinity;
      for (const worm of this.worms.values()) {
        if (worm.alive) nearest = Math.min(nearest, Math.abs(worm.x - candidate));
      }
      for (const item of this.items) nearest = Math.min(nearest, Math.abs(item.x - candidate));
      if (nearest > bestGap) {
        bestGap = nearest;
        best = candidate;
      }
      if (nearest >= ITEM_SPAWN_CLEARANCE) break;
    }

    this.items.push({ kind: rollItemKind(Math.random), x: best, y: surfaceY(this.terrain, best) });
  }

  /* --------------------------------------------------------- consequence */

  private applyDamage(worm: EngineWorm, amount: number, byId: string | null): void {
    // A shield stops everything, gravity and your own shells included.
    if (worm.shieldFrames > 0) return;
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
    worm.weapon = 'basic';
    worm.rounds = 0;
    worm.shieldFrames = 0;
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
        kills: worm.kills,
        charge: Math.round((worm.charge / WEAPONS[worm.weapon].chargeFrames) * 100),
        p: poseIndex(worm.pose),
        d: worm.alive ? undefined : Math.max(0, worm.respawnAt - now),
        // Left out entirely on the default weapon with no shield, which is most
        // worms most of the time — that is what keeps the packet small.
        w: worm.weapon === 'basic' ? undefined : weaponIndex(worm.weapon),
        a: worm.rounds > 0 ? worm.rounds : undefined,
        s: worm.shieldFrames > 0 ? worm.shieldFrames : undefined
      })),
      shells: this.shells.flatMap((shell) => [
        Math.round(shell.x),
        Math.round(shell.y),
        indexOf.get(shell.ownerId) ?? -1,
        weaponIndex(shell.weapon)
      ]),
      items: this.items.flatMap((item) => [itemIndex(item.kind), Math.round(item.x), Math.round(item.y)]),
      craters: this.craters.flatMap((crater) => [crater.seq, crater.x, crater.y, crater.r])
    };
  }
}
