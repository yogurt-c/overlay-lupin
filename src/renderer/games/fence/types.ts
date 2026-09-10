/** Fencing's own in-match state shapes. Another game owns its own version of these. */

/**
 * The pose vocabulary. Unlike the ball games, the pose is not just a drawing:
 * it is the whole contract between the two machines. A blade only cuts during
 * the four `ACTIVE_POSES`, so the opponent's pose alone tells us whether their
 * sword is live — no frame counter needs to travel over the network.
 */
export type Pose =
  | 'idle'
  | 'walk'
  | 'back'
  | 'jump'
  | 'windup'
  | 'slash'
  | 'after'
  | 'windupLow'
  | 'slashLow'
  | 'afterLow'
  | 'windupThrust'
  | 'thrust'
  | 'plunge'
  | 'guardHigh'
  | 'guardLow'
  | 'clash'
  | 'stagger'
  | 'hit';

/** The poses whose blade can cut. Everything else is a drawing. */
export const ACTIVE_POSES: ReadonlySet<Pose> = new Set<Pose>(['slash', 'slashLow', 'thrust', 'plunge']);

export interface FenceInput {
  left: boolean;
  right: boolean;
  jump: boolean;
  down: boolean;
  action: boolean;
  guard: boolean;
}

/** Same names as the ball games' phases, so the shell's existing banner CSS applies unchanged. */
export type FencePhase = 'kickoff' | 'play' | 'goal' | 'over';

export interface FencerState {
  x: number;
  y: number;
  facing: 1 | -1;
  pose: Pose;
}

/**
 * What one machine sends each tick.
 *
 * `hits` and `parries` are cumulative counters rather than one-shot events on
 * purpose: the shell sends at 30Hz while the simulation runs at 60Hz, so an
 * event flag set on a single tick would sometimes never be sent at all. A
 * counter is also idempotent — a resent or dropped packet can't score twice.
 *
 * The score is not sent. Each side counts only the cuts landed on *itself*,
 * so both machines derive the same scoreboard from the two counters.
 */
export interface FencePacket {
  player: FencerState;
  /** How many times this fencer has been cut, all match. */
  hits: number;
  /** How many attacks this fencer has blocked, all match. */
  parries: number;
  /** Host only — the client mirrors the round clock instead of running its own. */
  world?: { phase: FencePhase; timer: number };
}
