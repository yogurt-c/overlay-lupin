import { createKeyInputSource } from '../../lib/input.js';
import type { InputSource } from '../../lib/input.js';
import type { SurvivorInput } from './types.js';

/**
 * Movement is the whole control scheme — attacks fire themselves. The number
 * keys exist only during a level-up, and are buffered so a tap between ticks
 * still counts.
 */
export function createInputSource(target: Window = window): InputSource<SurvivorInput> {
  return createKeyInputSource<SurvivorInput>(
    target,
    {
      left: ['ArrowLeft', 'KeyA'],
      right: ['ArrowRight', 'KeyD'],
      up: ['ArrowUp', 'KeyW'],
      down: ['ArrowDown', 'KeyS'],
      pick1: ['Digit1', 'Numpad1'],
      pick2: ['Digit2', 'Numpad2'],
      pick3: ['Digit3', 'Numpad3'],
      skip: ['Space']
    },
    ['pick1', 'pick2', 'pick3', 'skip']
  );
}
