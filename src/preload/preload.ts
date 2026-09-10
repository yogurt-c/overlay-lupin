import { contextBridge, ipcRenderer } from 'electron';
import type { PeerInfo } from '../shared/protocol.js';

contextBridge.exposeInMainWorld('overlayLupin', {
  whoAmI: (): Promise<{ id: string; name: string }> => ipcRenderer.invoke('net:whoami'),

  onPeers: (cb: (peers: PeerInfo[]) => void) => {
    ipcRenderer.on('net:peers', (_e, peers) => cb(peers));
  },
  onInviteSent: (cb: (peer: PeerInfo) => void) => {
    ipcRenderer.on('net:invite-sent', (_e, peer) => cb(peer));
  },
  onInviteReceived: (cb: (peer: PeerInfo) => void) => {
    ipcRenderer.on('net:invite-received', (_e, peer) => cb(peer));
  },
  onInviteCleared: (cb: (reason: 'declined' | 'cancelled' | 'timeout') => void) => {
    ipcRenderer.on('net:invite-cleared', (_e, reason) => cb(reason));
  },
  onMatchFound: (cb: (peer: PeerInfo, isHost: boolean, gameId: string) => void) => {
    ipcRenderer.on('net:match-found', (_e, data) => cb(data.peer, data.isHost, data.gameId));
  },
  onMatchLost: (cb: (reason: 'left' | 'timeout') => void) => {
    ipcRenderer.on('net:match-lost', (_e, reason) => cb(reason));
  },
  onOpponentState: (cb: (packet: unknown) => void) => {
    ipcRenderer.on('net:opponent-state', (_e, packet) => cb(packet));
  },

  invite: (peerId: string, gameId: string) => ipcRenderer.send('net:invite', { peerId, gameId }),
  cancelInvite: () => ipcRenderer.send('net:cancel-invite'),
  acceptInvite: (peerId: string) => ipcRenderer.send('net:accept-invite', peerId),
  declineInvite: (peerId: string) => ipcRenderer.send('net:decline-invite', peerId),
  leaveMatch: () => ipcRenderer.send('net:leave'),
  sendLocalState: (packet: unknown) => ipcRenderer.send('net:pos', packet),

  quit: () => ipcRenderer.send('app:quit')
});
