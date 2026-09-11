import { GROUND_Y, CEILING_Y } from '../../lib/ballsport/field.js';
import { roughStroke } from '../../lib/sketch.js';
import type { Limbs } from '../../lib/ballsport/draw.js';
import { ACTIVE_FRAMES, DIVE_REACH, SPIKE_HAND } from './field.js';
import type { Pose } from './types.js';

const CHEST_Y = -32;
const LEG_LENGTH = 11;
const ARM_LENGTH = 10;
const ARM_DROP = 14;

function spikeLimbs(armX: number, armY: number, lean: number): Limbs {
  return {
    legs: [
      [9, -8],
      [-9, -3]
    ],
    hands: [
      [armX, armY],
      [-10, CHEST_Y + 4]
    ],
    lean
  };
}

/** Limb targets for each of volleyball's poses, in feet-space with +x already meaning "forward". */
export function limbsFor(pose: string, anim: number, actionTimer?: number): Limbs {
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
    case 'dive': {
      // Reach out over the commit window instead of snapping straight to full
      // extension: 0 at the trigger tick, 1 by the time the pose ends. Only
      // known for the locally-simulated figure — actionTimer isn't networked,
      // so the opponent's dive just holds at full reach the way it always did.
      const progress = actionTimer === undefined ? 1 : 1 - Math.min(1, actionTimer / ACTIVE_FRAMES);
      return {
        legs: [
          [-16, -1],
          [-10, 3]
        ],
        hands: [
          [DIVE_REACH.x, DIVE_REACH.y],
          [9, CHEST_Y + 10]
        ],
        lean: 4 + progress * 3,
        trail: actionTimer === undefined ? 0 : 1,
        // A quick flick right as the pose is about to end, not a lingering cloud.
        impact: actionTimer !== undefined && actionTimer <= 3 ? 1 - actionTimer / 3 : 0
      };
    }
    case 'spike':
      return spikeLimbs(SPIKE_HAND.x, SPIKE_HAND.y, -1);
    case 'spikeForward':
      return spikeLimbs(SPIKE_HAND.x + 5, SPIKE_HAND.y - 3, -3);
    case 'spikeDown':
      return spikeLimbs(SPIKE_HAND.x + 2, SPIKE_HAND.y + 12, -2);
    case 'spikeUp':
      return spikeLimbs(SPIKE_HAND.x - 2, SPIKE_HAND.y - 16, 2);
    case 'tip':
      return spikeLimbs(SPIKE_HAND.x - 9, SPIKE_HAND.y + 3, 3);
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

/** A hand-drawn net: a thin hatched band on a pole, only as tall as the net actually blocks. */
export function drawNet(ctx: CanvasRenderingContext2D, netX: number, height: number, color: string): void {
  const top = GROUND_Y - height;

  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  for (let y = top; y <= GROUND_Y; y += 7) {
    ctx.moveTo(netX - 6, y);
    ctx.lineTo(netX + 6, y);
  }
  for (let x = netX - 6; x <= netX + 6; x += 7) {
    ctx.moveTo(x, top);
    ctx.lineTo(x, GROUND_Y);
  }
  ctx.stroke();
  ctx.restore();

  roughStroke(ctx, netX, GROUND_Y, netX, top, 3, color, HALO);
}

/** A faint boundary line marking a side wall of the enclosed court. */
export function drawWall(ctx: CanvasRenderingContext2D, wallX: number, color: string): void {
  ctx.save();
  ctx.globalAlpha = 0.22;
  roughStroke(ctx, wallX, GROUND_Y, wallX, CEILING_Y, 2, color, HALO);
  ctx.restore();
}
