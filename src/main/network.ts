import dgram from 'node:dgram';
import os from 'node:os';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

const DISCOVERY_PORT = 47474;
const HELLO_INTERVAL_MS = 2000;
const PEER_TIMEOUT_MS = 6000;
const INVITE_TIMEOUT_MS = 10000;
const MATCH_TIMEOUT_MS = 3000;

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

/** The authoritative slice of the simulation, produced by the host only. */
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

interface KnownPeer extends PeerInfo {
  /** The peer's reply-socket port (from their HELLO), used for direct unicast messages. */
  replyPort: number;
  lastSeen: number;
}

type WireMessage =
  | { t: 'HELLO'; id: string; name: string; replyPort: number }
  | { t: 'INVITE'; id: string }
  | { t: 'ACCEPT'; id: string }
  | { t: 'DECLINE'; id: string }
  | { t: 'CANCEL'; id: string }
  | { t: 'LEAVE'; id: string }
  | { t: 'POS'; id: string; player: PlayerState; world?: WorldState; score: [number, number] };

export declare interface GameNetwork {
  on(event: 'peers', listener: (peers: PeerInfo[]) => void): this;
  /** We sent an invite and are waiting for the other side to respond. */
  on(event: 'invite-sent', listener: (peer: PeerInfo) => void): this;
  /** Someone invited us; show an accept/decline prompt. */
  on(event: 'invite-received', listener: (peer: PeerInfo) => void): this;
  /** Whatever waiting/incoming prompt was showing should be dismissed (cancelled, declined, or timed out). */
  on(event: 'invite-cleared', listener: (reason: 'declined' | 'cancelled' | 'timeout') => void): this;
  on(event: 'match-found', listener: (peer: PeerInfo, isHost: boolean) => void): this;
  /** 'left' means the opponent intentionally left; 'timeout' means we stopped hearing from them. */
  on(event: 'match-lost', listener: (reason: 'left' | 'timeout') => void): this;
  on(event: 'opponent-state', listener: (packet: OpponentPacket) => void): this;
}

/**
 * Two sockets, two jobs:
 *  - `discoverySocket` is bound to the fixed, well-known DISCOVERY_PORT and only
 *    ever sends/receives broadcast HELLOs. Broadcast fans out to every socket
 *    bound to that port on the host, so this works even when two instances of
 *    this app share one machine.
 *  - `replySocket` is bound to an OS-assigned ephemeral port and handles every
 *    directed (unicast) message: INVITE/ACCEPT/DECLINE/CANCEL/LEAVE/POS. Direct
 *    unicast delivery to a port shared by two reuseAddr sockets is NOT reliably
 *    fanned out (the OS hands it to just one of them) — giving each process its
 *    own unique ephemeral port sidesteps that entirely, on one machine or many.
 */
export class GameNetwork extends EventEmitter {
  readonly myId = crypto.randomUUID();
  readonly myName = os.hostname();

  private discoverySocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  private replySocket = dgram.createSocket('udp4');
  private replyPort = 0;

  private peers = new Map<string, KnownPeer>();
  private pendingOutgoing: { peer: KnownPeer; sentAt: number } | null = null;
  private pendingIncoming: { peer: KnownPeer; receivedAt: number } | null = null;
  private currentMatch: KnownPeer | null = null;
  private lastPosReceived = 0;
  private helloTimer?: ReturnType<typeof setInterval>;
  private sweepTimer?: ReturnType<typeof setInterval>;

  start(): void {
    this.discoverySocket.on('message', (buf, rinfo) => this.handleMessage(buf, rinfo));
    this.replySocket.on('message', (buf, rinfo) => this.handleMessage(buf, rinfo));

    this.replySocket.bind(0, () => {
      this.replyPort = this.replySocket.address().port;

      this.discoverySocket.bind(DISCOVERY_PORT, () => {
        this.discoverySocket.setBroadcast(true);
        this.helloTimer = setInterval(() => this.broadcastHello(), HELLO_INTERVAL_MS);
        this.sweepTimer = setInterval(() => this.sweep(), 1000);
        this.broadcastHello();
      });
    });
  }

  stop(): void {
    if (this.helloTimer) clearInterval(this.helloTimer);
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.discoverySocket.close();
    this.replySocket.close();
  }

  /** Sends an invite and waits for the peer to accept or decline. */
  invite(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer || this.currentMatch || this.pendingOutgoing) return;
    this.pendingOutgoing = { peer, sentAt: Date.now() };
    this.sendDirect({ t: 'INVITE', id: this.myId }, peer);
    this.emit('invite-sent', this.toPeerInfo(peer));
  }

  /** Cancels our own outgoing invite before the peer has responded. */
  cancelInvite(): void {
    if (!this.pendingOutgoing) return;
    const { peer } = this.pendingOutgoing;
    this.sendDirect({ t: 'CANCEL', id: this.myId }, peer);
    this.pendingOutgoing = null;
  }

  /** Accepts an invite someone sent us. */
  acceptInvite(peerId: string): void {
    if (!this.pendingIncoming || this.pendingIncoming.peer.id !== peerId) return;
    const { peer } = this.pendingIncoming;
    this.pendingIncoming = null;
    this.sendDirect({ t: 'ACCEPT', id: this.myId }, peer);
    this.establishMatch(peer);
  }

  /** Declines an invite someone sent us. */
  declineInvite(peerId: string): void {
    if (!this.pendingIncoming || this.pendingIncoming.peer.id !== peerId) return;
    const { peer } = this.pendingIncoming;
    this.pendingIncoming = null;
    this.sendDirect({ t: 'DECLINE', id: this.myId }, peer);
  }

  leaveMatch(): void {
    if (!this.currentMatch) return;
    this.sendDirect({ t: 'LEAVE', id: this.myId }, this.currentMatch);
    this.currentMatch = null;
  }

  sendLocalState(player: PlayerState, world: WorldState | undefined, score: [number, number]): void {
    if (!this.currentMatch) return;
    this.sendDirect({ t: 'POS', id: this.myId, player, world, score }, this.currentMatch);
  }

  private sendDirect(msg: WireMessage, peer: KnownPeer): void {
    const buf = Buffer.from(JSON.stringify(msg));
    this.replySocket.send(buf, peer.replyPort, peer.address);
  }

  private broadcastHello(): void {
    const buf = Buffer.from(
      JSON.stringify({ t: 'HELLO', id: this.myId, name: this.myName, replyPort: this.replyPort })
    );
    this.discoverySocket.send(buf, DISCOVERY_PORT, '255.255.255.255');
  }

  private handleMessage(buf: Buffer, rinfo: dgram.RemoteInfo): void {
    let msg: WireMessage;
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      return;
    }
    if (!msg || msg.id === this.myId) return;

    switch (msg.t) {
      case 'HELLO':
        this.upsertPeer(msg.id, msg.name, rinfo.address, msg.replyPort);
        break;

      case 'INVITE': {
        const peer = this.peers.get(msg.id);
        if (!peer || this.currentMatch || this.pendingIncoming) return;
        this.pendingIncoming = { peer, receivedAt: Date.now() };
        this.emit('invite-received', this.toPeerInfo(peer));
        break;
      }

      case 'ACCEPT': {
        const peer = this.peers.get(msg.id);
        if (!peer || !this.pendingOutgoing || this.pendingOutgoing.peer.id !== msg.id) return;
        this.pendingOutgoing = null;
        this.establishMatch(peer);
        break;
      }

      case 'DECLINE':
        if (this.pendingOutgoing && this.pendingOutgoing.peer.id === msg.id) {
          this.pendingOutgoing = null;
          this.emit('invite-cleared', 'declined');
        }
        break;

      case 'CANCEL':
        if (this.pendingIncoming && this.pendingIncoming.peer.id === msg.id) {
          this.pendingIncoming = null;
          this.emit('invite-cleared', 'cancelled');
        }
        break;

      case 'LEAVE':
        if (this.currentMatch && this.currentMatch.id === msg.id) {
          this.currentMatch = null;
          this.emit('match-lost', 'left');
        }
        break;

      case 'POS':
        if (this.currentMatch && this.currentMatch.id === msg.id) {
          this.lastPosReceived = Date.now();
          this.emit('opponent-state', { player: msg.player, world: msg.world, score: msg.score });
        }
        break;
    }
  }

  private establishMatch(peer: KnownPeer): void {
    this.currentMatch = peer;
    this.lastPosReceived = Date.now();
    const isHost = this.myId < peer.id;
    this.emit('match-found', this.toPeerInfo(peer), isHost);
  }

  private toPeerInfo(peer: KnownPeer): PeerInfo {
    return { id: peer.id, name: peer.name, address: peer.address };
  }

  private upsertPeer(id: string, name: string, address: string, replyPort: number): void {
    const existed = this.peers.has(id);
    this.peers.set(id, { id, name, address, replyPort, lastSeen: Date.now() });
    if (!existed) this.emitPeers();
  }

  private sweep(): void {
    const now = Date.now();
    let changed = false;

    for (const [id, peer] of this.peers) {
      if (now - peer.lastSeen > PEER_TIMEOUT_MS) {
        this.peers.delete(id);
        changed = true;
      }
    }

    if (this.pendingOutgoing && now - this.pendingOutgoing.sentAt > INVITE_TIMEOUT_MS) {
      const { peer } = this.pendingOutgoing;
      this.pendingOutgoing = null;
      this.sendDirect({ t: 'CANCEL', id: this.myId }, peer);
      this.emit('invite-cleared', 'timeout');
    }
    if (this.pendingIncoming && now - this.pendingIncoming.receivedAt > INVITE_TIMEOUT_MS) {
      this.pendingIncoming = null;
      this.emit('invite-cleared', 'timeout');
    }
    if (this.currentMatch && now - this.lastPosReceived > MATCH_TIMEOUT_MS) {
      this.currentMatch = null;
      this.emit('match-lost', 'timeout');
    }
    if (changed) this.emitPeers();
  }

  private emitPeers(): void {
    const list: PeerInfo[] = Array.from(this.peers.values()).map((p) => this.toPeerInfo(p));
    this.emit('peers', list);
  }
}
