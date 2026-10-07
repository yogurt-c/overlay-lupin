import { planck } from '../../lib/tower-physics.js';
import {
  BOX_BOTTOM, BOX_LEFT, BOX_RIGHT, DANGER_Y, DROP_Y, FINALE_SCORE, LAST_KIND, RADII, SPAWN_KINDS, mergeScore
} from './types.js';
import type { BallPose, MergeInput, MergeWorld } from './types.js';

/** Same metric scale as 동물탑: Box2D tolerances are absolute, so pixels are simulated as metres/30. */
const MPP = 1 / 30;
const GRAVITY = 620 * MPP;
const SUBSTEPS = 2;
const TIME_STEP = 1 / 60 / SUBSTEPS;
const AIM_SPEED = 2.2;
/** Pause between a drop and the next animal appearing in hand. */
export const COOLDOWN_TICKS = 36;
/** A freshly dropped or merged animal may pass the danger line while it settles. */
export const GRACE_TICKS = 60;
/** Ticks an animal may sit above the line before the run ends. */
export const DANGER_TICKS = 120;
/** How long the result stays on screen before the shell returns to idle. */
export const OVER_HOLD_TICKS = 240;
const WALL = 10;

interface Ball { body: planck.Body; kind: number; born: number; above: number; }

export class MergeEngine {
  readonly physics = planck.World({ gravity: planck.Vec2(0, GRAVITY) });
  private balls: Ball[] = [];
  private world: MergeWorld;
  private cooldown = 0;
  private overTicks = 0;
  private rng: number;

  constructor(seed = (Math.random() * 0xffffffff) >>> 0) {
    this.rng = seed || 1;
    const box = this.physics.createBody({ type: 'static' });
    const height = BOX_BOTTOM + 400;
    const fixture = { friction: 0.5, restitution: 0 };
    const rect = (cx: number, cy: number, hw: number, hh: number) =>
      box.createFixture(planck.Box(hw * MPP, hh * MPP, planck.Vec2(cx * MPP, cy * MPP)), fixture);
    // Walls run far above the drawn rim so nothing bounced high can escape sideways.
    rect(BOX_LEFT - WALL / 2, BOX_BOTTOM - height / 2, WALL / 2, height / 2);
    rect(BOX_RIGHT + WALL / 2, BOX_BOTTOM - height / 2, WALL / 2, height / 2);
    rect((BOX_LEFT + BOX_RIGHT) / 2, BOX_BOTTOM + WALL / 2, (BOX_RIGHT - BOX_LEFT) / 2 + WALL, WALL / 2);
    this.world = { tick: 0, phase: 'aim', kind: this.pick(), next: this.pick(), x: (BOX_LEFT + BOX_RIGHT) / 2, score: 0, danger: 0, balls: [] };
  }

  private pick(): number {
    this.rng ^= this.rng << 13; this.rng ^= this.rng >>> 17; this.rng ^= this.rng << 5;
    return (this.rng >>> 0) % SPAWN_KINDS;
  }

  private clampX(x: number, kind: number): number {
    return Math.max(BOX_LEFT + RADII[kind], Math.min(BOX_RIGHT - RADII[kind], x));
  }

  /** Exposed for tests: places an animal directly, as a drop or a merge would. */
  spawn(kind: number, x: number, y: number, vx = 0, vy = 0): void {
    const body = this.physics.createBody({
      type: 'dynamic',
      position: planck.Vec2(x * MPP, y * MPP),
      linearVelocity: planck.Vec2(vx, vy),
      linearDamping: 0.1,
      angularDamping: 0.4
    });
    body.createFixture(planck.Circle(RADII[kind] * MPP), { density: 1, friction: 0.45, restitution: 0.05 });
    this.balls.push({ body, kind, born: this.world.tick, above: 0 });
  }

  step(input: MergeInput): void {
    const w = this.world;
    w.tick++;
    if (w.phase === 'over') { this.overTicks++; return; }

    if (w.phase === 'aim') {
      w.x = this.clampX(w.x + (Number(input.right) - Number(input.left)) * AIM_SPEED, w.kind);
      if (input.drop) {
        this.spawn(w.kind, w.x, DROP_Y);
        w.phase = 'cooldown';
        this.cooldown = COOLDOWN_TICKS;
      }
    } else if (--this.cooldown <= 0) {
      w.kind = w.next;
      w.next = this.pick();
      w.x = this.clampX(w.x, w.kind);
      w.phase = 'aim';
    }

    for (let i = 0; i < SUBSTEPS; i++) this.physics.step(TIME_STEP, 8, 3);
    this.merge();
    this.checkDanger();
  }

  /** Every touching same-kind pair fuses once per tick into the next kind at their midpoint. */
  private merge(): void {
    const byBody = new Map(this.balls.map(b => [b.body, b]));
    const used = new Set<Ball>();
    const pairs: [Ball, Ball][] = [];
    for (let c = this.physics.getContactList(); c; c = c.getNext()) {
      if (!c.isTouching()) continue;
      const a = byBody.get(c.getFixtureA().getBody()), b = byBody.get(c.getFixtureB().getBody());
      if (!a || !b || a.kind !== b.kind || used.has(a) || used.has(b)) continue;
      used.add(a); used.add(b);
      pairs.push([a, b]);
    }
    for (const [a, b] of pairs) {
      const pa = a.body.getPosition(), pb = b.body.getPosition();
      const va = a.body.getLinearVelocity(), vb = b.body.getLinearVelocity();
      this.physics.destroyBody(a.body);
      this.physics.destroyBody(b.body);
      this.balls = this.balls.filter(x => x !== a && x !== b);
      if (a.kind === LAST_KIND) { this.world.score += FINALE_SCORE; continue; }
      const kind = a.kind + 1;
      this.world.score += mergeScore(kind);
      const x = this.clampX((pa.x + pb.x) / 2 / MPP, kind);
      this.spawn(kind, x, (pa.y + pb.y) / 2 / MPP, (va.x + vb.x) / 2, (va.y + vb.y) / 2);
    }
  }

  private checkDanger(): void {
    let worst = 0;
    for (const b of this.balls) {
      const top = b.body.getPosition().y / MPP - RADII[b.kind];
      b.above = this.world.tick - b.born > GRACE_TICKS && top < DANGER_Y ? b.above + 1 : 0;
      worst = Math.max(worst, b.above);
    }
    this.world.danger = Math.min(1, worst / DANGER_TICKS);
    if (worst >= DANGER_TICKS) this.world.phase = 'over';
  }

  get isOver(): boolean { return this.world.phase === 'over' && this.overTicks >= OVER_HOLD_TICKS; }

  snapshot(): MergeWorld {
    const balls: BallPose[] = this.balls.map(({ body, kind, born }) => {
      const p = body.getPosition();
      return [kind, p.x / MPP, p.y / MPP, body.getAngle(), this.world.tick - born];
    });
    return { ...this.world, balls };
  }
}
