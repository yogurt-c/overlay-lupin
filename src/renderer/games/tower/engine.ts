import { planck } from '../../lib/tower-physics.js';
import { ANIMALS } from './animals.js';
import { bodyBounds, createAnimalBody, GEOMETRY, METRES_PER_PIXEL, SURFACE } from './geometry.js';
import { DROP_MAX_X, DROP_MIN_X, MAX_ANIMALS, PLATFORM_WIDTH, PLATFORM_Y, SWAP_TOKENS } from './types.js';
import type { AimCommand, Side, TowerWorld } from './types.js';

/** Chosen so a piece lands at the same speed the hand-tuned drop height was built around. */
const GRAVITY = 530 * METRES_PER_PIXEL;
/**
 * Two substeps per 60Hz tick. Box2D solves each contact island per step, so halving
 * the step halves how far a thin ear travels between solves and sharpens the stack.
 */
const SUBSTEPS = 2;
const TIME_STEP = 1 / 60 / SUBSTEPS;
const VELOCITY_ITERATIONS = 8;
const POSITION_ITERATIONS = 3;
/** Ticks a settled tower must hold before the turn hands over. */
const REST_TICKS = 12;
/** Minimum time a piece is in play, so a turn never flicks past. */
const MIN_FALL_TICKS = 120;
const COLLAPSE_TICKS = 90;

export const clampX = (x: number): number => Math.max(DROP_MIN_X, Math.min(DROP_MAX_X, x));
export const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
export function validCommand(v: unknown): v is AimCommand {
  if (!v || typeof v !== 'object') return false;
  const c = v as AimCommand;
  return Number.isSafeInteger(c.seq) && c.seq >= 0 && Number.isSafeInteger(c.turn) && c.turn >= 0
    && Number.isFinite(c.x) && Number.isFinite(c.angle) && typeof c.drop === 'boolean' && typeof c.swap === 'boolean';
}

export class TowerEngine {
  readonly physics = planck.World({ gravity: planck.Vec2(0, GRAVITY) });
  readonly platform: planck.Body;
  readonly animals: { body: planck.Body; kind: number; owner: Side }[] = [];
  private world: TowerWorld;
  private lastSeq = [-1, -1];
  private lastDropper: Side = 0;
  private stableTicks = 0;
  private fallTicks = 0;
  private overTicks = 0;
  private bag: number[] = [];
  private rng: number;

  constructor(readonly solo = false, seed = (Math.random() * 0xffffffff) >>> 0) {
    this.rng = seed || 1;
    this.platform = this.physics.createBody({
      type: 'static',
      position: planck.Vec2(160 * METRES_PER_PIXEL, (PLATFORM_Y + 5) * METRES_PER_PIXEL)
    });
    this.platform.createFixture(
      planck.Box(PLATFORM_WIDTH / 2 * METRES_PER_PIXEL, 5 * METRES_PER_PIXEL), { ...SURFACE });
    this.world = { tick: 0, turn: 0, side: 0, phase: 'aim', kind: 0, next: this.pick(), x: 160,
      y: 100, angle: 0, score: 0, loser: null, complete: false, ack: -1,
      swaps: [SWAP_TOKENS, SWAP_TOKENS], bodies: [] };
    this.updateSpawn();
  }

  private pick(): number {
    if (!this.bag.length) {
      this.bag = ANIMALS.map((_, i) => i);
      for (let i = this.bag.length - 1; i > 0; i--) {
        this.rng ^= this.rng << 13; this.rng ^= this.rng >>> 17; this.rng ^= this.rng << 5;
        const j = (this.rng >>> 0) % (i + 1);
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    return this.bag.pop()!;
  }

  private updateSpawn(): void {
    const top = Math.min(PLATFORM_Y, ...this.animals.map(a => bodyBounds(a.body).minY));
    this.world.y = top - GEOMETRY[this.world.kind].radius - 38;
  }

  /** Sequence acknowledgement survives rejected stale-turn commands; retransmits never drop twice. */
  command(side: Side, value: unknown): void {
    if (!validCommand(value) || value.seq <= this.lastSeq[side]) return;
    this.lastSeq[side] = value.seq;
    if (side === 1) this.world.ack = value.seq;
    if (this.world.phase !== 'aim' || side !== this.world.side || value.turn !== this.world.turn) return;
    this.world.x = clampX(value.x);
    this.world.angle = wrapAngle(value.angle);
    // A token trades the waiting animal for the preview, so the cost is always visible before it is paid.
    if (value.swap && this.world.swaps[side] > 0) {
      const swaps: [number, number] = [...this.world.swaps];
      swaps[side]--;
      this.world = { ...this.world, swaps, kind: this.world.next, next: this.world.kind };
    }
    if (!value.drop) return;
    this.updateSpawn();
    const { kind, x, y, angle } = this.world;
    this.animals.push({ body: createAnimalBody(this.physics, kind, x, y, angle), kind, owner: side });
    this.lastDropper = side;
    this.world.phase = 'fall';
    this.stableTicks = this.fallTicks = 0;
  }

  /**
   * All bodies must belong to a contact chain rooted at the platform; an airborne
   * apex is not stable. Box2D keeps a touching contact on record while the pair
   * sleeps, so a quiet base still reads as support for the piece above it.
   */
  private supported(): boolean {
    const reachable = new Set<planck.Body>([this.platform]);
    let changed = true;
    while (changed) {
      changed = false;
      for (let contact = this.physics.getContactList(); contact; contact = contact.getNext()) {
        if (!contact.isTouching()) continue;
        const a = contact.getFixtureA().getBody(), b = contact.getFixtureB().getBody();
        if (reachable.has(a) && !reachable.has(b)) { reachable.add(b); changed = true; }
        if (reachable.has(b) && !reachable.has(a)) { reachable.add(a); changed = true; }
      }
    }
    return this.animals.every(a => reachable.has(a.body));
  }

  /** Box2D only sleeps an island whose every body has held still; that is the rest test. */
  private settled(): boolean {
    return this.animals.length > 0 && this.animals.every(a => !a.body.isAwake());
  }

  private advance(): void {
    for (let i = 0; i < SUBSTEPS; i++) this.physics.step(TIME_STEP, VELOCITY_ITERATIONS, POSITION_ITERATIONS);
  }

  step(): void {
    this.world.tick++;
    if (this.world.phase === 'over') {
      this.overTicks++;
      // Let the collapse play out during the result banner.
      if (this.overTicks < COLLAPSE_TICKS) this.advance();
      return;
    }
    this.advance();
    if (this.animals.some(a => {
      const bounds = bodyBounds(a.body);
      return bounds.minY > PLATFORM_Y + 55 || Math.abs(a.body.getPosition().x / METRES_PER_PIXEL - 160) > 420;
    })) {
      this.world.phase = 'over';
      this.world.loser = this.lastDropper;
      return;
    }
    if (this.world.phase === 'aim') { this.updateSpawn(); return; }
    this.fallTicks++;
    this.stableTicks = this.settled() && this.supported() ? this.stableTicks + 1 : 0;
    if (this.fallTicks < MIN_FALL_TICKS || this.stableTicks < REST_TICKS) return;
    this.world.score = this.animals.length;
    if (this.animals.length >= MAX_ANIMALS) {
      this.world.phase = 'over'; this.world.complete = true; return;
    }
    this.world.turn++;
    if (!this.solo) this.world.side = this.world.side === 0 ? 1 : 0;
    this.world.phase = 'aim';
    this.world.kind = this.world.next;
    this.world.next = this.pick();
    this.world.x = 160;
    this.world.angle = 0;
    this.updateSpawn();
  }

  get isOver(): boolean { return this.world.phase === 'over' && this.overTicks >= 240; }

  snapshot(): TowerWorld {
    return { ...this.world, swaps: [...this.world.swaps], bodies: this.animals.map(({ body, kind, owner }) => {
      const position = body.getPosition();
      return [kind, owner, position.x / METRES_PER_PIXEL, position.y / METRES_PER_PIXEL, wrapAngle(body.getAngle())];
    }) };
  }
}
