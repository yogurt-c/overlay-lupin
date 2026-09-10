/**
 * Wire types shared by every game, independent of genre: peer discovery only.
 * In-match packet shapes (player/ball state, scoring, ...) belong to each
 * game's own module instead — see `src/renderer/games/<game>/types.ts`.
 */
export interface PeerInfo {
  id: string;
  name: string;
  address: string;
}

/** One room advertised on the LAN — shown in the matching panel's room list. */
export interface RoomInfo {
  id: string;
  name: string;
  gameId: string;
  hostId: string;
  memberCount: number;
  capacity: number;
}

export interface RoomMember {
  id: string;
  name: string;
}

/** The full membership snapshot the host keeps every member's panel in sync with. */
export interface RoomRoster {
  id: string;
  name: string;
  gameId: string;
  hostId: string;
  capacity: number;
  members: RoomMember[];
  status: 'lobby' | 'playing';
}
