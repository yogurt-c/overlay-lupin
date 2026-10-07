/**
 * Shared constants and the seeded RNG for 뱀서.
 *
 * Every number a member could also compute lives here rather than in the
 * engine, because phase 3 runs the same simulation on each client from a
 * shared seed: anything the two sides disagree about would drift the swarm
 * apart. `Math.random` is therefore banned in this game — `createRng` is the
 * only source of chance.
 */

/** Logical play field. The camera shows a slice of it; the figures never leave. */
export const WORLD_W = 1600;
export const WORLD_H = 1200;

/**
 * How much of the world one screen pixel covers. Below 1 the whole scene is
 * drawn smaller, which widens the view without touching a single gameplay
 * number — the figures were reading as oversized against the field, not as
 * too fast or too strong.
 */
export const VIEW_SCALE = 0.68;

/** One tick is one shell step (60Hz), so every duration below is in ticks. */
export const TICKS_PER_SECOND = 60;
/** A run lasts this long; surviving to the end summons the reaper. */
export const RUN_TICKS = 10 * 60 * TICKS_PER_SECOND;

export const PLAYER_RADIUS = 11;
export const PLAYER_SPEED = 2.15;
export const PLAYER_MAX_HP = 120;
/** Damage from one touch. A miniboss multiplies it; the reaper ignores it entirely. */
export const CONTACT_DAMAGE = 2.4;
/** After taking a hit the figure is briefly untouchable, so a crowd can't delete it instantly. */
export const HURT_INVULN_TICKS = 24;

/** The overlay's default size in CSS pixels — see src/main/window.ts. */
const DEFAULT_VIEW_W = 320;
const DEFAULT_VIEW_H = 280;

/**
 * Half the rectangle the spawner works just outside of, in world units.
 *
 * Deliberately NOT the local window. The camera is render state: it eases
 * toward whichever figure is the local player, and its size is that player's
 * overlay. Spawning off it meant two clients in one run grew different swarms
 * from the same seed — a desync by construction, invisible to any test that
 * runs a single client. These are the default window's extents, so the
 * distance enemies walk in from is what it has always been by default.
 */
export const SPAWN_HALF_W = DEFAULT_VIEW_W / 2 / VIEW_SCALE;
export const SPAWN_HALF_H = DEFAULT_VIEW_H / 2 / VIEW_SCALE;

export const ENEMY_RADIUS = 10;
/** Hard ceiling on live enemies — the swarm is the point, but the frame budget isn't infinite. */
export const MAX_ENEMIES = 200;
export const MAX_GEMS = 120;
/** Enemies appear just outside the camera, never in front of the player. */
export const SPAWN_MARGIN = 90;

export const GEM_PICKUP_RADIUS = 14;
/** Gems inside this radius drift toward the player; the magnet passive widens it later. */
export const GEM_MAGNET_RADIUS = 70;

/** Level-up offers three cards and pauses the run until one is taken. */
export const CARD_COUNT = 3;
/** Multiplayer only: after this long the first card is taken for you. Solo waits forever. */
export const PICK_TIMEOUT_TICKS = 10 * TICKS_PER_SECOND;

export const ROOM_CAPACITY = 4;

/**
 * How long the result panel stays up after a run ends, in shell frames.
 *
 * The shell leaves the room the moment a match reports itself over, so without
 * a hold a ten-minute run would flash its result for one frame and dump
 * everyone back to the idle screen — indistinguishable from a disconnect.
 */
export const RESULT_HOLD_FRAMES = 7 * TICKS_PER_SECOND;

/**
 * xorshift32. Small, fast and — the reason it exists here — identical on every
 * machine, unlike `Math.random`.
 */
export function createRng(seed: number): () => number {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 4294967296;
  };
}

/**
 * Experience needed to reach the next level, following the original's shape:
 * cheap early so the first weapons arrive fast, then steadily steeper.
 * `players` scales it so a four-player room doesn't level up four times as
 * often — the pause has to land at the same rhythm as a solo run.
 */
export function xpForLevel(level: number, players = 1): number {
  const step = level < 20 ? 10 : level < 40 ? 13 : 16;
  return (5 + (level - 1) * step) * players;
}

export const clamp = (n: number, lo: number, hi: number): number => (n < lo ? lo : n > hi ? hi : n);

/** mm:ss. The HUD counts a run down with it and the result panel counts one up. */
export function clockText(ticks: number): string {
  const seconds = Math.max(0, Math.floor(ticks / TICKS_PER_SECOND));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
