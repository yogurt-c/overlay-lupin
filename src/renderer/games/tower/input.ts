import type { TowerInput } from './types.js';
export function createInputSource(target: Window): { read(): TowerInput; clear(): void } {
  const held = new Set<string>();
  let rotate = false, rotateBack = false, drop = false;
  const keys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD', 'KeyW', 'KeyS']);
  const clear = () => { held.clear(); rotate = rotateBack = drop = false; };
  target.addEventListener('keydown', e => {
    if (!keys.has(e.code)) return;
    e.preventDefault();
    if (!held.has(e.code) && !e.repeat) {
      if (e.code === 'ArrowUp' || e.code === 'KeyW') rotate = true;
      if (e.code === 'ArrowDown' || e.code === 'KeyS') rotateBack = true;
      if (e.code === 'Space') drop = true;
    }
    held.add(e.code);
  });
  target.addEventListener('keyup', e => { held.delete(e.code); });
  target.addEventListener('blur', clear);
  return {
    clear,
    read: () => {
      const input = { left: held.has('ArrowLeft') || held.has('KeyA'), right: held.has('ArrowRight') || held.has('KeyD'), rotate, rotateBack, drop };
      rotate = rotateBack = drop = false;
      return input;
    }
  };
}
