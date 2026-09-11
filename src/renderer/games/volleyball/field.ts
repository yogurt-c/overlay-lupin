import { WORLD_WIDTH } from '../../lib/ballsport/field.js';

/** The net sits at the centre of the shared arena; the court itself is much narrower than soccer's pitch. */
export const NET_X = WORLD_WIDTH / 2;
export const NET_HEIGHT = 54;

/** How close to the net a player's feet may get — keeps them from standing inside the net line. */
export const NET_GAP = 20;
/**
 * Half the playable court width on either side of the net. Wider than the
 * camera's 320px view, so the camera now tracks the ball/player across it
 * instead of holding the whole court in one static shot — the old 150 kept
 * every dive clamped against the net gap or the side wall well short of its
 * own reach, masking any change to dive distance.
 */
const COURT_HALF = 180;

export const WALL_LEFT = NET_X - COURT_HALF;
export const WALL_RIGHT = NET_X + COURT_HALF;

/** Bigger and more visible than soccer's ball — easier to read, easier to hit. */
export const BALL_RADIUS = 13;

/** How far off dead-centre a serve is allowed to drop, so kickoffs aren't perfectly identical every time. */
export const SERVE_JITTER = 30;

/**
 * Reach extended by a dive — the one and only way to reach for the ball,
 * whether the figure is grounded or still falling from a jump. Forward and
 * low relative to the feet; a bit short on purpose, so it's a quick poke
 * rather than a committed cross-court lunge.
 */
export const DIVE_REACH = { x: 20, y: -6, r: 11 };

/**
 * Commit window for the dive pose — how long it (and its active body part)
 * stays live once triggered. Lives here rather than in ruleset.ts so draw.ts
 * can read it too, without draw.ts and ruleset.ts importing each other.
 */
export const ACTIVE_FRAMES = 9;
