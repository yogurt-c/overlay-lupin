import type { CellInput } from './types.js';

const LEFT_KEYS = ['ArrowLeft', 'KeyA'];
const RIGHT_KEYS = ['ArrowRight', 'KeyD'];
const UP_KEYS = ['ArrowUp', 'KeyW'];
const DOWN_KEYS = ['ArrowDown', 'KeyS'];

const GAME_KEYS = new Set([...LEFT_KEYS, ...RIGHT_KEYS, ...UP_KEYS, ...DOWN_KEYS]);

export interface InputSource {
  read(): CellInput;
  clear(): void;
}

/** Same held-key tracking approach as soccer's input source — see its own file for the rationale. */
export function createInputSource(target: Window = window): InputSource {
  const held = new Set<string>();
  const anyOf = (codes: string[]) => codes.some((code) => held.has(code));

  target.addEventListener('keydown', (e) => {
    if (!GAME_KEYS.has(e.code)) return;
    e.preventDefault();
    held.add(e.code);
  });
  target.addEventListener('keyup', (e) => {
    if (!GAME_KEYS.has(e.code)) return;
    e.preventDefault();
    held.delete(e.code);
  });
  target.addEventListener('blur', () => held.clear());

  return {
    read: () => ({
      up: anyOf(UP_KEYS),
      down: anyOf(DOWN_KEYS),
      left: anyOf(LEFT_KEYS),
      right: anyOf(RIGHT_KEYS)
    }),
    clear: () => held.clear()
  };
}
