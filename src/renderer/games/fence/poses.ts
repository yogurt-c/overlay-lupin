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
          [6, -1],
          [-9, 0]
        ],
        hands: [
          [-4, -38],
          [-10, -32]
        ],
        lean: -1,
        blade: [
          [-4, -38],
          [-23, -46]
        ]
      };
    case 'slashLow':
      return {
        legs: [
          [12, -3],
          [-9, 0]
        ],
        hands: [
          [14, -24],
          [3, -24]
        ],
        lean: 4,
        blade: [
          [14, -24],
          [37, -9]
        ]
      };
    case 'afterLow':
      return {
        legs: [
          [10, -1],
          [-10, 0]
        ],
        hands: [
          [11, -20],
          [1, -25]
        ],
        lean: 5,
        blade: [
          [11, -20],
          [28, -4]
        ]
      };

    case 'windupThrust':
      return {
        legs: [
          [8, 0],
          [-10, 0]
        ],
        hands: [
          [-6, -31],
          [-1, -28]
        ],
        lean: -3,
        blade: [
          [-6, -31],
          [-24, -33]
        ]
      };
    case 'thrust':
      return {
        legs: [
          [17, 0],
          [-13, 0]
        ],
        hands: [
          [19, -30],
          [6, -28]
        ],
        lean: 5,
        blade: [
          [19, -30],
          [51, -31]
        ]
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
          [6, 0],
          [-7, 0]
        ],
        hands: [
          [13, -30],
          [8, -40]
        ],
        lean: 1,
        blade: [
          [12, -14],
          [16, -52]
        ]
      };
    case 'guardLow':
      return {
        legs: [
          [7, -1],
          [-8, 0]
        ],
        hands: [
          [11, -29],
          [5, -32]
        ],
        lean: 2,
        blade: [
          [9, -32],
          [27, -6]
        ]
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
    case 'slashLow':
      return [4, -28, 26, -1.9, 0.35];
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
