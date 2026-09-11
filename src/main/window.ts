import { BrowserWindow } from 'electron';
import path from 'node:path';

export function createGameWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 320,
    height: 280,
    minWidth: 160,
    minHeight: 120,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Without this, losing focus throttles requestAnimationFrame almost to a halt — the host then
      // stops broadcasting room state, and everyone else's client-side ROOM_TIMEOUT_MS trips and boots
      // them. This overlay is meant to sit unfocused in the background by design, so keep it full-rate.
      backgroundThrottling: false
    }
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  win.loadFile(path.join(__dirname, '../renderer/index.html'));

  return win;
}
