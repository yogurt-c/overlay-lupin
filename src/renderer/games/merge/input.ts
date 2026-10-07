import { createKeyInputSource } from '../../lib/input.js';
import type { InputSource } from '../../lib/input.js';
import type { MergeInput } from './types.js';

/** ← → move the held animal; Space (or ↓) lets it go. */
export function createInputSource(target: Window = window): InputSource<MergeInput> {
  return createKeyInputSource<MergeInput>(target, {
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    drop: ['Space', 'ArrowDown', 'KeyS']
  }, ['drop']);
}
