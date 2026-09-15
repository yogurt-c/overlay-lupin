/**
 * Render-side reactions for the cell arena: the short swallow animation when one of a player's blobs absorbs
 * another.
 *
 * Derived by diffing consecutive snapshots rather than reported by the engine, because a snapshot goes out
 * over the wire to every member each tick and there's an MTU budget on it (see the simulation tests). Members
 * render the same reaction off the same diff, so nothing has to be transmitted at all.
 */
import type { CellWorld } from './types.js';

/** Seconds one blob takes to disappear into the blob swallowing it. */
const SWALLOW_SECONDS = 0.22;
/** A merge is only read as a merge if the survivor picked up at least this share of the vanished mass. */
const SWALLOW_MASS_SHARE = 0.8;

/** Shape a blob's rim distorts into, e.g. while sliding into whatever's swallowing it — see `drawSwallow`. */
export interface Squash {
  /** Unit vector along the stretch/flatten axis. */
  nx: number;
  ny: number;
  /** Signed strength of the distortion. */
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
let swallows: PendingSwallow[] = [];
let lastAt = 0;

/** Drops every bit of carried-over state — call when a match starts so a previous one can't bleed into it. */
export function resetCellEffects(): void {
  motions.clear();
  swallows = [];
  lastAt = 0;
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
  }
}

/**
 * Folds this frame's snapshot into the carried-over reaction state and hands back what to draw. Call once per
 * frame, before drawing the blobs.
 */
export function updateCellEffects(world: CellWorld, colorOf: (playerId: string) => string): { swallows: Swallow[] } {
  const now = Date.now();
  const dt = lastAt === 0 ? 0 : Math.min((now - lastAt) / 1000, 0.25);
  lastAt = now;

  const cells = world.players
    .filter((p) => p.alive)
    .flatMap((p) => p.cells.map((c) => ({ id: c.id, x: c.x, y: c.y, mass: c.mass, playerId: p.id })));

  detectSwallows(world, colorOf);

  const live = new Set(cells.map((c) => c.id));
  for (const id of motions.keys()) if (!live.has(id)) motions.delete(id);
  for (const cell of cells) {
    motions.set(cell.id, { x: cell.x, y: cell.y, mass: cell.mass, playerId: cell.playerId });
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

  return { swallows: drawable };
}
