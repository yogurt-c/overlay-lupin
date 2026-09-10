export interface PeerInfo {
  id: string;
  name: string;
  address: string;
}

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

export interface OpponentPacket {
  player: PlayerState;
  world?: WorldState;
  score: [number, number];
}

export interface OverlayLupinApi {
  whoAmI(): Promise<{ id: string; name: string }>;
  onPeers(cb: (peers: PeerInfo[]) => void): void;
  onInviteSent(cb: (peer: PeerInfo) => void): void;
  onInviteReceived(cb: (peer: PeerInfo) => void): void;
  onInviteCleared(cb: (reason: 'declined' | 'cancelled' | 'timeout') => void): void;
  onMatchFound(cb: (peer: PeerInfo, isHost: boolean) => void): void;
  onMatchLost(cb: (reason: 'left' | 'timeout') => void): void;
  onOpponentState(cb: (packet: OpponentPacket) => void): void;
  invite(peerId: string): void;
  cancelInvite(): void;
  acceptInvite(peerId: string): void;
  declineInvite(peerId: string): void;
  leaveMatch(): void;
  sendLocalState(player: PlayerState, world: WorldState | undefined, score: [number, number]): void;
  quit(): void;
}

declare global {
  interface Window {
    overlayLupin: OverlayLupinApi;
  }
}
