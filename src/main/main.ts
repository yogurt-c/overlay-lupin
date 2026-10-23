import { app, ipcMain, BrowserWindow, dialog } from 'electron';
import fs from 'node:fs';
import { FishingStore } from './fishing-store';
import type { FishingAction, FishingReply } from '../shared/fishing';
import { createGameWindow } from './window';
import { GameNetwork } from './network';
import {
  installQuitMenu,
  installVisibilityShortcuts,
  uninstallVisibilityShortcuts,
  updateVisibilityShortcuts,
  getActiveVisibilityShortcuts,
  pauseVisibilityShortcuts,
  resumeVisibilityShortcuts
} from './shortcuts';
import { installAutoUpdater } from './updater';
import { loadVisibilityShortcuts, saveVisibilityShortcuts, DEFAULT_VISIBILITY_SHORTCUTS, loadNickname, saveNickname } from './settings';
import { normalizeNickname } from '../shared/nickname';
import type { VisibilityShortcuts } from '../shared/shortcuts.js';
import { GameAnalytics } from './analytics';
import type { AnalyticsStart } from '../shared/analytics';

let win: BrowserWindow | null = null;
const net = new GameNetwork(loadNickname() ?? undefined);

app.whenReady().then(() => {
  const analytics = new GameAnalytics({
    directory: app.getPath('userData'), version: app.getVersion(),
    platform: process.platform, packaged: app.isPackaged
  });
  const analyticsTimer = setInterval(() => { void analytics.flush(); }, 60_000);
  analyticsTimer.unref();
  app.once('before-quit', () => clearInterval(analyticsTimer));
  ipcMain.on('analytics:start', (event, input: AnalyticsStart) => {
    if (event.sender === win?.webContents) analytics.recordStart(input);
  });
  ipcMain.handle('analytics:get', () => analytics.getEnabled());
  ipcMain.handle('analytics:set', async (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') return { ok: false, enabled: await analytics.getEnabled() };
    const ok = await analytics.setEnabled(enabled);
    return { ok, enabled: await analytics.getEnabled() };
  });
  win = createGameWindow();
  net.start();
  const fishing = new FishingStore(app.getPath('userData'));
  const fishingReply = (fn: () => FishingReply): FishingReply => {
    try { return fn(); } catch (error) { return { ok: false, error: error instanceof Error ? error.message : '저장하지 못했습니다.' }; }
  };
  ipcMain.handle('fishing:load', () => fishingReply(() => ({ ok: true, data: fishing.load() })));
  ipcMain.handle('fishing:act', (_event, action: FishingAction) => fishingReply(() => ({ ok: true, data: fishing.act(action) })));
  ipcMain.handle('fishing:export', async () => {
    if (!win) return { ok: false };
    const result = await dialog.showSaveDialog(win, { title: '낚시 수집 데이터 내보내기', defaultPath: 'fishing-collection-backup.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (result.canceled || !result.filePath) return { ok: false, cancelled: true };
    return fishingReply(() => { fs.writeFileSync(result.filePath!, JSON.stringify(fishing.read(), null, 2), 'utf8'); return { ok: true }; });
  });
  ipcMain.handle('fishing:import', async () => {
    if (!win) return { ok: false };
    const result = await dialog.showOpenDialog(win, { title: '낚시 수집 데이터 합치기', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (result.canceled || !result.filePaths[0]) return { ok: false, cancelled: true };
    return fishingReply(() => {
      const filename = result.filePaths[0];
      if (fs.statSync(filename).size > 100 * 1024 * 1024) throw new Error('100MB 이하 파일을 선택해 주세요.');
      return { ok: true, data: fishing.merge(JSON.parse(fs.readFileSync(filename, 'utf8'))) };
    });
  });

  installQuitMenu();
  installVisibilityShortcuts(() => win, loadVisibilityShortcuts());
  installAutoUpdater(() => win);

  net.on('peers', (peers) => win?.webContents.send('net:peers', peers));
  net.on('invite-sent', (peer) => win?.webContents.send('net:invite-sent', peer));
  net.on('invite-received', (peer) => win?.webContents.send('net:invite-received', peer));
  net.on('invite-cleared', (reason) => win?.webContents.send('net:invite-cleared', reason));
  net.on('match-found', (peer, isHost, gameId, variant) => win?.webContents.send('net:match-found', { peer, isHost, gameId, variant }));
  net.on('match-lost', (reason) => win?.webContents.send('net:match-lost', reason));
  net.on('opponent-state', (payload) => win?.webContents.send('net:opponent-state', payload));

  net.on('rooms', (rooms) => win?.webContents.send('net:rooms', rooms));
  net.on('room-roster', (roster) => win?.webContents.send('net:room-roster', roster));
  net.on('room-started', (isHost, gameId) => win?.webContents.send('net:room-started', { isHost, gameId }));
  net.on('room-lost', (reason) => win?.webContents.send('net:room-lost', reason));
  net.on('room-promoted', (formerHostId) => win?.webContents.send('net:room-promoted', formerHostId));
  net.on('room-member-state', (fromId, payload) => win?.webContents.send('net:room-member-state', { fromId, payload }));
  net.on('room-world', (payload) => win?.webContents.send('net:room-world', payload));
  net.on('room-member-left', (peerId) => win?.webContents.send('net:room-member-left', peerId));

  ipcMain.on('net:invite', (_event, { peerId, gameId, variant }: { peerId: string; gameId: string; variant?: string }) =>
    net.invite(peerId, gameId, variant)
  );
  ipcMain.on('net:cancel-invite', () => net.cancelInvite());
  ipcMain.on('net:accept-invite', (_event, peerId: string) => net.acceptInvite(peerId));
  ipcMain.on('net:decline-invite', (_event, peerId: string) => net.declineInvite(peerId));
  ipcMain.on('net:leave', () => net.leaveMatch());
  ipcMain.on('net:pos', (_event, payload: unknown) => net.sendLocalState(payload));
  ipcMain.handle('net:whoami', () => ({ id: net.myId, name: net.myName }));
  ipcMain.handle('net:set-name', (_event, raw: unknown) => {
    const name = normalizeNickname(raw);
    if (!name) return { ok: false, reason: 'invalid', name: net.myName };
    if (!net.canRename()) return { ok: false, reason: 'busy', name: net.myName };
    try {
      saveNickname(name);
    } catch {
      return { ok: false, reason: 'save', name: net.myName };
    }
    net.rename(name);
    return { ok: true, name: net.myName };
  });

  ipcMain.on('net:create-room', (_event, { gameId, capacity }: { gameId: string; capacity?: number }) =>
    net.createRoom(gameId, capacity)
  );
  ipcMain.on('net:join-room', (_event, roomId: string) => net.joinRoom(roomId));
  ipcMain.on('net:leave-room', () => net.leaveRoom());
  ipcMain.on('net:start-room', () => net.startRoom());
  ipcMain.on('net:room-pos', (_event, payload: unknown) => net.sendRoomState(payload));

  ipcMain.on('app:quit', () => app.quit());

  ipcMain.handle('shortcuts:get', () => getActiveVisibilityShortcuts());
  ipcMain.handle('shortcuts:set', (_event, next: VisibilityShortcuts) => {
    const ok = updateVisibilityShortcuts(() => win, next);
    if (ok) saveVisibilityShortcuts(next);
    return { ok, shortcuts: getActiveVisibilityShortcuts() };
  });
  ipcMain.handle('shortcuts:reset', () => {
    const ok = updateVisibilityShortcuts(() => win, DEFAULT_VISIBILITY_SHORTCUTS);
    if (ok) saveVisibilityShortcuts(DEFAULT_VISIBILITY_SHORTCUTS);
    return { ok, shortcuts: getActiveVisibilityShortcuts() };
  });
  ipcMain.on('shortcuts:pause', () => pauseVisibilityShortcuts());
  ipcMain.on('shortcuts:resume', () => resumeVisibilityShortcuts(() => win));

  ipcMain.on('win:move-by', (_event, { dx, dy }: { dx: number; dy: number }) => {
    if (!win) return;
    const [x, y] = win.getPosition();
    win.setPosition(Math.round(x + dx), Math.round(y + dy));
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) win = createGameWindow();
  });
});

app.on('window-all-closed', () => {
  net.stop();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => net.stop());
app.on('will-quit', () => uninstallVisibilityShortcuts());
