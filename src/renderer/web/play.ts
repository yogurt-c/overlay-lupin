/**
 * Browser-only shell for the GitHub Pages trial (docs/play/). A stripped-down
 * cousin of shell/main.ts: same fixed-tick loop, but solo against the bot only —
 * no IPC, no matching, no settings. Bundled by `npm run build:web`.
 */
import { advanceSketchSeed } from '../lib/sketch.js';
import type { GameMatch } from '../games/types.js';
import { resolveTrialGame, splitHint } from './trial-games.js';

const STEP_MS = 1000 / 60;
const BOIL_MS = 90;
const MAX_STEPS_PER_FRAME = 5;

type TrialState = 'ready' | 'play' | 'hidden' | 'over';

const mod = resolveTrialGame(new URLSearchParams(location.search).get('game'));

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`play page is missing #${id}`);
  return el as T;
}

const stage = byId('stage');
const canvas = byId<HTMLCanvasElement>('game-canvas');
const ctx = canvas.getContext('2d')!;
const statusEl = byId('game-status');
const bannerEl = byId('game-banner');
const startPanel = byId('start-panel');
const overPanel = byId('over-panel');
const overText = byId('over-text');
const hideBtn = byId<HTMLButtonElement>('hide-toggle');

document.querySelectorAll<HTMLAnchorElement>('[data-game]').forEach((tab) => {
  if (tab.dataset.game === mod.id) tab.setAttribute('aria-current', 'page');
});
document.title = `${mod.label} · 브라우저에서 한 판 · 오버레이 루팡`;
byId('game-title').textContent = mod.label;
byId('control-list').replaceChildren(...splitHint(mod.hint).map((line) => {
  const li = document.createElement('li');
  li.textContent = line;
  return li;
}));

let viewWidth = 0;
let viewHeight = 0;
let pixelRatio = 1;
function resize(): void {
  const rect = stage.getBoundingClientRect();
  pixelRatio = window.devicePixelRatio || 1;
  viewWidth = rect.width;
  viewHeight = rect.height;
  canvas.width = Math.round(viewWidth * pixelRatio);
  canvas.height = Math.round(viewHeight * pixelRatio);
  if (state !== 'play') draw(0);
}

const input = mod.createInputSource(window);
let match: GameMatch | null = null;
let state: TrialState = 'ready';
let lastFrameAt = performance.now();
let stepAccumulator = 0;
let boilAccumulator = 0;

function setState(next: TrialState): void {
  state = next;
  stage.dataset.state = next;
  startPanel.hidden = next !== 'ready';
  overPanel.hidden = next !== 'over';
  hideBtn.setAttribute('aria-pressed', String(next === 'hidden'));
}

function start(): void {
  match = mod.createSoloMatch!('web-trial', '나');
  input.clear();
  stepAccumulator = 0;
  lastFrameAt = performance.now();
  setState('play');
  canvas.focus();
}

/** Mirrors the app's PgDn hide / PgUp reveal: the match pauses while tucked away. */
function hide(): void {
  if (state === 'play') setState('hidden');
}
function reveal(): void {
  if (state !== 'hidden') return;
  lastFrameAt = performance.now();
  setState('play');
}

function draw(alpha: number): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  match?.render(ctx, { width: viewWidth, height: viewHeight, pixelRatio }, alpha);
}

function syncHud(): void {
  if (!match) return;
  const { status, banner, bannerKind } = match.hud();
  if (statusEl.textContent !== status) statusEl.textContent = status;
  if (bannerEl.textContent !== banner) bannerEl.textContent = banner;
  bannerEl.hidden = banner === '' || state === 'over';
  bannerEl.dataset.kind = bannerKind;
}

function frame(now: number): void {
  const elapsed = Math.min(now - lastFrameAt, 250);
  lastFrameAt = now;

  if (state === 'play' && match) {
    stepAccumulator += elapsed;
    let steps = 0;
    while (stepAccumulator >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
      match.step(input.read());
      stepAccumulator -= STEP_MS;
      steps += 1;
    }
    if (stepAccumulator >= STEP_MS) stepAccumulator = 0;

    boilAccumulator += elapsed;
    if (boilAccumulator >= BOIL_MS) {
      boilAccumulator = 0;
      advanceSketchSeed();
    }

    draw(stepAccumulator / STEP_MS);
    syncHud();

    if (match.isOver()) {
      overText.textContent = match.hud().banner || '경기 종료';
      setState('over');
    }
  }

  requestAnimationFrame(frame);
}

byId('start-btn').addEventListener('click', start);
byId('again-btn').addEventListener('click', start);
hideBtn.addEventListener('click', () => (state === 'hidden' ? reveal() : hide()));
window.addEventListener('keydown', (e) => {
  if (e.code === 'PageDown') {
    e.preventDefault();
    hide();
  } else if (e.code === 'PageUp') {
    e.preventDefault();
    reveal();
  } else if (e.code === 'Enter' && (state === 'ready' || state === 'over')) {
    e.preventDefault();
    start();
  }
});

new ResizeObserver(resize).observe(stage);
setState('ready');
resize();
requestAnimationFrame(frame);
