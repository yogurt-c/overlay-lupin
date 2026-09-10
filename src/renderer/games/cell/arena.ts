/**
 * Arena geometry, shared by the simulation and the renderer. Unlike soccer's
 * ground-line world, this is a plain bounded 2D plane — the camera centers on
 * the local cell and clamps to the arena edges instead of scrolling a single axis.
 */
export const ARENA_WIDTH = 1800;
export const ARENA_HEIGHT = 1200;

/** Size of the camera's square viewport onto the arena. */
export const VIEW_SIZE = 240;

export const START_MASS = 30;
export const FOOD_MASS = 1.4;
/** Scaled to roughly the same dot density as the old, smaller arena. */
export const FOOD_COUNT = 150;
/** An attacker must be at least this much bigger to eat another cell. */
export const EAT_RATIO = 1.15;
export const RESPAWN_MS = 3000;

/** `mass` grows a cell's on-screen area, not its radius, so early growth reads as fast and later growth as gradual. */
export function radiusFor(mass: number): number {
  return 6 + Math.sqrt(mass) * 2.4;
}
