import { createKeyInputSource } from '../../lib/input.js';
import type { InputSource } from '../../lib/input.js';
import type { WormInput } from './types.js';

/**
 * Fortress's own layout: left/right walks, up/down elevates the barrel, and
 * space charges. There is deliberately no jump — up is spent on elevation,
 * which is the whole point of an artillery game.
 */
export function createInputSource(target: Window = window): InputSource<WormInput> {
  return createKeyInputSource<WormInput>(target, {
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    aimUp: ['ArrowUp', 'KeyW'],
    aimDown: ['ArrowDown', 'KeyS'],
    jump: ['ShiftLeft', 'ShiftRight'],
    fire: ['Space']
  });
}
