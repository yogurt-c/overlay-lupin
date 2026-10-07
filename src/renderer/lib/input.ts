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

/**
 * `buffered` fields are taps, not holds: each one reads true exactly once per
 * key press, however long the key stays down. A normal press lasts five to ten
 * frames, so reading the held state instead would answer a menu five to ten
 * times — and quietly consume whatever screen came next.
 */
export function createKeyInputSource<T>(target: Window, bindings: KeyBindings<T>, buffered: readonly (keyof T)[] = []): InputSource<T> {
  const fields = Object.keys(bindings) as (keyof T)[];
  const bufferedFields = new Set(buffered);
  const watched = new Set<string>();
  for (const field of fields) for (const code of bindings[field]) watched.add(code);

  const held = new Set<string>();
  const pressed = new Set<string>();
  const bufferedCodes = new Set(buffered.flatMap(field => [...bindings[field]]));

  target.addEventListener('keydown', (e) => {
    if (!watched.has(e.code)) return;
    e.preventDefault();
    if (!held.has(e.code) && bufferedCodes.has(e.code)) pressed.add(e.code);
    held.add(e.code);
  });
  target.addEventListener('keyup', (e) => {
    if (!watched.has(e.code)) return;
    e.preventDefault();
    held.delete(e.code);
  });
  target.addEventListener('blur', () => { held.clear(); pressed.clear(); });

  return {
    read: () => {
      const out: Record<string, boolean> = {};
      for (const field of fields) {
        const codes = bindings[field];
        out[field as string] = bufferedFields.has(field)
          ? codes.some((code) => pressed.has(code))
          : codes.some((code) => held.has(code));
      }
      pressed.clear();
      return out as T;
    },
    clear: () => { held.clear(); pressed.clear(); }
  };
}
