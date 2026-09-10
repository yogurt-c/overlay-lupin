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
  alive: boolean;
  kills: number;
  /** 0–100 while charging, 0 otherwise — drives the power gauge and the lean. */
  charge: number;
  pose: Pose;
  respawnInMs?: number;
}

export interface ShellView {
  x: number;
  y: number;
  /** Index of the firing worm within `WormWorld.worms` — an index rather than an
   *  id because a UUID per shell would cost more than the rest of the packet. */
  o: number;
}

/** One hole punched in the ground, replayed by members to keep their terrain in step. */
export interface CraterEvent {
  seq: number;
  x: number;
  y: number;
  r: number;
}

/** The host's authoritative snapshot, broadcast to every member each tick. */
export interface WormWorld {
  /** Members grow the whole map from this rather than receiving a heightmap. */
  seed: number;
  phase: 'play' | 'over';
  worms: WormView[];
  shells: ShellView[];
  /** A sliding window of the most recent craters, re-sent every tick so UDP loss self-heals. */
  craters: CraterEvent[];
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
