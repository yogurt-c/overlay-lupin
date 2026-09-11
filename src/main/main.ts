import { app, ipcMain, BrowserWindow } from 'electron';
import { createGameWindow } from './window';
import { GameNetwork } from './network';
import { installQuitMenu, installVisibilityShortcuts, uninstallVisibilityShortcuts } from './shortcuts';

let win: BrowserWindow | null = null;
const net = new GameNetwork();

app.whenReady().then(() => {
  win = createGameWindow();
  net.start();

  installQuitMenu();
  installVisibilityShortcuts(() => win);

  net.on('peers', (peers) => win?.webContents.send('net:peers', peers));
  net.on('invite-sent', (peer) => win?.webContents.send('net:invite-sent', peer));
  net.on('invite-received', (peer) => win?.webContents.send('net:invite-received', peer));
  net.on('invite-cleared', (reason) => win?.webContents.send('net:invite-cleared', reason));
  net.on('match-found', (peer, isHost, gameId) => win?.webContents.send('net:match-found', { peer, isHost, gameId }));
  net.on('match-lost', (reason) => win?.webContents.send('net:match-lost', reason));
  net.on('opponent-state', (payload) => win?.webContents.send('net:opponent-state', payload));

  net.on('rooms', (rooms) => win?.webContents.send('net:rooms', rooms));
  net.on('room-roster', (roster) => win?.webContents.send('net:room-roster', roster));
  net.on('room-started', (isHost, gameId) => win?.webContents.send('net:room-started', { isHost, gameId }));
  net.on('room-lost', (reason) => win?.webContents.send('net:room-lost', reason));
  net.on('room-member-state', (fromId, payload) => win?.webContents.send('net:room-member-state', { fromId, payload }));
  net.on('room-world', (payload) => win?.webContents.send('net:room-world', payload));
  net.on('room-member-left', (peerId) => win?.webContents.send('net:room-member-left', peerId));

  ipcMain.on('net:invite', (_event, { peerId, gameId }: { peerId: string; gameId: string }) =>
    net.invite(peerId, gameId)
  );
  ipcMain.on('net:cancel-invite', () => net.cancelInvite());
  ipcMain.on('net:accept-invite', (_event, peerId: string) => net.acceptInvite(peerId));
  ipcMain.on('net:decline-invite', (_event, peerId: string) => net.declineInvite(peerId));
  ipcMain.on('net:leave', () => net.leaveMatch());
  ipcMain.on('net:pos', (_event, payload: unknown) => net.sendLocalState(payload));
  ipcMain.handle('net:whoami', () => ({ id: net.myId, name: net.myName }));

  ipcMain.on('net:create-room', (_event, { gameId, capacity }: { gameId: string; capacity?: number }) =>
    net.createRoom(gameId, capacity)
  );
  ipcMain.on('net:join-room', (_event, roomId: string) => net.joinRoom(roomId));
  ipcMain.on('net:leave-room', () => net.leaveRoom());
  ipcMain.on('net:start-room', () => net.startRoom());
  ipcMain.on('net:room-pos', (_event, payload: unknown) => net.sendRoomState(payload));

  ipcMain.on('app:quit', () => app.quit());

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
