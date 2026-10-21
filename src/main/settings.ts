import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { VisibilityShortcuts } from '../shared/shortcuts.js';
import { normalizeNickname } from '../shared/nickname.js';

export const DEFAULT_VISIBILITY_SHORTCUTS: VisibilityShortcuts = {
  hide: 'PageDown',
  show: 'PageUp'
};

function settingsFilePath(): string {
  return path.join(app.getPath('userData'), 'shortcuts.json');
}

/**
 * Falls back to the default pair whenever the file is missing, unreadable, or only partially
 * valid — a corrupt or half-written config should never leave the overlay unable to hide/show.
 */
export function loadVisibilityShortcuts(): VisibilityShortcuts {
  try {
    const raw = fs.readFileSync(settingsFilePath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<VisibilityShortcuts>;
    const hide = typeof parsed.hide === 'string' && parsed.hide.length > 0 ? parsed.hide : DEFAULT_VISIBILITY_SHORTCUTS.hide;
    const show = typeof parsed.show === 'string' && parsed.show.length > 0 ? parsed.show : DEFAULT_VISIBILITY_SHORTCUTS.show;
    return { hide, show };
  } catch {
    return { ...DEFAULT_VISIBILITY_SHORTCUTS };
  }
}

export function saveVisibilityShortcuts(shortcuts: VisibilityShortcuts): void {
  fs.mkdirSync(path.dirname(settingsFilePath()), { recursive: true });
  fs.writeFileSync(settingsFilePath(), JSON.stringify(shortcuts, null, 2), 'utf-8');
}

function profileFilePath(): string {
  return path.join(app.getPath('userData'), 'profile.json');
}

/** null when no nickname was ever saved (or the file is unusable) — the caller falls back to the hostname. */
export function loadNickname(): string | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(profileFilePath(), 'utf-8')) as { nickname?: unknown };
    return normalizeNickname(parsed.nickname);
  } catch {
    return null;
  }
}

export function saveNickname(nickname: string): void {
  fs.mkdirSync(path.dirname(profileFilePath()), { recursive: true });
  fs.writeFileSync(profileFilePath(), JSON.stringify({ nickname }, null, 2), 'utf-8');
}
