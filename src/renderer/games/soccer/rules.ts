import type { Figure } from './ball.js';
import type { BallState, Pose } from './types.js';
import type { Input } from './engine.js';

/** A body part a game can put "in play" for the current tick (a kick foot, a dive reach, ...). */
export interface ActivePartSpec {
  /** Offset from the figure's feet, before `facing` is applied to x. */
  anchor: { x: number; y: number; r: number };
  bounce: number;
  push: number;
  /** Present only for parts that redirect the ball outright, like a shot — absent means a normal bounce. */
  shot?: { power: number; lift: number; spin: number };
}

/** A figure the engine is stepping — same shape as ball.ts's Figure, plus per-tick action bookkeeping. */
export interface RuleActor extends Figure {
  pose: Pose;
  actionTimer: number;
  actionCooldown: number;
  activePart?: ActivePartSpec;
}

/**
 * Everything that differs between games. The `Game` engine owns movement,
 * gravity, remote interpolation, ball flight, and scorekeeping bookkeeping;
 * a `GameRules` only decides the game-specific shape of each of those.
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
  };

  /** The local player's allowed x range this tick. */
  bounds(mySide: 1 | -1): { min: number; max: number };

  /** Handles the action button: updates timers, may set `p.pose`, and returns this tick's active body part (if any). */
  stepAction(p: RuleActor, input: Input): ActivePartSpec | undefined;

  /** Derives the active body part for a figure the engine doesn't control directly (the remote player), from its last known pose. */
  activePartFor(pose: Pose, facing: 1 | -1): ActivePartSpec | undefined;

  /** Checked every tick during play; returns the scorer, or null if nothing happened. May mutate the ball (e.g. bounce off a post). */
  resolveRound(ball: BallState): 0 | 1 | null;

  /** Runs instead of resolveRound while celebrating a score, so the ball can settle instead of staying live. */
  settleBall?(ball: BallState): void;

  /** Draws this game's field decorations (goal posts, a net, ...). */
  drawField(ctx: CanvasRenderingContext2D, cameraX: number, viewWidth: number): void;
}
