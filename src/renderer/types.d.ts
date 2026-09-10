import type { PeerInfo } from '../shared/protocol.js';

export type { PeerInfo };

export interface OverlayLupinApi {
  whoAmI(): Promise<{ id: string; name: string }>;
  onPeers(cb: (peers: PeerInfo[]) => void): void;
  onInviteSent(cb: (peer: PeerInfo) => void): void;
  onInviteReceived(cb: (peer: PeerInfo) => void): void;
  onInviteCleared(cb: (reason: 'declined' | 'cancelled' | 'timeout') => void): void;
  /** `gameId` is whatever the inviter had selected — both sides start the same game. */
  onMatchFound(cb: (peer: PeerInfo, isHost: boolean, gameId: string) => void): void;
  onMatchLost(cb: (reason: 'left' | 'timeout') => void): void;
  /** Packet shape is private to the active game; the shell only relays it. */
  onOpponentState(cb: (packet: unknown) => void): void;
  invite(peerId: string, gameId: string): void;
  cancelInvite(): void;
  acceptInvite(peerId: string): void;
  declineInvite(peerId: string): void;
  leaveMatch(): void;
  sendLocalState(packet: unknown): void;
  quit(): void;
}

declare global {
  interface Window {
    overlayLupin: OverlayLupinApi;
  }
}
