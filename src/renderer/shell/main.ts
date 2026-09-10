import { advanceSketchSeed } from '../lib/sketch.js';
import { GAME_MODULES } from '../games/registry.js';
import type { GameMatch } from '../games/types.js';
import type { PeerInfo } from '../types.js';

/** The simulation advances in fixed 1/60s ticks; every constant below is per tick. */
const STEP_MS = 1000 / 60;
/** How often the hand-drawn jitter is re-rolled. Slow enough to read as ink, not noise. */
const BOIL_MS = 90;
const SEND_INTERVAL_MS = 1000 / 30;
/** Cap on catch-up ticks per frame, so a stalled window doesn't fast-forward the match. */
const MAX_STEPS_PER_FRAME = 5;

const canvas = document.getElementById('field') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const idleIcon = document.getElementById('idle-icon') as HTMLButtonElement;
const statusDot = document.getElementById('status-dot') as HTMLSpanElement;
const panel = document.getElementById('panel') as HTMLDivElement;
const panelTitle = document.getElementById('panel-title') as HTMLHeadingElement;
const gameTabsEl = document.getElementById('game-tabs') as HTMLDivElement;
const hintEl = document.getElementById('hint') as HTMLParagraphElement;
const peerListEl = document.getElementById('peer-list') as HTMLUListElement;
const hud = document.getElementById('hud') as HTMLDivElement;
const scoreEl = document.getElementById('score') as HTMLSpanElement;
const bannerEl = document.getElementById('banner') as HTMLDivElement;
const reconnectMsg = document.getElementById('reconnect-msg') as HTMLDivElement;
const quitBtn = document.getElementById('quit-btn') as HTMLButtonElement;
const waitingBox = document.getElementById('waiting-box') as HTMLDivElement;
const waitingName = document.getElementById('waiting-name') as HTMLElement;
const cancelInviteBtn = document.getElementById('cancel-invite-btn') as HTMLButtonElement;
const incomingBox = document.getElementById('incoming-box') as HTMLDivElement;
const incomingName = document.getElementById('incoming-name') as HTMLElement;
const acceptBtn = document.getElementById('accept-btn') as HTMLButtonElement;
const declineBtn = document.getElementById('decline-btn') as HTMLButtonElement;
const leaveBtn = document.getElementById('leave-btn') as HTMLButtonElement;

type UiState = 'idle' | 'panel' | 'waiting' | 'incoming' | 'play' | 'reconnecting';

/** One input source per game, created once so listeners aren't re-attached every match. */
const inputSources = new Map(GAME_MODULES.map((m) => [m.id, m.createInputSource(window)]));

let uiState: UiState = 'idle';
let selectedGameId = GAME_MODULES[0].id;
let activeMatch: GameMatch | null = null;
let activeInput: { read(): unknown; clear(): void } | null = null;
let peers: PeerInfo[] = [];
let incomingPeerId: string | null = null;
let lastScoreText = '';
let lastBannerText = '';
let stepAccumulator = 0;
let boilAccumulator = 0;
let lastFrameAt = performance.now();
let lastSentAt = 0;

let viewWidthPx = window.innerWidth;
let viewHeightPx = window.innerHeight;
let pixelRatio = window.devicePixelRatio || 1;

function resizeCanvas(): void {
  pixelRatio = window.devicePixelRatio || 1;
  viewWidthPx = window.innerWidth;
  viewHeightPx = window.innerHeight;
  canvas.width = Math.round(viewWidthPx * pixelRatio);
  canvas.height = Math.round(viewHeightPx * pixelRatio);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

/* ---------------------------------------------------------------- UI shell */

function setUiState(next: UiState): void {
  uiState = next;
  idleIcon.hidden = next !== 'idle';
  statusDot.hidden = next === 'play';
  panel.hidden = next !== 'panel';
  waitingBox.hidden = next !== 'waiting';
  incomingBox.hidden = next !== 'incoming';
  leaveBtn.hidden = next !== 'play';
  hud.hidden = next !== 'play';
  reconnectMsg.hidden = next !== 'reconnecting';
  if (next !== 'play') {
    for (const src of inputSources.values()) src.clear();
    clearCanvas();
  }
}

function clearCanvas(): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/** `gameId` is authoritative — for the host it's whatever was selected; for the
 * invitee it's whatever the host actually invited to, which may differ from
 * whatever tab they last had open. */
function beginMatch(isHost: boolean, gameId: string): void {
  const module = GAME_MODULES.find((m) => m.id === gameId) ?? GAME_MODULES[0];
  incomingPeerId = null;
  selectedGameId = module.id;
  activeMatch = module.createMatch(isHost);
  activeInput = inputSources.get(module.id) ?? null;
  stepAccumulator = 0;
  lastFrameAt = performance.now();
  lastScoreText = '';
  lastBannerText = '';
  setUiState('play');
}

function endMatch(): void {
  window.overlayLupin.leaveMatch();
  activeMatch = null;
  setUiState('idle');
}

function renderGameTabs(): void {
  gameTabsEl.innerHTML = '';
  for (const module of GAME_MODULES) {
    const btn = document.createElement('button');
    btn.textContent = module.label;
    btn.classList.toggle('active', module.id === selectedGameId);
    btn.disabled = GAME_MODULES.length === 1;
    btn.addEventListener('click', () => {
      selectedGameId = module.id;
      renderGameTabs();
    });
    gameTabsEl.appendChild(btn);
  }
  hintEl.textContent = GAME_MODULES.find((m) => m.id === selectedGameId)?.hint ?? '';
}

function renderPeerList(): void {
  panelTitle.textContent = peers.length === 0 ? '찾는 중…' : `${peers.length}명 찾음`;

  peerListEl.innerHTML = '';
  if (peers.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '근처에 아무도 없음';
    peerListEl.appendChild(li);
    return;
  }
  for (const peer of peers) {
    const li = document.createElement('li');
    li.textContent = peer.name;
    li.addEventListener('click', () => window.overlayLupin.invite(peer.id, selectedGameId));
    peerListEl.appendChild(li);
  }
}

quitBtn.addEventListener('click', () => window.overlayLupin.quit());
leaveBtn.addEventListener('click', endMatch);

idleIcon.addEventListener('click', () => {
  renderGameTabs();
  renderPeerList();
  setUiState('panel');
});

cancelInviteBtn.addEventListener('click', () => {
  window.overlayLupin.cancelInvite();
  setUiState('idle');
});

acceptBtn.addEventListener('click', () => {
  if (incomingPeerId) window.overlayLupin.acceptInvite(incomingPeerId);
});

declineBtn.addEventListener('click', () => {
  if (incomingPeerId) window.overlayLupin.declineInvite(incomingPeerId);
  incomingPeerId = null;
  setUiState('idle');
});

document.addEventListener('click', (e) => {
  if (uiState !== 'panel') return;
  const target = e.target as HTMLElement;
  if (!panel.contains(target) && !idleIcon.contains(target)) setUiState('idle');
});

/* --------------------------------------------------------------- Networking */

window.overlayLupin.onPeers((list) => {
  peers = list;
  statusDot.dataset.state = list.length > 0 ? 'found' : '';
  if (uiState === 'panel') renderPeerList();
});

window.overlayLupin.onInviteSent((peer) => {
  waitingName.textContent = peer.name;
  setUiState('waiting');
});

window.overlayLupin.onInviteReceived((peer) => {
  incomingPeerId = peer.id;
  incomingName.textContent = peer.name;
  setUiState('incoming');
});

window.overlayLupin.onInviteCleared(() => {
  incomingPeerId = null;
  if (uiState === 'waiting' || uiState === 'incoming') setUiState('idle');
});

window.overlayLupin.onMatchFound((_peer, isHost, gameId) => beginMatch(isHost, gameId));

window.overlayLupin.onMatchLost((reason) => {
  if (reason === 'left') {
    setUiState('idle');
    return;
  }
  setUiState('reconnecting');
  setTimeout(() => {
    if (uiState === 'reconnecting') setUiState('idle');
  }, 5000);
});

window.overlayLupin.onOpponentState((packet) => activeMatch?.applyOpponentPacket(packet));

/* ------------------------------------------------------------------ Drawing */

function drawFrame(alpha: number): void {
  activeMatch?.render(ctx, { width: viewWidthPx, height: viewHeightPx, pixelRatio }, alpha);
}

/* ---------------------------------------------------------------------- HUD */

function syncHud(): void {
  if (!activeMatch) return;
  const { status, banner, bannerKind } = activeMatch.hud();

  if (status !== lastScoreText) {
    scoreEl.textContent = status;
    lastScoreText = status;
  }
  if (banner !== lastBannerText) {
    bannerEl.textContent = banner;
    bannerEl.hidden = banner === '';
    bannerEl.dataset.kind = bannerKind;
    lastBannerText = banner;
  }
}

/* --------------------------------------------------------------- Frame loop */

function frame(now: number): void {
  const elapsed = Math.min(now - lastFrameAt, 250);
  lastFrameAt = now;

  if (uiState === 'play' && activeMatch) {
    stepAccumulator += elapsed;
    let steps = 0;
    while (stepAccumulator >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
      activeMatch.step(activeInput?.read());
      stepAccumulator -= STEP_MS;
      steps += 1;
    }
    // Too far behind to catch up honestly — drop the backlog instead of sprinting.
    if (stepAccumulator >= STEP_MS) stepAccumulator = 0;

    boilAccumulator += elapsed;
    if (boilAccumulator >= BOIL_MS) {
      boilAccumulator = 0;
      advanceSketchSeed();
    }

    drawFrame(stepAccumulator / STEP_MS);
    syncHud();

    if (now - lastSentAt >= SEND_INTERVAL_MS) {
      lastSentAt = now;
      window.overlayLupin.sendLocalState(activeMatch.buildOutgoingPacket());
    }

    if (activeMatch.isOver()) endMatch();
  }

  requestAnimationFrame(frame);
}

idleIcon.title = '상대 찾기';
setUiState('idle');
requestAnimationFrame(frame);
