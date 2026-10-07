/**
 * The multiplayer wire for 뱀서.
 *
 * Two hundred enemies will never fit in a 1472-byte datagram, so none of them
 * travel. Instead every client runs the same engine from the same seed, and the
 * host broadcasts the only thing that can't be derived: what everyone pressed.
 * Same seed + same inputs + same order = same swarm on every screen.
 *
 * A frame is one tick's worth of input for every player, packed one number per
 * player. Each packet repeats the last `FRAME_WINDOW` frames, so a dropped
 * datagram repairs itself on the next one instead of stalling the run.
 */

import type { SurvivorInput } from './types.js';

/**
 * How many past frames ride along in every packet — the loss window.
 *
 * The shell sends twice per frame, so twenty frames is ten send intervals:
 * nine datagrams in a row can vanish before a hole becomes unfillable.
 */
export const FRAME_WINDOW = 20;
/** Room cap, used only to bound what a packet is allowed to claim. */
const MAX_PLAYERS = 8;

/** Input packed into one integer, so a frame of four players is four numbers. */
export function packInput(input: SurvivorInput): number {
  return (input.left ? 1 : 0)
    | (input.right ? 2 : 0)
    | (input.up ? 4 : 0)
    | (input.down ? 8 : 0)
    | (input.pick1 ? 16 : 0)
    | (input.pick2 ? 32 : 0)
    | (input.pick3 ? 64 : 0)
    | (input.skip ? 128 : 0);
}

/** The card-choice bits. These are taps, not holds — see `PICK_MASK` below. */
export const PICK_MASK = 16 | 32 | 64 | 128;

export function unpackInput(bits: number): SurvivorInput {
  return {
    left: (bits & 1) !== 0,
    right: (bits & 2) !== 0,
    up: (bits & 4) !== 0,
    down: (bits & 8) !== 0,
    pick1: (bits & 16) !== 0,
    pick2: (bits & 32) !== 0,
    pick3: (bits & 64) !== 0,
    skip: (bits & 128) !== 0
  };
}

/** What a member sends up: its own input, and its name until the host has it. */
export interface MemberPacket {
  t: 'svi';
  bits: number;
  name: string;
}

/** The authoritative body of one player, for the drift insurance. */
export type PlayerRow = [x: number, y: number, hp: number, alive: number];

export interface HostPacket {
  t: 'svf';
  /** Seed every client grows its own swarm from. */
  seed: number;
  /** Player order — every client must create players in exactly this order. */
  ids: string[];
  names: string[];
  /**
   * Index of the first frame in `frames`. Frames are counted, not timed: a
   * level-up pauses the simulation but still produces frames, so this number
   * and the engine's own tick deliberately drift apart.
   */
  base: number;
  /** One entry per tick; each entry is one packed input per id, in `ids` order. */
  frames: number[][];
  /** The host's own bodies at `base + frames.length - 1`. */
  bodies: PlayerRow[];
  /** The host's fingerprint after applying the last frame in this packet. */
  sum: number;
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export function validMemberPacket(packet: unknown): packet is MemberPacket {
  if (!packet || typeof packet !== 'object') return false;
  const p = packet as MemberPacket;
  return p.t === 'svi' && finite(p.bits) && p.bits >= 0 && p.bits <= 255 && typeof p.name === 'string';
}

export function validHostPacket(packet: unknown): packet is HostPacket {
  if (!packet || typeof packet !== 'object') return false;
  const p = packet as HostPacket;
  if (p.t !== 'svf' || !finite(p.seed) || !finite(p.base) || !finite(p.sum)) return false;
  if (!Array.isArray(p.ids) || p.ids.length === 0 || p.ids.length > MAX_PLAYERS) return false;
  if (!p.ids.every((id) => typeof id === 'string')) return false;
  if (!Array.isArray(p.names) || p.names.length !== p.ids.length) return false;
  if (!p.names.every((name) => typeof name === 'string')) return false;
  if (!Array.isArray(p.frames) || p.frames.length === 0 || p.frames.length > FRAME_WINDOW) return false;
  if (!p.frames.every((frame) =>
    Array.isArray(frame) && frame.length === p.ids.length &&
    frame.every((bits) => finite(bits) && bits >= 0 && bits <= 255))) return false;
  if (!Array.isArray(p.bodies) || p.bodies.length !== p.ids.length) return false;
  return p.bodies.every((row) => Array.isArray(row) && row.length === 4 && row.every(finite));
}

/**
 * Holds frames until they can be applied in order. A client never skips a tick:
 * the whole point is that it runs the same sequence the host did.
 */
export class FrameQueue {
  private frames = new Map<number, number[]>();
  /** The next tick this client still needs. */
  private next = 1;

  /** Remembers every frame in the packet that hasn't been consumed yet. */
  ingest(packet: HostPacket): void {
    packet.frames.forEach((frame, i) => {
      const tick = packet.base + i;
      if (tick >= this.next) this.frames.set(tick, frame);
    });
  }

  /** The next frame, or null when the client has caught up with what arrived. */
  take(): number[] | null {
    const frame = this.frames.get(this.next);
    if (!frame) return null;
    this.frames.delete(this.next);
    this.next += 1;
    return frame;
  }

  /** How far behind the host this client is, in ticks. */
  backlog(hostTick: number): number {
    return Math.max(0, hostTick - this.next + 1);
  }

  /**
   * A client that falls far enough behind — a long stall, a tab asleep —
   * can never catch up by stepping one tick per frame. Dropping to the newest
   * run of frames trades a visible jump for staying in the same match.
   */
  skipTo(tick: number): void {
    if (tick <= this.next) return;
    for (const held of [...this.frames.keys()]) if (held < tick) this.frames.delete(held);
    this.next = tick;
  }

  get nextTick(): number {
    return this.next;
  }
}
