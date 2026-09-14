/**
 * Render-side reactions for the cell arena: the squash a blob takes when it runs into a wall or another blob,
 * and the short swallow animation when one of a player's blobs absorbs another.
 *
 * All of it is derived by diffing consecutive snapshots rather than reported by the engine, because a snapshot
 * goes out over the wire to every member each tick and there's an MTU budget on it (see the simulation tests).
 * Members render the same reactions off the same diff, so nothing has to be transmitted at all.
 */
import { ARENA_HEIGHT, ARENA_WIDTH, radiusFor } from './arena.js';
import type { CellWorld } from './types.js';

/** How hard a blob has to be moving into something for the hit to register at all, in arena px per tick. */
const IMPACT_MIN_SPEED = 0.6;
/** Speed that counts as a full-strength hit; anything faster is clamped to it. */
const IMPACT_FULL_SPEED = 6;
/** Seconds for a squash to spring back out. */
const SQUASH_DECAY = 5.5;
/** Seconds one blob takes to disappear into the blob swallowing it. */
const SWALLOW_SECONDS = 0.22;
/** A merge is only read as a merge if the survivor picked up at least this share of the vanished mass. */
const SWALLOW_MASS_SHARE = 0.8;

export interface Squash {
  /** Unit vector pointing back along whatever the blob ran into — the axis it flattens on. */
  nx: number;
  ny: number;
  /** 0 to 1, springing back to 0 over `SQUASH_DECAY`. */
  amount: number;
}

/** One blob mid-swallow: drawn shrinking and sliding into whatever absorbed it, on top of the real blobs. */
export interface Swallow {
  x: number;
  y: number;
  toX: number;
  toY: number;
  mass: number;
  color: string;
  /** 0 at the start of the swallow, 1 when it's gone. */
  progress: number;
}

interface Motion {
  x: number;
  y: number;
  mass: number;
  /** Arena px per tick, carried from the previous frame so a hit can be read as "was inbound, now stopped". */
  vx: number;
  vy: number;
  playerId: string;
}

interface PendingSwallow {
  fromX: number;
  fromY: number;
  mass: number;
  color: string;
  targetId: string;
  elapsed: number;
}

const motions = new Map<string, Motion>();
const squashes = new Map<string, Squash>();
let swallows: PendingSwallow[] = [];
let lastAt = 0;

/** Drops every bit of carried-over state — call when a match starts so a previous one can't bleed into it. */
export function resetCellEffects(): void {
  motions.clear();
  squashes.clear();
  swallows = [];
  lastAt = 0;
}

function strengthFor(speed: number): number {
  if (speed < IMPACT_MIN_SPEED) return 0;
  return Math.min(1, (speed - IMPACT_MIN_SPEED) / (IMPACT_FULL_SPEED - IMPACT_MIN_SPEED));
}

/** Keeps the hardest hit a blob took this frame rather than letting a later, softer one overwrite it. */
function applySquash(id: string, nx: number, ny: number, strength: number): void {
  if (strength <= 0) return;
  const existing = squashes.get(id);
  if (existing && existing.amount >= strength) return;
  squashes.set(id, { nx, ny, amount: strength });
}

/** A blob pinned against an arena edge flattens against it, as hard as it was travelling into it. */
function detectWallHits(id: string, x: number, y: number, radius: number, prev: Motion): void {
  const slack = 0.75;
  if (x <= radius + slack && prev.vx < 0) applySquash(id, -1, 0, strengthFor(-prev.vx));
  else if (x >= ARENA_WIDTH - radius - slack && prev.vx > 0) applySquash(id, 1, 0, strengthFor(prev.vx));
  if (y <= radius + slack && prev.vy < 0) applySquash(id, 0, -1, strengthFor(-prev.vy));
  else if (y >= ARENA_HEIGHT - radius - slack && prev.vy > 0) applySquash(id, 0, 1, strengthFor(prev.vy));
}

/**
 * Blobs that just came into contact squash against each other, split by mass so the smaller one gives more.
 * Only the frame contact begins counts — a piece parked against its main body shouldn't buzz forever.
 */
function detectBlobHits(now: { id: string; x: number; y: number; mass: number }[]): void {
  for (let i = 0; i < now.length; i++) {
    for (let j = i + 1; j < now.length; j++) {
      const a = now[i];
      const b = now[j];
      const contact = radiusFor(a.mass) + radiusFor(b.mass);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist > contact || dist < 0.001) continue;

      const prevA = motions.get(a.id);
      const prevB = motions.get(b.id);
      if (!prevA || !prevB) continue;
      const wasApart = Math.hypot(prevB.x - prevA.x, prevB.y - prevA.y) > radiusFor(prevA.mass) + radiusFor(prevB.mass);
      if (!wasApart) continue;

      const nx = dx / dist;
      const ny = dy / dist;
      const closing = (prevA.vx - prevB.vx) * nx + (prevA.vy - prevB.vy) * ny;
      const strength = strengthFor(closing);
      if (strength <= 0) continue;
      // The lighter blob is the one that gives — a pebble off a boulder barely marks the boulder.
      const total = a.mass + b.mass;
      applySquash(a.id, nx, ny, strength * (b.mass / total) * 2);
      applySquash(b.id, -nx, -ny, strength * (a.mass / total) * 2);
    }
  }
}

/**
 * Finds blobs that vanished into a sibling since the last frame. A blob eaten by someone else vanishes too, so
 * a merge is only called a merge when one of the player's remaining blobs put on the mass that went missing.
 */
function detectSwallows(world: CellWorld, colorOf: (playerId: string) => string): void {
  const seen = new Set<string>();
  for (const player of world.players) for (const cell of player.cells) seen.add(cell.id);

  for (const [id, prev] of motions) {
    if (seen.has(id)) continue;
    const player = world.players.find((p) => p.id === prev.playerId);
    if (!player || !player.alive || player.cells.length === 0) continue;

    const absorber = player.cells.find((c) => {
      const before = motions.get(c.id);
      return before !== undefined && c.mass - before.mass >= prev.mass * SWALLOW_MASS_SHARE;
    });
    if (!absorber) continue;

    swallows.push({
      fromX: prev.x,
      fromY: prev.y,
      mass: prev.mass,
      color: colorOf(prev.playerId),
      targetId: absorber.id,
      elapsed: 0
    });
    // The blob doing the swallowing gets a shove from what it just took in.
    const dx = absorber.x - prev.x;
    const dy = absorber.y - prev.y;
    const dist = Math.hypot(dx, dy) || 1;
    applySquash(absorber.id, -dx / dist, -dy / dist, 0.75);
  }
}

/**
 * Folds this frame's snapshot into the carried-over reaction state and hands back what to draw. Call once per
 * frame, before drawing the blobs.
 */
export function updateCellEffects(
  world: CellWorld,
  colorOf: (playerId: string) => string
): { squashOf: (id: string) => Squash | undefined; swallows: Swallow[] } {
  const now = Date.now();
  const dt = lastAt === 0 ? 0 : Math.min((now - lastAt) / 1000, 0.25);
  lastAt = now;

  const cells = world.players
    .filter((p) => p.alive)
    .flatMap((p) => p.cells.map((c) => ({ id: c.id, x: c.x, y: c.y, mass: c.mass, playerId: p.id })));

  for (const squash of squashes.values()) squash.amount -= squash.amount * SQUASH_DECAY * dt;
  for (const [id, squash] of squashes) if (squash.amount < 0.01) squashes.delete(id);

  detectSwallows(world, colorOf);
  for (const cell of cells) {
    const prev = motions.get(cell.id);
    if (prev) detectWallHits(cell.id, cell.x, cell.y, radiusFor(cell.mass), prev);
  }
  detectBlobHits(cells);

  const live = new Set(cells.map((c) => c.id));
  for (const id of motions.keys()) if (!live.has(id)) motions.delete(id);
  for (const id of squashes.keys()) if (!live.has(id)) squashes.delete(id);
  for (const cell of cells) {
    const prev = motions.get(cell.id);
    motions.set(cell.id, {
      x: cell.x,
      y: cell.y,
      mass: cell.mass,
      vx: prev ? cell.x - prev.x : 0,
      vy: prev ? cell.y - prev.y : 0,
      playerId: cell.playerId
    });
  }

  const byId = new Map(cells.map((c) => [c.id, c]));
  const drawable: Swallow[] = [];
  for (const swallow of swallows) {
    swallow.elapsed += dt;
    const target = byId.get(swallow.targetId);
    if (!target) continue;
    const progress = Math.min(1, swallow.elapsed / SWALLOW_SECONDS);
    drawable.push({
      x: swallow.fromX,
      y: swallow.fromY,
      toX: target.x,
      toY: target.y,
      mass: swallow.mass,
      color: swallow.color,
      progress
    });
  }
  swallows = swallows.filter((s) => s.elapsed < SWALLOW_SECONDS && byId.has(s.targetId));

  return { squashOf: (id: string) => squashes.get(id), swallows: drawable };
}
