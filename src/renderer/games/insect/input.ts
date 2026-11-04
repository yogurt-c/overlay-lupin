export interface InsectInput { move: number; moveY: number; sneak: boolean; swing: boolean; cancel: boolean; emotes: boolean; emoji: number; brag: boolean; collection: boolean; map: boolean }
const KEYS = new Set(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight','Space','Escape','KeyE','KeyB','KeyC','KeyM', ...Array.from({length:8},(_,i)=>`Digit${i+1}`)]);
export function createInputSource(target: Window) {
  const held = new Set<string>(); let swing = false, cancel = false, emotes = false, emoji = -1, brag = false, collection = false, map = false;
  const active = () => target.document.body.dataset.game === 'insect';
  // Losing focus only lets go of held keys; closing the collection or map is Escape's job, so switching apps keeps them open.
  const release = () => { held.clear(); swing = false; };
  const drop = () => { release(); cancel = true; };
  target.addEventListener('keydown', e => {
    if (!active()) return;
    if (target.document.getElementById('settings-panel')?.hidden === false || (e.target as HTMLElement)?.closest('input,select,textarea,.fish-dropdown[data-open]')) { drop(); return; }
    if (!KEYS.has(e.code)) return;
    e.preventDefault(); e.stopImmediatePropagation(); held.add(e.code);
    if (e.repeat) return;
    if (e.code === 'Space') swing = true;
    if (e.code === 'Escape') drop();
    if (e.code === 'KeyE') emotes = true;
    if (e.code === 'KeyB') brag = true;
    if (e.code === 'KeyC') { collection = true; swing = false; }
    if (e.code === 'KeyM') { map = true; swing = false; }
    if (e.code.startsWith('Digit')) emoji = Number(e.code.slice(-1)) - 1;
  }, true);
  target.addEventListener('keyup', e => { held.delete(e.code);  });
  target.addEventListener('blur', release);
  target.document.addEventListener('visibilitychange', () => { if (target.document.hidden) release(); });
  return {
    read(): InsectInput {
      if (target.document.body.dataset.insectPaused === 'true') { held.clear(); swing = false; }
      const has = (...keys: string[]) => keys.some(k => held.has(k));
      const out = { move: Number(has('KeyD','ArrowRight')) - Number(has('KeyA','ArrowLeft')), moveY: Number(has('KeyS','ArrowDown')) - Number(has('KeyW','ArrowUp')), sneak: has('ShiftLeft','ShiftRight'), swing, cancel, emotes, emoji, brag, collection, map };
      swing = cancel = emotes = brag = collection = map = false; emoji = -1; return out;
    }, clear: drop
  };
}
