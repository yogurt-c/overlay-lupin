/** Cell-growing's own in-match state shapes. Another game owns its own version of these. */

export interface CellInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  /** Space bar — trades mass for a speed burst. */
  boost: boolean;
}

export interface FoodDot {
  x: number;
  y: number;
  /** A rare, high-value pellet spawned periodically instead of the ambient food. */
  big?: boolean;
}

export interface CellPlayer {
  id: string;
  name: string;
  x: number;
  y: number;
  mass: number;
  /** false while waiting out the respawn delay after being eaten. */
  alive: boolean;
  /** Only present while `alive` is false — how much longer until respawn. */
  respawnInMs?: number;
}

/** The host's authoritative simulation, broadcast to every member each tick. */
export interface CellWorld {
  players: CellPlayer[];
  food: FoodDot[];
}

/** What a member sends the host each tick — just their own intent, plus enough to lazily spawn them. */
export interface CellMemberPacket {
  name: string;
  input: CellInput;
}

/** The shell tags an incoming member packet with who sent it before handing it to the host's match. */
export interface CellMemberPacketTagged extends CellMemberPacket {
  from: string;
}
