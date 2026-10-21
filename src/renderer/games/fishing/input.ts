export interface FishingInput { held: boolean; cast: boolean; cancel: boolean; collection: boolean; emotes: boolean; emoji: number }
export function createInputSource(target: Window) {
  let held = false, cast = false, cancel = false, collection = false, emotes = false, emoji = -1;
  const active = () => target.document.body.dataset.game === 'fishing';
  target.addEventListener('keydown', e => {
    if (!active() || target.document.getElementById('settings-panel')?.hidden === false) return;
    if ((e.target as HTMLElement)?.closest('input,select,textarea')) { e.stopImmediatePropagation(); return; }
    if (!['Space','Escape','KeyC','KeyE','Digit1','Digit2','Digit3','Digit4','Digit5','Digit6'].includes(e.code)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.repeat) return;
    if (e.code === 'Space') { held = true; cast = true; }
    if (e.code === 'Escape') cancel = true;
    if (e.code === 'KeyC') collection = true;
    if (e.code === 'KeyE') emotes = true;
    if (e.code.startsWith('Digit')) emoji = Number(e.code.slice(-1))-1;
  }, true);
  target.addEventListener('keyup', e => { if (e.code === 'Space') held = false; });
  target.addEventListener('blur', () => { held = false; cast = false; cancel = true; });
  target.document.addEventListener('visibilitychange', () => { if (target.document.hidden) { held = false; cast = false; cancel = true; } });
  return { read(): FishingInput { const out = { held, cast, cancel, collection, emotes, emoji }; cast = cancel = collection = emotes = false; emoji = -1; return out; },
    clear(): void { held = cast = cancel = collection = emotes = false; emoji = -1; } };
}
