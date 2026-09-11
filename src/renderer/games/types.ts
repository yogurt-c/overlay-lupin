/**
 * The contract between the app shell (matching UI + frame loop) and one
 * game's own module. Deliberately thin: the shell only needs to drive ticks,
 * draw a frame, show some HUD text, and shuttle opaque packets over the
 * network — everything about what a "match" actually is belongs to the game.
 */

export interface Viewport {
  /** CSS pixel size of the canvas. */
  width: number;
  height: number;
  pixelRatio: number;
}

/** Text the shell renders chrome-side; the game decides what it means. */
export interface MatchHud {
  /** Persistent status line shown while a match is live (a scoreboard, a rank, ...). */
  status: string;
  /** Transient banner text; '' hides it. */
  banner: string;
  /** Opaque to the shell — forwarded as-is so the game's own CSS can style it. */
  bannerKind: string;
}

export interface GameMatch {
  /** Advances the simulation by exactly one fixed tick. */
  step(input: unknown): void;
  render(ctx: CanvasRenderingContext2D, viewport: Viewport, alpha: number): void;
  hud(): MatchHud;
  isOver(): boolean;
  /** Local state to send this tick — shape is private to this game. */
  buildOutgoingPacket(): unknown;
  applyOpponentPacket(packet: unknown): void;
  /** Room games only: another member disconnected — drop their entity instead of leaving a frozen ghost. */
  removePeer?(peerId: string): void;
}

export interface GameModule {
  id: string;
  label: string;
  /** Control hint shown in the matching panel while this game is selected. */
  hint: string;
  /**
   * 'duel' (default) is the existing 1:1 invite/accept flow. 'room' is a
   * host-created lobby that others free-join (including mid-session), with no
   * accept step — see `roomCapacity`.
   */
  matching?: 'duel' | 'room';
  /** Only meaningful for `matching: 'room'`. */
  roomCapacity?: number;
  /** `myId`/`myName` are this machine's network identity — only games that need to tell "me" apart in an N-player snapshot use them. */
  createMatch(isHost: boolean, myId: string, myName: string): GameMatch;
  /** Present only for games with a bot opponent — lets the matching panel offer "혼자하기" with no networking involved. */
  createSoloMatch?(myId: string, myName: string): GameMatch;
  createInputSource(target: Window): { read(): unknown; clear(): void };
}
