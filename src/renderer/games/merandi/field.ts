/**
 * Square-loop geometry shared by the simulation and the renderer. Monsters
 * walk the perimeter of a square forever (never reaching a "base"); each of
 * the 4 corners is one player's zone, and slots inside a zone are laid out on
 * a corner-anchored 6x6 grid — index 0 sits deepest (closest to the shared
 * center), index (SLOT_COLS*SLOT_ROWS - 1) sits shallowest (right at the corner).
 */
import { SLOT_COLS, SLOT_ROWS } from './data.js';
import type { ZoneLabel } from './types.js';

export const HALF_TRACK = 260;
export const ZONE_MARGIN = 44;
export const ZONE_HALF = HALF_TRACK - ZONE_MARGIN;

/** Default zoomed-in visible window (world units) — smaller than the full ~2*HALF_TRACK field so a small overlay window still reads clearly. */
export const ZOOM_VIEW_SIZE = 300;
/** How far the world extends past the loop track (corner labels, etc.) — the camera clamp keeps the view inside this. */
export const WORLD_CLAMP = HALF_TRACK + 20;

/** Keeps a camera target inside the world so panning never scrolls past the edge of the field. */
export function clampCamera(x: number, y: number): Point {
  const maxOffset = Math.max(0, WORLD_CLAMP - ZOOM_VIEW_SIZE / 2);
  return [Math.max(-maxOffset, Math.min(maxOffset, x)), Math.max(-maxOffset, Math.min(maxOffset, y))];
}

export const ZONE_SIGN: Record<ZoneLabel, { sx: 1 | -1; sy: 1 | -1 }> = {
  P1: { sx: -1, sy: -1 },
  P2: { sx: 1, sy: -1 },
  P3: { sx: 1, sy: 1 },
  P4: { sx: -1, sy: 1 }
};

export const ZONE_LABELS: ZoneLabel[] = ['P1', 'P2', 'P3', 'P4'];

export type Point = [number, number];

/** Closed square loop (side = 2*half), traced clockwise starting from the top-left corner. */
export function squareLoopPoints(half: number, perSide: number): Point[] {
  const corners: Point[] = [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half]
  ];
  const pts: Point[] = [];
  for (let c = 0; c < 4; c++) {
    const a = corners[c];
    const b = corners[(c + 1) % 4];
    for (let i = 0; i < perSide; i++) {
      const f = i / perSide;
      pts.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    }
  }
  return pts;
}

export function perimeterPoint(pts: Point[], t: number): Point {
  const n = pts.length;
  const pos = (((t % 1) + 1) % 1) * n;
  const i = Math.floor(pos) % n;
  const frac = pos - Math.floor(pos);
  const a = pts[i];
  const b = pts[(i + 1) % n];
  return [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac];
}

/** Slot position for `index` (0..35) inside `label`'s corner-anchored grid. */
export function slotPosition(label: ZoneLabel, index: number): Point {
  const { sx, sy } = ZONE_SIGN[label];
  const col = index % SLOT_COLS;
  const row = Math.floor(index / SLOT_COLS);
  const pad = 0.1;
  const fx = pad + (col / (SLOT_COLS - 1)) * (1 - pad * 2);
  const fy = pad + (row / (SLOT_ROWS - 1)) * (1 - pad * 2);
  // fx/fy run 0 (near center) -> 1 (near corner).
  const x = sx * (ZONE_HALF - fx * ZONE_HALF);
  const y = sy * (ZONE_HALF - fy * ZONE_HALF);
  return [x, y];
}

/** How close to the shared center a slot sits, 0 (at the corner) .. 1 (deepest, nearest center) — used to gate placement by a unit's range. */
export function slotDepth(index: number): number {
  const col = index % SLOT_COLS;
  const row = Math.floor(index / SLOT_COLS);
  const fx = col / (SLOT_COLS - 1);
  const fy = row / (SLOT_ROWS - 1);
  return Math.max(fx, fy);
}

/**
 * Small offset for member `index` of `total` sharing one slot (a slot is a shared tile, not a "must
 * match" stack — see types.ts's UnitStack) — shared by the renderer and the click hit-test so both
 * agree on exactly where each member visually sits.
 */
export function memberOffset(index: number, total: number): Point {
  if (total <= 1) return [0, 0];
  const spread = 11; // wide enough that same-slot members read as distinct icons instead of one clump, now that units are drawn larger
  const angle = (index / total) * Math.PI * 2;
  return [Math.cos(angle) * spread, Math.sin(angle) * spread];
}

export function distanceToPath(pos: Point, pathPts: Point[]): number {
  let best = Infinity;
  for (const p of pathPts) {
    const d = Math.hypot(p[0] - pos[0], p[1] - pos[1]);
    if (d < best) best = d;
  }
  return best;
}
