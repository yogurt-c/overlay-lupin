import { GOLDEN_CHANCE, RARITY_WEIGHTS, SPECIES, SPECIES_BY_ID } from '../../../shared/insect.js';
import type { Env, InsectCatch, Species } from '../../../shared/insect.js';
/** Field positions are 0..1 across the walkway; heights are scene pixels on the 320×280 canvas. */
export const SEATS = 4, SEAT_X = [.15, .38, .62, .85];
/** Far-apart spots fill first: 0.15 → 0.62 → 0.38 → 0.85. */
export const SEAT_ORDER = [0, 2, 1, 3];
export const TREES = [.3, .7];
export const GROUND_Y = 176, AIR_TOP = 80, AIR_BOTTOM = 134, TRUNK_TOP = 122, TRUNK_BOTTOM = 166;
export const WALK = .18 / 60, SNEAK = .07 / 60, EDGE = .06, MIN_X = .03, MAX_X = .97;
/** Net hoop sits this far ahead of the body; a bug within REACH of the hoop shows the dashed ring. */
export const NET_AHEAD = .045, REACH = .05, ALERT_RADIUS = .12;
export const ALERT_WALK = 60 / 60, ALERT_SNEAK = 12 / 60, ALERT_DECAY = 20 / 60, ALERT_MISS = 50;
/** Rarer insects get nervous faster and give a shorter catch window. */
export const RARITY_ALERT = [.8, 1, 1.25, 1.5];
export const RING_TICKS = 72, WINDOW_TICKS = [.34, .28, .22, .16].map(s => s * 60);
export const SWING_TICKS = 14, MISS_STUN = 36, EMPTY_STUN = 18, CATCH_TICKS = 48, ENTER_TICKS = 36, FLEE_TICKS = 42, PAUSE_TICKS = 30;
export const RESPAWN_MIN = 300, RESPAWN_EXTRA = 420, FIRST_SPAWN_MIN = 30, FIRST_SPAWN_EXTRA = 90;
export const GLINT_MIN = 480, GLINT_EXTRA = 420, GLINT_TICKS = 12;
export const EMOTE_TICKS = 120, EMOTE_COUNT = 8, SHOW_TICKS = 300, NOTICE_TICKS = 120, CAUGHT_TICKS = 150;
/** A swing may be judged at the tick the swinger saw, at most this old, so LAN lag never eats a well-timed press. */
export const SWING_LATENCY = 20;
const MAX_BUGS = 6, MAX_PER_ENV = 3, RECENT_TICKS = 30, SPAWN_CLEAR = .07;
export type Phase = 'free' | 'stun' | 'catch' | 'result';
export interface Collector {
  id: string; name: string; seat: number; x: number; facing: 1 | -1; move: -1 | 0 | 1; sneak: boolean; walking: boolean;
  phase: Phase; t: number; since: number; env: Env; bug?: InsectCatch; emoji: number; emojiUntil: number; showUntil: number; shown?: InsectCatch;
  notice: string; noticeUntil: number; ack: number; known: string[]; lastInput: number;
  /** The latest catch, shown in a bubble over the head for everyone for CAUGHT_TICKS. */
  caught?: InsectCatch; caughtUntil: number;
}
export type BugState = 'enter' | 'live' | 'flee';
export interface Bug {
  id: number; speciesId: string; golden: boolean; sizeMm: number; x: number; y: number; hx: number; hy: number; dir: 1 | -1;
  timer: number; state: BugState; t: number; alert: number; seed: number; glintAt: number; pauseUntil: number; reached: boolean;
}
export interface InsectWorld { tick: number; players: Collector[]; bugs: Bug[]; nextId: number; respawns: number[]; recent: { x: number; tick: number }[] }
export interface Command { seq: number; kind: 'swing' | 'saved' | 'emoji' | 'show'; bug?: number; at?: number; value?: number; catchId?: string; shown?: InsectCatch }
export function emptyWorld(): InsectWorld { return { tick: 0, players: [], bugs: [], nextId: 1, respawns: [], recent: [] }; }
export const envOf = (b: Bug): Env => SPECIES_BY_ID.get(b.speciesId)!.env;
export const netX = (p: Collector): number => p.x + p.facing * NET_AHEAD;
/** Where the dashed ring is in its shrink cycle at `tick`: 0 is widest, RING_TICKS/2 hugs the insect. */
export const ringPhase = (b: Bug, tick: number): number => (tick + b.seed) % RING_TICKS;
export function inWindow(b: Bug, tick: number): boolean {
  return Math.abs(ringPhase(b, tick) - RING_TICKS / 2) <= WINDOW_TICKS[SPECIES_BY_ID.get(b.speciesId)!.rarity] / 2;
}
export const catchable = (b: Bug): boolean => b.state === 'live';
export function inReach(p: Collector, b: Bug, slack = 1): boolean { return catchable(b) && Math.abs(b.x - netX(p)) <= REACH * slack; }
export const glinting = (b: Bug, tick: number): boolean => b.golden && b.state === 'live' && tick >= b.glintAt && tick < b.glintAt + GLINT_TICKS;
/** Rarity first, then a species of that rarity in the habitat; species nobody here has caught yet are twice as likely. */
export function pickSpecies(env: Env, known: string[], rng: () => number): Species {
  const pool = SPECIES.filter(s => s.env === env);
  let roll = rng() * RARITY_WEIGHTS.reduce((a, b) => a + b, 0), rarity = 0;
  for (; rarity < RARITY_WEIGHTS.length - 1; rarity++) { roll -= RARITY_WEIGHTS[rarity]; if (roll < 0) break; }
  const tier = pool.filter(s => s.rarity === rarity), weight = (s: Species) => known.includes(s.id) ? 1 : 2;
  let speciesRoll = rng() * tier.reduce((n, s) => n + weight(s), 0);
  return tier.find(s => (speciesRoll -= weight(s)) < 0) ?? tier[tier.length - 1];
}
export class InsectEngine {
  world = emptyWorld();
  constructor(private rng = Math.random, private uid = () => crypto.randomUUID(), private now = () => new Date().toISOString()) {}
  ensure(id: string, name: string): Collector | undefined {
    let p = this.world.players.find(p => p.id === id);
    if (!p && this.world.players.length < SEATS) {
      const seat = SEAT_ORDER.find(n => !this.world.players.some(p => p.seat === n))!;
      p = { id, name: name.slice(0, 24), seat, x: SEAT_X[seat], facing: seat < 2 ? 1 : -1, move: 0, sneak: false, walking: false, phase: 'free', t: 0, since: 0, env: 'air',
        emoji: -1, emojiUntil: 0, showUntil: 0, notice: '', noticeUntil: 0, ack: 0, known: [], lastInput: this.world.tick, caughtUntil: 0 };
      this.world.players.push(p);
    }
    return p;
  }
  remove(id: string): void { this.world.players = this.world.players.filter(p => p.id !== id); }
  input(id: string, move: number, sneak: boolean, commands: Command[]): void {
    const p = this.world.players.find(p => p.id === id); if (!p) return;
    p.move = move < 0 ? -1 : move > 0 ? 1 : 0; p.sneak = !!sneak; p.lastInput = this.world.tick;
    for (const cmd of commands.slice(0, 32)) {
      if (!cmd || !Number.isInteger(cmd.seq) || cmd.seq !== p.ack + 1) continue;
      p.ack = cmd.seq;
      if (cmd.kind === 'swing') this.swing(p, cmd);
      if (cmd.kind === 'emoji' && this.world.tick >= p.emojiUntil && Number.isInteger(cmd.value) && cmd.value! >= 0 && cmd.value! < EMOTE_COUNT) { p.emoji = cmd.value!; p.emojiUntil = this.world.tick + EMOTE_TICKS; }
      if (cmd.kind === 'show' && cmd.shown && this.world.tick >= p.showUntil) { p.shown = cmd.shown; p.showUntil = this.world.tick + SHOW_TICKS; }
      if (cmd.kind === 'saved' && p.phase === 'result' && cmd.catchId === p.bug?.id) {
        if (!p.known.includes(p.bug!.speciesId)) p.known.push(p.bug!.speciesId);
        p.phase = 'free'; p.bug = undefined;
      }
    }
  }
  private say(p: Collector, text: string): void { p.notice = text; p.noticeUntil = this.world.tick + NOTICE_TICKS; }
  /** Judged against the ring as the swinger saw it; the first success the host receives takes the insect. */
  private swing(p: Collector, cmd: Command): void {
    if (p.phase !== 'free') return;
    p.since = this.world.tick;
    const w = this.world, at = Number.isInteger(cmd.at) ? Math.max(w.tick - SWING_LATENCY, Math.min(w.tick, cmd.at!)) : w.tick;
    const near = w.bugs.filter(b => inReach(p, b, 1.3)).sort((a, b) => Math.abs(a.x - netX(p)) - Math.abs(b.x - netX(p)));
    const target = near.find(b => b.id === cmd.bug) ?? near[0];
    if (!target) {
      p.phase = 'stun'; p.t = EMPTY_STUN; p.env = 'air';
      if (w.recent.some(r => w.tick - r.tick <= RECENT_TICKS && Math.abs(r.x - netX(p)) <= REACH * 1.5)) this.say(p, '다른 사람이 먼저 잡았어요');
      return;
    }
    p.env = envOf(target);
    if (!inWindow(target, at)) { p.phase = 'stun'; p.t = MISS_STUN; target.alert = Math.min(100, target.alert + ALERT_MISS); this.say(p, '헛스윙!'); return; }
    w.bugs = w.bugs.filter(b => b !== target); w.recent.push({ x: target.x, tick: w.tick });
    w.respawns.push(w.tick + RESPAWN_MIN + Math.floor(this.rng() * RESPAWN_EXTRA));
    p.bug = { id: this.uid(), speciesId: target.speciesId, sizeMm: target.sizeMm, golden: target.golden, caughtAt: this.now(), favorite: false, released: false };
    p.phase = 'catch'; p.t = CATCH_TICKS; p.facing = target.x >= p.x ? 1 : -1;
  }
  step(): void {
    const w = this.world; w.tick++;
    w.recent = w.recent.filter(r => w.tick - r.tick <= RECENT_TICKS);
    for (const p of w.players) {
      if (w.tick - p.lastInput > 90) { p.move = 0; p.sneak = false; }
      if (p.phase === 'stun' && --p.t <= 0) p.phase = 'free';
      if (p.phase === 'catch' && --p.t <= 0) { p.phase = 'result'; p.caught = p.bug; p.caughtUntil = w.tick + CAUGHT_TICKS; this.say(p, ''); }
      const free = p.phase === 'free' || p.phase === 'result';
      p.walking = free && p.move !== 0;
      if (p.walking) { p.facing = p.move as 1 | -1; p.x = Math.max(MIN_X, Math.min(MAX_X, p.x + p.move * (p.sneak ? SNEAK : WALK))); }
    }
    for (const b of w.bugs) this.stepBug(b);
    w.bugs = w.bugs.filter(b => !(b.state === 'flee' && b.t >= FLEE_TICKS));
    this.spawn();
  }
  private stepBug(b: Bug): void {
    const w = this.world, s = SPECIES_BY_ID.get(b.speciesId)!;
    b.t++;
    if (b.state === 'enter') { if (b.t >= ENTER_TICKS) { b.state = 'live'; b.t = 0; } return; }
    if (b.state === 'flee') { this.fleeStep(b, s); return; }
    // Everyone walking near it counts; sneaking costs a fifth as much.
    let rise = 0;
    for (const p of w.players) if (p.walking && Math.abs(p.x - b.x) <= ALERT_RADIUS) rise += p.sneak ? ALERT_SNEAK : ALERT_WALK;
    b.alert = Math.max(0, Math.min(100, rise ? b.alert + rise * RARITY_ALERT[s.rarity] : b.alert - ALERT_DECAY));
    if (b.alert >= 100) {
      b.state = 'flee'; b.t = 0; b.dir = (w.players.reduce((n, p) => n + Math.sign(b.x - p.x), 0) >= 0 ? 1 : -1);
      w.respawns.push(w.tick + RESPAWN_MIN + Math.floor(this.rng() * RESPAWN_EXTRA));
      for (const p of w.players) if (Math.abs(p.x - b.x) <= ALERT_RADIUS) this.say(p, '놓쳤어요');
      return;
    }
    if (b.golden && w.tick >= b.glintAt + GLINT_TICKS) b.glintAt = w.tick + GLINT_MIN + Math.floor(this.rng() * GLINT_EXTRA);
    // Perched insects freeze for a beat when a net first comes in reach; flyers keep flying.
    const reached = w.players.some(p => p.phase === 'free' && inReach(p, b));
    if (reached && !b.reached && s.env !== 'air') b.pauseUntil = w.tick + PAUSE_TICKS;
    b.reached = reached;
    if (b.alert >= 50 || w.tick < b.pauseUntil) return;
    this.wander(b, s);
  }
  private turn(b: Bug, lo = EDGE, hi = 1 - EDGE): void { if (b.x < lo) { b.x = lo; b.dir = 1; } if (b.x > hi) { b.x = hi; b.dir = -1; } }
  /** Each habit is a small timer-driven gait; the art reads the same fields to pose the insect. */
  private wander(b: Bug, s: Species): void {
    const r = this.rng, k = b.t;
    b.timer--;
    switch (s.move) {
      case 'flutter': b.x += b.dir * .0007; b.y = b.hy + Math.sin(k * .13 + b.seed) * 9; if (b.timer <= 0) { b.timer = 90 + r() * 160; if (r() < .4) b.dir = -b.dir as 1 | -1; } break;
      case 'hover': if (b.timer <= 0) { b.timer = 50 + r() * 80; b.dir = r() < .5 ? 1 : -1; b.hy = AIR_TOP + 8 + r() * (AIR_BOTTOM - AIR_TOP - 16); } if (b.timer < 12) { b.x += b.dir * .006; b.y += (b.hy - b.y) * .2; } break;
      case 'skim': b.y = 146 + Math.sin(k * .2) * 3; if (b.timer <= 0) { b.timer = 70 + r() * 90; if (r() < .5) b.dir = -b.dir as 1 | -1; } if (b.timer > 40) b.x += b.dir * .0025; else b.y = 152; break;
      case 'glide': b.x += b.dir * .0012; b.y = b.hy + Math.sin(k * .03 + b.seed) * 16; if (b.timer <= 0) { b.timer = 200 + r() * 200; if (r() < .5) b.dir = -b.dir as 1 | -1; } break;
      case 'drift': b.x += b.dir * .0004; b.y = b.hy + Math.sin(k * .05 + b.seed) * 5; if (b.timer <= 0) { b.timer = 160 + r() * 200; if (r() < .5) b.dir = -b.dir as 1 | -1; } break;
      case 'circle': b.x = b.hx + Math.cos(k * .045 + b.seed) * .06; b.y = b.hy + Math.sin(k * .045 + b.seed) * 14; if (b.timer <= 0) { b.timer = 240 + r() * 200; b.hx = Math.max(EDGE + .06, Math.min(1 - EDGE - .06, b.hx + (r() - .5) * .2)); } break;
      case 'patrol': b.x += b.dir * .0042; b.y = b.hy + Math.sin(k * .08) * 4; if (Math.abs(b.x - b.hx) > .15) b.dir = (b.x > b.hx ? -1 : 1); break;
      case 'perch': if (b.timer <= 0) { b.timer = 80 + r() * 120; b.dir = r() < .5 ? 1 : -1; } if (b.timer > 50) b.y += (GROUND_Y - 22 - b.y) * .1; else { b.x += b.dir * .0016; b.y = b.hy + Math.sin(k * .2) * 6; } break;
      case 'crawl': b.y += b.dir * .12; if (b.y < TRUNK_TOP) { b.y = TRUNK_TOP; b.dir = 1; } if (b.y > TRUNK_BOTTOM) { b.y = TRUNK_BOTTOM; b.dir = -1; } if (b.timer <= 0) { b.timer = 120 + r() * 200; if (r() < .3) b.dir = -b.dir as 1 | -1; } return;
      case 'hop': if (b.timer <= 0) { b.timer = 70 + r() * 70; if (r() < .35) b.dir = -b.dir as 1 | -1; } if (b.timer < 14) b.x += b.dir * .0022; break;
      case 'walk': if (b.timer <= 0) { b.timer = 90 + r() * 140; if (r() < .4) b.dir = -b.dir as 1 | -1; } if (b.timer > 50) b.x += b.dir * .0005; break;
      case 'dash': if (b.timer <= 0) { b.timer = 40 + r() * 60; if (r() < .45) b.dir = -b.dir as 1 | -1; } if (b.timer < 10) b.x += b.dir * .005; break;
      case 'roll': b.x += b.dir * .0003; if (b.timer <= 0) { b.timer = 200 + r() * 200; if (r() < .4) b.dir = -b.dir as 1 | -1; } break;
      default: if (b.timer <= 0) b.timer = 120 + r() * 120; return; // sing, still, dig, nod stay put
    }
    if (s.env === 'tree') return;
    this.turn(b);
    if (s.env === 'air') b.y = Math.max(AIR_TOP, Math.min(GROUND_Y - 18, b.y));
  }
  private fleeStep(b: Bug, s: Species): void {
    const f = b.t / FLEE_TICKS;
    switch (s.flee) {
      case 'up': b.y -= 2.4; b.x += b.dir * .002 + Math.sin(b.t * .6) * .002; break;
      case 'dart': b.x += b.dir * .014; b.y -= .6; break;
      case 'zigzag': b.x += b.dir * .012; b.y += Math.floor(b.t / 5) % 2 ? -3 : 2; break;
      case 'buzz': b.y -= 1.6 + f * 2; b.x += b.dir * .007; break;
      case 'fly': b.y -= 1.2 + f * 2.2; b.x += b.dir * .005; break;
      case 'hide': if (s.env === 'tree') b.y -= 1.4; else b.x += b.dir * .004; break;
      case 'hop': b.x += b.dir * .009; b.y = GROUND_Y - Math.sin(Math.min(1, f * 1.6) * Math.PI) * 40 - (f > .62 ? (f - .62) * 120 : 0); break;
      case 'dig': break;
      case 'run': b.x += b.dir * .011; break;
    }
  }
  private spawnSpot(env: Env): { x: number; y: number } | undefined {
    const w = this.world, r = this.rng;
    // Prefer spots outside everyone's alert radius; four spread-out players cover the whole walkway, so then settle for out of reach.
    for (let i = 0; i < 24; i++) {
      let x: number, y: number;
      const clear = i < 12 ? ALERT_RADIUS : SPAWN_CLEAR;
      if (env === 'tree') {
        const tree = TREES[Math.floor(r() * TREES.length)]; x = tree + (r() - .5) * .016; y = TRUNK_TOP + r() * (TRUNK_BOTTOM - TRUNK_TOP);
        if (w.bugs.some(b => envOf(b) === 'tree' && Math.abs(b.x - x) < .03 && Math.abs(b.y - y) < 16)) continue;
      } else {
        x = EDGE + r() * (1 - EDGE * 2); y = env === 'air' ? AIR_TOP + r() * (AIR_BOTTOM - AIR_TOP) : GROUND_Y;
        if (w.bugs.some(b => envOf(b) === env && Math.abs(b.x - x) < .06)) continue;
      }
      if (w.players.some(p => Math.abs(p.x - x) <= clear)) continue;
      return { x, y };
    }
    return undefined;
  }
  private spawn(): void {
    const w = this.world, target = Math.min(MAX_BUGS, w.players.length + 2), alive = w.bugs.filter(b => b.state !== 'flee');
    // Joining players fill the field fast; a caught or startled insect is replaced after 5–12 s.
    for (let n = alive.length + w.respawns.length; n < target; n++) w.respawns.push(w.tick + FIRST_SPAWN_MIN + Math.floor(this.rng() * FIRST_SPAWN_EXTRA));
    const due = w.respawns.filter(t => t <= w.tick);
    if (!due.length) return;
    w.respawns = w.respawns.filter(t => t > w.tick);
    for (let i = 0; i < due.length; i++) {
      if (w.bugs.filter(b => b.state !== 'flee').length >= target) continue;
      const counts = (env: Env) => w.bugs.filter(b => b.state !== 'flee' && envOf(b) === env).length;
      const envs = (['air', 'tree', 'ground'] as Env[]).filter(e => counts(e) < MAX_PER_ENV);
      const fewest = Math.min(...envs.map(counts)), choices = envs.filter(e => counts(e) === fewest);
      const env = choices[Math.floor(this.rng() * choices.length)], spot = env && this.spawnSpot(env);
      if (!spot) { w.respawns.push(w.tick + 60); continue; }
      const known = [...new Set(w.players.flatMap(p => p.known))], s = pickSpecies(env, known, this.rng);
      const ratio = (this.rng() + this.rng() + this.rng()) / 3, golden = this.rng() < GOLDEN_CHANCE;
      w.bugs.push({ id: w.nextId++, speciesId: s.id, golden, sizeMm: Math.round(s.minMm + ratio * (s.maxMm - s.minMm)), x: spot.x, y: spot.y, hx: spot.x, hy: spot.y,
        dir: this.rng() < .5 ? 1 : -1, timer: 30 + Math.floor(this.rng() * 90), state: 'enter', t: 0, alert: 0, seed: Math.floor(this.rng() * RING_TICKS),
        glintAt: w.tick + ENTER_TICKS + Math.floor(this.rng() * GLINT_MIN), pauseUntil: 0, reached: false });
    }
  }
  snapshot(): InsectWorld { return structuredClone(this.world); }
}
