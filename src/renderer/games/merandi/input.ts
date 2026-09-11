import type { MerandiCommand, MerandiInput } from './types.js';

const KEY_DRAW = 'KeyZ';
const KEY_UPGRADE = 'KeyX';
const KEY_SELL = 'KeyC';
const KEY_CANCEL = 'Escape';
const DIGIT_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8'];

const GAME_KEYS = new Set([KEY_DRAW, KEY_UPGRADE, KEY_SELL, KEY_CANCEL, ...DIGIT_KEYS]);

const UP_KEYS = ['ArrowUp', 'KeyW'];
const DOWN_KEYS = ['ArrowDown', 'KeyS'];
const LEFT_KEYS = ['ArrowLeft', 'KeyA'];
const RIGHT_KEYS = ['ArrowRight', 'KeyD'];
const CAMERA_KEYS = new Set([...UP_KEYS, ...DOWN_KEYS, ...LEFT_KEYS, ...RIGHT_KEYS]);

export interface CameraPan {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export interface InputSource {
  read(): MerandiInput;
  clear(): void;
  /** Held-key camera pan state — separate from `read()` because panning is purely a local render concern, never sent over the network. */
  readCameraPan(): CameraPan;
}

/**
 * Every action here is a one-shot, edge-triggered command (draw once per
 * press), not held state like a movement game's WASD — so this queues
 * commands on keydown and drains the queue on `read()` instead of sampling a
 * held-key set.
 */
export function createInputSource(target: Window = window): InputSource {
  let queue: MerandiCommand[] = [];
  const held = new Set<string>();
  const anyOf = (codes: string[]) => codes.some((code) => held.has(code));

  target.addEventListener('keydown', (e) => {
    if (CAMERA_KEYS.has(e.code)) {
      e.preventDefault();
      held.add(e.code);
      return;
    }
    if (!GAME_KEYS.has(e.code) || e.repeat) return;
    e.preventDefault();
    if (e.code === KEY_DRAW) queue.push({ type: 'draw' });
    else if (e.code === KEY_UPGRADE) queue.push({ type: 'armUpgrade' });
    else if (e.code === KEY_SELL) queue.push({ type: 'armSell' });
    else if (e.code === KEY_CANCEL) queue.push({ type: 'cancel' });
    else {
      const index = DIGIT_KEYS.indexOf(e.code) + 1;
      queue.push({ type: 'pick', index });
    }
  });
  target.addEventListener('keyup', (e) => {
    if (CAMERA_KEYS.has(e.code)) held.delete(e.code);
  });
  target.addEventListener('blur', () => {
    queue = [];
    held.clear();
  });

  return {
    read: () => {
      const commands = queue;
      queue = [];
      return { commands };
    },
    clear: () => {
      queue = [];
      held.clear();
    },
    readCameraPan: () => ({
      up: anyOf(UP_KEYS),
      down: anyOf(DOWN_KEYS),
      left: anyOf(LEFT_KEYS),
      right: anyOf(RIGHT_KEYS)
    })
  };
}
