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

/** Shared monochrome ink and paper values; materials are identified by shape and marks. */
export const INK_STYLE = {
  dark: '#202020',
  ink: '#414141',
  graphite: '#686868',
  hatch: '#969696',
  shade: '#c7c7c7',
  wash: '#e3e3e3',
  paper: '#f8f8f8'
} as const;

export const ZONE_STYLE = {
  desk: { label: '통나무 숲', ink: INK_STYLE.ink, fill: INK_STYLE.paper, side: INK_STYLE.shade },
  workshop: { label: '바위 능선', ink: INK_STYLE.ink, fill: INK_STYLE.wash, side: INK_STYLE.graphite },
  sky: { label: '구름 하늘', ink: INK_STYLE.ink, fill: INK_STYLE.paper, side: INK_STYLE.wash }
} as const;

export function zoneAt(y: number): CourseZone {
  return y >= 4000 ? 'desk' : y >= 2800 ? 'workshop' : 'sky';
}

function platform(id: string, kind: PlatformKind, cx: number, y: number, w: number,
  detail: Partial<Pick<PlatformSpec, 'amplitude' | 'speed' | 'phase' | 'label' | 'launchTargetId'>> = {}): PlatformSpec {
  return { id, kind, x: centered(cx, w), y, w, ...detail };
}

/** Four hand-laid chapters: forest, rocks, clouds, then a demanding summit.
 * Forks offer a narrow two-hop shortcut and a wider three-hop detour.
 * Steps narrow through each chapter and faster moving ledges require timed takeoffs.
 * Broad gathering platforms separate the technical sections. */
export const PLATFORMS: PlatformSpec[] = [
  platform('start', 'start', 480, 5200, 190),
  platform('p1', 'static', 570, 5130, 101),
  platform('p2', 'static', 680, 5060, 94),
  platform('p3', 'moving', 720, 4982, 86, { amplitude: 75, speed: 0.0253 }),
  platform('desk-plaza', 'static', 600, 4904, 180, { label: '01 · 통나무 숲' }),
  platform('desk-wide1', 'static', 460, 4844, 90, { label: '돌아가기 ←' }),
  platform('desk-short', 'static', 650, 4804, 41, { label: '↑ 지름길' }),
  platform('desk-wide2', 'static', 430, 4784, 90),
  platform('desk-merge', 'static', 540, 4724, 180),
  platform('desk-step1', 'static', 420, 4658, 72),
  platform('desk-step2', 'static', 310, 4592, 72),
  platform('trampoline1', 'trampoline', 240, 4514, 110, { launchTargetId: 'desk-landing' }),
  platform('desk-landing', 'static', 440, 4354, 155),
  platform('p6', 'moving', 560, 4276, 90, { amplitude: 85, speed: 0.0264, phase: 0.4 }),
  platform('desk-last', 'static', 680, 4198, 94),
  platform('desk-exit', 'static', 580, 4118, 122),
  platform('work-entry', 'static', 460, 4038, 108),
  platform('work-plaza', 'static', 350, 3958, 185, { label: '02 · 바위 능선' }),
  platform('work-lift1', 'moving', 280, 3880, 75, { amplitude: 100, speed: 0.0276, phase: 1.2 }),
  platform('work-rest', 'static', 410, 3802, 97),
  platform('work-wide1', 'static', 560, 3742, 81, { label: '돌아가기 →' }),
  platform('work-short', 'static', 350, 3702, 36, { label: '↑ 지름길' }),
  platform('work-wide2', 'static', 590, 3682, 81),
  platform('work-merge', 'static', 470, 3622, 190),
  platform('work-beam1', 'static', 600, 3548, 55),
  platform('work-beam2', 'static', 730, 3474, 52),
  platform('trampoline2', 'trampoline', 790, 3396, 110, { launchTargetId: 'work-landing' }),
  platform('work-landing', 'static', 580, 3236, 155),
  platform('work-lift2', 'moving', 440, 3158, 75, { amplitude: 100, speed: 0.0299, phase: 2.1 }),
  platform('work-beam3', 'static', 290, 3080, 61),
  platform('work-exit', 'static', 400, 3002, 113),
  platform('trampoline3', 'trampoline', 480, 2924, 120, { launchTargetId: 'sky-plaza' }),
  platform('sky-plaza', 'static', 680, 2764, 180, { label: '03 · 구름 하늘' }),
  platform('sky-step1', 'static', 790, 2686, 70),
  platform('sky-lift1', 'moving', 690, 2608, 70, { amplitude: 95, speed: 0.0287, phase: 0.8 }),
  platform('sky-rest', 'static', 550, 2530, 101),
  platform('sky-wide1', 'static', 400, 2470, 74, { label: '돌아가기 ←' }),
  platform('sky-short', 'static', 600, 2430, 32, { label: '↑ 지름길' }),
  platform('sky-wide2', 'static', 370, 2410, 74),
  platform('sky-merge', 'static', 490, 2350, 185),
  platform('sky-step2', 'static', 340, 2272, 61),
  platform('sky-lift2', 'moving', 250, 2194, 68, { amplitude: 90, speed: 0.0299, phase: 0.4 }),
  platform('sky-rest2', 'static', 380, 2116, 89),
  platform('trampoline4', 'trampoline', 480, 2038, 110, { launchTargetId: 'sky-landing' }),
  platform('sky-landing', 'static', 690, 1878, 155),
  platform('final-plaza', 'static', 790, 1800, 190, { label: '정상 구간으로 ↑' }),
  platform('final-step', 'static', 680, 1722, 86),
  platform('summit-entry', 'static', 570, 1644, 130, { label: '04 · 구름 정상' }),
  // Twenty more single-jump links: precision steps, moving pairs, then a final traverse.
  platform('summit-step1', 'static', 470, 1564, 62),
  platform('summit-lift1', 'moving', 360, 1484, 62, { amplitude: 70, speed: 0.034, phase: 0.6 }),
  platform('summit-lift2', 'moving', 260, 1404, 60, { amplitude: 75, speed: 0.037, phase: 2.2 }),
  platform('summit-step2', 'static', 360, 1324, 50),
  platform('summit-step3', 'static', 470, 1244, 46),
  platform('summit-rest1', 'static', 580, 1164, 100, { label: '구름 능선 →' }),
  platform('summit-lift3', 'moving', 690, 1084, 58, { amplitude: 80, speed: 0.036, phase: 1.3 }),
  platform('summit-step4', 'static', 790, 1004, 48),
  platform('summit-step5', 'static', 680, 924, 44),
  platform('summit-lift4', 'moving', 570, 844, 56, { amplitude: 75, speed: 0.038, phase: 2.8 }),
  platform('summit-lift5', 'moving', 460, 764, 56, { amplitude: 80, speed: 0.035, phase: 0.2 }),
  platform('summit-rest2', 'static', 350, 684, 100, { label: '마지막 능선' }),
  platform('summit-step6', 'static', 240, 604, 46),
  platform('summit-step7', 'static', 350, 524, 44),
  platform('summit-lift6', 'moving', 460, 444, 54, { amplitude: 70, speed: 0.039, phase: 1.8 }),
  platform('summit-step8', 'static', 570, 364, 44),
  platform('summit-lift7', 'moving', 680, 284, 54, { amplitude: 80, speed: 0.037, phase: 0.9 }),
  platform('summit-step9', 'static', 790, 204, 44),
  platform('summit-final', 'static', 680, 124, 42),
  platform('goal', 'goal', 570, 44, 100)
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
/** About 90 world units of unopposed horizontal travel, roughly twice the old shove. */
export const KNOCKBACK_VX = 8.2;
export const KNOCKBACK_VY = -4.6;
/** While stunned, held movement keys are ignored — the shove has to actually interrupt the runner. */
export const KNOCKBACK_STUN_TICKS = 16;
/** Per-tick decay on knockback drift, and the speed below which it's just rounded to a stop. */
export const KNOCKBACK_DECAY = 0.91;
export const KNOCKBACK_REST_SPEED = 0.05;

/* ------------------------------------------------------------- restart */

/** Distance below the whole course before returning to the start. */
export const RESPAWN_WORLD_MARGIN = 40;

/* -------------------------------------------------------------- match */

export const ROOM_CAPACITY = 6;
export const GRACE_MS = 15_000;
export const INTERMISSION_MS = 3_000;
