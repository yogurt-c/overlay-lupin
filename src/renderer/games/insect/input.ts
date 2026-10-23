export interface InsectInput { move: number; sneak: boolean; swing: boolean; cancel: boolean; emotes: boolean; emoji: number; brag: boolean; collection: boolean }
const LEFT = ['ArrowLeft', 'KeyA'], RIGHT = ['ArrowRight', 'KeyD'], SHIFT = ['ShiftLeft', 'ShiftRight'];
const KEYS = new Set([...LEFT, ...RIGHT, ...SHIFT, 'Space', 'Escape', 'KeyE', 'KeyB', 'KeyC', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8']);
export function createInputSource(target: Window) {
  const held = new Set<string>();
  let swing = false, cancel = false, emotes = false, brag = false, collection = false, emoji = -1;
  const active = () => target.document.body.dataset.game === 'insect';
  target.addEventListener('keydown', e => {
    if (!active() || target.document.getElementById('settings-panel')?.hidden === false) return;
    if ((e.target as HTMLElement)?.closest('input,select,textarea')) { e.stopImmediatePropagation(); return; }
    // An open collection dropdown owns Space/Esc/arrows until it closes.
    if ((e.target as HTMLElement)?.closest('.fish-dropdown[data-open]')) return;
    if (!KEYS.has(e.code)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    held.add(e.code);
    if (e.repeat) return;
    if (e.code === 'Space') swing = true;
    if (e.code === 'Escape') cancel = true;
    if (e.code === 'KeyE') emotes = true;
    if (e.code === 'KeyB') brag = true;
    if (e.code === 'KeyC') collection = true;
    if (e.code.startsWith('Digit')) emoji = Number(e.code.slice(-1)) - 1;
  }, true);
  target.addEventListener('keyup', e => held.delete(e.code));
  // A key released while the overlay is in the background would otherwise keep walking forever.
  const drop = () => { held.clear(); swing = false; cancel = true; };
  target.addEventListener('blur', drop);
  target.document.addEventListener('visibilitychange', () => { if (target.document.hidden) drop(); });
  return {
    read(): InsectInput {
      const move = (RIGHT.some(k => held.has(k)) ? 1 : 0) - (LEFT.some(k => held.has(k)) ? 1 : 0);
      const out = { move, sneak: SHIFT.some(k => held.has(k)), swing, cancel, emotes, emoji, brag, collection };
      swing = cancel = emotes = brag = collection = false; emoji = -1; return out;
    },
    clear(): void { held.clear(); swing = cancel = emotes = brag = collection = false; emoji = -1; }
  };
}
