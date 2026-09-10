/**
 * The destructible terrain: a heightmap with one surface sample per column.
 *
 * A heightmap can't express caves or overhangs, but it buys three things this
 * game needs more: collision is an array lookup, the whole map is reproducible
 * from a single seed, and craters are a handful of numbers instead of a
 * bitmap. Fortress works the same way — its ground only ever erodes from
 * above — so nothing about the genre is lost.
 *
 * Terrain values are immutable: carving returns a new Terrain rather than
 * editing one in place, which keeps a snapshot safe to hold onto and makes the
 * host's crater log easy to replay.
 */

import { BEDROCK_Y, COLUMN_COUNT, COLUMN_W, SKY_MARGIN, WORLD_WIDTH } from './arena.js';

export interface Terrain {
  /** Everything below is derivable from this alone, before any craters. */
  readonly seed: number;
  /** Surface `y` per column, index `i` sampling world x = i * COLUMN_W. */
  readonly heights: Float64Array;
}

/**
 * Same xorshift family the sketch renderer uses. The point is reproducibility:
 * every client must grow byte-identical terrain from the seed the host sends,
 * so `Math.random()` is not an option anywhere in this file.
 */
export function createRng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

/** A fresh seed for a new match. Only ever called by the host. */
export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0 || 1;
}

/** Three octaves of rolling ground, before any features are cut into it. */
function layRidgeline(heights: Float64Array, rng: () => number): void {
  const mid = (SKY_MARGIN + BEDROCK_Y) / 2;
  const waves = [
    { cycles: 1.0, amp: 62, phase: rng() * Math.PI * 2 },
    { cycles: 2.7, amp: 26, phase: rng() * Math.PI * 2 },
    { cycles: 6.1, amp: 11, phase: rng() * Math.PI * 2 }
  ];

  for (let i = 0; i < COLUMN_COUNT; i++) {
    const u = i / COLUMN_COUNT;
    let y = mid;
    for (const w of waves) y += Math.sin(u * Math.PI * 2 * w.cycles + w.phase) * w.amp;
    heights[i] = y;
  }
}

/**
 * Flat-topped blocks with sheer sides. The vertical edges are the point: they
 * exceed MAX_CLIMB, so they read as cliffs a worm has to shoot its way past
 * rather than walk around.
 */
function cutMesas(heights: Float64Array, rng: () => number): void {
  const count = 2 + Math.floor(rng() * 2);
  for (let n = 0; n < count; n++) {
    const width = 12 + Math.floor(rng() * 20);
    const start = Math.floor(rng() * (COLUMN_COUNT - width));
    const lift = 26 + rng() * 32;
    for (let i = start; i < start + width; i++) heights[i] -= lift;
  }
}

/** Rounded high ground — cover you can hide behind without it being a wall. */
function raisePeaks(heights: Float64Array, rng: () => number): void {
  const count = 1 + Math.floor(rng() * 2);
  for (let n = 0; n < count; n++) {
    const centre = rng() * COLUMN_COUNT;
    const spread = 8 + rng() * 10;
    const height = 30 + rng() * 25;
    for (let i = 0; i < COLUMN_COUNT; i++) {
      const d = (i - centre) / spread;
      heights[i] -= height * Math.exp(-d * d);
    }
  }
}

/** One level stretch, so every map has somewhere predictable to duel across. */
function levelOneStretch(heights: Float64Array, rng: () => number): void {
  const width = 24 + Math.floor(rng() * 16);
  const start = Math.floor(rng() * (COLUMN_COUNT - width));
  let sum = 0;
  for (let i = start; i < start + width; i++) sum += heights[i];
  const average = sum / width;
  for (let i = start; i < start + width; i++) heights[i] = average;
}

/**
 * Slides the whole profile down before clamping, so a map that happens to peak
 * too high keeps its shape instead of having its summits shaved flat.
 */
function fitWithinBounds(heights: Float64Array): void {
  let lowest = Infinity;
  for (const y of heights) lowest = Math.min(lowest, y);
  const deficit = SKY_MARGIN - lowest;
  if (deficit > 0) {
    for (let i = 0; i < COLUMN_COUNT; i++) heights[i] += deficit;
  }
  for (let i = 0; i < COLUMN_COUNT; i++) {
    heights[i] = Math.min(BEDROCK_Y, Math.max(SKY_MARGIN, heights[i]));
  }
}

/** Grows a complete map from one seed. Same seed in, same map out, on any machine. */
export function generateTerrain(seed: number): Terrain {
  const rng = createRng(seed);
  const heights = new Float64Array(COLUMN_COUNT);

  layRidgeline(heights, rng);
  cutMesas(heights, rng);
  raisePeaks(heights, rng);
  levelOneStretch(heights, rng);
  fitWithinBounds(heights);

  return { seed, heights };
}

/** Surface height at any world x, interpolated between the two nearest columns. */
export function surfaceY(terrain: Terrain, x: number): number {
  const clamped = Math.max(0, Math.min(WORLD_WIDTH - 1, x));
  const position = clamped / COLUMN_W;
  const left = Math.min(COLUMN_COUNT - 1, Math.floor(position));
  const right = Math.min(COLUMN_COUNT - 1, left + 1);
  const t = position - left;
  return terrain.heights[left] * (1 - t) + terrain.heights[right] * t;
}

/**
 * Blows a hole at (x, y): every column the blast circle covers drops to the
 * circle's lower edge, never past bedrock.
 *
 * A blast centred well below the surface takes the ground above it with it,
 * which a heightmap can't avoid — there's no way to say "hollow underneath".
 * In practice a shell detonates the moment it touches the surface, so a truly
 * buried blast barely happens, and when it does it reads like ground caving
 * in rather than a bug.
 */
export function carveCrater(terrain: Terrain, x: number, y: number, radius: number): Terrain {
  const heights = Float64Array.from(terrain.heights);
  const from = Math.max(0, Math.ceil((x - radius) / COLUMN_W));
  const to = Math.min(COLUMN_COUNT - 1, Math.floor((x + radius) / COLUMN_W));

  for (let i = from; i <= to; i++) {
    const dx = i * COLUMN_W - x;
    const halfChord = radius * radius - dx * dx;
    if (halfChord <= 0) continue;
    const bottomOfBlast = y + Math.sqrt(halfChord);
    heights[i] = Math.min(BEDROCK_Y, Math.max(heights[i], bottomOfBlast));
  }

  return { seed: terrain.seed, heights };
}
