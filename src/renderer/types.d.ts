import type { PeerInfo, RoomInfo, RoomRoster } from '../shared/protocol.js';

export type { PeerInfo, RoomInfo, RoomRoster };

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

  /** Rooms open on the LAN right now, for any game — the panel filters by the selected game's id. */
  onRooms(cb: (rooms: RoomInfo[]) => void): void;
  /** Membership changed while still in the lobby (not yet playing). */
  onRoomRoster(cb: (roster: RoomRoster) => void): void;
  /** Fires exactly once per room per client: on explicit start, or immediately on joining a room already playing. */
  onRoomStarted(cb: (isHost: boolean, gameId: string) => void): void;
  onRoomLost(cb: (reason: 'closed' | 'left' | 'timeout') => void): void;
  /** Host-only: another member's own packet, tagged with who sent it. */
  onRoomMemberState(cb: (fromId: string, payload: unknown) => void): void;
  /** Member-only: the host's authoritative world snapshot. */
  onRoomWorld(cb: (payload: unknown) => void): void;
  /** Host-only: a member left or disconnected — the game should drop their entity. */
  onRoomMemberLeft(cb: (peerId: string) => void): void;
  createRoom(gameId: string, capacity?: number): void;
  joinRoom(roomId: string): void;
  leaveRoom(): void;
  startRoom(): void;
  sendRoomState(payload: unknown): void;

  quit(): void;
}

declare global {
  interface Window {
    overlayLupin: OverlayLupinApi;
  }
}
