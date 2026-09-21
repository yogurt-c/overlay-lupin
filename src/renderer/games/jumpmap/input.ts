import { createKeyInputSource } from '../../lib/input.js';
import type { InputSource } from '../../lib/input.js';
import type { JumpmapInput } from './types.js';

/**
 * ← → walks, Space jumps (press again in the air for one extra hop), ↓ speeds
 * up a fall, and X is the only offense in the game — a short shove.
 */
export function createInputSource(target: Window = window): InputSource<JumpmapInput> {
  return createKeyInputSource<JumpmapInput>(target, {
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    jump: ['Space'],
    down: ['ArrowDown', 'KeyS'],
    attack: ['KeyX', 'KeyJ']
  });
}
