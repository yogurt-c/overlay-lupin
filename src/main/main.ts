import { app, ipcMain, BrowserWindow } from 'electron';
import { createGameWindow } from './window';
import { GameNetwork } from './network';

let win: BrowserWindow | null = null;
const net = new GameNetwork();

app.whenReady().then(() => {
  win = createGameWindow();
  net.start();

  net.on('peers', (peers) => win?.webContents.send('net:peers', peers));
  net.on('invite-sent', (peer) => win?.webContents.send('net:invite-sent', peer));
  net.on('invite-received', (peer) => win?.webContents.send('net:invite-received', peer));
  net.on('invite-cleared', (reason) => win?.webContents.send('net:invite-cleared', reason));
  net.on('match-found', (peer, isHost, gameId) => win?.webContents.send('net:match-found', { peer, isHost, gameId }));
  net.on('match-lost', (reason) => win?.webContents.send('net:match-lost', reason));
  net.on('opponent-state', (payload) => win?.webContents.send('net:opponent-state', payload));

  ipcMain.on('net:invite', (_event, { peerId, gameId }: { peerId: string; gameId: string }) =>
    net.invite(peerId, gameId)
  );
  ipcMain.on('net:cancel-invite', () => net.cancelInvite());
  ipcMain.on('net:accept-invite', (_event, peerId: string) => net.acceptInvite(peerId));
  ipcMain.on('net:decline-invite', (_event, peerId: string) => net.declineInvite(peerId));
  ipcMain.on('net:leave', () => net.leaveMatch());
  ipcMain.on('net:pos', (_event, payload: unknown) => net.sendLocalState(payload));
  ipcMain.handle('net:whoami', () => ({ id: net.myId, name: net.myName }));
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
