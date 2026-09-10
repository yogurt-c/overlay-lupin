import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  BIG_FOOD_MASS,
  BIG_FOOD_MAX_COUNT,
  BIG_FOOD_SPAWN_INTERVAL_MS,
  BOOST_MASS_DECAY,
  BOOST_SPEED_MULT,
  EAT_RATIO,
  FOOD_COUNT,
  FOOD_MASS,
  RESPAWN_MS,
  START_MASS,
  radiusFor
} from './arena.js';
import type { CellInput, CellWorld, FoodDot } from './types.js';

const MOVE_ACCEL = 0.6;
const DRAG = 0.86;
const BASE_MAX_SPEED = 2.6;
/** Applied only to mass above `START_MASS`, so idling never shrinks a cell below its starting size. */
const MASS_DECAY = 0.9998;

interface EnginePlayer {
  id: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  alive: boolean;
  input: CellInput;
  respawnAt: number;
}

const NO_INPUT: CellInput = { up: false, down: false, left: false, right: false, boost: false };

function randomSpot(): { x: number; y: number } {
  return { x: Math.random() * ARENA_WIDTH, y: Math.random() * ARENA_HEIGHT };
}

/**
 * The host-only authoritative simulation for one cell-growing match. Members
 * never run this themselves — they just render whatever snapshot arrives.
 */
export class CellEngine {
  players = new Map<string, EnginePlayer>();
  food: FoodDot[] = [];
  private nextBigFoodAt: number;

  constructor() {
    for (let i = 0; i < FOOD_COUNT; i++) this.food.push(randomSpot());
    this.nextBigFoodAt = Date.now() + BIG_FOOD_SPAWN_INTERVAL_MS;
  }

  /** Lazily creates a player the first time we hear from them — a mid-session joiner needs no separate path. */
  ensurePlayer(id: string, name: string): void {
    let p = this.players.get(id);
    if (!p) {
      const spot = randomSpot();
      p = { id, name, x: spot.x, y: spot.y, vx: 0, vy: 0, mass: START_MASS, alive: true, input: NO_INPUT, respawnAt: 0 };
      this.players.set(id, p);
    }
    p.name = name;
  }

  setInput(id: string, input: CellInput): void {
    const p = this.players.get(id);
    if (p) p.input = input;
  }

  removePlayer(id: string): void {
    this.players.delete(id);
  }

  /** Advances the simulation by exactly one tick. */
  step(): void {
    const now = Date.now();
    for (const p of this.players.values()) {
      if (!p.alive) {
        if (now >= p.respawnAt) this.respawn(p);
        continue;
      }
      const boosting = p.input.boost && p.mass > START_MASS;
      this.stepMovement(p, boosting);
      this.decay(p, boosting);
    }
    this.stepEating();
    this.stepFood();
    this.stepBigFoodSpawn(now);
  }

  private respawn(p: EnginePlayer): void {
    const spot = randomSpot();
    p.x = spot.x;
    p.y = spot.y;
    p.vx = 0;
    p.vy = 0;
    p.mass = START_MASS;
    p.alive = true;
  }

  private stepMovement(p: EnginePlayer, boosting: boolean): void {
    const maxSpeed = BASE_MAX_SPEED * Math.sqrt(START_MASS / p.mass) * (boosting ? BOOST_SPEED_MULT : 1);
    const ax = (p.input.left ? -1 : 0) + (p.input.right ? 1 : 0);
    const ay = (p.input.up ? -1 : 0) + (p.input.down ? 1 : 0);

    if (ax !== 0 || ay !== 0) {
      const len = Math.hypot(ax, ay);
      p.vx += (ax / len) * MOVE_ACCEL;
      p.vy += (ay / len) * MOVE_ACCEL;
    } else {
      p.vx *= DRAG;
      p.vy *= DRAG;
    }

    const speed = Math.hypot(p.vx, p.vy);
    if (speed > maxSpeed) {
      p.vx = (p.vx / speed) * maxSpeed;
      p.vy = (p.vy / speed) * maxSpeed;
    }

    const r = radiusFor(p.mass);
    p.x = Math.max(r, Math.min(ARENA_WIDTH - r, p.x + p.vx));
    p.y = Math.max(r, Math.min(ARENA_HEIGHT - r, p.y + p.vy));
  }

  private decay(p: EnginePlayer, boosting: boolean): void {
    if (p.mass <= START_MASS) return;
    const rate = boosting ? MASS_DECAY * BOOST_MASS_DECAY : MASS_DECAY;
    p.mass = START_MASS + (p.mass - START_MASS) * rate;
  }

  /** Bigger absorbs smaller when they touch, above `EAT_RATIO` — everyone else just bounces off no one (cells overlap freely otherwise). */
  private stepEating(): void {
    const alive = Array.from(this.players.values()).filter((p) => p.alive);
    for (const a of alive) {
      if (!a.alive) continue;
      for (const b of alive) {
        if (a === b || !b.alive || a.mass < b.mass * EAT_RATIO) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) > radiusFor(a.mass)) continue;
        a.mass += b.mass;
        b.alive = false;
        b.respawnAt = Date.now() + RESPAWN_MS;
      }
    }
  }

  private stepFood(): void {
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      const r = radiusFor(p.mass);
      for (let i = this.food.length - 1; i >= 0; i--) {
        const dot = this.food[i];
        if (Math.hypot(p.x - dot.x, p.y - dot.y) > r) continue;
        p.mass += dot.big ? BIG_FOOD_MASS : FOOD_MASS;
        this.food.splice(i, 1);
        // Big food is a rare bonus on top of the ambient count — only regular food gets replaced.
        if (!dot.big) this.food.push(randomSpot());
      }
    }
  }

  /** Drops a big food pellet on a timer, capped so the arena never gets flooded with them. */
  private stepBigFoodSpawn(now: number): void {
    if (now < this.nextBigFoodAt) return;
    this.nextBigFoodAt = now + BIG_FOOD_SPAWN_INTERVAL_MS;
    const bigCount = this.food.reduce((n, f) => n + (f.big ? 1 : 0), 0);
    if (bigCount >= BIG_FOOD_MAX_COUNT) return;
    this.food.push({ ...randomSpot(), big: true });
  }

  snapshot(): CellWorld {
    const now = Date.now();
    return {
      players: Array.from(this.players.values()).map((p) => ({
        id: p.id,
        name: p.name,
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10,
        mass: Math.round(p.mass * 10) / 10,
        alive: p.alive,
        respawnInMs: p.alive ? undefined : Math.max(0, p.respawnAt - now)
      })),
      food: this.food.map((f) => (f.big ? { x: f.x, y: f.y, big: true } : { x: f.x, y: f.y }))
    };
  }
}
