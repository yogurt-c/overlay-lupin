/**
 * The 뱀서 simulation. One authoritative instance per host (solo: per player),
 * stepped once per shell tick.
 *
 * Ordering matters and is fixed: input → movement → spawns → enemy movement →
 * weapons → projectiles → pickups → damage → bookkeeping. Phase 3 replays this
 * same order on every client from the same seed, so any reshuffle here is a
 * desync there.
 */

import {
  CARD_COUNT,
  CONTACT_DAMAGE,
  ENEMY_RADIUS,
  GEM_MAGNET_RADIUS,
  GEM_PICKUP_RADIUS,
  HURT_INVULN_TICKS,
  MAX_ENEMIES,
  MAX_GEMS,
  PICK_TIMEOUT_TICKS,
  PLAYER_MAX_HP,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  RUN_TICKS,
  SPAWN_HALF_H,
  SPAWN_HALF_W,
  TICKS_PER_SECOND,
  WORLD_H,
  WORLD_W,
  clamp,
  createRng,
  mixSeed,
  xpForLevel
} from './arena.js';
import {
  MINIBOSS_EVERY_TICKS,
  linePoints,
  ringPoints,
  rollKind,
  eliteKind,
  evictionIndex,
  spawnBatch,
  spawnInterval,
  spawnPoint,
  statsFor,
  waveAt,
  waveCount
} from './spawn.js';
import { passiveById, passiveStats } from './passives.js';
import type { Stats } from './passives.js';
import {
  EVOLVE_PASSIVE_LEVEL,
  PASSIVE_SLOTS,
  WEAPON_SLOTS,
  evolutionReady,
  isPassiveOffer,
  labelOf,
  passiveIdOf,
  resolve,
  rollOffers,
  weaponById
} from './weapons.js';
import { NO_INPUT, REAPER_KIND, baseKind, isElite, kindScale } from './types.js';
import type {
  CardOffer,
  ChestView,
  ItemView,
  EnemyKind,
  EnemyView,
  GemView,
  OfferSet,
  OwnedItem,
  Phase,
  PlayerView,
  PoolView,
  ProjectileView,
  StrikeView,
  SurvivorInput,
  SurvivorWorld
} from './types.js';

/** The rectangle enemies arrive just outside of. See `spawnFrame`. */
interface SpawnFrame { x: number; y: number; halfW: number; halfH: number; }

interface Player extends PlayerView {
  input: SurvivorInput;
  timers: Map<string, number>;
  weapons: Map<string, number>;
  passives: Map<string, number>;
  stats: Stats;
  pending: boolean;
  /** Card index taken this level-up (-1 for a skip), or null while still owing one. */
  pickIndex: number | null;
  /** Level-ups owed from chests, handed out one card screen at a time. */
  bonusLevels: number;
}

interface Enemy extends EnemyView { speed: number; }

interface Projectile extends ProjectileView {
  vx: number;
  vy: number;
  life: number;
  damage: number;
  /** How many more enemies this can hit before it dies. */
  pierce: number;
  /** Set for orbiting bodies: whose waist it circles, and where on the ring. */
  owner?: string;
  angle?: number;
  orbitRadius?: number;
  orbitSpeed?: number;
  /** Enemies already hit, so one pass can't tick damage every frame. */
  struck: Set<number>;
}

interface Pool extends PoolView { damage: number; }

const PROJECTILE_CAP = 160;
/**
 * Chance an ordinary kill leaves a chicken, and the shortest gap between two of
 * them.
 *
 * The chance alone cannot balance this: a run kills 240 things in its first
 * minute and 3,000 in its eighth, so a rate that is rare early is a buffet
 * late. At 1.2% the late game handed back more than twice the player's maximum
 * health every minute — there was nothing to be afraid of. The gap is what
 * actually holds sustain down, and the chance keeps it from being clockwork.
 */
const CHICKEN_CHANCE = 0.004;
const CHICKEN_GAP_TICKS = 35 * TICKS_PER_SECOND;
/** How much of the ceiling one chicken puts back. */
const CHICKEN_HEAL = 0.3;
/** The reaper outruns everyone — it is the end of the run, not a fight. */
const REAPER_SPEED = 2.4;
/**
 * How close the reaper has to get. It is drawn at `kindScale` times the usual
 * enemy, and a judgement that ignored its ink read as the reaper strolling
 * straight through a player it visibly covered.
 */
export const REAPER_REACH = PLAYER_RADIUS + ENEMY_RADIUS * kindScale(REAPER_KIND);
/** How far outside the spawn frame a closing ring starts. */
const WAVE_RING_MARGIN = 60;
const CHEST_PICKUP_RADIUS = 20;
/** Opening a chest with nothing to evolve hands out this many levels instead. */
const CHEST_LEVELS = 2;
/**
 * How long an evolution stays announced. It used to be cleared on the next
 * tick, which is one frame of banner — a run's biggest moment, invisible.
 * Counted in ticks so every client shouts for the same stretch of the run.
 */
const EVOLVE_SHOUT_TICKS = Math.round(2.5 * TICKS_PER_SECOND);

export class SurvivorEngine {
  private rng: () => number;
  private tick = 0;
  private phase: Phase = 'run';
  private players = new Map<string, Player>();
  private enemies: Enemy[] = [];
  private gems: GemView[] = [];
  private strikes: StrikeView[] = [];
  private shots: Projectile[] = [];
  private pools: Pool[] = [];
  private chests: ChestView[] = [];
  private items: ItemView[] = [];
  private nextEnemyId = 1;
  private nextGemId = 1;
  private spawnTimer = 0;
  private bossesSpawned = 0;
  private reaperOut = false;
  /** Tick the last chicken fell on — see CHICKEN_GAP_TICKS. */
  private lastChicken = -CHICKEN_GAP_TICKS;
  /** Card screens shown so far — the only thing that makes each one's draw differ. */
  private screens = 0;

  private xp = 0;
  private level = 1;
  private kills = 0;
  /** Cards on the table, per player. Each set is rolled from its own shelf. */
  private offers = new Map<string, CardOffer[]>();
  private pickDeadline = -1;
  private survived = false;
  private evolved: string | null = null;
  private evolveShout = 0;

  constructor(private readonly seed: number, private readonly timedPicks: boolean) {
    this.rng = createRng(seed);
  }


  ensurePlayer(id: string, name: string): void {
    if (this.players.has(id)) return;
    const spread = this.players.size * 34;
    this.players.set(id, {
      id,
      name,
      x: WORLD_W / 2 + spread,
      y: WORLD_H / 2,
      hp: PLAYER_MAX_HP,
      maxHp: PLAYER_MAX_HP,
      facing: 1,
      invuln: 0,
      alive: true,
      input: NO_INPUT,
      timers: new Map([['whip', 0]]),
      weapons: new Map([['whip', 1]]),
      passives: new Map(),
      stats: passiveStats(new Map()),
      pending: false,
      pickIndex: null,
      bonusLevels: 0
    });
  }

  removePlayer(id: string): void {
    this.players.delete(id);
    this.offers.delete(id);
    this.shots = this.shots.filter((s) => s.owner !== id);
    if (this.phase === 'levelup' && !this.anyPending()) this.resume();
  }

  setInput(id: string, input: SurvivorInput): void {
    const player = this.players.get(id);
    if (player) player.input = input;
  }

  step(): void {
    if (this.phase === 'over') return;
    if (this.phase === 'levelup') { this.stepLevelUp(); return; }

    this.tick += 1;
    if (this.evolveShout > 0) {
      this.evolveShout -= 1;
      if (this.evolveShout === 0) this.evolved = null;
    }
    this.movePlayers();
    this.spawnEnemies();
    this.spawnBoss();
    this.spawnReaper();
    this.moveEnemies();
    this.fireWeapons();
    this.moveProjectiles();
    this.agePools();
    this.ageStrikes();
    this.collectGems();
    this.collectItems();
    this.openChests();
    this.applyContactDamage();
    this.regenerate();
    this.checkEnd();
  }

  // ---------- movement ----------

  private movePlayers(): void {
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      const dx = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0);
      const dy = (p.input.down ? 1 : 0) - (p.input.up ? 1 : 0);
      if (dx !== 0) p.facing = dx > 0 ? 1 : -1;
      if (dx === 0 && dy === 0) continue;
      // Diagonals are normalised, or corners would be the fastest way to travel.
      const len = Math.hypot(dx, dy);
      const speed = PLAYER_SPEED * p.stats.speed;
      p.x = clamp(p.x + (dx / len) * speed, PLAYER_RADIUS, WORLD_W - PLAYER_RADIUS);
      p.y = clamp(p.y + (dy / len) * speed, PLAYER_RADIUS, WORLD_H - PLAYER_RADIUS);
    }
  }

  // ---------- spawning ----------

  private pushEnemy(x: number, y: number, hp: number, speed: number, kind: EnemyKind): void {
    if (this.enemies.length >= MAX_ENEMIES) return;
    this.enemies.push({
      id: this.nextEnemyId++,
      x: clamp(x, -240, WORLD_W + 240),
      y: clamp(y, -240, WORLD_H + 240),
      hp,
      flash: 0,
      kind,
      speed
    });
  }

  /**
   * The rectangle the spawner works just outside of: the midpoint of everyone
   * still standing, plus fixed extents. Built from simulation state only, so
   * every client in a run computes exactly the same one — which is the whole
   * point, since the seed alone cannot save a spawn that rings a local camera.
   */
  private spawnFrame(): SpawnFrame {
    const everyone = [...this.players.values()];
    const alive = everyone.filter((p) => p.alive);
    const crowd = alive.length > 0 ? alive : everyone;
    const centre = crowd.length > 0
      ? {
        x: crowd.reduce((sum, p) => sum + p.x, 0) / crowd.length,
        y: crowd.reduce((sum, p) => sum + p.y, 0) / crowd.length
      }
      : { x: WORLD_W / 2, y: WORLD_H / 2 };
    return { ...centre, halfW: SPAWN_HALF_W, halfH: SPAWN_HALF_H };
  }

  private spawnEnemies(): void {
    this.spawnWave();
    if (this.spawnTimer > 0) { this.spawnTimer -= 1; return; }
    const crowd = this.livingCount();
    this.spawnTimer = spawnInterval(this.tick, crowd);

    const frame = this.spawnFrame();
    for (let i = 0; i < spawnBatch(this.tick); i++) {
      const { x, y } = spawnPoint(this.rng, frame.x, frame.y, frame.halfW, frame.halfH);
      const kind = rollKind(this.tick, this.rng);
      const { hp, speed } = statsFor(kind, this.tick);
      this.pushEnemy(x, y, hp, speed, kind);
    }
  }

  /**
   * Set pieces: a ring closes in from every side at once, a line marches in
   * from one. Both are deliberately readable — they are the moments a run is
   * remembered by, not another handful of bats.
   */
  private spawnWave(): void {
    const wave = waveAt(this.tick);
    if (!wave) return;
    const focus = [...this.players.values()].find((p) => p.alive);
    if (!focus) return;

    const kind = rollKind(this.tick, this.rng);
    const { hp, speed } = statsFor(kind, this.tick);
    const count = waveCount(wave.count, this.livingCount());
    const frame = this.spawnFrame();
    const points = wave.shape === 'ring'
      ? ringPoints(focus.x, focus.y, Math.max(frame.halfW, frame.halfH) + WAVE_RING_MARGIN, count)
      : linePoints(this.rng, frame.x, frame.y, frame.halfW, frame.halfH, count);
    for (const point of points) this.pushEnemy(point.x, point.y, hp, speed, kind);
  }

  private spawnBoss(): void {
    const due = Math.floor(this.tick / MINIBOSS_EVERY_TICKS);
    if (due <= this.bossesSpawned || this.tick === 0) return;
    this.bossesSpawned = due;
    const frame = this.spawnFrame();
    const { x, y } = spawnPoint(this.rng, frame.x, frame.y, frame.halfW, frame.halfH);
    // Each miniboss is an elite of whatever is already in the swarm, so the
    // second one looks nothing like the first.
    const kind = eliteKind(this.tick, this.rng);
    const { hp, speed } = statsFor(kind, this.tick);
    this.pushEnemy(x, y, hp, speed, kind);
  }

  /** At the deadline the reaper walks in: untouchable, and fatal on contact. */
  private spawnReaper(): void {
    if (this.reaperOut || this.tick < RUN_TICKS) return;
    this.reaperOut = true;
    this.survived = true;
    const frame = this.spawnFrame();
    const { x, y } = spawnPoint(this.rng, frame.x, frame.y, frame.halfW, frame.halfH);
    // An ordinary spawn is simply dropped when the field is full, and at the
    // ten-minute mark it always is — which left the reaper never arriving and
    // the run never ending. It takes an ordinary enemy's place instead: the
    // oldest one that isn't a miniboss, so nobody loses a chest to it.
    if (this.enemies.length >= MAX_ENEMIES) {
      this.enemies.splice(evictionIndex(this.enemies.map((e) => e.kind)), 1);
    }
    this.pushEnemy(x, y, Number.POSITIVE_INFINITY, REAPER_SPEED, REAPER_KIND);
  }

  /** Everyone still standing — the swarm scales to this, not to the room's size. */
  private livingCount(): number {
    let alive = 0;
    for (const p of this.players.values()) if (p.alive) alive += 1;
    return Math.max(1, alive);
  }

  private moveEnemies(): void {
    const targets = [...this.players.values()].filter((p) => p.alive);
    if (targets.length === 0) return;

    for (const e of this.enemies) {
      if (e.flash > 0) e.flash -= 1;
      let best = targets[0];
      let bestDist = Infinity;
      for (const p of targets) {
        const d = (p.x - e.x) ** 2 + (p.y - e.y) ** 2;
        if (d < bestDist) { bestDist = d; best = p; }
      }
      const len = Math.max(1, Math.sqrt(bestDist));
      e.x += ((best.x - e.x) / len) * e.speed;
      e.y += ((best.y - e.y) / len) * e.speed;
    }

    this.separateEnemies();
  }

  /**
   * A light shove apart. Without it the swarm stacks into one dot the moment
   * it reaches a player, which reads as a single enemy and makes the crowd —
   * the entire appeal of the genre — invisible.
   */
  private separateEnemies(): void {
    const minDist = ENEMY_RADIUS * 1.5;
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (Math.abs(dx) > minDist || Math.abs(dy) > minDist) continue;
        const dist = Math.hypot(dx, dy);
        if (dist === 0 || dist >= minDist) continue;
        const push = (minDist - dist) / 2 / dist;
        a.x -= dx * push; a.y -= dy * push;
        b.x += dx * push; b.y += dy * push;
      }
    }
  }

  // ---------- weapons ----------

  private fireWeapons(): void {
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      for (const [id, level] of p.weapons) {
        const left = (p.timers.get(id) ?? 0) - 1;
        if (left > 0) { p.timers.set(id, left); continue; }
        const w = resolve(id, level, p.stats);
        p.timers.set(id, w.cooldown);
        this.activate(p, w);
      }
    }
  }

  private activate(p: Player, w: ReturnType<typeof resolve>): void {
    switch (w.kind) {
      case 'arc': {
        // Extra "count" turns the single swing into a swing on each side.
        const sides = w.count > 1 ? [p.facing, -p.facing as 1 | -1] : [p.facing];
        for (const facing of sides) {
          const cx = p.x + facing * w.radius * 0.55;
          this.strikes.push({ x: cx, y: p.y, radius: w.radius, facing, age: 0, life: 9, kind: 'arc' });
          this.damageCircle(cx, p.y, w.radius, w.damage);
        }
        break;
      }
      case 'aura':
        this.strikes.push({ x: p.x, y: p.y, radius: w.radius, facing: p.facing, age: 0, life: 6, kind: 'aura' });
        this.damageCircle(p.x, p.y, w.radius, w.damage);
        break;
      case 'bolt': {
        // A screen's worth of ground around the caster — the same fixed box the
        // spawner uses, and for the same reason: the real screen is per-client.
        const inView = this.enemies.filter((e) =>
          baseKind(e.kind) !== REAPER_KIND &&
          Math.abs(e.x - p.x) < SPAWN_HALF_W &&
          Math.abs(e.y - p.y) < SPAWN_HALF_H);
        for (let i = 0; i < w.count && inView.length > 0; i++) {
          const target = inView[Math.floor(this.rng() * inView.length)];
          this.strikes.push({ x: target.x, y: target.y, radius: w.radius, facing: 1, age: 0, life: 10, kind: 'bolt' });
          this.damageCircle(target.x, target.y, w.radius, w.damage);
        }
        break;
      }
      case 'pool':
        for (let i = 0; i < w.count; i++) {
          const angle = this.rng() * Math.PI * 2;
          const reach = 40 + this.rng() * 70;
          this.pools.push({
            x: clamp(p.x + Math.cos(angle) * reach, 0, WORLD_W),
            y: clamp(p.y + Math.sin(angle) * reach, 0, WORLD_H),
            radius: w.radius, age: 0, life: w.life, damage: w.damage
          });
        }
        break;
      case 'orbit':
        // Books replace the previous set rather than piling up forever.
        this.shots = this.shots.filter((s) => !(s.kind === 'orbit' && s.owner === p.id));
        for (let i = 0; i < w.count; i++) {
          this.shots.push({
            x: p.x, y: p.y, radius: 9, spin: 0, kind: 'orbit',
            vx: 0, vy: 0, life: w.life, damage: w.damage, pierce: Number.POSITIVE_INFINITY,
            owner: p.id, angle: (Math.PI * 2 * i) / w.count, orbitRadius: w.radius, orbitSpeed: 0.055,
            struck: new Set()
          });
        }
        break;
      case 'homing':
      case 'shot':
      case 'lob': {
        for (let i = 0; i < w.count; i++) {
          if (this.shots.length >= PROJECTILE_CAP) break;
          const spread = (i - (w.count - 1) / 2) * 0.22;
          let vx = 0;
          let vy = 0;
          if (w.kind === 'homing') {
            const target = this.nearestEnemy(p.x, p.y);
            const angle = target ? Math.atan2(target.y - p.y, target.x - p.x) + spread : spread;
            vx = Math.cos(angle) * w.speed; vy = Math.sin(angle) * w.speed;
          } else if (w.kind === 'shot') {
            vx = p.facing * w.speed; vy = spread * w.speed;
          } else {
            // The axe keeps the original's shape: thrown up and outward.
            vx = p.facing * w.speed * 0.5 + spread * w.speed; vy = -w.speed;
          }
          this.shots.push({
            x: p.x, y: p.y, radius: w.radius, spin: 0, kind: w.kind,
            vx, vy, life: w.life, damage: w.damage,
            pierce: w.kind === 'shot' ? 2 : w.kind === 'lob' ? Number.POSITIVE_INFINITY : 1,
            struck: new Set()
          });
        }
        break;
      }
    }
  }

  private nearestEnemy(x: number, y: number): Enemy | null {
    let best: Enemy | null = null;
    let dist = Infinity;
    for (const e of this.enemies) {
      if (baseKind(e.kind) === 3) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < dist) { dist = d; best = e; }
    }
    return best;
  }

  private moveProjectiles(): void {
    for (const s of this.shots) {
      s.life -= 1;
      if (s.kind === 'orbit') {
        const owner = this.players.get(s.owner ?? '');
        if (!owner) { s.life = 0; continue; }
        s.angle = (s.angle ?? 0) + (s.orbitSpeed ?? 0.05);
        s.x = owner.x + Math.cos(s.angle) * (s.orbitRadius ?? 60);
        s.y = owner.y + Math.sin(s.angle) * (s.orbitRadius ?? 60);
        s.spin = s.angle;
        // An orbiting book can hit the same enemy again on its next pass.
        if (this.tick % 20 === 0) s.struck.clear();
      } else {
        if (s.kind === 'lob') s.vy += 0.045;     // the axe arcs over
        s.x += s.vx;
        s.y += s.vy;
        s.spin += 0.3;
      }
      this.hitWith(s);
    }
    this.shots = this.shots.filter((s) => s.life > 0 && s.pierce > 0 &&
      s.x > -200 && s.x < WORLD_W + 200 && s.y > -200 && s.y < WORLD_H + 200);
  }

  private hitWith(s: Projectile): void {
    const reach = (s.radius + ENEMY_RADIUS) ** 2;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (s.struck.has(e.id)) continue;
      if ((e.x - s.x) ** 2 + (e.y - s.y) ** 2 > reach) continue;
      s.struck.add(e.id);
      s.pierce -= 1;
      this.wound(i, s.damage);
      if (s.pierce <= 0) return;
    }
  }

  private agePools(): void {
    for (const pool of this.pools) {
      pool.age += 1;
      // Pools tick five times a second rather than every frame, so their
      // damage reads as a burn instead of melting everything instantly.
      if (pool.age % 12 === 0) this.damageCircle(pool.x, pool.y, pool.radius, pool.damage);
    }
    this.pools = this.pools.filter((pool) => pool.age < pool.life);
  }

  private damageCircle(cx: number, cy: number, radius: number, damage: number): void {
    const reach = (radius + ENEMY_RADIUS) ** 2;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if ((e.x - cx) ** 2 + (e.y - cy) ** 2 > reach) continue;
      this.wound(i, damage);
    }
  }

  /** Applies damage to the enemy at `index`, and handles what it leaves behind. */
  private wound(index: number, damage: number): void {
    const e = this.enemies[index];
    if (e.kind === REAPER_KIND) return;       // the reaper cannot be hurt
    e.hp -= damage;
    e.flash = 4;
    if (e.hp > 0) return;

    this.enemies.splice(index, 1);
    this.kills += 1;
    if (isElite(e.kind)) this.chests.push({ x: e.x, y: e.y });
    // A splitter leaves two smaller ones behind — which is what makes area
    // weapons worth carrying once it joins the roster.
    if (baseKind(e.kind) === 6) {
      const { hp, speed } = statsFor(0, this.tick);
      for (const side of [-1, 1]) this.pushEnemy(e.x + side * 12, e.y, hp * 0.6, speed * 1.1, 0);
    }
    this.dropGem(e.x, e.y, e.kind);
    if (this.tick - this.lastChicken >= CHICKEN_GAP_TICKS && this.rng() < CHICKEN_CHANCE) {
      this.lastChicken = this.tick;
      this.items.push({ x: e.x, y: e.y, kind: 0 });
    }
  }

  /**
   * The field keeps the *newest* gems, not the oldest.
   *
   * Dropping nothing once the cap was reached looked like a harmless way to
   * bound the field, and it quietly ended the run's economy: the hundred and
   * twenty gems holding the cap were the ones dropped minutes ago, somewhere
   * the run had long since walked away from, so every kill after the second
   * minute paid nothing at all. Experience stopped, the build froze, and the
   * swarm kept growing — which is what "they just won't die" actually was.
   *
   * Evicting the oldest keeps the same ceiling, and what lies on the ground is
   * what the player just killed: at their feet, where it can be picked up.
   */
  private dropGem(x: number, y: number, kind: EnemyKind): void {
    const roll = this.rng();
    const worth = isElite(kind) ? 25 : roll > 0.98 ? 25 : roll > 0.85 ? 5 : 1;
    if (this.gems.length >= MAX_GEMS) this.gems.shift();
    this.gems.push({ id: this.nextGemId++, x, y, worth });
  }

  private ageStrikes(): void {
    for (const s of this.strikes) s.age += 1;
    this.strikes = this.strikes.filter((s) => s.age <= s.life);
  }

  // ---------- pickups ----------

  private collectGems(): void {
    const alive = [...this.players.values()].filter((p) => p.alive);
    if (alive.length === 0) return;

    for (let i = this.gems.length - 1; i >= 0; i--) {
      const gem = this.gems[i];
      let nearest = alive[0];
      let dist = Infinity;
      for (const p of alive) {
        const d = Math.hypot(p.x - gem.x, p.y - gem.y);
        if (d < dist) { dist = d; nearest = p; }
      }
      if (dist > GEM_MAGNET_RADIUS * nearest.stats.magnet) continue;

      if (dist <= GEM_PICKUP_RADIUS) {
        this.gems.splice(i, 1);
        this.gainXp(gem.worth);
        continue;
      }
      // Inside the magnet ring the gem accelerates in, which is what makes
      // sweeping through a cleared field feel like a reward.
      gem.x += ((nearest.x - gem.x) / dist) * 2.6;
      gem.y += ((nearest.y - gem.y) / dist) * 2.6;
    }
  }

  /** Chickens heal whoever walks over them — the original's one panic button. */
  private collectItems(): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      const finder = [...this.players.values()].find((p) =>
        p.alive && Math.hypot(p.x - item.x, p.y - item.y) <= PLAYER_RADIUS + GEM_PICKUP_RADIUS);
      if (!finder) continue;
      this.items.splice(i, 1);
      const max = this.maxHpOf(finder);
      finder.hp = Math.min(max, finder.hp + max * CHICKEN_HEAL);
    }
  }

  /** Walking over a chest evolves a weapon if one is ready, or hands out levels. */
  private openChests(): void {
    for (let i = this.chests.length - 1; i >= 0; i--) {
      const chest = this.chests[i];
      const finder = [...this.players.values()].find((p) =>
        p.alive && Math.hypot(p.x - chest.x, p.y - chest.y) <= CHEST_PICKUP_RADIUS + PLAYER_RADIUS);
      if (!finder) continue;
      this.chests.splice(i, 1);

      const ready = evolutionReady(finder.weapons, finder.passives);
      if (ready) {
        const level = finder.weapons.get(ready) ?? 1;
        finder.weapons.delete(ready);
        finder.timers.delete(ready);
        finder.weapons.set(`${ready}+`, level);
        finder.timers.set(`${ready}+`, 0);
        this.evolved = labelOf(`${ready}+`);
        this.evolveShout = EVOLVE_SHOUT_TICKS;
        continue;
      }
      finder.bonusLevels += CHEST_LEVELS;
      this.beginLevelUp();
    }
  }

  private gainXp(amount: number): void {
    this.xp += amount;
    const need = xpForLevel(this.level, Math.max(1, this.players.size));
    if (this.xp < need) return;
    this.xp -= need;
    this.level += 1;
    this.beginLevelUp();
  }

  // ---------- damage and survival ----------

  private applyContactDamage(): void {
    // The reaper does not negotiate: it ignores the blink after a hit, and it
    // reaches as far as it is drawn — otherwise it strolls through a player
    // whose centre it never quite touches.
    const scythe = REAPER_REACH ** 2;

    for (const p of this.players.values()) {
      if (!p.alive) continue;

      if (this.reaperOut
        && this.enemies.some((e) => e.kind === REAPER_KIND && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= scythe)) {
        p.hp = 0;
        p.alive = false;
        continue;
      }

      if (p.invuln > 0) { p.invuln -= 1; continue; }
      const reach = (PLAYER_RADIUS + ENEMY_RADIUS) ** 2;
      const toucher = this.enemies.find((e) => (e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= reach);
      if (!toucher) continue;

      const bite = CONTACT_DAMAGE * (isElite(toucher.kind) ? 2.5 : 1) * (1 - p.stats.armor);
      p.hp -= bite;
      p.invuln = HURT_INVULN_TICKS;
      if (p.hp <= 0) { p.hp = 0; p.alive = false; }
    }
  }

  /**
   * Regeneration is a share of the player's own ceiling, not a flat number:
   * a flat trickle out-heals the early game and is worthless in the late one.
   */
  private regenerate(): void {
    if (this.tick % TICKS_PER_SECOND !== 0) return;
    for (const p of this.players.values()) {
      if (!p.alive || p.stats.regen <= 0) continue;
      const max = this.maxHpOf(p);
      p.hp = Math.min(max, p.hp + max * p.stats.regen);
    }
  }

  private maxHpOf(p: Player): number {
    return PLAYER_MAX_HP * p.stats.maxHp;
  }

  private checkEnd(): void {
    const anyAlive = [...this.players.values()].some((p) => p.alive);
    if (!anyAlive) this.phase = 'over';
  }

  // ---------- level up ----------

  private beginLevelUp(): void {
    const alive = [...this.players.values()].filter((p) => p.alive);
    if (alive.length === 0) return;
    this.phase = 'levelup';
    this.pickDeadline = this.timedPicks ? PICK_TIMEOUT_TICKS : -1;
    this.offers.clear();
    this.screens += 1;
    for (const p of alive) {
      // Each hand is drawn from its own forked stream rather than the shared
      // one. Drawing per player from the shared stream would tie the number of
      // draws to how many people are in the room at that instant — and a member
      // adopts the host's roster a tick or two before it replays the frame that
      // used it, so a join or a leave during a level-up would part the two
      // streams permanently. This way a level-up costs the shared stream nothing.
      const hand = createRng(mixSeed(this.seed, this.screens, p.id));
      const cards = rollOffers(p.weapons, p.passives, CARD_COUNT, hand);
      this.offers.set(p.id, cards);
      // Someone with nothing left to take must not hold the room hostage: they
      // have no cards to answer with, and no overlay to answer them on.
      p.pending = cards.length > 0;
      p.pickIndex = cards.length > 0 ? null : -1;
    }
    if (!this.anyPending()) this.resume();
  }

  private stepLevelUp(): void {
    for (const p of this.players.values()) {
      if (!p.pending || !p.alive) continue;
      const cards = this.offers.get(p.id) ?? [];
      const choice = p.input.pick1 ? 0 : p.input.pick2 ? 1 : p.input.pick3 ? 2 : p.input.skip ? -1 : null;
      if (choice === null || choice >= cards.length) continue;
      if (choice >= 0) this.applyOffer(p, cards[choice]);
      p.pending = false;
      p.pickIndex = choice;
    }

    if (this.pickDeadline > 0) {
      this.pickDeadline -= 1;
      if (this.pickDeadline === 0) {
        for (const p of this.players.values()) {
          if (p.pending && p.alive) { this.applyOffer(p, this.offers.get(p.id)?.[0]); p.pickIndex = 0; }
          p.pending = false;
        }
      }
    }

    if (!this.anyPending()) this.resume();
  }

  private applyOffer(player: Player, offer: CardOffer | undefined): void {
    if (!offer) return;
    if (isPassiveOffer(offer)) {
      const id = passiveIdOf(offer);
      if (!player.passives.has(id) && player.passives.size >= PASSIVE_SLOTS) return;
      player.passives.set(id, offer.level);
      player.stats = passiveStats(player.passives);
      // A bigger heart raises the ceiling, not the current reading.
      player.hp = Math.min(player.hp, this.maxHpOf(player));
      return;
    }
    if (!player.weapons.has(offer.weapon) && player.weapons.size >= WEAPON_SLOTS) return;
    player.weapons.set(offer.weapon, offer.level);
    if (!player.timers.has(offer.weapon)) player.timers.set(offer.weapon, 0);
  }

  private anyPending(): boolean {
    return [...this.players.values()].some((p) => p.pending && p.alive);
  }

  private resume(): void {
    this.offers.clear();
    this.pickDeadline = -1;
    for (const p of this.players.values()) p.pending = false;

    // A chest can owe several levels; show the next card screen rather than
    // swallowing them, but only once the current one is settled.
    const owed = [...this.players.values()].find((p) => p.alive && p.bonusLevels > 0);
    if (owed) {
      owed.bonusLevels -= 1;
      this.phase = 'run';
      this.beginLevelUp();
      return;
    }
    this.phase = 'run';
  }

  // ---------- read side ----------

  snapshot(): SurvivorWorld {
    return {
      seed: this.seed,
      tick: this.tick,
      phase: this.phase,
      players: [...this.players.values()].map((p) =>
        ({
          id: p.id, name: p.name, x: p.x, y: p.y,
          hp: p.hp, maxHp: this.maxHpOf(p),
          facing: p.facing, invuln: p.invuln, alive: p.alive
        })),
      enemies: this.enemies.map(({ id, x, y, hp, flash, kind }) => ({ id, x, y, hp, flash, kind })),
      gems: this.gems.map((g) => ({ ...g })),
      strikes: this.strikes.map((s) => ({ ...s })),
      shots: this.shots.map(({ x, y, radius, spin, kind }) => ({ x, y, radius, spin, kind })),
      pools: this.pools.map(({ x, y, radius, age, life }) => ({ x, y, radius, age, life })),
      chests: this.chests.map((c) => ({ ...c })),
      items: this.items.map((i) => ({ ...i })),
      xp: this.xp,
      level: this.level,
      kills: this.kills,
      offers: [...this.offers].map(([id, cards]): OfferSet =>
        ({ id, cards: cards.map((card) => ({ ...card })) })),
      pendingIds: [...this.players.values()].filter((p) => p.pending && p.alive).map((p) => p.id),
      picks: [...this.players.values()]
        .filter((p) => p.pickIndex !== null && p.alive)
        .map((p) => [p.id, p.pickIndex as number] as [string, number]),
      evolved: this.evolved,
      reaper: this.reaperOut,
      pickDeadline: this.pickDeadline,
      survived: this.survived
    };
  }

  /**
   * A cheap fingerprint of everything the simulation owns.
   *
   * Phase 3 runs this same engine on every client from one seed and one input
   * stream, so the numbers must match tick for tick. This is how a client finds
   * out that they don't — it is a monitor, not a repair.
   */
  checksum(): number {
    let sum = this.tick * 2654435761;
    sum = (sum + this.enemies.length * 97 + this.gems.length * 31 + this.shots.length * 17) >>> 0;
    for (const e of this.enemies) {
      sum = (sum * 31 + (Math.round(e.x) | 0) + (Math.round(e.y) | 0) * 7 + e.kind * 13) >>> 0;
    }
    for (const p of this.players.values()) {
      sum = (sum * 31 + (Math.round(p.x) | 0) + (Math.round(p.y) | 0) * 7 + Math.round(p.hp)) >>> 0;
    }
    return sum >>> 0;
  }

  /** The simulation's phase, without building a whole snapshot to read it. */
  runPhase(): Phase {
    return this.phase;
  }

  /** Players in insertion order — every client must build this list the same way. */
  playerIds(): string[] {
    return [...this.players.keys()];
  }

  /** The tick this engine has simulated up to. */
  currentTick(): number {
    return this.tick;
  }

  /**
   * Hard-sets a player's body from the host's copy. Lockstep should already
   * agree; this is the cheap insurance that a drift can't get someone killed
   * on one screen while they're alive on another.
   */
  reconcile(id: string, x: number, y: number, hp: number, alive: boolean): void {
    const p = this.players.get(id);
    if (!p) return;
    p.x = x; p.y = y; p.hp = hp;
    if (!alive) p.alive = false;
  }

  /** Experience still needed for the next level — the HUD bar reads this. */
  xpNeeded(): number {
    return xpForLevel(this.level, Math.max(1, this.players.size));
  }

  /** One player's shelf, labelled and levelled — what the end-of-run panel reads. */
  loadout(id: string): { weapons: OwnedItem[]; passives: OwnedItem[] } {
    const p = this.players.get(id);
    if (!p) return { weapons: [], passives: [] };
    return {
      weapons: [...p.weapons].map(([weapon, level]) => ({ label: labelOf(weapon), level })),
      passives: [...p.passives].map(([passive, level]) =>
        ({ label: passiveById(passive)?.label ?? passive, level }))
    };
  }

  /** True when this player's next chest will evolve something. */
  evolutionPending(id: string): boolean {
    const p = this.players.get(id);
    if (!p) return false;
    return evolutionReady(p.weapons, p.passives) !== null;
  }
}

/** Re-exported so tests and the HUD can reason about evolution without reaching into weapons.ts. */
export { EVOLVE_PASSIVE_LEVEL, weaponById };
