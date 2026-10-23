import { createKeyInputSource } from '../../lib/input.js';
import type { GomokuInput } from './types.js';
export function createInputSource(target: Window) {
  const source = createKeyInputSource<GomokuInput>(target, {
    left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'], place: ['Space']
  }, ['place']);
  return { read: () => source.read(), clear: () => source.clear() };
}
