import { WORLD_WIDTH } from '../../lib/ballsport/field.js';

/**
 * Dojo geometry and the frame data that makes up the whole game. Every number
 * here is per 1/60s tick, like the rest of the app.
 *
 * The dojo sits at the centre of the shared arena and is deliberately narrower
 * than the volleyball court: there is nowhere to run, so distance has to be
 * won rather than escaped.
 */
export const DOJO_X = WORLD_WIDTH / 2;
export const DOJO_HALF = 110;
export const WALL_LEFT = DOJO_X - DOJO_HALF;
export const WALL_RIGHT = DOJO_X + DOJO_HALF;

/** How far from the centre each fencer stands when a round starts. */
export const START_GAP = 60;

export type AttackKind = 'slash' | 'slashLow' | 'thrust' | 'plunge';

/** Frames spent telegraphing, before the blade means anything. */
export const WINDUP: Record<AttackKind, number> = {
  slash: 6,
  slashLow: 8,
  thrust: 11,
  plunge: 7
};

/** Frames the blade is live and can cut. */
export const ACTIVE: Record<AttackKind, number> = {
  slash: 5,
  slashLow: 5,
  thrust: 4,
  plunge: 8
};

/** Frames of helplessness after the swing — the punish window. */
export const RECOVER: Record<AttackKind, number> = {
  slash: 12,
  slashLow: 16,
  thrust: 22,
  plunge: 14
};

/** A parried attacker is locked out for longer than any recovery — blocking's only reward. */
export const STAGGER_FRAMES = 24;
/** How long a clash or cut mark stays on screen. */
export const FX_LIFE = 22;
/** How long the blocker's deflection reads on screen. */
export const CLASH_FRAMES = 8;
/** Frames the guard takes to actually cover, and to come down again. */
export const GUARD_RAISE_FRAMES = 2;
export const GUARD_DROP_FRAMES = 4;
/** Guarding is not free movement. */
export const GUARD_MOVE_SCALE = 0.55;

/** The one countdown in the match: both fencers square up, then it runs until someone falls. */
export const KICKOFF_FRAMES = 120;
export const OVER_FRAMES = 240;

/**
 * Being cut costs a life and half a second of reeling, not a restart — the
 * fight never stops. The victim is untouchable while they reel, so a single
 * flurry can't take more than one life.
 */
export const HIT_STUN_FRAMES = 34;
/** Impulse thrown into the victim, which is what re-opens the distance now that nobody is repositioned. */
export const KNOCKBACK = 3.4;
/** How long "명중" / "피격" stays on the banner. */
export const FLASH_FRAMES = 40;

export const LIVES = 5;

/** Movement is heavier than soccer's: a fencer carries a sword, not a ball. */
export const GRAVITY = 0.52;
export const JUMP_VELOCITY = -7.9;
export const MOVE_ACCEL = 0.9;
export const MOVE_MAX_FORWARD = 2.6;
export const MOVE_MAX_BACK = 1.7;
export const GROUND_DRAG = 0.7;
export const AIR_DRAG = 0.95;
export const AIR_CONTROL = 0.5;
export const SHOVE_STRENGTH = 0.45;
/** Downward kick given to an aerial attack, so it commits instead of floating. */
export const PLUNGE_DIVE = 3.2;
