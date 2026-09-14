/** Cell-growing's own in-match state shapes. Another game owns its own version of these. */

export interface CellInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  /** Space bar — splits every eligible cell in half, launching the new half forward. */
  split: boolean;
}

export interface FoodDot {
  x: number;
  y: number;
  /** A rare, high-value pellet spawned periodically instead of the ambient food. */
  big?: boolean;
}

/** A static hazard scattered around the arena — pops any big enough cell that touches it. */
export interface VirusDot {
  id: string;
  x: number;
  y: number;
}

/** One blob of mass on the field. A player owns one of these normally, more right after a split or a virus pop. */
export interface CellBlob {
  id: string;
  x: number;
  y: number;
  mass: number;
}

export interface CellPlayer {
  id: string;
  name: string;
  /** Every blob this player currently owns. Empty only for the instant between all-eaten and respawn. */
  cells: CellBlob[];
  /** false while waiting out the respawn delay after every one of this player's cells has been eaten. */
  alive: boolean;
  /** Only present while `alive` is false — how much longer until respawn. */
  respawnInMs?: number;
}

/** The host's authoritative simulation, broadcast to every member each tick. */
export interface CellWorld {
  players: CellPlayer[];
  food: FoodDot[];
  viruses: VirusDot[];
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
