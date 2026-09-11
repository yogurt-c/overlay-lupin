import { app, BrowserWindow, globalShortcut, Menu } from 'electron';

const isMac = process.platform === 'darwin';

/**
 * Quit accelerators only fire while this app is the focused/active app, which is fine since
 * quitting only makes sense while the user is interacting with the overlay anyway. Cmd+W would
 * normally just close the window (app stays alive in the dock on mac), so it's bound to a full
 * quit here to match the "close the program" expectation from other apps.
 */
export function installQuitMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
        { label: 'Close', accelerator: isMac ? 'Cmd+W' : 'Alt+F4', click: () => app.quit() }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/**
 * PageUp/PageDown must work even when the overlay is hidden or another app is focused, so these
 * use globalShortcut (OS-wide) instead of the application menu.
 */
export function installVisibilityShortcuts(getWindow: () => BrowserWindow | null): void {
  globalShortcut.register('PageDown', () => {
    getWindow()?.hide();
  });

  globalShortcut.register('PageUp', () => {
    getWindow()?.show();
  });
}

export function uninstallVisibilityShortcuts(): void {
  globalShortcut.unregisterAll();
}
