/**
 * Volleyball's own pose vocabulary — opaque to the shared engine, meaningful
 * only to this game's own rules/draw code. One action pose only: diving is
 * the single way to reach for the ball, on the ground or in the air alike —
 * there's no separate "spike" pose anymore.
 */
export type Pose = 'idle' | 'run' | 'jump' | 'dive';
