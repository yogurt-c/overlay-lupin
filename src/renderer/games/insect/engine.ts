import { GOLDEN_CHANCE, RARITY_WEIGHTS, SPECIES, SPECIES_BY_ID, validCatch } from '../../../shared/insect.js';
import type { Env, InsectCatch, Species } from '../../../shared/insect.js';
import { WIDTH, HEIGHT, CAMP, TREES, HABITATS, behaviorOf, habitatOf, clamp, movePoint } from './map.js';
export const SEATS = 4, WALK = 2, SNEAK = .75, REACH = 46, NET_AHEAD = 32, CATCH_TICKS = 42, SWING_TICKS = 24, MISS_STUN = 18, HIT_REACH = 24, HIT_STUN = 40;
export const EMOTE_TICKS = 120, SHOW_TICKS = 240;
export type Phase = 'free' | 'swing' | 'stun' | 'hit' | 'catch' | 'result';
export interface Collector {
  id: string; name: string; seat: number; x: number; y: number; angle: number; move: number; moveY: number; sneak: boolean; paused: boolean; strikeX: number; strikeY: number;
  phase: Phase; t: number; bug?: InsectCatch; emoji: number; emojiUntil: number; showUntil: number; shown?: InsectCatch;
  notice: string; noticeUntil: number; ack: number; lastInput: number; known: string[]; caught?: InsectCatch; caughtUntil: number;
  pingX: number; pingY: number; pingUntil: number; swingAt: number;
}
export interface PersonalBug { owner: string; alert: number; misses: number; dx: number; dy: number; until: number; caught: boolean; escaped: boolean }
export interface Bug {
  id: number; speciesId: string; sizeMm: number; golden: boolean; x: number; y: number; hx: number; hy: number;
  born: number; expires: number; seed: number; personal: PersonalBug[]; tutorial: boolean;
}
export interface InsectWorld { version: 3; tick: number; nextId: number; players: Collector[]; bugs: Bug[]; epoch: string }
export interface Command { seq: number; kind: 'swing' | 'saved' | 'emoji' | 'show' | 'ping'; at?: number; value?: number; catchId?: string; shown?: InsectCatch; x?: number; y?: number }
export function emptyWorld(): InsectWorld { return { version: 3, tick: 0, nextId: 1, players: [], bugs: [], epoch: crypto.randomUUID() }; }
export const envOf = (b: Bug): Env => SPECIES_BY_ID.get(b.speciesId)!.env;
export const personal = (b: Bug, id: string) => b.personal.find(s => s.owner === id);
export const bugPoint = (b: Bug, id: string) => { const s = personal(b, id); return { x: b.x + (s?.dx ?? 0), y: b.y + (s?.dy ?? 0) }; };
export const netPoint = (p: Pick<Collector, 'x' | 'y' | 'angle'>) => ({ x: p.x + Math.cos(p.angle) * NET_AHEAD, y: p.y + Math.sin(p.angle) * NET_AHEAD });
export function inReach(p: Collector, b: Bug): boolean {
  const s = personal(b, p.id); if (!s || s.caught || s.escaped) return false;
  const q = bugPoint(b, p.id), n = netPoint(p);
  return Math.hypot(q.x - n.x, q.y - n.y) <= REACH;
}
export function pickSpecies(env: Env, known: string[], rng: () => number): Species {
  let roll = rng() * 100, rarity = 0;
  for (; rarity < 3; rarity++) { roll -= RARITY_WEIGHTS[rarity]; if (roll < 0) break; }
  const pool = SPECIES.filter(s => s.env === env && s.rarity === rarity), weight = (s: Species) => known.includes(s.id) ? 1 : 2;
  let n = rng() * pool.reduce((a, s) => a + weight(s), 0);
  return pool.find(s => (n -= weight(s)) < 0) ?? pool[pool.length - 1];
}
const ease = (n: number) => { const t = clamp(n, 0, 1); return t * t * (3 - 2 * t); };
/**
 * Where a free bug is at `tick`, as a pure function of its spawn data so every client can
 * replay it between snapshots. `lift` is how high it hovers over its own ground shadow; it is
 * render-only, since the net always lands on the shadow.
 */
export function bugMotion(b: Bug, tick: number): { x: number; y: number; lift: number } {
  if (b.tutorial) return { x: b.hx, y: b.hy, lift: 0 };
  const behavior = behaviorOf(SPECIES_BY_ID.get(b.speciesId)!), t = (tick + b.seed) % 300;
  if (behavior === 'flower') {
    // Takes off, meanders around the patch with a little flutter, then settles back on its flower.
    const flying = t < 190, f = flying ? ease(t / 190) : 1, env = flying ? Math.min(1, t / 18, (190 - t) / 18) : 0;
    return { x: b.hx + Math.sin(f * Math.PI * 2) * 65 + Math.sin(t * .23 + b.seed) * 6 * env,
      y: b.hy + Math.sin(f * Math.PI * 4) * 28 + Math.sin(t * .31 + b.seed) * 4 * env, lift: env * (10 + Math.sin(t * .4) * 3) };
  }
  if (behavior === 'trunk') {
    // Sits still, then shuffles a short step along the bark.
    const phase = (Math.floor(t / 100) + ease((t % 100) / 30)) / 3 * Math.PI * 2;
    return { x: b.hx + Math.sin(phase * 2) * 1.5, y: b.hy + Math.sin(phase) * 8, lift: 0 };
  }
  if (behavior === 'patrol') {
    // A quick dart, then a long hover: the dragonfly rhythm.
    const k = Math.floor(t / 75), w = clamp((t % 75) / 18, 0, 1), phase = (k + 1 - (1 - w) ** 3) / 4 * Math.PI * 2, hover = 1 - w * (1 - w) * 4;
    return { x: b.hx + Math.sin(phase) * 100 + Math.sin(t * .5 + b.seed) * 1.2 * hover, y: b.hy + Math.cos(phase) * 28 + Math.cos(t * .37) * .8 * hover, lift: 18 + Math.sin(t * .13) * 2 };
  }
  // Ground bugs hop out and back; the arc is drawn as lift so the shadow stays on the ground.
  const out = clamp((t - 110) / 24, 0, 1), back = clamp((t - 240) / 24, 0, 1), a = b.seed * 2.4, d = out - back;
  return { x: b.hx + Math.cos(a) * 55 * d, y: b.hy + Math.sin(a) * 30 * d, lift: (Math.sin(out * Math.PI) + Math.sin(back * Math.PI)) * 16 };
}
function walk(p: Collector): void {
  if (p.paused || (p.phase !== 'free' && p.phase !== 'result')) return;
  const scale = (p.sneak ? SNEAK : WALK) / Math.max(1, Math.hypot(p.move, p.moveY));
  Object.assign(p, movePoint(p.x, p.y, p.move * scale, p.moveY * scale));
}
/** Recomputes every free bug's shared path point for the world's current tick. */
export function syncBugs(w: InsectWorld): void {
  for (const b of w.bugs) if (!b.tutorial) { const m = bugMotion(b, w.tick); b.x = m.x; b.y = m.y; }
}
/**
 * Member-side dead reckoning between host packets: replays only the deterministic parts of
 * step() (walking, timers counting down, bug paths) and never resolves a swing or changes a phase.
 */
export function predictStep(w: InsectWorld): void {
  w.tick++;
  for (const p of w.players) { if (p.phase !== 'free' && p.phase !== 'result' && p.t > 1) p.t--; walk(p); }
  syncBugs(w);
}
/** Host-authoritative state. Personal escape/catch flags never consume another collector's opportunity. */
export class InsectEngine {
  world = emptyWorld();
  private history: { tick: number; players: { id: string; x: number; y: number; angle: number }[]; bugs: { id: number; x: number; y: number }[] }[] = [];
  constructor(private rng = Math.random, private uid = () => crypto.randomUUID(), private now = () => new Date().toISOString()) {}
  ensure(id: string, name: string): Collector | undefined {
    let p = this.world.players.find(p => p.id === id);
    if (!p && this.world.players.length < SEATS) {
      const seat = [0, 1, 2, 3].find(n => !this.world.players.some(p => p.seat === n))!;
      p = { id, name: name.slice(0, 24), seat, x: CAMP.x + seat * 38, y: CAMP.y, angle: -Math.PI / 2, move: 0, moveY: 0, sneak: false, paused: false, strikeX: CAMP.x + seat * 38, strikeY: CAMP.y,
        phase: 'free', t: 0, emoji: -1, emojiUntil: 0, showUntil: 0, notice: '', noticeUntil: 0, ack: 0, lastInput: this.world.tick, known: [], caughtUntil: 0,
        pingX: 0, pingY: 0, pingUntil: 0, swingAt: 0 };
      this.world.players.push(p);
      // A newly joined collector has an immediate, stable practice opportunity near the shelter.
      this.spawnOne(SPECIES[0], p.x, p.y - NET_AHEAD - 12, true);
    }
    return p;
  }
  remove(id: string): void { this.world.players = this.world.players.filter(p => p.id !== id); }
  input(id: string, move: number, sneak: boolean, commands: Command[], moveY = 0, paused = false): void {
    const p = this.world.players.find(p => p.id === id); if (!p || !Number.isFinite(move) || !Number.isFinite(moveY)) return;
    p.move = clamp(move, -1, 1); p.moveY = clamp(moveY, -1, 1); p.sneak = !!sneak; p.paused = !!paused; p.lastInput = this.world.tick;
    if ((p.move || p.moveY) && (p.phase === 'free' || p.phase === 'result')) p.angle = Math.atan2(p.moveY, p.move);
    for (const c of commands.slice(0, 32)) {
      if (!c || !Number.isSafeInteger(c.seq) || c.seq !== p.ack + 1) continue;
      p.ack = c.seq;
      if (c.kind === 'swing' && !paused && p.phase === 'free') {
        p.phase = 'swing'; p.t = SWING_TICKS;
        p.swingAt = Number.isSafeInteger(c.at) ? clamp(c.at!, this.world.tick - 9, this.world.tick) : this.world.tick;
        const seen = this.history.find(h => h.tick === p.swingAt)?.players.find(q => q.id === p.id);
        p.strikeX = seen?.x ?? p.x; p.strikeY = seen?.y ?? p.y; if (seen) p.angle = seen.angle;
      }
      if (c.kind === 'saved' && p.phase === 'result' && p.bug && p.bug.id === c.catchId) { if (!p.known.includes(p.bug.speciesId)) p.known.push(p.bug.speciesId); p.phase = 'free'; p.bug = undefined; }
      if (c.kind === 'emoji' && Number.isInteger(c.value) && c.value! >= 0 && c.value! < 8 && this.world.tick >= p.emojiUntil) { p.emoji = c.value!; p.emojiUntil = this.world.tick + EMOTE_TICKS; }
      if (c.kind === 'show' && validCatch(c.shown) && this.world.tick >= p.showUntil) { p.shown = c.shown; p.showUntil = this.world.tick + SHOW_TICKS; }
      if (c.kind === 'ping' && Number.isFinite(c.x) && Number.isFinite(c.y) && this.world.tick >= p.pingUntil - 420) { p.pingX = clamp(c.x!, 0, WIDTH); p.pingY = clamp(c.y!, 0, HEIGHT); p.pingUntil = this.world.tick + 480; }
    }
  }
  private say(p: Collector, text: string) { p.notice = text; p.noticeUntil = this.world.tick + 150; }
  private swing(p: Collector): void {
    // Resolve the quick slam at the collector's captured position. A round landing
    // radius makes it forgiving; it never selects a species or insect automatically.
    const actor = { ...p, x: p.strikeX, y: p.strikeY };
    const n = netPoint(actor);
    const candidates = this.world.bugs.filter(b => inReach(actor, b))
      .sort((a, b) => { const qa=bugPoint(a,p.id),qb=bugPoint(b,p.id);return Math.hypot(qa.x-n.x,qa.y-n.y)-Math.hypot(qb.x-n.x,qb.y-n.y); });
    const bonked = this.bonk(p, n);
    const b = candidates[0];
    if (b) {
      personal(b, p.id)!.caught = true;
      p.bug = { id: `${this.world.epoch}_${b.id}_${p.seat}`, speciesId: b.speciesId, sizeMm: b.sizeMm, golden: b.golden, caughtAt: this.now(), favorite: false, released: false };
      p.phase = 'catch'; p.t = CATCH_TICKS; this.say(p, b.golden ? '금빛 발견!' : '잡았다!'); return;
    }
    p.phase = 'stun'; p.t = MISS_STUN; this.say(p, '조금 더 가까이 다가가 다시 Space');
    for (const bug of this.world.bugs) {
      const s = personal(bug, p.id), q = bugPoint(bug, p.id);
      if (!s || s.caught || s.escaped || Math.hypot(q.x - p.x, q.y - p.y) > 140 || bug.tutorial) continue;
      s.misses++; s.alert = 55; s.until = this.world.tick + 300;
      s.dx = clamp(q.x + Math.cos(p.angle) * 65, 40, WIDTH - 40) - bug.x;
      s.dy = clamp(q.y + Math.sin(p.angle) * 65, 60, HEIGHT - 40) - bug.y;
      if (s.misses >= 2) { s.escaped = true; this.say(p, '숲으로 숨었어요 · 다른 흔적을 찾아볼까요?'); }
      else this.say(p, '근처로 옮겨 갔어요 · 다시 다가가 보세요');
    }
    if (bonked) this.say(p, `앗, ${bonked.name.slice(0, 6)}을(를) 쳤어요!`);
  }
  /** A net that lands on another free collector bonks them: they freeze briefly, but nothing else is taken from them. */
  private bonk(p: Collector, n: { x: number; y: number }): Collector | undefined {
    let bonked: Collector | undefined;
    const seen = this.history.find(h => h.tick === p.swingAt)?.players;
    for (const q of this.world.players) {
      if (q === p || q.phase !== 'free') continue;
      const at = seen?.find(s => s.id === q.id) ?? q;
      if (Math.hypot(at.x - n.x, at.y - n.y) > HIT_REACH) continue;
      q.phase = 'hit'; q.t = HIT_STUN; q.move = q.moveY = 0;
      this.say(q, `${p.name.slice(0, 6)}의 잠자리채에 맞았어요!`); bonked ??= q;
    }
    return bonked;
  }
  step(): void {
    const w = this.world; w.tick++;
    for (const p of w.players) {
      if (w.tick - p.lastInput > 90) { p.move = p.moveY = 0; p.paused = true; }
      if (p.phase === 'swing' && --p.t <= 0) this.swing(p);
      else if ((p.phase === 'stun' || p.phase === 'hit') && --p.t <= 0) p.phase = 'free';
      else if (p.phase === 'catch' && --p.t <= 0) { p.phase = 'result'; p.caught = p.bug; p.caughtUntil = w.tick + 150; }
      walk(p);
    }
    for (const b of w.bugs) {
      if (!b.tutorial) { const m = bugMotion(b, w.tick); b.x = m.x; b.y = m.y; }
      for (const s of b.personal) {
        const p = w.players.find(p => p.id === s.owner); if (!p || p.paused || s.caught || s.escaped || b.tutorial) continue;
        const q = bugPoint(b, p.id), d = Math.hypot(q.x - p.x, q.y - p.y);
        if (s.until && w.tick > s.until) { s.dx *= .96; s.dy *= .96; }
        s.alert = clamp(s.alert + (d < 90 && (p.move || p.moveY) ? (p.sneak ? .10 : .65) : -.6), 0, 100);
        if (s.alert >= 100) { s.escaped = true; this.say(p, '놀라서 숨었어요 · 살금살금 다가가 보세요'); }
      }
    }
    w.bugs = w.bugs.filter(b => {
      const active = b.personal.filter(s => w.players.some(p => p.id === s.owner));
      const unfinished = active.some(s => !s.caught && !s.escaped);
      return unfinished && w.tick < b.expires;
    });
    const target = 14 + w.players.length * 4;
    if (w.players.length && w.bugs.length < target && w.tick % 6 === 0) {
      const envs: Env[] = ['air', 'tree', 'ground'], s = pickSpecies(envs[Math.floor(this.rng() * 3)], [...new Set(w.players.flatMap(p => p.known))], this.rng);
      const h = HABITATS[habitatOf(s)];
      const tree = TREES[Math.floor(this.rng() * 5)];
      const x = s.env === 'tree' ? tree.x + 34 : h.x + (this.rng() - .5) * 480;
      const y = s.env === 'tree' ? tree.y + 12 : h.y + (this.rng() - .5) * 420;
      this.spawnOne(s, x, y);
    }
    this.history.push({ tick: w.tick, players: w.players.map(({ id, x, y, angle }) => ({ id, x, y, angle })), bugs: w.bugs.map(({ id, x, y }) => ({ id, x, y })) });
    if (this.history.length > 20) this.history.shift();
  }
  private spawnOne(s: Species, x: number, y: number, tutorial = false): void {
    const w = this.world;
    if (w.bugs.length >= 34) return;
    w.bugs.push({ id: w.nextId++, speciesId: s.id, sizeMm: Math.round(s.minMm + (s.maxMm - s.minMm) * (this.rng() + this.rng() + this.rng()) / 3), golden: !tutorial && this.rng() < GOLDEN_CHANCE,
      x, y, hx: x, hy: y, born: w.tick, expires: w.tick + (tutorial ? 9000 : 5400 + Math.floor(this.rng() * 3600)), seed: Math.floor(this.rng() * 300), tutorial,
      personal: w.players.map(p => ({ owner: p.id, alert: 0, misses: 0, dx: 0, dy: 0, until: 0, caught: false, escaped: false })) });
  }
  snapshot(): InsectWorld { return structuredClone(this.world); }
}
