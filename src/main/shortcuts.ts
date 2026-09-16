import { app, BrowserWindow, globalShortcut, Menu } from 'electron';
import { DEFAULT_VISIBILITY_SHORTCUTS } from './settings.js';
import type { VisibilityShortcuts } from '../shared/shortcuts.js';

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

/** Whichever hide/show pair is currently held by the OS, so it can be released precisely on update/uninstall. */
let active: VisibilityShortcuts | null = null;

function bind(getWindow: () => BrowserWindow | null, shortcuts: VisibilityShortcuts): boolean {
  if (!globalShortcut.register(shortcuts.hide, () => getWindow()?.hide())) return false;
  if (!globalShortcut.register(shortcuts.show, () => getWindow()?.show())) {
    globalShortcut.unregister(shortcuts.hide);
    return false;
  }
  return true;
}

function unbind(shortcuts: VisibilityShortcuts): void {
  globalShortcut.unregister(shortcuts.hide);
  globalShortcut.unregister(shortcuts.show);
}

/**
 * PageUp/PageDown must work even when the overlay is hidden or another app is focused, so these
 * use globalShortcut (OS-wide) instead of the application menu.
 */
export function installVisibilityShortcuts(getWindow: () => BrowserWindow | null, shortcuts: VisibilityShortcuts): void {
  if (bind(getWindow, shortcuts)) {
    active = shortcuts;
    return;
  }
  // The saved pair no longer registers (OS conflict, corrupted config file, ...) — fall back to the
  // known-good defaults rather than leaving the overlay with no way to show/hide itself at all.
  if (bind(getWindow, DEFAULT_VISIBILITY_SHORTCUTS)) {
    active = { ...DEFAULT_VISIBILITY_SHORTCUTS };
  }
}

export function uninstallVisibilityShortcuts(): void {
  if (active) unbind(active);
  active = null;
}

/**
 * Swaps in a new hide/show pair (e.g. from the in-app shortcut recorder). Registers the new pair
 * before releasing the old one, so a bad accelerator — already claimed by the OS or another app —
 * is rejected without leaving the user with no working shortcut in the meantime.
 */
export function updateVisibilityShortcuts(getWindow: () => BrowserWindow | null, shortcuts: VisibilityShortcuts): boolean {
  if (shortcuts.hide === shortcuts.show) return false;

  const previous = active;
  if (previous) unbind(previous); // free the slot in case the new pair reuses one of the old keys

  if (bind(getWindow, shortcuts)) {
    active = shortcuts;
    return true;
  }

  if (previous) bind(getWindow, previous); // restore whatever was working before the failed attempt
  active = previous;
  return false;
}

export function getActiveVisibilityShortcuts(): VisibilityShortcuts {
  return active ?? DEFAULT_VISIBILITY_SHORTCUTS;
}
