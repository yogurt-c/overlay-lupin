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
