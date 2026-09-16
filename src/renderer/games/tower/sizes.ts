/** Longest visible dimension in world pixels. Relative adult size, compressed for a 320px overlay:
 * this is a gameplay scale, not zoological measurements. Giraffe uses height, most others body length.
 * Keep the smallest silhouette readable and the largest able to reach the platform. */
export const ANIMAL_SIZE: Readonly<Record<string, number>> = {
  giraffe: 112,
  elephant: 108,
  hippo: 94,
  crocodile: 86,
  bear: 66,
  seal: 58,
  panda: 52,
  sheep: 46,
  dog: 38,
  penguin: 34,
  cat: 32,
  duck: 26,
  rabbit: 24,
  squirrel: 22,
  turtle: 22,
  hedgehog: 18
};
