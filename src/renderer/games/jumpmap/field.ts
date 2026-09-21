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
  /** Small world-space sign, placed below the landing surface. */
  label?: string;
  /** Landing destination for the trampoline direction cue. */
  launchTargetId?: string;
}

/** The course is much wider than the camera; the camera tracks each runner across it. */
export const WORLD_WIDTH = 960;
export const VIEW_WIDTH = 260;
export const VIEW_HEIGHT = 260;

export const PLATFORM_H = 14;

function centered(cx: number, w: number): number {
  return cx - w / 2;
}

export type CourseZone = 'desk' | 'workshop' | 'sky';

export const ZONE_STYLE = {
  desk: { label: '책상 위', ink: '#826348', fill: '#f4e6cb', side: '#dbc5a2' },
  workshop: { label: '낙서 공사장', ink: '#576f75', fill: '#e7eeea', side: '#b9cbc7' },
  sky: { label: '종이 하늘', ink: '#747394', fill: '#f6f3ff', side: '#ddd9ef' }
} as const;

export function zoneAt(y: number): CourseZone {
  return y >= 2400 ? 'desk' : y >= 1200 ? 'workshop' : 'sky';
}

function platform(id: string, kind: PlatformKind, cx: number, y: number, w: number,
  detail: Partial<Pick<PlatformSpec, 'amplitude' | 'speed' | 'phase' | 'label' | 'launchTargetId'>> = {}): PlatformSpec {
  return { id, kind, x: centered(cx, w), y, w, ...detail };
}

/** Three hand-laid chapters: learn, choose routes, then race across the clouds.
 * Forks offer a narrow two-hop shortcut and a wider three-hop detour.
 * Broad gathering platforms separate the technical sections. */
export const PLATFORMS: PlatformSpec[] = [
  platform('start', 'start', 480, 3600, 190),
  platform('p1', 'static', 570, 3530, 140),
  platform('p2', 'static', 680, 3460, 130),
  platform('p3', 'moving', 720, 3382, 120, { amplitude: 75, speed: 0.022 }),
  platform('desk-plaza', 'static', 600, 3304, 180, { label: '01 · 책상 위' }),
  platform('desk-wide1', 'static', 460, 3244, 125, { label: '돌아가기 ←' }),
  platform('desk-short', 'static', 650, 3204, 58, { label: '↑ 지름길' }),
  platform('desk-wide2', 'static', 430, 3184, 125),
  platform('desk-merge', 'static', 540, 3124, 180),
  platform('desk-step1', 'static', 420, 3058, 100),
  platform('desk-step2', 'static', 310, 2992, 100),
  platform('trampoline1', 'trampoline', 240, 2914, 110, { launchTargetId: 'desk-landing' }),
  platform('desk-landing', 'static', 440, 2754, 155),
  platform('p6', 'moving', 560, 2676, 125, { amplitude: 85, speed: 0.023, phase: 0.4 }),
  platform('desk-last', 'static', 680, 2598, 130),
  platform('desk-exit', 'static', 580, 2518, 170),
  platform('work-entry', 'static', 460, 2438, 150),
  platform('work-plaza', 'static', 350, 2358, 185, { label: '02 · 낙서 공사장' }),
  platform('work-lift1', 'moving', 280, 2280, 115, { amplitude: 100, speed: 0.024, phase: 1.2 }),
  platform('work-rest', 'static', 410, 2202, 150),
  platform('work-wide1', 'static', 560, 2142, 125, { label: '돌아가기 →' }),
  platform('work-short', 'static', 350, 2102, 55, { label: '↑ 지름길' }),
  platform('work-wide2', 'static', 590, 2082, 125),
  platform('work-merge', 'static', 470, 2022, 190),
  platform('work-beam1', 'static', 600, 1948, 85),
  platform('work-beam2', 'static', 730, 1874, 80),
  platform('trampoline2', 'trampoline', 790, 1796, 110, { launchTargetId: 'work-landing' }),
  platform('work-landing', 'static', 580, 1636, 155),
  platform('work-lift2', 'moving', 440, 1558, 115, { amplitude: 100, speed: 0.026, phase: 2.1 }),
  platform('work-beam3', 'static', 290, 1480, 95),
  platform('work-exit', 'static', 400, 1402, 175),
  platform('trampoline3', 'trampoline', 480, 1324, 120, { launchTargetId: 'sky-plaza' }),
  platform('sky-plaza', 'static', 680, 1164, 180, { label: '03 · 종이 하늘' }),
  platform('sky-step1', 'static', 790, 1086, 115),
  platform('sky-lift1', 'moving', 690, 1008, 115, { amplitude: 95, speed: 0.025, phase: 0.8 }),
  platform('sky-rest', 'static', 550, 930, 165),
  platform('sky-wide1', 'static', 400, 870, 120, { label: '돌아가기 ←' }),
  platform('sky-short', 'static', 600, 830, 52, { label: '↑ 지름길' }),
  platform('sky-wide2', 'static', 370, 810, 120),
  platform('sky-merge', 'static', 490, 750, 185),
  platform('sky-step2', 'static', 340, 672, 100),
  platform('sky-lift2', 'moving', 250, 594, 110, { amplitude: 90, speed: 0.026, phase: 0.4 }),
  platform('sky-rest2', 'static', 380, 516, 145),
  platform('trampoline4', 'trampoline', 480, 438, 110, { launchTargetId: 'sky-landing' }),
  platform('sky-landing', 'static', 690, 278, 155),
  platform('final-plaza', 'static', 790, 200, 190, { label: '마지막 한 걸음!' }),
  platform('final-step', 'static', 680, 122, 140),
  platform('goal', 'goal', 570, 44, 140)
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
