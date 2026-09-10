import type { Input } from './engine.js';

const LEFT_KEYS = ['ArrowLeft', 'KeyA'];
const RIGHT_KEYS = ['ArrowRight', 'KeyD'];
const JUMP_KEYS = ['ArrowUp', 'KeyW'];
const KICK_KEYS = ['Space', 'ArrowDown', 'KeyS'];

const GAME_KEYS = new Set([...LEFT_KEYS, ...RIGHT_KEYS, ...JUMP_KEYS, ...KICK_KEYS]);

export interface InputSource {
  read(): Input;
  clear(): void;
}

/**
 * Reads the keyboard into the simulation's input shape. Held keys are tracked
 * rather than sampled per event so a tick always sees the current state, and
 * losing focus drops everything — otherwise a key released while the overlay is
 * in the background would stay stuck down forever.
 */
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
      left: anyOf(LEFT_KEYS),
      right: anyOf(RIGHT_KEYS),
      jump: anyOf(JUMP_KEYS),
      kick: anyOf(KICK_KEYS)
    }),
    clear: () => held.clear()
  };
}
