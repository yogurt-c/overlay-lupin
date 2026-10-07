/** World layout in the same 320×280 design space every overlay game draws into. */
export const BOX_LEFT = 80;
export const BOX_RIGHT = 240;
export const BOX_BOTTOM = 262;
/** Walls are drawn up to here; the danger line sits lower. */
export const BOX_TOP = 50;
/** An animal resting above this line for too long ends the run. */
export const DANGER_Y = 80;
/** Where the held animal hangs before it is dropped. */
export const DROP_Y = 34;

/** Evolution order. The last one, merged with its twin, vanishes for a bonus. */
export const ANIMAL_NAMES = ['콩벌레', '고슴도치', '다람쥐', '토끼', '고양이', '펭귄', '강아지', '양', '판다', '곰', '코끼리'] as const;
export const RADII = [9, 11.5, 14, 16.5, 19.5, 23, 27, 31, 35.5, 40, 46] as const;
export const LAST_KIND = RADII.length - 1;
/** Only the five smallest are ever handed to the player. */
export const SPAWN_KINDS = 5;

/** Points for creating a kind: triangular numbers, as in the original. */
export const mergeScore = (kind: number): number => (kind + 1) * (kind + 2) / 2;
/** Two of the largest animal pop instead of growing. */
export const FINALE_SCORE = 100;

export interface MergeInput { left: boolean; right: boolean; drop: boolean; }
export const NO_INPUT: MergeInput = { left: false, right: false, drop: false };

export type Phase = 'aim' | 'cooldown' | 'over';

/** [kind, x, y, angle, ageTicks] — age drives the pop-in scale after a merge. */
export type BallPose = [kind: number, x: number, y: number, angle: number, age: number];

export interface MergeWorld {
  tick: number;
  phase: Phase;
  /** Animal in hand and the one after it. */
  kind: number;
  next: number;
  x: number;
  score: number;
  /** 0..1 — how close the longest stay above the danger line is to ending the run. */
  danger: number;
  balls: BallPose[];
}
