import type { Figure } from './ball.js';
import type { BallState } from './ball.js';
import type { Input } from './engine.js';

/** A body part a game can put "in play" for the current tick (a kick foot, a dive reach, ...). */
export interface ActivePartSpec {
  /** Offset from the figure's feet, before `facing` is applied to x. */
  anchor: { x: number; y: number; r: number };
  bounce: number;
  push: number;
  /** Present only for parts that redirect the ball outright, like a shot — absent means a normal bounce. */
  shot?: {
    power: number;
    lift: number;
    spin: number;
    /** Overrides the figure's own `facing` for which way the shot goes — for games where a shot must always aim at a fixed side (a net) regardless of which way the player happens to be facing. */
    dir?: 1 | -1;
  };
}

/** A figure the engine is stepping — same shape as ball.ts's Figure, plus per-tick action bookkeeping. */
export interface RuleActor extends Figure {
  /** Opaque to the engine — each game defines its own pose vocabulary. */
  pose: string;
  actionTimer: number;
  actionCooldown: number;
  activePart?: ActivePartSpec;
}

/**
 * Everything that differs between games sharing this engine. The `Game`
 * engine owns movement, gravity, remote interpolation, ball flight, and
 * scorekeeping bookkeeping; a `GameRules` only decides the game-specific
 * shape of each of those.
 */
export interface GameRules {
  id: string;

  /** Where each side's figure starts, and where the ball is parked before play begins. */
  resetPositions(mySide: 1 | -1): {
    localX: number;
    localY: number;
    remoteX: number;
    remoteY: number;
    ballX: number;
    ballY: number;
    ballR: number;
  };

  /** The local player's allowed x range this tick. */
  bounds(mySide: 1 | -1): { min: number; max: number };

  /**
   * Owns `p.pose` entirely for the local player: updates action timers, sets
   * `p.pose` to `defaultPose` when no action is in progress or to whatever
   * this game's action poses are otherwise (locking in a choice made at the
   * moment the button was first pressed, if a game has more than one action
   * pose), and returns this tick's active body part (if any). `side` is which
   * half of a divided court this actor is anchored to, for games where a shot
   * direction must be absolute (toward the opponent) rather than relative to
   * `p.facing`.
   */
  stepAction(p: RuleActor, input: Input, side: 1 | -1, defaultPose: string): ActivePartSpec | undefined;

  /** Derives the active body part for a figure the engine doesn't control directly (the remote player), from its last known pose. */
  activePartFor(pose: string, facing: 1 | -1, side: 1 | -1): ActivePartSpec | undefined;

  /** Runs every tick during play, before the round is resolved — a net or a wall, for instance. No-op if the game has none. */
  stepBallExtra?(ball: BallState): void;

  /** Checked every tick during play; returns the scorer, or null if nothing happened. May mutate the ball (e.g. bounce off a post). */
  resolveRound(ball: BallState): 0 | 1 | null;

  /** Runs instead of resolveRound while celebrating a score, so the ball can settle instead of staying live. */
  settleBall?(ball: BallState): void;

  /** Draws this game's field decorations (goal posts, a net, ...). */
  drawField(ctx: CanvasRenderingContext2D, cameraX: number, viewWidth: number): void;
}
