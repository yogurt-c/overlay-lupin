/**
 * Arena geometry shared by every "two figures + one ball" game, and by the
 * simulation and the renderer alike. Everything lives in one fixed logical
 * space so the two clients agree on the game regardless of how each of them
 * sized its own window. The renderer maps a camera-sized slice of this space
 * onto the real canvas at draw time.
 *
 * Vertical convention: `y` is measured from the ground line and grows
 * downward, so `y === 0` is standing on the ground and negative values are in
 * the air. The renderer adds GROUND_Y to get a canvas coordinate.
 */

/** The arena is far wider than the camera: a game can use as much or as little of it as it wants. */
export const WORLD_WIDTH = 1400;
export const LOGICAL_HEIGHT = 216;
export const GROUND_MARGIN = 22;
export const GROUND_Y = LOGICAL_HEIGHT - GROUND_MARGIN;

/** Highest the ball is allowed to fly, relative to the ground line. */
export const CEILING_Y = -(GROUND_Y - 6);

/** A game that doesn't care to pick its own ball size can use this. */
export const DEFAULT_BALL_RADIUS = 9;

/** Half-width of a player's footprint, used for pitch bounds and shoving. */
export const PLAYER_HALF = 13;

/**
 * The figure is approximated for collision by three circles anchored to the
 * feet. The head is deliberately oversized — heading is the primary way to
 * move the ball in every game sharing this engine, so it needs to be the
 * biggest target on the body.
 */
export const HEAD = { y: -44, r: 11 };
export const TORSO = { y: -25, r: 8 };
export const LEGS = { y: -9, r: 8 };

/** Total figure height, for shadow sizing and layout sanity checks. */
export const FIGURE_HEIGHT = -(HEAD.y - HEAD.r);
