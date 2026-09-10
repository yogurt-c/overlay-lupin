import { advanceSketchSeed } from '../lib/sketch.js';
import { GAME_MODULES } from '../games/registry.js';
import type { GameMatch, GameModule } from '../games/types.js';
import type { PeerInfo, RoomInfo, RoomRoster } from '../types.js';

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
const roomListEl = document.getElementById('room-list') as HTMLUListElement;
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
const lobbyBox = document.getElementById('lobby-box') as HTMLDivElement;
const lobbyTitle = document.getElementById('lobby-title') as HTMLHeadingElement;
const lobbyMembersEl = document.getElementById('lobby-members') as HTMLUListElement;
const lobbyStartBtn = document.getElementById('lobby-start-btn') as HTMLButtonElement;
const lobbyWait = document.getElementById('lobby-wait') as HTMLParagraphElement;
const lobbyLeaveBtn = document.getElementById('lobby-leave-btn') as HTMLButtonElement;

type UiState = 'idle' | 'panel' | 'waiting' | 'incoming' | 'lobby' | 'play' | 'reconnecting';

/** One input source per game, created once so listeners aren't re-attached every match. */
const inputSources = new Map(GAME_MODULES.map((m) => [m.id, m.createInputSource(window)]));

let myId = '';
let myName = '';
let uiState: UiState = 'idle';
let selectedGameId = GAME_MODULES[0].id;
let activeMatch: GameMatch | null = null;
let activeMatchMode: 'duel' | 'room' | null = null;
let activeInput: { read(): unknown; clear(): void } | null = null;
let peers: PeerInfo[] = [];
let rooms: RoomInfo[] = [];
let currentRoster: RoomRoster | null = null;
let incomingPeerId: string | null = null;
/** null until the first sync, so a match that wants no status line still clears the HUD. */
let lastScoreText: string | null = null;
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

window.overlayLupin.whoAmI().then((me) => {
  myId = me.id;
  myName = me.name;
});

function currentModule(): GameModule {
  return GAME_MODULES.find((m) => m.id === selectedGameId) ?? GAME_MODULES[0];
}

/* ---------------------------------------------------------------- UI shell */

function setUiState(next: UiState): void {
  uiState = next;
  idleIcon.hidden = next !== 'idle' && next !== 'panel';
  statusDot.hidden = next === 'play';
  panel.hidden = next !== 'panel';
  waitingBox.hidden = next !== 'waiting';
  incomingBox.hidden = next !== 'incoming';
  lobbyBox.hidden = next !== 'lobby';
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
  incomingPeerId = null;
  startMatch('duel', isHost, gameId);
}

function beginRoomMatch(isHost: boolean, gameId: string): void {
  currentRoster = null;
  startMatch('room', isHost, gameId);
}

function startMatch(mode: 'duel' | 'room', isHost: boolean, gameId: string): void {
  const module = GAME_MODULES.find((m) => m.id === gameId) ?? GAME_MODULES[0];
  selectedGameId = module.id;
  activeMatchMode = mode;
  activeMatch = module.createMatch(isHost, myId, myName);
  activeInput = inputSources.get(module.id) ?? null;
  stepAccumulator = 0;
  lastFrameAt = performance.now();
  lastScoreText = null;
  lastBannerText = '';
  setUiState('play');
}

function endMatch(): void {
  if (activeMatchMode === 'room') window.overlayLupin.leaveRoom();
  else window.overlayLupin.leaveMatch();
  activeMatch = null;
  activeMatchMode = null;
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
      renderMatchingList();
    });
    gameTabsEl.appendChild(btn);
  }
  hintEl.textContent = currentModule().hint;
}

/** Shows the peer list (1:1 duel games) or the room list (room games) for whichever game tab is selected. */
function renderMatchingList(): void {
  const isRoomGame = currentModule().matching === 'room';
  peerListEl.hidden = isRoomGame;
  roomListEl.hidden = !isRoomGame;
  if (isRoomGame) renderRoomList();
  else renderPeerList();
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

function renderRoomList(): void {
  const gameRooms = rooms.filter((r) => r.gameId === selectedGameId);
  panelTitle.textContent = gameRooms.length === 0 ? '열린 방 없음' : `열린 방 ${gameRooms.length}개`;

  roomListEl.innerHTML = '';
  const create = document.createElement('li');
  create.className = 'create';
  create.textContent = '+ 새 방 만들기';
  create.addEventListener('click', () => window.overlayLupin.createRoom(selectedGameId, currentModule().roomCapacity));
  roomListEl.appendChild(create);

  for (const room of gameRooms) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = room.name;
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = `${room.memberCount}/${room.capacity}`;
    li.append(name, count);
    li.addEventListener('click', () => window.overlayLupin.joinRoom(room.id));
    roomListEl.appendChild(li);
  }
}

function renderLobby(roster: RoomRoster): void {
  lobbyTitle.textContent = `${roster.name} · ${roster.members.length}/${roster.capacity}`;
  lobbyMembersEl.innerHTML = '';
  for (const member of roster.members) {
    const li = document.createElement('li');
    const isHostMember = member.id === roster.hostId;
    if (isHostMember) li.dataset.host = '';
    const name = document.createElement('span');
    name.textContent = member.name;
    li.appendChild(name);
    if (isHostMember) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = '방장';
      li.appendChild(tag);
    }
    lobbyMembersEl.appendChild(li);
  }

  const iAmHost = roster.hostId === myId;
  lobbyStartBtn.hidden = !iAmHost;
  lobbyWait.hidden = iAmHost;
}

quitBtn.addEventListener('click', () => window.overlayLupin.quit());
leaveBtn.addEventListener('click', endMatch);

idleIcon.addEventListener('click', () => {
  if (uiState === 'panel') {
    setUiState('idle');
    return;
  }
  renderGameTabs();
  renderMatchingList();
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

lobbyStartBtn.addEventListener('click', () => window.overlayLupin.startRoom());
lobbyLeaveBtn.addEventListener('click', () => {
  window.overlayLupin.leaveRoom();
  currentRoster = null;
  setUiState('idle');
});

// Capture phase, so this runs before a tab button's own click handler can
// rebuild #game-tabs and detach the very node `e.target` points at — checked
// afterward (bubble phase), `panel.contains(target)` would wrongly read false
// and close the panel on every tab switch.
document.addEventListener(
  'click',
  (e) => {
    if (uiState !== 'panel') return;
    const target = e.target as HTMLElement;
    if (!panel.contains(target) && !idleIcon.contains(target)) setUiState('idle');
  },
  true
);

/* --------------------------------------------------------------- Networking */

window.overlayLupin.onPeers((list) => {
  peers = list;
  statusDot.dataset.state = list.length > 0 ? 'found' : '';
  if (uiState === 'panel') renderMatchingList();
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

window.overlayLupin.onRooms((list) => {
  rooms = list;
  if (uiState === 'panel') renderMatchingList();
});

window.overlayLupin.onRoomRoster((roster) => {
  currentRoster = roster;
  if (uiState !== 'play') {
    renderLobby(roster);
    setUiState('lobby');
  }
});

window.overlayLupin.onRoomStarted((isHost, gameId) => beginRoomMatch(isHost, gameId));

window.overlayLupin.onRoomLost(() => {
  currentRoster = null;
  if (uiState === 'lobby' || uiState === 'play') {
    activeMatch = null;
    activeMatchMode = null;
    setUiState('idle');
  }
});

window.overlayLupin.onRoomMemberState((fromId, payload) => {
  activeMatch?.applyOpponentPacket({ from: fromId, ...(payload as Record<string, unknown>) });
});

window.overlayLupin.onRoomWorld((payload) => activeMatch?.applyOpponentPacket(payload));

window.overlayLupin.onRoomMemberLeft((peerId) => activeMatch?.removePeer?.(peerId));

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
    // A game with nothing to say up there gets no HUD at all.
    hud.hidden = status === '';
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
      const packet = activeMatch.buildOutgoingPacket();
      if (activeMatchMode === 'room') window.overlayLupin.sendRoomState(packet);
      else window.overlayLupin.sendLocalState(packet);
    }

    if (activeMatch.isOver()) endMatch();
  }

  requestAnimationFrame(frame);
}

idleIcon.title = '상대 찾기';
setUiState('idle');
requestAnimationFrame(frame);
