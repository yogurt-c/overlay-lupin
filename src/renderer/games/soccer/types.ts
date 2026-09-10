/** Soccer's own in-match state shapes. Another game owns its own version of these. */

export type Pose = 'idle' | 'run' | 'jump' | 'kick';

export interface PlayerState {
  x: number;
  y: number;
  facing: 1 | -1;
  pose: Pose;
}

export interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
}

/** Phases of a single match, driven by the host and mirrored by the client. */
export type MatchPhase = 'kickoff' | 'play' | 'goal' | 'over';

/** The authoritative slice of the simulation: only the host produces this. */
export interface WorldState {
  ball: BallState;
  phase: MatchPhase;
  timer: number;
}

/** The packet exchanged over the network while a soccer match is live. */
export interface OpponentPacket {
  player: PlayerState;
  world?: WorldState;
  score: [number, number];
}
