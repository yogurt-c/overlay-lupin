import { contextBridge, ipcRenderer } from 'electron';

export interface PeerInfo {
  id: string;
  name: string;
  address: string;
}

export interface PlayerState {
  x: number;
  y: number;
  facing: 1 | -1;
  pose: 'idle' | 'run' | 'jump' | 'kick';
}

export interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
}

export type MatchPhase = 'kickoff' | 'play' | 'goal' | 'over';

export interface WorldState {
  ball: BallState;
  phase: MatchPhase;
  timer: number;
}

export interface OpponentPacket {
  player: PlayerState;
  world?: WorldState;
  score: [number, number];
}

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
  onMatchFound: (cb: (peer: PeerInfo, isHost: boolean) => void) => {
    ipcRenderer.on('net:match-found', (_e, data) => cb(data.peer, data.isHost));
  },
  onMatchLost: (cb: (reason: 'left' | 'timeout') => void) => {
    ipcRenderer.on('net:match-lost', (_e, reason) => cb(reason));
  },
  onOpponentState: (cb: (packet: OpponentPacket) => void) => {
    ipcRenderer.on('net:opponent-state', (_e, packet) => cb(packet));
  },

  invite: (peerId: string) => ipcRenderer.send('net:invite', peerId),
  cancelInvite: () => ipcRenderer.send('net:cancel-invite'),
  acceptInvite: (peerId: string) => ipcRenderer.send('net:accept-invite', peerId),
  declineInvite: (peerId: string) => ipcRenderer.send('net:decline-invite', peerId),
  leaveMatch: () => ipcRenderer.send('net:leave'),
  sendLocalState: (player: PlayerState, world: WorldState | undefined, score: [number, number]) => {
    ipcRenderer.send('net:pos', { player, world, score });
  },

  quit: () => ipcRenderer.send('app:quit')
});
