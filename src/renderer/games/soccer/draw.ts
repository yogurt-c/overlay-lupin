import { GROUND_Y } from '../../lib/ballsport/field.js';
import { roughStroke } from '../../lib/sketch.js';
import type { Limbs } from '../../lib/ballsport/draw.js';
import { KICK_FOOT } from './field.js';
import type { Pose } from './types.js';

const CHEST_Y = -32;
const LEG_LENGTH = 11;
const ARM_LENGTH = 10;
/** How far below the shoulder a relaxed hand hangs. */
const ARM_DROP = 14;

/** Limb targets for each of soccer's poses, in feet-space with +x already meaning "forward". */
export function limbsFor(pose: string, anim: number): Limbs {
  const swing = Math.sin(anim);
  const lift = Math.cos(anim);

  switch (pose as Pose) {
    case 'run':
      return {
        legs: [
          [swing * LEG_LENGTH, -Math.max(0, lift) * 5],
          [-swing * LEG_LENGTH, -Math.max(0, -lift) * 5]
        ],
        hands: [
          [-swing * ARM_LENGTH, CHEST_Y + ARM_DROP - Math.abs(swing) * 3],
          [swing * ARM_LENGTH, CHEST_Y + ARM_DROP - Math.abs(swing) * 3]
        ],
        lean: 1.5
      };
    case 'jump':
      return {
        legs: [
          [9, -8],
          [-9, -3]
        ],
        hands: [
          [15, CHEST_Y - 2],
          [-14, CHEST_Y]
        ],
        lean: 0
      };
    case 'kick':
      return {
        legs: [
          [KICK_FOOT.x, KICK_FOOT.y],
          [-7, 0]
        ],
        hands: [
          [-15, CHEST_Y + 2],
          [12, CHEST_Y + 9]
        ],
        lean: -2
      };
    default: {
      const breathe = Math.sin(anim * 0.08) * 0.6;
      return {
        legs: [
          [5, 0],
          [-5, 0]
        ],
        hands: [
          [10, CHEST_Y + ARM_DROP - 2 + breathe],
          [-10, CHEST_Y + ARM_DROP - 2 + breathe]
        ],
        lean: 0
      };
    }
  }
}

const HALO = 'rgba(255,255,255,0.92)';

/** A hand-drawn goal: two uprights, a crossbar, and a light net hatch. */
export function drawGoal(
  ctx: CanvasRenderingContext2D,
  frontX: number,
  backX: number,
  height: number,
  color: string
): void {
  const top = GROUND_Y - height;
  const left = Math.min(frontX, backX);
  const right = Math.max(frontX, backX);

  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, right - left, height);
  ctx.clip();
  ctx.globalAlpha = 0.38;
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  for (let i = -height; i <= right - left; i += 8) {
    ctx.moveTo(left + i, top);
    ctx.lineTo(left + i + height, GROUND_Y);
  }
  for (let y = top; y <= GROUND_Y; y += 8) {
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
  }
  ctx.stroke();
  ctx.restore();

  roughStroke(ctx, frontX, GROUND_Y, frontX, top, 3, color, HALO);
  roughStroke(ctx, backX, GROUND_Y, backX, top, 2.2, color, HALO);
  roughStroke(ctx, frontX, top, backX, top, 3, color, HALO);
}
