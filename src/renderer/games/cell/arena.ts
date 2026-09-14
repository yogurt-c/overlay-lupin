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

/** Below this, a blob is too small to split or pop any further. */
export const MIN_CELL_MASS = 12;
/** A cell must be at least double the minimum so a manual split leaves two viable halves. */
export const SPLIT_MIN_MASS = MIN_CELL_MASS * 2;
/** How many separate blobs one player may own at once — caps runaway splitting/popping. */
export const MAX_CELLS_PER_PLAYER = 8;
/** Initial speed of the half fired forward on a split. */
export const SPLIT_LAUNCH_SPEED = 13;
/** How many ticks that extra speed keeps applying before the piece settles into normal movement. */
export const SPLIT_LAUNCH_TICKS = 18;
/** Weaker than the idle drag, so a launched piece actually travels somewhere before slowing down. */
export const SPLIT_LAUNCH_DRAG = 0.94;
/** How long two of your own split pieces must wait before they're allowed to merge back together. */
export const MERGE_COOLDOWN_MS = 12000;

/** Worth far more than a regular dot; spawns rarely to give the arena the occasional risk/reward prize. */
export const BIG_FOOD_MASS = 15;
export const BIG_FOOD_SPAWN_INTERVAL_MS = 10000;
/** Caps how many can sit on the field at once so they stay a rare sight, not ambient food. */
export const BIG_FOOD_MAX_COUNT = 3;

/** How large a cell must grow before touching a virus forces it to pop apart. */
export const VIRUS_POP_MASS = 55;
/** How many pieces a popped cell bursts into (fewer if the player is close to `MAX_CELLS_PER_PLAYER`). */
export const VIRUS_POP_PIECES = 4;
/** Pieces fly apart from a pop faster than a manual split — it's meant to punish, not help. */
export const VIRUS_LAUNCH_SPEED = 15;
export const VIRUS_RADIUS = 16;
/** How many virus hazards get scattered around the arena, here and there, at match start. */
export const VIRUS_COUNT = 8;

/** The host tops up with bots until this many cells are alive, and backs off as real players join. */
export const TARGET_POPULATION = 6;

/** `mass` grows a cell's on-screen area, not its radius, so early growth reads as fast and later growth as gradual. */
export function radiusFor(mass: number): number {
  return 6 + Math.sqrt(mass) * 2.4;
}
