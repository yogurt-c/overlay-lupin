import { app, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

/**
 * electron-updater hits the GitHub Releases API directly (no server of our own needed), so this
 * only works against packaged builds published with `--publish=always` — those runs are the ones
 * that upload the latest-mac.yml / latest.yml metadata + zip/nsis artifacts the updater reads.
 * Running unpackaged (`npm run dev`) has no update feed at all, so skip entirely in that case.
 */
export function installAutoUpdater(): void {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    dialog
      .showMessageBox({
        type: 'info',
        buttons: ['업데이트', '나중에'],
        defaultId: 0,
        cancelId: 1,
        title: '업데이트 발견',
        message: `새 버전 ${info.version}이 있습니다. 업데이트하시겠습니까?`,
        detail: '업데이트를 누르면 백그라운드에서 다운로드하고, 완료되면 다시 알려드립니다.'
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.downloadUpdate().catch((err) => console.error('[updater] download failed:', err));
      });
  });

  autoUpdater.on('update-downloaded', (info) => {
    dialog
      .showMessageBox({
        type: 'info',
        buttons: ['지금 재시작', '나중에'],
        defaultId: 0,
        cancelId: 1,
        title: '업데이트 준비됨',
        message: `새 버전 ${info.version}이 다운로드되었습니다.`,
        detail: '지금 재시작하면 바로 적용됩니다. 나중에를 선택하면 다음 종료 시 자동으로 적용됩니다.'
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      });
  });

  autoUpdater.on('error', (err) => {
    console.error('[updater] error:', err);
  });

  autoUpdater.checkForUpdates().catch((err) => console.error('[updater] check failed:', err));
  setInterval(() => {
    autoUpdater.checkForUpdates().catch((err) => console.error('[updater] check failed:', err));
  }, CHECK_INTERVAL_MS);
}
