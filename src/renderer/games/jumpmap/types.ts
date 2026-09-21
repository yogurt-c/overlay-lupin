/** 점프맵's own in-match state shapes. Opaque to the shell and the network layer. */

export type Phase = 'race' | 'grace' | 'intermission';

export type Pose = 'idle' | 'move' | 'jump' | 'fall' | 'hit' | 'finish';

/** Wire order for poses. Append only. */
export const POSE_ORDER: Pose[] = ['idle', 'move', 'jump', 'fall', 'hit', 'finish'];

export function poseIndex(pose: Pose): number {
  return POSE_ORDER.indexOf(pose);
}

export function poseAt(index: number): Pose {
  return POSE_ORDER[index] ?? 'idle';
}

export interface JumpmapInput {
  left: boolean;
  right: boolean;
  jump: boolean;
  /** Held to fast-fall while airborne. */
  down: boolean;
  /** A short-range shove — the only thing in this game that can end a run early. */
  attack: boolean;
}

/** The host's authoritative view of one runner, broadcast every tick. */
export interface PlayerView {
  id: string;
  x: number;
  y: number;
  facing: 1 | -1;
  /** POSE_ORDER index. */
  p: number;
  /** The order this runner touched the goal in this round; absent until they do. */
  finish?: number;
  /** Frames left in the shove swing's visual, omitted when there isn't one. */
  atk?: number;
  /** Short-lived authoritative landing event, also used for spring and finish effects. */
  impact?: { platformId: string; x: number; tick: number };
}

export interface JumpmapWorld {
  phase: Phase;
  /** ms left in the grace or intermission countdown; 0 during a plain race. */
  timerMs: number;
  /**
   * The host's tick counter — broadcast so every member can compute a moving
   * platform's position with the exact same formula the host used for
   * collision, instead of the host having to spell out every platform's
   * coordinates every tick.
   */
  tick: number;
  players: PlayerView[];
}

/** What a member sends the host each tick — intent only, plus enough to spawn them. */
export interface JumpmapMemberPacket {
  name: string;
  input: JumpmapInput;
}

/** The shell tags an incoming member packet with who sent it. */
export interface JumpmapMemberPacketTagged extends JumpmapMemberPacket {
  from: string;
}
