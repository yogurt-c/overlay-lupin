import { updateNotice, updateStatusText, type UpdateState } from '../../shared/update.js';

const noticeEl = document.getElementById('update-notice') as HTMLDivElement;
const textEl = document.getElementById('update-text') as HTMLSpanElement;
const progressEl = document.getElementById('update-progress') as HTMLSpanElement;
const progressFillEl = document.getElementById('update-progress-fill') as HTMLSpanElement;
const percentEl = document.getElementById('update-percent') as HTMLSpanElement;
const actionBtn = document.getElementById('update-action-btn') as HTMLButtonElement;
const dismissBtn = document.getElementById('update-dismiss-btn') as HTMLButtonElement;
const versionEl = document.getElementById('app-version') as HTMLSpanElement;
const checkBtn = document.getElementById('update-check-btn') as HTMLButtonElement;
const statusEl = document.getElementById('update-status') as HTMLParagraphElement;

const ACTION_LABEL = { install: '재시작', retry: '다시 시도' } as const;

let state: UpdateState = { kind: 'idle' };
/** Hidden during a match so a progress bar never sits on top of play; it comes back afterwards. */
let suppressed = false;
/** An error notice the user closed stays closed until the updater moves to another state. */
let dismissed = false;

export function installUpdateNotice(): void {
  window.overlayLupin.getUpdateInfo().then((info) => {
    if (!info) return;
    versionEl.textContent = `v${info.currentVersion}`;
    setState(info.state);
  }).catch((err) => console.error('[update] failed to load state:', err));
  window.overlayLupin.onUpdateState(setState);

  actionBtn.addEventListener('click', () => runAction(updateNotice(state)?.action ?? null));
  dismissBtn.addEventListener('click', () => {
    dismissed = true;
    render();
  });
  checkBtn.addEventListener('click', () => {
    if (state.kind === 'ready') window.overlayLupin.installUpdate();
    else window.overlayLupin.checkForUpdate();
  });
  render();
}

export function setUpdateNoticeSuppressed(next: boolean): void {
  if (suppressed === next) return;
  suppressed = next;
  render();
}

function setState(next: UpdateState): void {
  if (next.kind !== state.kind) dismissed = false;
  state = next;
  render();
}

function runAction(action: 'install' | 'retry' | null): void {
  if (action === 'install') window.overlayLupin.installUpdate();
  else if (action === 'retry') window.overlayLupin.checkForUpdate();
}

function render(): void {
  const notice = updateNotice(state);
  noticeEl.hidden = !notice || suppressed || dismissed;
  if (notice) {
    noticeEl.dataset.kind = state.kind;
    textEl.textContent = notice.text;
    progressEl.hidden = notice.percent === null;
    percentEl.hidden = notice.percent === null;
    if (notice.percent !== null) {
      progressFillEl.style.transform = `scaleX(${notice.percent / 100})`;
      percentEl.textContent = `${notice.percent}%`;
    }
    actionBtn.hidden = notice.action === null;
    if (notice.action) actionBtn.textContent = ACTION_LABEL[notice.action];
    dismissBtn.hidden = state.kind !== 'error';
  }

  statusEl.textContent = updateStatusText(state);
  statusEl.classList.toggle('error', state.kind === 'error');
  checkBtn.textContent = state.kind === 'ready' ? '재시작' : '업데이트 확인';
  checkBtn.disabled = state.kind === 'unsupported' || state.kind === 'checking' || state.kind === 'downloading';
}
