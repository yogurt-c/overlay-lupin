/**
 * Arena geometry and tuning constants for the worm artillery game, shared by
 * the simulation and the renderer alike.
 *
 * Vertical convention: `y` grows downward from the top of the world, the same
 * way the cell game measures its plane — unlike ballsport's ground-relative
 * space, because here the ground itself moves as it gets blown apart, so there
 * is no fixed ground line to measure from.
 */

/** The world is far wider than the camera; a match uses all of it. */
export const WORLD_WIDTH = 1440;

/** Width of the camera's visible slice. Window size scales this, never widens it. */
export const VIEW_WIDTH = 320;
export const VIEW_HEIGHT = 240;

/** Horizontal resolution of the terrain heightmap. */
export const COLUMN_W = 4;
export const COLUMN_COUNT = WORLD_WIDTH / COLUMN_W;

/** Nothing rises above this line, so there is always sky to arc a shell through. */
export const SKY_MARGIN = 96;
/** Ground is never *generated* below this, which keeps the playable band shallow. */
export const TERRAIN_FLOOR_Y = 380;
/**
 * Diggable rock under even the deepest valley. Each hit deepens a hole by about
 * one crater radius, so this is roughly how many shells the same spot swallows
 * before hitting bare bedrock — and bare bedrock is both ugly and flat, so it
 * wants to be out of reach of anything but a sustained pounding.
 */
export const ROCK_DEPTH = 240;
/** Nothing digs below this line, so a match can never breach the floor. */
export const BEDROCK_Y = TERRAIN_FLOOR_Y + ROCK_DEPTH;
export const WORLD_HEIGHT = BEDROCK_Y + 24;

/* ------------------------------------------------------------------- worm */

export const WORM_HALF_W = 7;
export const WORM_HEIGHT = 15;
export const MOVE_SPEED = 0.9;
/** Biggest height difference one step may climb — this is what makes a cliff a wall. */
export const MAX_CLIMB = 3;
export const WORM_GRAVITY = 0.45;
/**
 * A deliberately short hop — it peaks about 14px up, which clears a lip or a
 * crater rim but never a mesa. Cliffs have to stay unjumpable, or blasting a
 * path through the ground stops being a reason to spend a shell.
 */
export const JUMP_VELOCITY = -3.6;
/** Falls shorter than this are free; beyond it the worm takes damage. */
export const SAFE_FALL = 40;
export const FALL_DAMAGE_PER_PX = 0.5;
export const FALL_DAMAGE_MAX = 40;

/* ------------------------------------------------------------------- aim */

export const AIM_MIN_DEG = 5;
export const AIM_MAX_DEG = 85;
export const AIM_START_DEG = 45;
export const AIM_SPEED_DEG = 1.2;
/** Distance from the worm's centre to the muzzle, where a shell is born. */
export const BARREL_LENGTH = 16;

/* ------------------------------------------------------------------ shell */

/** Frames of held fire to reach full power; releasing early scales down from here. */
export const CHARGE_FRAMES = 90;
export const SHELL_SPEED_MIN = 2.2;
export const SHELL_SPEED_RANGE = 8.0;
export const SHELL_GRAVITY = 0.22;
/** Ticks after firing during which a shell ignores the worm that fired it. */
export const MUZZLE_GRACE = 6;
export const RELOAD_FRAMES = 72;
/** Safety valve: a shell that somehow never lands still stops existing. */
export const SHELL_MAX_AGE = 600;

/* ---------------------------------------------------------------- blast */

/** Damage reaches further than destruction, so grazing hits land without flattening the map. */
export const BLAST_RADIUS = 26;
export const CRATER_RADIUS = 22;
export const DAMAGE_MAX = 34;
export const DAMAGE_MIN = 6;

/* ----------------------------------------------------------------- match */

export const MAX_HP = 100;
export const RESPAWN_MS = 3000;
export const WIN_KILLS = 5;
export const ROOM_CAPACITY = 6;

/* ------------------------------------------------------------------ items */

/** How many pickups may sit on the map at once. */
export const ITEM_MAX = 3;
/** Frames between spawn attempts, rolled fresh each time — 12 to 20 seconds. */
export const ITEM_SPAWN_MIN_FRAMES = 720;
export const ITEM_SPAWN_MAX_FRAMES = 1200;
/** How close a worm has to walk to collect one. */
export const ITEM_PICKUP_RADIUS = 13;
/** Drawn size, and the radius a blast has to reach to destroy it. */
export const ITEM_RADIUS = 7;
/** Keeps a fresh pickup from landing on top of whoever is standing there. */
export const ITEM_SPAWN_CLEARANCE = 90;

export const HEAL_AMOUNT = 50;
/** Ten seconds of complete immunity, fall damage and self-inflicted included. */
export const SHIELD_FRAMES = 600;

/** Hard ceiling on shells in flight, so a shotgun volley can't blow the packet budget. */
export const MAX_SHELLS = 24;
