import type { Limbs } from '../../lib/ballsport/draw.js';
import type { Pose } from './types.js';

/**
 * Every pose's limb and blade geometry, in feet-space with +x already meaning
 * "forward". This table is shared by the renderer and by the simulation: hit
 * detection measures the very same blade the player can see, so reach is never
 * a hidden number that disagrees with the drawing.
 */

const LEG_LENGTH = 9;

/** Above this height a cut counts as "high" and only a high guard covers it. */
export const GUARD_SPLIT = -22;

function stance(anim: number): Limbs {
  const breathe = Math.sin(anim * 0.06) * 0.7;
  return {
    legs: [
      [6, 0],
      [-7, 0]
    ],
    hands: [
      [12, -30 + breathe],
      [3, -25]
    ],
    lean: 0,
    blade: [
      [12, -30],
      [32, -45]
    ]
  };
}

function stepping(anim: number, lean: number): Limbs {
  const swing = Math.sin(anim);
  const lift = Math.cos(anim);
  return {
    legs: [
      [swing * LEG_LENGTH, -Math.max(0, lift) * 4],
      [-swing * LEG_LENGTH, -Math.max(0, -lift) * 4]
    ],
    hands: [
      [11, -29],
      [2, -24]
    ],
    lean,
    blade: [
      [11, -29],
      [31, -43]
    ]
  };
}

export function limbsFor(pose: string, anim: number): Limbs {
  switch (pose as Pose) {
    case 'walk':
      return stepping(anim, 1.5);
    case 'back':
      return stepping(anim, -1.5);

    case 'jump':
      return {
        legs: [
          [8, -8],
          [-9, -3]
        ],
        hands: [
          [10, -34],
          [0, -26]
        ],
        lean: 0,
        blade: [
          [10, -34],
          [26, -50]
        ]
      };

    case 'windup':
      return {
        legs: [
          [7, -1],
          [-8, 0]
        ],
        hands: [
          [-2, -48],
          [-8, -40]
        ],
        lean: -2,
        blade: [
          [-2, -48],
          [-21, -60]
        ]
      };
    case 'slash':
      return {
        legs: [
          [11, -2],
          [-9, 0]
        ],
        hands: [
          [16, -34],
          [4, -30]
        ],
        lean: 2,
        blade: [
          [16, -34],
          [39, -27]
        ]
      };
    case 'after':
      return {
        legs: [
          [9, -1],
          [-8, 0]
        ],
        hands: [
          [14, -22],
          [2, -26]
        ],
        lean: 3,
        blade: [
          [14, -22],
          [33, -12]
        ]
      };

    case 'windupLow':
      return {
        legs: [
          [9, 0],
          [-12, 0]
        ],
        hands: [
          [-3, -4],
          [-9, -2]
        ],
        lean: -2,
        blade: [
          [-3, -4],
          [-22, 4]
        ],
        crouch: 10
      };
    case 'slashLow':
      return {
        legs: [
          [17, 1],
          [-11, 0]
        ],
        hands: [
          [13, -2],
          [3, -8]
        ],
        lean: 5,
        // Kept low on purpose: this blade is also what judges hits (bladeFor),
        // so it has to land on LEGS, not TORSO, or a high guard would wrongly
        // block a low attack. The windup/after poses carry the dramatic rise instead.
        blade: [
          [14, -2],
          [37, -15]
        ],
        crouch: 10
      };
    case 'afterLow':
      return {
        legs: [
          [13, -1],
          [-14, 0]
        ],
        hands: [
          [10, -30],
          [0, -22]
        ],
        lean: 6,
        blade: [
          [10, -30],
          [26, -52]
        ],
        crouch: 10
      };

    case 'plunge':
      return {
        legs: [
          [9, -9],
          [-10, -4]
        ],
        hands: [
          [11, -46],
          [1, -38]
        ],
        lean: -1,
        blade: [
          [11, -46],
          [35, -18]
        ]
      };

    case 'guardHigh':
      return {
        legs: [
          [3, 0],
          [-4, 0]
        ],
        hands: [
          [12, -32],
          [7, -40]
        ],
        lean: -2,
        blade: [
          [12, -32],
          [17, -54]
        ],
        crouch: -3
      };
    case 'guardLow':
      return {
        legs: [
          [14, 0],
          [-16, 0]
        ],
        hands: [
          [10, -16],
          [2, -19]
        ],
        lean: 7,
        blade: [
          [10, -16],
          [36, 4]
        ],
        crouch: 13
      };

    case 'clash':
      return {
        legs: [
          [7, -1],
          [-9, 0]
        ],
        hands: [
          [9, -34],
          [0, -30]
        ],
        lean: -3,
        blade: [
          [9, -34],
          [25, -57]
        ]
      };
    case 'stagger':
      return {
        legs: [
          [-3, 0],
          [-13, 0]
        ],
        hands: [
          [5, -25],
          [-4, -27]
        ],
        lean: -5,
        blade: [
          [5, -25],
          [19, -3]
        ]
      };
    case 'hit':
      return {
        legs: [
          [-9, -2],
          [-17, 1]
        ],
        hands: [
          [-7, -40],
          [-14, -33]
        ],
        lean: -8,
        // The sword is gone from the hand — it tumbles away behind the figure.
        blade: [
          [-15, -17],
          [-35, -25]
        ]
      };

    default:
      return stance(anim);
  }
}

/** The swing trail drawn behind a live blade: centre x/y, radius, start and end angle. */
export function arcFor(pose: string): [number, number, number, number, number] | undefined {
  switch (pose as Pose) {
    case 'slash':
      return [4, -34, 28, -2.4, -0.2];
    // Dips toward the ground then rises — the mirror of the high slash's cresting arc.
    case 'slashLow':
      return [5, -20, 18, -0.66, 2.67];
    case 'plunge':
      return [6, -40, 24, -1.5, 0.6];
    default:
      return undefined;
  }
}

/** Hilt and tip of the blade this pose holds, in feet-space. */
export function bladeFor(pose: Pose): [number, number][] | undefined {
  return limbsFor(pose, 0).blade;
}
