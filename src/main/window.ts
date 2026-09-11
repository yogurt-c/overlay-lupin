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
      nodeIntegration: false
    }
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  win.loadFile(path.join(__dirname, '../renderer/index.html'));

  return win;
}
