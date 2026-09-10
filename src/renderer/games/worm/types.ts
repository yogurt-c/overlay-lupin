/** 지렁포's own in-match state shapes. Opaque to the shell and the network layer. */

export type Pose = 'idle' | 'move' | 'jump' | 'charge' | 'hit' | 'down' | 'taunt';

export interface WormInput {
  left: boolean;
  right: boolean;
  aimUp: boolean;
  aimDown: boolean;
  jump: boolean;
  /** True while the fire key is held — the host turns held/released into charge/launch. */
  fire: boolean;
}

export interface WormView {
  id: string;
  x: number;
  y: number;
  /** Barrel elevation in degrees, always measured up from horizontal. */
  aim: number;
  facing: 1 | -1;
  hp: number;
  kills: number;
  /** 0–100 while charging, 0 otherwise — drives the power gauge and the lean. */
  charge: number;
  /** POSE_ORDER index. */
  p: number;
  /** Milliseconds until respawn. Present *only* while down, so it doubles as the alive flag. */
  d?: number;
  /** Held weapon as a WEAPON_ORDER index. Omitted while on the default weapon. */
  w?: number;
  /** Rounds left in that weapon. Omitted when there is nothing to count. */
  a?: number;
  /** Shield frames left. Omitted when unshielded. */
  s?: number;
}

export interface ShellView {
  x: number;
  y: number;
  /** Index of the firing worm within `WormWorld.worms` — an index rather than an
   *  id because a UUID per shell would cost more than the rest of the packet. */
  o: number;
  /** Weapon that fired it, as a WEAPON_ORDER index. */
  w: number;
}

/** Wire order for poses. Append only. */
export const POSE_ORDER: Pose[] = ['idle', 'move', 'jump', 'charge', 'hit', 'down', 'taunt'];

export function poseIndex(pose: Pose): number {
  return POSE_ORDER.indexOf(pose);
}

export function poseAt(index: number): Pose {
  return POSE_ORDER[index] ?? 'idle';
}

/** One hole punched in the ground, replayed by members to keep their terrain in step. */
export interface CraterEvent {
  seq: number;
  x: number;
  y: number;
  r: number;
}

/** The host's authoritative snapshot, broadcast to every member each tick. */
export interface ItemView {
  /** ITEM_ORDER index. */
  k: number;
  x: number;
  y: number;
}

export interface WormWorld {
  /** Members grow the whole map from this rather than receiving a heightmap. */
  seed: number;
  phase: 'play' | 'over';
  worms: WormView[];
  /**
   * Shells flattened to [x, y, ownerIndex, weaponIndex, ...]. A shotgun volley
   * from six worms is a lot of shells, and dropping the JSON keys is what keeps
   * the worst-case snapshot inside a single Ethernet frame. Use `decodeShells`.
   */
  shells: number[];
  /** Flattened to [kindIndex, x, y, ...]. */
  items: number[];
  /** A sliding window of the most recent craters, flattened to [seq, x, y, r, ...] and
   *  re-sent every tick so UDP loss self-heals. Use `decodeCraters`. */
  craters: number[];
  winnerId: string | null;
}

/** What a member sends the host each tick — intent only, plus enough to spawn them. */
export interface WormMemberPacket {
  name: string;
  input: WormInput;
}

/** The shell tags an incoming member packet with who sent it. */
export interface WormMemberPacketTagged extends WormMemberPacket {
  from: string;
}

/** Unpacks the flattened crater array back into something readable. */
export function decodeCraters(flat: number[]): CraterEvent[] {
  const out: CraterEvent[] = [];
  for (let i = 0; i + 3 < flat.length; i += 4) {
    out.push({ seq: flat[i], x: flat[i + 1], y: flat[i + 2], r: flat[i + 3] });
  }
  return out;
}

/** Unpacks the flattened item array. */
export function decodeItems(flat: number[]): ItemView[] {
  const out: ItemView[] = [];
  for (let i = 0; i + 2 < flat.length; i += 3) {
    out.push({ k: flat[i], x: flat[i + 1], y: flat[i + 2] });
  }
  return out;
}

/** Unpacks the flattened shell array back into something readable. */
export function decodeShells(flat: number[]): ShellView[] {
  const out: ShellView[] = [];
  for (let i = 0; i + 3 < flat.length; i += 4) {
    out.push({ x: flat[i], y: flat[i + 1], o: flat[i + 2], w: flat[i + 3] });
  }
  return out;
}
