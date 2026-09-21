/**
 * Course geometry and tuning constants for 점프맵, shared by the simulation
 * and the renderer alike.
 *
 * Vertical convention: `y` grows downward from the top of the world, same as
 * the worm and cell games — the start platform sits at a large y, the goal
 * at a small one, and gravity adds to `vy` rather than subtracting from it.
 */

export type PlatformKind = 'start' | 'static' | 'moving' | 'trampoline' | 'goal';

export interface PlatformSpec {
  id: string;
  kind: PlatformKind;
  /** Left edge, in world units. */
  x: number;
  /** Top surface — the only y collision cares about. */
  y: number;
  w: number;
  /** Moving platforms only: how far either side of `x` it swings, and how fast. */
  amplitude?: number;
  speed?: number;
  phase?: number;
}

/** The course is much wider than the camera; the camera tracks each runner across it. */
export const WORLD_WIDTH = 960;
export const VIEW_WIDTH = 260;
export const VIEW_HEIGHT = 260;

export const PLATFORM_H = 14;

function centered(cx: number, w: number): number {
  return cx - w / 2;
}

/**
 * One hand-laid course, bottom to top, in two acts so the climb has real
 * length: a moving platform to open, a narrow single-file squeeze, forks
 * that let a runner dodge a fight by taking the long way round, and
 * trampolines that turn a flat gap into a big vertical skip — that pattern
 * repeats twice on the way up. The path also zig-zags across the full width
 * of the course rather than climbing a narrow column. No hazards — the only
 * thing that can end a run early is another runner's attack key.
 */
export const PLATFORMS: PlatformSpec[] = [
  { id: 'start', kind: 'start', x: centered(480, 170), y: 1980, w: 170 },
  { id: 'p1', kind: 'moving', x: centered(480, 120), y: 1902, w: 120, amplitude: 130, speed: 0.03, phase: 0 },
  { id: 'p2', kind: 'static', x: centered(620, 120), y: 1824, w: 120 },
  { id: 'p3', kind: 'static', x: centered(750, 80), y: 1746, w: 80 },
  { id: 'fork1a', kind: 'static', x: centered(650, 110), y: 1668, w: 110 },
  { id: 'fork1b', kind: 'static', x: centered(870, 110), y: 1668, w: 110 },
  { id: 'p4', kind: 'moving', x: centered(760, 130), y: 1590, w: 130, amplitude: 130, speed: 0.028, phase: 1.2 },
  { id: 'trampoline1', kind: 'trampoline', x: centered(560, 120), y: 1512, w: 120 },
  { id: 'p5', kind: 'static', x: centered(300, 100), y: 1352, w: 100 },
  { id: 'fork2a', kind: 'static', x: centered(180, 100), y: 1274, w: 100 },
  { id: 'fork2b', kind: 'static', x: centered(420, 100), y: 1274, w: 100 },
  { id: 'p6', kind: 'moving', x: centered(300, 130), y: 1196, w: 130, amplitude: 150, speed: 0.031, phase: 0.4 },
  { id: 'p7', kind: 'static', x: centered(560, 110), y: 1118, w: 110 },
  { id: 'p8', kind: 'static', x: centered(690, 110), y: 1040, w: 110 },
  { id: 'trampoline2', kind: 'trampoline', x: centered(620, 120), y: 962, w: 120 },
  { id: 'bridge', kind: 'static', x: centered(480, 140), y: 802, w: 140 },
  // Second act: the same repertoire of devices again, higher up.
  { id: 'p9', kind: 'static', x: centered(600, 110), y: 724, w: 110 },
  { id: 'p10', kind: 'moving', x: centered(480, 120), y: 646, w: 120, amplitude: 140, speed: 0.029, phase: 2.1 },
  { id: 'fork3a', kind: 'static', x: centered(420, 110), y: 568, w: 110 },
  { id: 'fork3b', kind: 'static', x: centered(660, 110), y: 568, w: 110 },
  { id: 'p11', kind: 'static', x: centered(540, 70), y: 490, w: 70 },
  { id: 'trampoline3', kind: 'trampoline', x: centered(420, 120), y: 412, w: 120 },
  { id: 'p12', kind: 'static', x: centered(680, 110), y: 252, w: 110 },
  { id: 'p13', kind: 'moving', x: centered(480, 120), y: 174, w: 120, amplitude: 140, speed: 0.032, phase: 0.8 },
  { id: 'p14', kind: 'static', x: centered(650, 140), y: 96, w: 140 },
  { id: 'goal', kind: 'goal', x: centered(650, 90), y: 18, w: 90 }
];

/** A moving platform's left edge at a given tick — a pure function of the tick count, so the host (for collision) and every member (for rendering) compute the identical position without the host ever having to broadcast it. */
export function movingPlatformX(spec: PlatformSpec, tick: number): number {
  if (spec.kind !== 'moving' || spec.amplitude === undefined || spec.speed === undefined) return spec.x;
  const centerBase = spec.x + spec.w / 2;
  const center = centerBase + Math.sin(tick * spec.speed + (spec.phase ?? 0)) * spec.amplitude;
  return center - spec.w / 2;
}

const START = PLATFORMS[0];
const GOAL = PLATFORMS[PLATFORMS.length - 1];

export const START_X = START.x + START.w / 2;
export const START_Y = START.y;
export const GOAL_Y = GOAL.y;

/** Bottom margin below the start platform, top margin above the goal — both just for the camera to breathe in. */
export const WORLD_HEIGHT = START.y + 70;
export const WORLD_TOP = GOAL.y - 80;

/* -------------------------------------------------------------- runner */

export const PLAYER_HALF_W = 9;
export const MOVE_SPEED = 3;
/** Softened slightly below a "realistic" fall so an ordinary jump clears every hand-placed gap with room to spare. */
export const GRAVITY = 0.42;
export const JUMP_VELOCITY = -9.6;
/** One extra hop while airborne — resets the moment a runner lands again. */
export const AIR_JUMP_VELOCITY = -8.4;
export const FASTFALL_ACCEL = 0.9;
export const MAX_FALL_SPEED = 13;
export const TRAMPOLINE_VELOCITY = -14.5;

/* --------------------------------------------------------- knockback */

/** A shove only lands on whoever is roughly in front — no swing hits someone standing behind you. */
export const ATTACK_RANGE_X = 30;
export const ATTACK_RANGE_Y = 22;
/** Slop on the facing check, so a target standing almost dead-on still counts as "in front". */
export const ATTACK_FRONT_SLOP = 5;
export const ATTACK_COOLDOWN_TICKS = 45;
/** How long the bat-swing visual plays, in frames. */
export const ATTACK_SWING_FRAMES = 10;
export const KNOCKBACK_VX = 5.8;
export const KNOCKBACK_VY = -3.2;
/** While stunned, held movement keys are ignored — the shove has to actually interrupt the runner. */
export const KNOCKBACK_STUN_TICKS = 16;
/** Per-tick decay on knockback drift, and the speed below which it's just rounded to a stop. */
export const KNOCKBACK_DECAY = 0.88;
export const KNOCKBACK_REST_SPEED = 0.05;

/* ---------------------------------------------------------- checkpoint */

/** Falling this far below the last platform stood on, with nothing caught in between, sends a runner back to it. */
export const RESPAWN_FALL_MARGIN = 170;
/** Absolute safety net below the whole course, regardless of where a runner's checkpoint was. */
export const RESPAWN_WORLD_MARGIN = 40;

/* -------------------------------------------------------------- match */

export const ROOM_CAPACITY = 6;
export const GRACE_MS = 15_000;
export const INTERMISSION_MS = 3_000;
