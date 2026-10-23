import type { UpdateState } from '../shared/update';

/** electron-updater's events, reduced to what the UI cares about. */
export type UpdaterEvent =
  | { type: 'check'; manual: boolean }
  | { type: 'available'; version: string }
  | { type: 'not-available' }
  | { type: 'progress'; percent: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error' };

export interface UpdaterModel {
  state: UpdateState;
  /** Whether the check in flight was asked for by the user — only those report "checking"/"latest"/check errors. */
  manual: boolean;
}

export const INITIAL_UPDATER: UpdaterModel = { state: { kind: 'idle' }, manual: false };

/**
 * Background checks run every few hours and fail whenever the machine is offline, so their failures
 * stay silent. A download failure is always surfaced: by then the user has seen the progress bar.
 */
export function reduceUpdater(model: UpdaterModel, event: UpdaterEvent): UpdaterModel {
  const { state } = model;
  switch (event.type) {
    case 'check':
      if (state.kind === 'downloading' || state.kind === 'ready') return model;
      return event.manual ? { state: { kind: 'checking' }, manual: true } : { state, manual: false };
    case 'available':
      return { state: { kind: 'downloading', version: event.version, percent: 0 }, manual: false };
    case 'not-available':
      return { state: { kind: model.manual ? 'latest' : 'idle' }, manual: false };
    case 'progress':
      if (state.kind !== 'downloading') return model;
      return { ...model, state: { ...state, percent: clampPercent(event.percent) } };
    case 'downloaded':
      return { state: { kind: 'ready', version: event.version }, manual: false };
    case 'error':
      if (state.kind === 'downloading') return { state: { kind: 'error', stage: 'download' }, manual: false };
      if (model.manual) return { state: { kind: 'error', stage: 'check' }, manual: false };
      return { ...model, manual: false };
  }
}

function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, Math.floor(percent)));
}
