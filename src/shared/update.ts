/** What the in-app updater is doing right now, as seen by the renderer. */
export type UpdateState =
  | { kind: 'unsupported' }
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'latest' }
  | { kind: 'downloading'; version: string; percent: number }
  | { kind: 'ready'; version: string }
  | { kind: 'error'; stage: 'check' | 'download' };

export interface UpdateInfo {
  currentVersion: string;
  state: UpdateState;
}

export interface UpdateNotice {
  text: string;
  /** 0–100 while downloading, null otherwise. */
  percent: number | null;
  action: 'install' | 'retry' | null;
}

const ERROR_TEXT = { check: '업데이트를 확인하지 못했어요', download: '업데이트를 받지 못했어요' } as const;

/** The overlay notice for states worth interrupting the user for; null keeps it hidden. */
export function updateNotice(state: UpdateState): UpdateNotice | null {
  switch (state.kind) {
    case 'downloading': return { text: `v${state.version} 받는 중`, percent: state.percent, action: null };
    case 'ready': return { text: `v${state.version} 준비됨`, percent: null, action: 'install' };
    case 'error': return { text: ERROR_TEXT[state.stage], percent: null, action: 'retry' };
    default: return null;
  }
}

/** One-line status under the settings panel's 업데이트 확인 button. */
export function updateStatusText(state: UpdateState): string {
  switch (state.kind) {
    case 'unsupported': return '개발 빌드에서는 확인할 수 없어요.';
    case 'idle': return '';
    case 'checking': return '확인 중…';
    case 'latest': return '최신 버전이에요.';
    case 'downloading': return `v${state.version} 받는 중 (${state.percent}%)`;
    case 'ready': return `v${state.version} 준비됨 · 재시작하면 적용돼요.`;
    case 'error': return `${ERROR_TEXT[state.stage]}.`;
  }
}
