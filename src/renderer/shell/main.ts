import { advanceSendClock } from '../lib/send-clock.js';
import { advanceSketchSeed } from '../lib/sketch.js';
import { acceleratorFromKeyboardEvent } from '../lib/accelerator.js';
import { GAME_MODULES } from '../games/registry.js';
import type { GameMatch, GameModule } from '../games/types.js';
import type { PeerInfo, RoomInfo, RoomRoster, VisibilityShortcuts } from '../types.js';

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
const variantChoiceEl = document.getElementById('variant-choice') as HTMLDivElement;
const variantButtonsEl = document.getElementById('variant-buttons') as HTMLDivElement;
const modeChoiceEl = document.getElementById('mode-choice') as HTMLDivElement;
const soloBtn = document.getElementById('solo-btn') as HTMLButtonElement;
const versusBtn = document.getElementById('versus-btn') as HTMLButtonElement;
const matchViewEl = document.getElementById('match-view') as HTMLDivElement;
const modeBackBtn = document.getElementById('mode-back-btn') as HTMLButtonElement;
const peerListEl = document.getElementById('peer-list') as HTMLUListElement;
const roomListEl = document.getElementById('room-list') as HTMLUListElement;
const hud = document.getElementById('hud') as HTMLDivElement;
const scoreEl = document.getElementById('score') as HTMLSpanElement;
const bannerEl = document.getElementById('banner') as HTMLDivElement;
const reconnectMsg = document.getElementById('reconnect-msg') as HTMLDivElement;
const quitBtn = document.getElementById('quit-btn') as HTMLButtonElement;
const settingsBtn = document.getElementById('settings-btn') as HTMLButtonElement;
const settingsPanel = document.getElementById('settings-panel') as HTMLDivElement;
const shortcutHideBtn = document.getElementById('shortcut-hide-btn') as HTMLButtonElement;
const shortcutShowBtn = document.getElementById('shortcut-show-btn') as HTMLButtonElement;
const settingsResetBtn = document.getElementById('settings-reset-btn') as HTMLButtonElement;
const settingsMsg = document.getElementById('settings-msg') as HTMLParagraphElement;
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
/** Which half of the panel is showing: the 혼자하기/같이하기 choice, or the peer/room search. Reset whenever the panel (re)opens or the game tab changes. */
let panelStep: 'mode' | 'match' = 'mode';
/** Rule variant picked per game, remembered while the app is open. Absent means the game's default. */
const selectedVariants = new Map<string, string>();
let activeMatch: GameMatch | null = null;
let activeMatchMode: 'duel' | 'room' | 'solo' | null = null;
let activeInput: { read(): unknown; clear(): void } | null = null;
let peers: PeerInfo[] = [];
let rooms: RoomInfo[] = [];
let currentRoster: RoomRoster | null = null;
let incomingPeerId: string | null = null;
/** null until the first sync, so a match that wants no status line still clears the HUD. */
let lastScoreText: string | null = null;
/**
 * null (not '') for the same reason as lastScoreText above: syncHud only writes bannerEl when banner
 * !== lastBannerText. If this were reset to '' on match start and the new game's own banner also
 * happens to be '' (e.g. cell's hud() always returns banner: ''), the diff check would see '' === ''
 * and skip the write forever — leaving the previous match's stale banner text (e.g. soccer's "승리")
 * on screen indefinitely. null guarantees the very next syncHud() always writes, regardless of what
 * the new match's banner value is.
 */
let lastBannerText: string | null = null;
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
  // Safety net alongside the lastBannerText fix above: syncHud only runs while uiState === 'play', so
  // leaving play (match over, back to idle/panel) must hide any stale banner directly here rather than
  // waiting for a syncHud() that won't run again until the next match starts.
  if (next !== 'play') bannerEl.hidden = true;
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

/** `gameId`/`variant` are authoritative — for the host it's whatever was selected; for the
 * invitee it's whatever the host actually invited to, which may differ from
 * whatever tab they last had open. */
function beginMatch(isHost: boolean, gameId: string, variant?: string): void {
  incomingPeerId = null;
  startMatch('duel', isHost, gameId, variant);
}

function beginRoomMatch(isHost: boolean, gameId: string): void {
  currentRoster = null;
  startMatch('room', isHost, gameId);
}

function startMatch(mode: 'duel' | 'room', isHost: boolean, gameId: string, variant?: string): void {
  const module = GAME_MODULES.find((m) => m.id === gameId) ?? GAME_MODULES[0];
  selectedGameId = module.id;
  activeMatchMode = mode;
  activeMatch = module.createMatch(isHost, myId, myName, knownVariant(module, variant));
  activeInput = inputSources.get(module.id) ?? null;
  stepAccumulator = 0;
  lastFrameAt = performance.now();
  lastScoreText = null;
  lastBannerText = null;
  setUiState('play');
}

/** No networking involved at all — the game's own bot stands in for the opponent. */
function beginSoloMatch(): void {
  const module = currentModule();
  if (!module.createSoloMatch) return;
  activeMatchMode = 'solo';
  activeMatch = module.createSoloMatch(myId, myName, variantOf(module));
  activeInput = inputSources.get(module.id) ?? null;
  stepAccumulator = 0;
  lastFrameAt = performance.now();
  lastScoreText = null;
  lastBannerText = null;
  setUiState('play');
}

function endMatch(): void {
  if (activeMatchMode === 'room') window.overlayLupin.leaveRoom();
  else if (activeMatchMode === 'duel') window.overlayLupin.leaveMatch();
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
      panelStep = 'mode';
      renderGameTabs();
      renderPanelBody();
    });
    gameTabsEl.appendChild(btn);
  }
  renderVariants();
}

function variantOf(module: GameModule): string | undefined {
  return module.variants ? selectedVariants.get(module.id) ?? module.variants[0].id : undefined;
}

/** A variant that arrived over the network is only a hint; anything unrecognised falls back to the default. */
function knownVariant(module: GameModule, variant: string | undefined): string | undefined {
  return module.variants?.some((v) => v.id === variant) ? variant : variantOf(module);
}

/** The rule chooser sits above 혼자하기/같이하기; games without variants simply have no row. */
function renderVariants(): void {
  const module = currentModule();
  const variants = module.variants ?? [];
  const chosen = variantOf(module);
  variantChoiceEl.hidden = variants.length === 0;
  variantButtonsEl.innerHTML = '';
  for (const variant of variants) {
    const btn = document.createElement('button');
    btn.textContent = variant.label;
    btn.classList.toggle('active', variant.id === chosen);
    btn.addEventListener('click', () => {
      selectedVariants.set(module.id, variant.id);
      renderVariants();
    });
    variantButtonsEl.appendChild(btn);
  }
  const hint = variants.find((v) => v.id === chosen)?.hint;
  hintEl.textContent = hint ? `${module.hint}\n${hint}` : module.hint;
}

/** Picks between the 혼자하기/같이하기 choice and the peer/room search, per `panelStep`. */
function renderPanelBody(): void {
  const showMode = panelStep === 'mode';
  modeChoiceEl.hidden = !showMode;
  matchViewEl.hidden = showMode;
  if (showMode) {
    panelTitle.textContent = currentModule().label;
    soloBtn.disabled = !currentModule().createSoloMatch;
  } else {
    renderMatchingList();
  }
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
    li.addEventListener('click', () => window.overlayLupin.invite(peer.id, selectedGameId, variantOf(currentModule())));
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

/* ------------------------------------------------------------- Shortcuts panel */

let shortcuts: VisibilityShortcuts = { hide: 'PageDown', show: 'PageUp' };
/** Which of the two accelerators is currently waiting for its next keypress, if any. */
let recordingKey: 'hide' | 'show' | null = null;

window.overlayLupin.getShortcuts().then((current) => {
  shortcuts = current;
  renderShortcuts();
});

function renderShortcuts(): void {
  if (recordingKey !== 'hide') shortcutHideBtn.textContent = shortcuts.hide;
  if (recordingKey !== 'show') shortcutShowBtn.textContent = shortcuts.show;
}

function startRecording(key: 'hide' | 'show'): void {
  recordingKey = key;
  settingsMsg.textContent = '';
  shortcutHideBtn.classList.toggle('recording', key === 'hide');
  shortcutShowBtn.classList.toggle('recording', key === 'show');
  (key === 'hide' ? shortcutHideBtn : shortcutShowBtn).textContent = '키 입력 대기…';
  // Otherwise pressing a key that matches the currently-bound hide/show pair gets swallowed by
  // the OS-level global accelerator before it ever reaches this window's keydown listener.
  window.overlayLupin.pauseShortcuts();
}

function stopRecording(): void {
  recordingKey = null;
  shortcutHideBtn.classList.remove('recording');
  shortcutShowBtn.classList.remove('recording');
  renderShortcuts();
  window.overlayLupin.resumeShortcuts();
}

async function applyShortcuts(next: VisibilityShortcuts): Promise<void> {
  const result = await window.overlayLupin.setShortcuts(next);
  shortcuts = result.shortcuts;
  settingsMsg.textContent = result.ok ? '' : '이미 다른 곳에서 사용 중인 단축키입니다.';
  renderShortcuts();
}

shortcutHideBtn.addEventListener('click', () => startRecording('hide'));
shortcutShowBtn.addEventListener('click', () => startRecording('show'));

settingsResetBtn.addEventListener('click', async () => {
  const result = await window.overlayLupin.resetShortcuts();
  shortcuts = result.shortcuts;
  settingsMsg.textContent = '';
  renderShortcuts();
});

settingsBtn.addEventListener('click', () => {
  settingsPanel.hidden = !settingsPanel.hidden;
  if (settingsPanel.hidden) stopRecording();
  else settingsMsg.textContent = '';
});

// Closing the panel from outside also cancels an in-progress recording, same as #panel's own
// click-outside handler below.
document.addEventListener(
  'click',
  (e) => {
    if (settingsPanel.hidden) return;
    const target = e.target as HTMLElement;
    if (!settingsPanel.contains(target) && !settingsBtn.contains(target)) {
      settingsPanel.hidden = true;
      stopRecording();
    }
  },
  true
);

// Capture phase so a recording in progress swallows the keypress before it can reach a game's
// own input listener (all of which are also attached to `window`).
window.addEventListener(
  'keydown',
  (e) => {
    if (!recordingKey) return;
    e.preventDefault();

    if (e.key === 'Escape') {
      stopRecording();
      return;
    }

    const result = acceleratorFromKeyboardEvent(e);
    if (!result.ok) {
      if (result.reason === 'unsafe-alone') {
        settingsMsg.textContent = '영문·숫자·특수문자 키는 단독으로 사용할 수 없습니다. Cmd, Ctrl, Alt 중 하나와 함께 눌러주세요.';
      } else if (result.reason === 'unsupported') {
        settingsMsg.textContent = '지원하지 않는 키입니다. 다른 키를 눌러주세요.';
      }
      return; // keep waiting for a usable combo
    }

    const key = recordingKey;
    const next = { ...shortcuts, [key]: result.accelerator };
    if (next.hide === next.show) {
      settingsMsg.textContent = '숨기기와 보이기는 서로 다른 키로 설정해주세요.';
      return;
    }

    stopRecording();
    applyShortcuts(next);
  },
  true
);

/** First click arms a short confirm window (visually flagged via .armed + a warning tooltip) instead of leaving immediately; a second click within it actually leaves. Resets on its own if the player doesn't confirm. */
let leaveArmedTimer: ReturnType<typeof setTimeout> | null = null;
leaveBtn.addEventListener('click', () => {
  if (leaveArmedTimer) {
    clearTimeout(leaveArmedTimer);
    leaveArmedTimer = null;
    leaveBtn.classList.remove('armed');
    leaveBtn.title = '나가기';
    endMatch();
    return;
  }
  leaveBtn.classList.add('armed');
  leaveBtn.title = '한 번 더 누르면 나갑니다';
  leaveArmedTimer = setTimeout(() => {
    leaveArmedTimer = null;
    leaveBtn.classList.remove('armed');
    leaveBtn.title = '나가기';
  }, 3000);
});

idleIcon.addEventListener('click', () => {
  if (uiState === 'panel') {
    setUiState('idle');
    return;
  }
  panelStep = 'mode';
  renderGameTabs();
  renderPanelBody();
  setUiState('panel');
});

soloBtn.addEventListener('click', () => {
  if (soloBtn.disabled) return;
  beginSoloMatch();
});

versusBtn.addEventListener('click', () => {
  panelStep = 'match';
  renderPanelBody();
});

modeBackBtn.addEventListener('click', () => {
  panelStep = 'mode';
  renderPanelBody();
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
  if (uiState === 'panel' && panelStep === 'match') renderMatchingList();
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

window.overlayLupin.onMatchFound((_peer, isHost, gameId, variant) => beginMatch(isHost, gameId, variant));

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
  if (uiState === 'panel' && panelStep === 'match') renderMatchingList();
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

    const sendAt = advanceSendClock(lastSentAt, now, SEND_INTERVAL_MS);
    if (activeMatchMode !== 'solo' && sendAt > lastSentAt) {
      lastSentAt = sendAt;
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
