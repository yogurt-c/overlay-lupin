import { createKeyInputSource } from '../../lib/input.js';
import type { InputSource } from '../../lib/input.js';
import type { JumpmapInput } from './types.js';

/**
 * ← → walks, ↑ jumps from a platform, ↓ speeds up a fall,
 * and Space swings the bat.
 */
export function createInputSource(target: Window = window): InputSource<JumpmapInput> {
  return createKeyInputSource<JumpmapInput>(target, {
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    jump: ['ArrowUp'],
    down: ['ArrowDown', 'KeyS'],
    attack: ['Space']
  });
}
