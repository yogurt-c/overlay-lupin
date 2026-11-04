/** 4×4 sliding board in the same 320×280 design space every overlay game draws into. */
export const SIZE = 4;
export const CELL = 46;
export const GAP = 5;
export const BOARD = SIZE * CELL + (SIZE + 1) * GAP;
export const BOARD_X = 100;
export const BOARD_Y = 32;

/** Tile `exp` holds the value 2^exp: 1 is 2, 11 is 2048. */
export const WIN_EXP = 11;
export const tileValue = (exp: number): number => 2 ** exp;

/** Ticks a tile spends sliding to its new cell; merged and new tiles appear once it lands. */
export const SLIDE_TICKS = 6;
/** Ticks of the landing pop on a merged tile. */
export const POP_TICKS = 16;
/** The result card waits for the last merge to land before it shows and takes input. */
export const PROMPT_DELAY = SLIDE_TICKS + POP_TICKS;

export type Dir = 'left' | 'right' | 'up' | 'down';

/**
 * Every field is a tap. Only keys other games already claim are used, so the
 * shared window listeners never start swallowing new letters in text fields.
 */
export interface SlideInput {
  left: boolean; right: boolean; up: boolean; down: boolean;
  /** Picks the highlighted button on a result card. */
  confirm: boolean;
  /** 끝내기 straight from a result card. */
  quit: boolean;
}
export const NO_INPUT: SlideInput = { left: false, right: false, up: false, down: false, confirm: false, quit: false };

/** 'won' asks 계속하기/끝내기 once 2048 appears; 'over' asks 다시하기/끝내기; 'ended' hands back to the shell. */
export type Phase = 'play' | 'won' | 'over' | 'ended';

export interface Tile {
  id: number;
  exp: number;
  row: number;
  col: number;
  /** Where the tile started its latest slide. */
  fromRow: number;
  fromCol: number;
  /** Tick it was spawned or created by a merge; it stays hidden until its slide lands. */
  born: number;
  merged: boolean;
}

/** A tile consumed by a merge, drawn sliding into the cell where it fused. */
export interface Ghost { exp: number; fromRow: number; fromCol: number; row: number; col: number; }

export interface MergeEvent { row: number; col: number; exp: number; gain: number; }
