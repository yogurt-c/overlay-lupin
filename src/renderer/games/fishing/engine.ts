import { SPECIES, SPECIES_BY_ID } from '../../../shared/fishing.js';
import type { FishCatch, Species } from '../../../shared/fishing.js';
export const WIDTHS = [.36,.31,.26,.22,.19,.17];
export const LIMITS = [12,14,16,18,20,22];
const GAIN = [22,20,18,16,14,13], LOSS = [10,12,14,16,18,19];
export const CAST_SECONDS = 1.0;
export const EMOTE_TICKS = 120;
export type Phase = 'casting' | 'idle' | 'waiting' | 'bite' | 'fight' | 'result';
export interface Fisher {
  id: string; name: string; seat: number; phase: Phase; time: number; pos: number; target: number; progress: number;
  fish?: FishCatch; seed: number; emoji: number; emojiUntil: number; showUntil: number; shown?: FishCatch;
  notice: string; ack: number; known: string[]; held: boolean; lastInput: number; attempts: number;
}
export interface FishingWorld { tick: number; players: Fisher[] }
export interface Command { seq: number; kind: 'cast' | 'cancel' | 'saved' | 'emoji' | 'show'; value?: number; fish?: FishCatch; catchId?: string }
export function emptyWorld(): FishingWorld { return { tick: 0, players: [] }; }
export function fishTarget(species: Species, seed: number, time: number, sizeMm: number): number {
  const speed = (.52 + species.rarity * .17) * (1 + .1 * (sizeMm - species.minMm) / (species.maxMm - species.minMm));
  const t = time * speed + seed % 97;
  const wave = Math.sin(t);
  switch (species.pattern) {
    case 1: return .5 + .35 * Math.tanh(wave * 2.3);
    case 2: return .5 + .28 * wave + .09 * Math.sin(t * 3);
    case 3: return .5 + .36 * Math.sin(t + .4 * Math.sin(t * .5));
    case 4: return .5 + .29 * wave + .09 * Math.sin(t * 2.2);
    default: return .5 + .36 * wave;
  }
}
export function pickSpecies(known: string[], rng: () => number): Species {
  const candidates = SPECIES;
  const weights = [50,28,14,6,1.7,.3];
  const available = weights.map((w, r) => candidates.some(s => s.rarity === r) ? w : 0);
  let roll = rng() * available.reduce((a,b) => a+b,0), rarity = 0;
  for (; rarity < 5; rarity++) { roll -= available[rarity]; if (roll < 0) break; }
  const pool = candidates.filter(s => s.rarity === rarity);
  let speciesRoll = rng() * pool.reduce((n,s) => n + (known.includes(s.id) ? 1 : 2), 0);
  return pool.find(s => (speciesRoll -= known.includes(s.id) ? 1 : 2) < 0) ?? pool[pool.length - 1];
}
export class FishingEngine {
  world = emptyWorld();
  constructor(private rng = Math.random, private uid = () => crypto.randomUUID(), private now = () => new Date().toISOString()) {}
  ensure(id: string, name: string): Fisher | undefined {
    let p = this.world.players.find(p => p.id === id);
    if (!p && this.world.players.length < 6) {
      const seat = [0,1,2,3,4,5].find(n => !this.world.players.some(p => p.seat === n))!;
      p = { id, name: name.slice(0,24), seat, phase: 'idle', time: 0, pos: .5, target: .5, progress: 25, seed: 1,
        emoji: -1, emojiUntil: 0, showUntil: 0, notice: '', ack: 0, known: [], held: false, lastInput: this.world.tick, attempts: 0 };
      this.world.players.push(p);
    }
    return p;
  }
  remove(id: string): void { this.world.players = this.world.players.filter(p => p.id !== id); }
  input(id: string, held: boolean, commands: Command[]): void {
    const p = this.world.players.find(p => p.id === id); if (!p) return;
    p.held = held; p.lastInput = this.world.tick;
    for (const cmd of commands.slice(0,32)) {
      if (!cmd || !Number.isInteger(cmd.seq) || cmd.seq !== p.ack + 1) continue;
      p.ack = cmd.seq;
      if (cmd.kind === 'cancel' && p.phase !== 'result') { p.phase = 'idle'; p.fish = undefined; p.notice = '쉬는 중'; }
      if (cmd.kind === 'emoji' && this.world.tick >= p.emojiUntil && Number.isInteger(cmd.value) && cmd.value! >= 0 && cmd.value! < 6) { p.emoji = cmd.value!; p.emojiUntil = this.world.tick + EMOTE_TICKS; }
      if (cmd.kind === 'show' && cmd.fish && this.world.tick >= p.showUntil) { p.shown = cmd.fish; p.showUntil = this.world.tick + 300; }
      if (cmd.kind === 'saved' && p.phase === 'result' && cmd.catchId === p.fish?.id) {
        if (!p.known.includes(p.fish!.speciesId)) p.known.push(p.fish!.speciesId);
        p.phase = 'idle'; p.fish = undefined; p.notice = '';
      }
      if (cmd.kind === 'cast') {
        if (p.phase === 'idle') {
          const s = pickSpecies(p.known, this.rng);
          const ratio = (this.rng() + this.rng() + this.rng()) / 3;
          p.fish = { id: this.uid(), speciesId: s.id, sizeMm: Math.round(s.minMm + ratio * (s.maxMm-s.minMm)), caughtAt: this.now(), favorite: false, released: false };
          p.phase = 'casting'; p.time = 0; p.seed = Math.floor(this.rng()*100000);
          p.notice = '';
        } else if (p.phase === 'bite') { p.phase = 'fight'; p.time = 0; p.progress = 25; p.pos = .5; p.attempts++; }
      }
    }
  }
  step(): void {
    this.world.tick++;
    for (const p of this.world.players) {
      if (this.world.tick - p.lastInput > 90 && ['casting','waiting','bite','fight'].includes(p.phase)) {
        p.phase = 'idle'; p.fish = undefined; p.held = false; p.notice = '입력이 멈춰 쉬는 중';
      }
      if (p.phase === 'casting') {
        p.time += 1/60;
        if (p.time >= CAST_SECONDS) { p.phase = 'waiting'; p.time = 3 + this.rng()*5; }
      } else if (p.phase === 'waiting' || p.phase === 'bite') {
        p.time -= 1/60;
        if (p.time <= 0) {
          if (p.phase === 'waiting') { p.phase = 'bite'; p.time = p.attempts < 3 ? 4 : 2; }
          else { p.phase = 'idle'; p.fish = undefined; p.notice = '입질을 놓쳤어요. 다시 던져 보세요'; }
        }
      } else if (p.phase === 'fight' && p.fish) {
        const s = SPECIES_BY_ID.get(p.fish.speciesId)!;
        p.time += 1/60;
        p.pos = Math.max(WIDTHS[s.rarity]/2, Math.min(1-WIDTHS[s.rarity]/2, p.pos + (p.held ? 1 : -1)*.58/60));
        p.target = fishTarget(s,p.seed,p.time,p.fish.sizeMm);
        const inside = Math.abs(p.target-p.pos) <= WIDTHS[s.rarity]/2;
        p.progress = Math.max(0, Math.min(100, p.progress + (inside ? GAIN[s.rarity] : p.time < 1 ? 0 : -LOSS[s.rarity])/60));
        if (p.progress >= 100) { p.phase = 'result'; p.fish.caughtAt = this.now(); p.notice = '포획! 저장 중…'; }
        else if (p.progress <= 0 || p.time >= LIMITS[s.rarity]) { p.phase = 'idle'; p.fish = undefined; p.notice = '물고기가 달아났어요'; }
      }
    }
  }
  snapshot(): FishingWorld { return structuredClone(this.world); }
}
