import { app, ipcMain, type BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdateInfo, UpdateState } from '../shared/update';
import { INITIAL_UPDATER, reduceUpdater, type UpdaterEvent, type UpdaterModel } from './update-state';

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

/**
 * electron-updater hits the GitHub Releases API directly (no server of our own needed), so this
 * only works against packaged builds published with `--publish=always` — those runs are the ones
 * that upload the latest-mac.yml / latest.yml metadata + zip/nsis artifacts the updater reads.
 * Running unpackaged (`npm run dev`) has no update feed at all, so it reports `unsupported` instead.
 *
 * Progress and prompts render inside the overlay rather than as native dialogs: the game window sits at
 * the screen-saver level, so a parentless dialog fights it for focus and stacking order.
 */
export function installAutoUpdater(getWindow: () => BrowserWindow | null): void {
  let model: UpdaterModel = app.isPackaged ? INITIAL_UPDATER : { state: { kind: 'unsupported' }, manual: false };
  const fromWindow = (sender: Electron.WebContents) => sender === getWindow()?.webContents;

  const dispatch = (event: UpdaterEvent) => {
    const next = reduceUpdater(model, event);
    if (next === model) return;
    const changed = !sameState(next.state, model.state);
    model = next;
    if (changed) getWindow()?.webContents.send('update:state', model.state);
  };

  const check = (manual: boolean) => {
    if (!app.isPackaged) return;
    // A download in flight or waiting for restart ignores checks; a manual one just re-announces it.
    if (model.state.kind === 'downloading' || model.state.kind === 'ready') {
      if (manual) getWindow()?.webContents.send('update:state', model.state);
      return;
    }
    dispatch({ type: 'check', manual });
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[updater] check failed:', err);
      dispatch({ type: 'error' });
    });
  };

  ipcMain.handle('update:get', (event): UpdateInfo | null =>
    fromWindow(event.sender) ? { currentVersion: app.getVersion(), state: model.state } : null
  );
  ipcMain.on('update:check', (event) => {
    if (fromWindow(event.sender)) check(true);
  });
  ipcMain.on('update:install', (event) => {
    if (fromWindow(event.sender) && model.state.kind === 'ready') autoUpdater.quitAndInstall();
  });

  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => dispatch({ type: 'available', version: info.version }));
  autoUpdater.on('update-not-available', () => dispatch({ type: 'not-available' }));
  autoUpdater.on('download-progress', (progress) => dispatch({ type: 'progress', percent: progress.percent }));
  autoUpdater.on('update-downloaded', (info) => dispatch({ type: 'downloaded', version: info.version }));
  autoUpdater.on('error', (err) => {
    console.error('[updater] error:', err);
    dispatch({ type: 'error' });
  });

  check(false);
  setInterval(() => check(false), CHECK_INTERVAL_MS);
}

/** download-progress fires many times per percent; only whole-percent changes are worth an IPC hop. */
function sameState(a: UpdateState, b: UpdateState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
