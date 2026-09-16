import { GEOMETRY } from './geometry.js';
import { clampX, wrapAngle } from './engine.js';
import { PLATFORM_WIDTH, PLATFORM_Y } from './types.js';
import type { AimCommand, TowerWorld } from './types.js';

type Point = { x: number; y: number };
const ROTATION = Math.PI / 12;
function outline(kind: number, angle: number, x = 0, y = 0): Point[] {
  const { vertices, centre } = GEOMETRY[kind];
  const c = Math.cos(angle), s = Math.sin(angle);
  return vertices.map(v => ({ x: x + (v.x - centre.x) * c - (v.y - centre.y) * s,
    y: y + (v.x - centre.x) * s + (v.y - centre.y) * c }));
}

/** Scan the visible outline, not the hidden physical state or future simulation. */
function envelope(points: Point[], x: number, bottom: boolean): number {
  let result = bottom ? -Infinity : Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (x < Math.min(a.x, b.x) || x > Math.max(a.x, b.x) || Math.abs(a.x - b.x) < 1e-6) continue;
    const y = a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
    result = bottom ? Math.max(result, y) : Math.min(result, y);
  }
  return result;
}

/** Lightweight geometric judgement. No exact rollouts: a seemingly good placement can still slip. */
export function planPlacement(world: TowerWorld, random: () => number): { x: number; angle: number } {
  const shapes = world.bodies.map(([kind, , x, y, angle]) => outline(kind, angle, x, y));
  const skyline = Array.from({ length: 161 }, (_, i) => {
    const x = i * 2;
    return Math.min(Math.abs(x - 160) <= PLATFORM_WIDTH / 2 ? PLATFORM_Y : Infinity,
      ...shapes.map(shape => envelope(shape, x, false)));
  });
  const candidates: { x: number; angle: number; score: number }[] = [];
  for (let rotation = -12; rotation < 12; rotation++) {
    const angle = rotation * ROTATION, shape = outline(world.kind, angle);
    const bottom: Point[] = [];
    const minX = Math.min(...shape.map(p => p.x)), maxX = Math.max(...shape.map(p => p.x));
    for (let x = Math.ceil(minX / 2) * 2; x <= maxX; x += 2) {
      const y = envelope(shape, x, true);
      if (Number.isFinite(y)) bottom.push({ x, y });
    }
    for (let x = 80; x <= 240; x += 4) {
      const gaps = bottom.map(p => skyline[Math.round((x + p.x) / 2)] - p.y);
      const landing = Math.min(...gaps);
      if (!Number.isFinite(landing)) continue;
      const contacts = bottom.filter((_, i) => gaps[i] - landing < 2.5);
      const left = Math.min(...contacts.map(p => p.x)), right = Math.max(...contacts.map(p => p.x));
      const margin = Math.min(-left, right);
      // A wide support under the centre is safer; prefer building up over camping on the bare platform.
      const score = Math.min(margin, 12) * 2 + (right - left) * 0.18
        + (PLATFORM_Y - landing) * 0.08 - Math.abs(x - 160) * 0.08 - Math.abs(rotation) * 0.12;
      candidates.push({ x, angle, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best) return { x: 160, angle: 0 };
  // Choose among a few plausible places. Slight hand-position error varies each turn, with occasional
  // less precise choices; the bot can lose by the same physics and rules as a human.
  const options = candidates.filter(c => c.score >= best.score - 4).slice(0, 8);
  const choice = options[Math.floor(random() * options.length)];
  const error = (random() - 0.5) * (random() < 0.12 ? 10 : 3);
  return { x: clampX(choice.x + error), angle: choice.angle };
}

/** Turn-local motor behaviour: look, approach, pause, correct, then release. All timing uses game ticks. */
export class TowerBot {
  private turn = -1;
  private seq = 0;
  private age = 0;
  private think = 0;
  private confirm = 0;
  private settled = 0;
  private rotateIn = 0;
  private pauseAt = 0;
  private pauseFor = 0;
  private speed = 1;
  private correction = 0;
  private corrected = false;
  private dropped = false;
  private target = { x: 160, angle: 0 };
  private state: number;
  constructor(seed = (Math.random() * 0xffffffff) >>> 0) { this.state = seed || 1; }
  private random = (): number => {
    this.state ^= this.state << 13; this.state ^= this.state >>> 17; this.state ^= this.state << 5;
    return (this.state >>> 0) / 4294967296;
  };

  step(world: TowerWorld): AimCommand | null {
    if (world.phase !== 'aim' || world.side !== 1) return null;
    if (world.turn !== this.turn) {
      this.turn = world.turn; this.age = this.settled = 0; this.dropped = this.corrected = false;
      this.target = planPlacement(world, this.random);
      this.think = 35 + Math.floor(this.random() * 55);
      this.confirm = 20 + Math.floor(this.random() * 35);
      this.speed = 0.7 + this.random() * 0.65;
      this.rotateIn = 8;
      this.pauseAt = this.think + 15 + Math.floor(this.random() * 25);
      this.pauseFor = 8 + Math.floor(this.random() * 15);
      this.correction = (this.random() < 0.65 ? 1 : 0) * (this.random() < 0.5 ? -1 : 1) * (3 + this.random() * 4);
    }
    if (this.dropped) return null;
    this.age++;
    if (this.age < this.think) return null;
    if (this.age >= this.pauseAt && this.pauseFor > 0) { this.pauseFor--; return null; }
    const targetX = this.target.x + (this.corrected ? 0 : this.correction);
    const dx = targetX - world.x;
    const x = clampX(world.x + Math.sign(dx) * Math.min(Math.abs(dx), this.speed));
    let angle = world.angle;
    const da = wrapAngle(this.target.angle - angle);
    if (--this.rotateIn <= 0 && Math.abs(da) > 0.01) {
      angle = wrapAngle(angle + Math.sign(da) * Math.min(Math.abs(da), ROTATION));
      this.rotateIn = 9 + Math.floor(this.random() * 8);
    }
    const aligned = Math.abs(x - targetX) < 0.1 && Math.abs(wrapAngle(this.target.angle - angle)) < 0.01;
    this.settled = aligned ? this.settled + 1 : 0;
    if (!this.corrected && this.settled >= 10) {
      this.corrected = true; this.settled = 0;
    }
    const drop = this.corrected && this.settled >= this.confirm;
    this.dropped = drop;
    if (!drop && x === world.x && angle === world.angle) return null;
    return { seq: ++this.seq, turn: world.turn, x, angle, drop };
  }
}
