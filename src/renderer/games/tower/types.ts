export type Side = 0 | 1;
export type Phase = 'aim' | 'fall' | 'over';
export interface TowerInput { left: boolean; right: boolean; rotate: boolean; rotateBack: boolean; drop: boolean; }
export interface AimCommand { seq: number; turn: number; x: number; angle: number; drop: boolean; }
/** Compact pose: array index is also the persistent animal id. Coordinates in world space. */
export type AnimalPose = [kind: number, owner: Side, x: number, y: number, angle: number];
export interface TowerWorld {
  tick: number;
  turn: number;
  side: Side;
  phase: Phase;
  kind: number;
  next: number;
  x: number;
  y: number;
  angle: number;
  score: number;
  loser: Side | null;
  complete: boolean;
  ack: number;
  bodies: AnimalPose[];
}
export const NO_INPUT: TowerInput = { left: false, right: false, rotate: false, rotateBack: false, drop: false };
export const PLATFORM_Y = 250;
export const PLATFORM_WIDTH = 112;
export const DROP_MIN_X = 40;
export const DROP_MAX_X = 280;
export const MAX_ANIMALS = 64;
