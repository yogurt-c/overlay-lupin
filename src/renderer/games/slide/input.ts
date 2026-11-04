import { createKeyInputSource } from '../../lib/input.js';
import type { InputSource } from '../../lib/input.js';
import type { SlideInput } from './types.js';

/** Arrows slide the board (and pick a button on a result card), Space confirms, Q quits from a card. */
export function createInputSource(target: Window = window): InputSource<SlideInput> {
  return createKeyInputSource<SlideInput>(target, {
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    confirm: ['Space'],
    quit: ['KeyQ']
  }, ['left', 'right', 'up', 'down', 'confirm', 'quit']);
}
