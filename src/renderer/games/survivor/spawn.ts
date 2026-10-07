/**
 * How many enemies arrive, what kind they are, and where they come from.
 *
 * Everything is a pure function of (tick, seed), never of the current world,
 * so phase 3 can let each client grow its own identical swarm instead of
 * shipping two hundred positions over the wire every frame.
 *
 * The schedule follows the original's shape — a new type joins every minute or
 * two and the earlier ones keep coming — compressed to a third, since this run
 * is ten minutes rather than thirty.
 */

import { SPAWN_MARGIN, TICKS_PER_SECOND } from './arena.js';
import { ELITE, REAPER_KIND, baseKind, isElite } from './types.js';
import type { EnemyKind } from './types.js';

const SECOND = TICKS_PER_SECOND;

/** Minute index of a tick, as the difficulty curve counts it. */
const minuteOf = (tick: number): number => Math.floor(tick / (60 * SECOND));

/**
 * Ticks between spawns. Starts slow, tightens every minute, floors out at the cap.
 *
 * `players` matters because the swarm is shared: with four people chewing
 * through the same stream, each of them meets a quarter of it. Dividing the
 * gap keeps one person's screen as busy as it is in a solo run.
 */
export function spawnInterval(tick: number, players = 1): number {
  const solo = 13 * Math.pow(0.82, minuteOf(tick));
  return Math.max(4, Math.round(solo / Math.max(1, players)));
}

/**
 * How many arrive per spawn — one early, small knots later. Deliberately not
 * scaled by player count: the interval above already carries that, and doing
 * both multiplies the swarm instead of sharing it.
 */
export function spawnBatch(tick: number): number {
  return 1 + Math.floor(minuteOf(tick) / 2);
}

/** Waves grow with the room too, for the same reason. */
export function waveCount(base: number, players = 1): number {
  return Math.round(base * (1 + 0.5 * (Math.max(1, players) - 1)));
}

/**
 * Enemy health at a given time. The opening minute is deliberately one-shot
 * territory — the first weapon has to feel like it works before the swarm grows.
 *
 * The growth rate is the whole difficulty curve, and it compounds: at 1.45 a
 * minute-eight bat had thirteen times the health of a minute-one bat, which
 * read as a swarm that simply would not die. Measured against a bot that stays
 * in the swarm, 1.40 doubles how long a run lasts and 1.35 does no better — so
 * this takes the smaller cut and leaves the late minutes something to say.
 */
export function enemyHp(tick: number): number {
  return Math.round(10 * Math.pow(1.40, minuteOf(tick)));
}

/** Enemy speed creeps up, but stays under the player's so running away always works. */
export function enemySpeed(tick: number): number {
  return Math.min(1.75, 0.82 + 0.1 * minuteOf(tick));
}

/** Chargers are the exception: faster than the player, so standing still is punished. */
export function chargerSpeed(tick: number): number {
  return Math.min(2.9, 2.2 + 0.08 * minuteOf(tick));
}

/** A miniboss every two minutes; each one leaves a chest. */
export const MINIBOSS_EVERY_TICKS = 2 * 60 * SECOND;

/** Miniboss health — a wall compared to the swarm, but not a stalemate. */
export function bossHp(tick: number): number {
  return Math.round(enemyHp(tick) * 28);
}

/**
 * When each kind joins the roster. Nothing ever leaves it: the swarm grows by
 * mixing, which is what makes the late minutes feel different from the early
 * ones even though the bats never stop coming.
 */
export const JOINS_AT: { kind: EnemyKind; at: number; weight: number }[] = [
  { kind: 0, at: 0, weight: 10 },              // 박쥐 — the baseline
  { kind: 4, at: 40 * SECOND, weight: 5 },     // 좀비 — slow, tough, blocks a lane
  { kind: 5, at: 80 * SECOND, weight: 7 },     // 유령 — fast and frail, arrives in knots
  { kind: 6, at: 160 * SECOND, weight: 4 },    // 분열체 — splits when it dies
  { kind: 1, at: 240 * SECOND, weight: 4 }     // 돌진형 — faster than the player
];

/** Picks a kind for this spawn from everything unlocked so far. */
export function rollKind(tick: number, rng: () => number): EnemyKind {
  const open = JOINS_AT.filter((entry) => tick >= entry.at);
  const total = open.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng() * total;
  for (const entry of open) {
    roll -= entry.weight;
    if (roll <= 0) return entry.kind;
  }
  return 0;
}

/** Health and speed for one kind, on top of the curve for this moment. */
export function statsFor(kind: EnemyKind, tick: number): { hp: number; speed: number } {
  const hp = enemyHp(tick);
  const speed = enemySpeed(tick);
  const base = baseKind(kind);
  let out: { hp: number; speed: number };
  switch (base) {
    case 4: out = { hp: hp * 1.9, speed: speed * 0.55 }; break;    // 좀비
    case 5: out = { hp: hp * 0.6, speed: speed * 1.35 }; break;    // 유령
    case 6: out = { hp: hp * 1.4, speed: speed * 0.85 }; break;    // 분열체
    case 1: out = { hp: hp * 0.7, speed: chargerSpeed(tick) }; break;
    default: out = { hp, speed };
  }
  // An elite is the same creature, grown into a wall — and slowed, or a giant
  // charger would be unavoidable rather than hard.
  if (isElite(kind)) return { hp: out.hp * 28, speed: Math.min(out.speed, speed) * 0.75 };
  return out;
}

/** The elite that shows up at this moment, drawn from whatever has joined by now. */
export function eliteKind(tick: number, rng: () => number): EnemyKind {
  return rollKind(tick, rng) + ELITE;
}

export type WaveShape = 'ring' | 'line';

/**
 * Set pieces that interrupt the drip of ordinary spawns. A ring surrounds the
 * player and has to be broken out of; a line forces a direction choice.
 */
export const WAVES: { at: number; shape: WaveShape; count: number }[] = [
  { at: 200 * SECOND, shape: 'ring', count: 18 },
  { at: 300 * SECOND, shape: 'line', count: 20 },
  { at: 360 * SECOND, shape: 'ring', count: 26 },
  { at: 450 * SECOND, shape: 'line', count: 28 },
  { at: 520 * SECOND, shape: 'ring', count: 34 }
];

/** The wave starting exactly on this tick, if any. */
export function waveAt(tick: number): { shape: WaveShape; count: number } | null {
  return WAVES.find((w) => w.at === tick) ?? null;
}

/**
 * A spawn point on a ring just outside the camera: off screen, but close
 * enough that the walk in is short.
 */
export function spawnPoint(
  rng: () => number,
  camX: number,
  camY: number,
  halfW: number,
  halfH: number
): { x: number; y: number } {
  const angle = rng() * Math.PI * 2;
  const rx = halfW + SPAWN_MARGIN;
  const ry = halfH + SPAWN_MARGIN;
  return { x: camX + Math.cos(angle) * rx, y: camY + Math.sin(angle) * ry };
}

/** Evenly spaced points on a circle around a target — the surround wave. */
export function ringPoints(cx: number, cy: number, radius: number, count: number): { x: number; y: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count;
    return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
  });
}

/** A column marching in from one side — the charge wave. */
export function linePoints(
  rng: () => number,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  count: number
): { x: number; y: number }[] {
  const fromLeft = rng() < 0.5;
  const x = cx + (fromLeft ? -1 : 1) * (halfW + SPAWN_MARGIN);
  const top = cy - halfH * 0.8;
  const step = (halfH * 1.6) / Math.max(1, count - 1);
  return Array.from({ length: count }, (_, i) => ({ x, y: top + step * i }));
}

/**
 * Which enemy gives up its place when the reaper arrives at a full field.
 *
 * The oldest one is the obvious answer and the wrong one: elites live longest
 * precisely because they have the most health, so "oldest" is usually the one
 * carrying a chest. This takes the oldest ordinary enemy instead, and falls
 * back to the front only if the field is somehow nothing but minibosses.
 */
export function evictionIndex(kinds: readonly EnemyKind[]): number {
  const ordinary = kinds.findIndex((kind) => !isElite(kind) && kind !== REAPER_KIND);
  return ordinary >= 0 ? ordinary : 0;
}
