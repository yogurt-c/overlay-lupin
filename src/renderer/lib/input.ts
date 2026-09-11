/**
 * Keyboard reading shared by every game. Held keys are tracked rather than
 * sampled per event so a tick always sees the current state, and losing focus
 * drops everything — otherwise a key released while the overlay sits in the
 * background would stay stuck down forever.
 *
 * Each game supplies only its own key map; nothing else about a game's input
 * differs, which is why this lives here instead of being copied per game.
 */

export interface InputSource<T> {
  read(): T;
  clear(): void;
}

/** Maps each field of a game's input shape to the key codes that trigger it. */
export type KeyBindings<T> = { [K in keyof T]: readonly string[] };

export function createKeyInputSource<T>(target: Window, bindings: KeyBindings<T>): InputSource<T> {
  const fields = Object.keys(bindings) as (keyof T)[];
  const watched = new Set<string>();
  for (const field of fields) for (const code of bindings[field]) watched.add(code);

  const held = new Set<string>();

  target.addEventListener('keydown', (e) => {
    if (!watched.has(e.code)) return;
    e.preventDefault();
    held.add(e.code);
  });
  target.addEventListener('keyup', (e) => {
    if (!watched.has(e.code)) return;
    e.preventDefault();
    held.delete(e.code);
  });
  target.addEventListener('blur', () => held.clear());

  return {
    read: () => {
      const out: Record<string, boolean> = {};
      for (const field of fields) {
        out[field as string] = bindings[field].some((code) => held.has(code));
      }
      return out as T;
    },
    clear: () => held.clear()
  };
}
