export const SIZE = 15;
export const CELLS = SIZE * SIZE;
export type Side = 0 | 1;
export type Stone = 1 | 2;
export type Difficulty = 'easy' | 'normal' | 'hard';
export type Result = 0 | Stone | 3;
export interface World {
  id: string;
  round: number;
  revision: number;
  board: number[];
  black: Side;
  turn: number;
  last: number;
  result: Result;
  reason: 'line' | 'draw' | 'resign' | '';
  line: number[];
  ready: [boolean, boolean];
  ack: [number, number];
}
export interface Command {
  id: string;
  round: number;
  seq: number;
  turn: number;
  kind: 'place' | 'rematch' | 'resign';
  cell: number;
}
export interface GomokuInput { left: boolean; right: boolean; up: boolean; down: boolean; place: boolean }
export const NO_INPUT: GomokuInput = { left: false, right: false, up: false, down: false, place: false };
export const stoneFor = (w: World, side: Side): Stone => w.black === side ? 1 : 2;
export const turnStone = (w: World): Stone => w.turn % 2 === 0 ? 1 : 2;
