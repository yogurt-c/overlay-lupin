/**
 * Turns a captured keydown into an Electron accelerator string for the shortcut recorder in the
 * settings panel. A plain letter/digit/space/etc. registered with no modifier becomes a
 * SYSTEM-WIDE global shortcut that swallows that key in every other app on the machine — so only
 * navigation/function keys are accepted alone; everything else must carry a modifier.
 */

const KEY_NAME_MAP: Record<string, string> = {
  ' ': 'Space',
  Escape: 'Esc',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Enter: 'Return',
  Delete: 'Delete',
  Backspace: 'Backspace',
  Tab: 'Tab',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown'
};

/** Keys safe to register with no modifier — rarely if ever typed as ordinary input elsewhere. */
const SAFE_ALONE = new Set(['PageUp', 'PageDown', 'Home', 'End', 'Insert', 'Up', 'Down', 'Left', 'Right']);

const MODIFIER_ONLY_KEYS = new Set(['Control', 'Meta', 'Alt', 'Shift', 'OS']);

function isFunctionKey(key: string): boolean {
  return /^F([1-9]|1[0-9]|2[0-4])$/.test(key);
}

export type AcceleratorResult =
  | { ok: true; accelerator: string }
  /** `unsafe-alone`: a real key was pressed but needs a modifier to be safely bindable globally. */
  | { ok: false; reason: 'modifier-only' | 'unsafe-alone' | 'unsupported' };

export function acceleratorFromKeyboardEvent(e: KeyboardEvent): AcceleratorResult {
  if (MODIFIER_ONLY_KEYS.has(e.key)) return { ok: false, reason: 'modifier-only' };

  let key = KEY_NAME_MAP[e.key];
  if (!key) {
    if (/^[a-zA-Z0-9]$/.test(e.key)) key = e.key.toUpperCase();
    else if (isFunctionKey(e.key)) key = e.key;
    else return { ok: false, reason: 'unsupported' };
  }

  const hasModifier = e.ctrlKey || e.metaKey || e.altKey;
  if (!hasModifier && !SAFE_ALONE.has(key) && !isFunctionKey(key)) {
    return { ok: false, reason: 'unsafe-alone' };
  }

  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('CmdOrCtrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(key);
  return { ok: true, accelerator: parts.join('+') };
}
