import dgram from 'node:dgram';
import os from 'node:os';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { PeerInfo, RoomInfo, RoomRoster } from '../shared/protocol.js';

export type { PeerInfo, RoomInfo, RoomRoster };

const DISCOVERY_PORT = 47474;
const HELLO_INTERVAL_MS = 2000;
const PEER_TIMEOUT_MS = 6000;
const INVITE_TIMEOUT_MS = 10000;
const MATCH_TIMEOUT_MS = 3000;
/** Rooms are longer-lived than a 1:1 match, so a lobby survives a couple of missed adverts. */
const ROOM_TIMEOUT_MS = 6000;
/** How long the host waits without a ROOM_POS before treating a live member as disconnected. */
const ROOM_MEMBER_TIMEOUT_MS = 5000;
const DEFAULT_ROOM_CAPACITY = 6;

interface KnownPeer extends PeerInfo {
  /** The peer's reply-socket port (from their HELLO), used for direct unicast messages. */
  replyPort: number;
  lastSeen: number;
}

/** A minimal send target — a `KnownPeer` satisfies this, but so does any address/port pair we learned from a broadcast. */
interface SendTarget {
  address: string;
  replyPort: number;
}

interface HostedRoomMember {
  id: string;
  name: string;
  address: string;
  replyPort: number;
  lastSeen: number;
}

/** The room I'm hosting, kept authoritative here — every member's roster is a copy of this. */
interface HostedRoom {
  id: string;
  name: string;
  gameId: string;
  capacity: number;
  status: 'lobby' | 'playing';
  members: Map<string, HostedRoomMember>;
}

/** The room I've joined as a non-host member. */
interface JoinedRoom {
  id: string;
  hostId: string;
  hostAddress: string;
  hostReplyPort: number;
  gameId: string;
  status: 'lobby' | 'playing';
  lastMsgAt: number;
}

/** A room someone else is advertising, as seen from the matching panel's room list. */
interface OpenRoom extends RoomInfo {
  hostAddress: string;
  hostReplyPort: number;
  lastSeen: number;
}

type WireMessage =
  | { t: 'HELLO'; id: string; name: string; replyPort: number }
  | { t: 'INVITE'; id: string; gameId: string }
  | { t: 'ACCEPT'; id: string; gameId: string }
  | { t: 'DECLINE'; id: string }
  | { t: 'CANCEL'; id: string }
  | { t: 'LEAVE'; id: string }
  /** `payload` is the active game's own in-match packet shape — opaque here. */
  | { t: 'POS'; id: string; payload: unknown }
  /** Broadcast by a room's host, same cadence as HELLO, so the room list stays live. */
  | { t: 'ROOM_OPEN'; id: string; name: string; roomId: string; gameId: string; capacity: number; memberCount: number; replyPort: number }
  /** A hopeful member, sent directly to the host learned from a ROOM_OPEN. */
  | { t: 'ROOM_JOIN'; id: string; name: string; roomId: string; replyPort: number }
  /** The host's authoritative membership list, sent to every member after anything changes. */
  | {
      t: 'ROOM_ROSTER';
      roomId: string;
      name: string;
      gameId: string;
      hostId: string;
      capacity: number;
      members: { id: string; name: string }[];
      status: 'lobby' | 'playing';
    }
  | { t: 'ROOM_LEAVE'; id: string; roomId: string }
  | { t: 'ROOM_CLOSED'; roomId: string }
  /** A member's own state, sent to the host only. */
  | { t: 'ROOM_POS'; id: string; roomId: string; payload: unknown }
  /** The host's authoritative world snapshot, broadcast to every member. */
  | { t: 'ROOM_WORLD'; roomId: string; payload: unknown };

export declare interface GameNetwork {
  on(event: 'peers', listener: (peers: PeerInfo[]) => void): this;
  /** We sent an invite and are waiting for the other side to respond. */
  on(event: 'invite-sent', listener: (peer: PeerInfo) => void): this;
  /** Someone invited us; show an accept/decline prompt. */
  on(event: 'invite-received', listener: (peer: PeerInfo) => void): this;
  /** Whatever waiting/incoming prompt was showing should be dismissed (cancelled, declined, or timed out). */
  on(event: 'invite-cleared', listener: (reason: 'declined' | 'cancelled' | 'timeout') => void): this;
  /** `gameId` is whatever the inviter picked — both sides start the same game. */
  on(event: 'match-found', listener: (peer: PeerInfo, isHost: boolean, gameId: string) => void): this;
  /** 'left' means the opponent intentionally left; 'timeout' means we stopped hearing from them. */
  on(event: 'match-lost', listener: (reason: 'left' | 'timeout') => void): this;
  on(event: 'opponent-state', listener: (payload: unknown) => void): this;

  /** Rooms open on the LAN right now, for any game — the panel filters by the selected game's id. */
  on(event: 'rooms', listener: (rooms: RoomInfo[]) => void): this;
  /** Membership changed while still in the lobby (not yet playing). */
  on(event: 'room-roster', listener: (roster: RoomRoster) => void): this;
  /** Fires exactly once per room per client: on explicit start, or immediately on joining a room already playing. */
  on(event: 'room-started', listener: (isHost: boolean, gameId: string) => void): this;
  on(event: 'room-lost', listener: (reason: 'closed' | 'left' | 'timeout') => void): this;
  /** Host-only: another member's own packet, tagged with who sent it. */
  on(event: 'room-member-state', listener: (fromId: string, payload: unknown) => void): this;
  /** Member-only: the host's authoritative world snapshot. */
  on(event: 'room-world', listener: (payload: unknown) => void): this;
  /** Host-only: a member left or disconnected — the game should drop their entity. */
  on(event: 'room-member-left', listener: (peerId: string) => void): this;
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
  private pendingOutgoing: { peer: KnownPeer; gameId: string; sentAt: number } | null = null;
  private pendingIncoming: { peer: KnownPeer; gameId: string; receivedAt: number } | null = null;
  private currentMatch: KnownPeer | null = null;
  private lastPosReceived = 0;
  private helloTimer?: ReturnType<typeof setInterval>;
  private sweepTimer?: ReturnType<typeof setInterval>;

  /** Set only while I'm hosting a room; authoritative membership lives here. */
  private hostedRoom: HostedRoom | null = null;
  /** Set only while I've joined someone else's room. */
  private joinedRoom: JoinedRoom | null = null;
  private openRooms = new Map<string, OpenRoom>();

  start(): void {
    this.discoverySocket.on('message', (buf, rinfo) => this.handleMessage(buf, rinfo));
    this.replySocket.on('message', (buf, rinfo) => this.handleMessage(buf, rinfo));

    this.replySocket.bind(0, () => {
      this.replyPort = this.replySocket.address().port;

      this.discoverySocket.bind(DISCOVERY_PORT, () => {
        this.discoverySocket.setBroadcast(true);
        this.helloTimer = setInterval(() => {
          this.broadcastHello();
          if (this.hostedRoom) this.broadcastRoomOpen();
        }, HELLO_INTERVAL_MS);
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

  /** Sends an invite for `gameId` and waits for the peer to accept or decline. */
  invite(peerId: string, gameId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer || this.currentMatch || this.pendingOutgoing) return;
    this.pendingOutgoing = { peer, gameId, sentAt: Date.now() };
    this.sendDirect({ t: 'INVITE', id: this.myId, gameId }, peer);
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
    const { peer, gameId } = this.pendingIncoming;
    this.pendingIncoming = null;
    this.sendDirect({ t: 'ACCEPT', id: this.myId, gameId }, peer);
    this.establishMatch(peer, gameId);
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

  sendLocalState(payload: unknown): void {
    if (!this.currentMatch) return;
    this.sendDirect({ t: 'POS', id: this.myId, payload }, this.currentMatch);
  }

  /** Opens a room for `gameId` and starts advertising it; I'm the host. */
  createRoom(gameId: string, capacity: number = DEFAULT_ROOM_CAPACITY): void {
    if (this.hostedRoom || this.joinedRoom) return;
    this.hostedRoom = {
      id: crypto.randomUUID(),
      name: `${this.myName}의 방`,
      gameId,
      capacity,
      status: 'lobby',
      members: new Map([[this.myId, { id: this.myId, name: this.myName, address: '', replyPort: 0, lastSeen: Date.now() }]])
    };
    this.broadcastRoomOpen();
    this.emitRoomRoster();
  }

  /** Joins a room seen in the room list. The host confirms membership via ROOM_ROSTER. */
  joinRoom(roomId: string): void {
    if (this.hostedRoom || this.joinedRoom) return;
    const room = this.openRooms.get(roomId);
    if (!room) return;
    this.sendDirect(
      { t: 'ROOM_JOIN', id: this.myId, name: this.myName, roomId, replyPort: this.replyPort },
      { address: room.hostAddress, replyPort: room.hostReplyPort }
    );
  }

  /** Leaves whatever room I'm in — closes it for everyone if I was hosting. */
  leaveRoom(): void {
    if (this.hostedRoom) {
      const room = this.hostedRoom;
      this.hostedRoom = null;
      for (const member of room.members.values()) {
        if (member.id === this.myId) continue;
        this.sendDirect({ t: 'ROOM_CLOSED', roomId: room.id }, member);
      }
    } else if (this.joinedRoom) {
      const room = this.joinedRoom;
      this.joinedRoom = null;
      this.sendDirect(
        { t: 'ROOM_LEAVE', id: this.myId, roomId: room.id },
        { address: room.hostAddress, replyPort: room.hostReplyPort }
      );
    }
  }

  /** Host only: moves the room from lobby to playing. Every member (present and future joiners) sees the new status. */
  startRoom(): void {
    if (!this.hostedRoom || this.hostedRoom.status !== 'lobby') return;
    this.hostedRoom.status = 'playing';
    this.broadcastRosterToAll();
    this.emit('room-started', true, this.hostedRoom.gameId);
  }

  /**
   * Sends this tick's room packet. As the host this is the authoritative world,
   * broadcast to every member; as a member it's just my own local state, sent
   * to the host only.
   */
  sendRoomState(payload: unknown): void {
    if (this.hostedRoom) {
      for (const member of this.hostedRoom.members.values()) {
        if (member.id === this.myId) continue;
        this.sendDirect({ t: 'ROOM_WORLD', roomId: this.hostedRoom.id, payload }, member);
      }
    } else if (this.joinedRoom) {
      this.sendDirect(
        { t: 'ROOM_POS', id: this.myId, roomId: this.joinedRoom.id, payload },
        { address: this.joinedRoom.hostAddress, replyPort: this.joinedRoom.hostReplyPort }
      );
    }
  }

  private sendDirect(msg: WireMessage, target: SendTarget): void {
    const buf = Buffer.from(JSON.stringify(msg));
    this.replySocket.send(buf, target.replyPort, target.address);
  }

  private broadcastHello(): void {
    const buf = Buffer.from(
      JSON.stringify({ t: 'HELLO', id: this.myId, name: this.myName, replyPort: this.replyPort })
    );
    this.discoverySocket.send(buf, DISCOVERY_PORT, '255.255.255.255');
  }

  private broadcastRoomOpen(): void {
    if (!this.hostedRoom) return;
    const room = this.hostedRoom;
    const buf = Buffer.from(
      JSON.stringify({
        t: 'ROOM_OPEN',
        id: this.myId,
        name: room.name,
        roomId: room.id,
        gameId: room.gameId,
        capacity: room.capacity,
        memberCount: room.members.size,
        replyPort: this.replyPort
      })
    );
    this.discoverySocket.send(buf, DISCOVERY_PORT, '255.255.255.255');
  }

  /** Host only: pushes the current membership to every member, then updates my own view. */
  private broadcastRosterToAll(): void {
    if (!this.hostedRoom) return;
    const room = this.hostedRoom;
    const members = Array.from(room.members.values()).map((m) => ({ id: m.id, name: m.name }));
    for (const member of room.members.values()) {
      if (member.id === this.myId) continue;
      this.sendDirect(
        {
          t: 'ROOM_ROSTER',
          roomId: room.id,
          name: room.name,
          gameId: room.gameId,
          hostId: this.myId,
          capacity: room.capacity,
          members,
          status: room.status
        },
        member
      );
    }
    this.emitRoomRoster();
    this.broadcastRoomOpen();
  }

  /** Host only: tells my own renderer about the room I'm hosting (never travels over the wire). */
  private emitRoomRoster(): void {
    if (!this.hostedRoom) return;
    const room = this.hostedRoom;
    if (room.status !== 'lobby') return;
    this.emit('room-roster', {
      id: room.id,
      name: room.name,
      gameId: room.gameId,
      hostId: this.myId,
      capacity: room.capacity,
      members: Array.from(room.members.values()).map((m) => ({ id: m.id, name: m.name })),
      status: room.status
    });
  }

  private handleMessage(buf: Buffer, rinfo: dgram.RemoteInfo): void {
    let msg: WireMessage;
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      return;
    }
    if (!msg) return;
    if ('id' in msg && msg.id === this.myId) return;

    switch (msg.t) {
      case 'HELLO':
        this.upsertPeer(msg.id, msg.name, rinfo.address, msg.replyPort);
        break;

      case 'INVITE': {
        const peer = this.peers.get(msg.id);
        if (!peer || this.currentMatch || this.pendingIncoming) return;
        this.pendingIncoming = { peer, gameId: msg.gameId, receivedAt: Date.now() };
        this.emit('invite-received', this.toPeerInfo(peer));
        break;
      }

      case 'ACCEPT': {
        const peer = this.peers.get(msg.id);
        if (!peer || !this.pendingOutgoing || this.pendingOutgoing.peer.id !== msg.id) return;
        this.pendingOutgoing = null;
        this.establishMatch(peer, msg.gameId);
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
          this.emit('opponent-state', msg.payload);
        }
        break;

      case 'ROOM_OPEN':
        this.openRooms.set(msg.roomId, {
          id: msg.roomId,
          name: msg.name,
          gameId: msg.gameId,
          hostId: msg.id,
          memberCount: msg.memberCount,
          capacity: msg.capacity,
          hostAddress: rinfo.address,
          hostReplyPort: msg.replyPort,
          lastSeen: Date.now()
        });
        this.emitRooms();
        break;

      case 'ROOM_JOIN': {
        const room = this.hostedRoom;
        if (!room || room.id !== msg.roomId || room.members.size >= room.capacity) return;
        room.members.set(msg.id, {
          id: msg.id,
          name: msg.name,
          address: rinfo.address,
          replyPort: msg.replyPort,
          lastSeen: Date.now()
        });
        this.broadcastRosterToAll();
        break;
      }

      case 'ROOM_ROSTER': {
        if (this.hostedRoom) return;
        const wasPlaying = this.joinedRoom?.id === msg.roomId && this.joinedRoom.status === 'playing';
        this.joinedRoom = {
          id: msg.roomId,
          hostId: msg.hostId,
          hostAddress: rinfo.address,
          hostReplyPort: rinfo.port,
          gameId: msg.gameId,
          status: msg.status,
          lastMsgAt: Date.now()
        };
        if (msg.status === 'playing') {
          if (!wasPlaying) this.emit('room-started', false, msg.gameId);
        } else {
          this.emit('room-roster', {
            id: msg.roomId,
            name: msg.name,
            gameId: msg.gameId,
            hostId: msg.hostId,
            capacity: msg.capacity,
            members: msg.members,
            status: msg.status
          });
        }
        break;
      }

      case 'ROOM_LEAVE':
        if (this.hostedRoom && this.hostedRoom.id === msg.roomId) {
          this.hostedRoom.members.delete(msg.id);
          this.broadcastRosterToAll();
          this.emit('room-member-left', msg.id);
        }
        break;

      case 'ROOM_CLOSED':
        if (this.joinedRoom && this.joinedRoom.id === msg.roomId) {
          this.joinedRoom = null;
          this.emit('room-lost', 'closed');
        }
        break;

      case 'ROOM_POS': {
        const member = this.hostedRoom?.id === msg.roomId ? this.hostedRoom.members.get(msg.id) : undefined;
        if (member) {
          member.lastSeen = Date.now();
          this.emit('room-member-state', msg.id, msg.payload);
        }
        break;
      }

      case 'ROOM_WORLD':
        if (this.joinedRoom && this.joinedRoom.id === msg.roomId) {
          this.joinedRoom.lastMsgAt = Date.now();
          this.emit('room-world', msg.payload);
        }
        break;
    }
  }

  private establishMatch(peer: KnownPeer, gameId: string): void {
    this.currentMatch = peer;
    this.lastPosReceived = Date.now();
    const isHost = this.myId < peer.id;
    this.emit('match-found', this.toPeerInfo(peer), isHost, gameId);
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

    let roomsChanged = false;
    for (const [id, room] of this.openRooms) {
      if (now - room.lastSeen > ROOM_TIMEOUT_MS) {
        this.openRooms.delete(id);
        roomsChanged = true;
      }
    }
    if (roomsChanged) this.emitRooms();

    if (this.joinedRoom && now - this.joinedRoom.lastMsgAt > ROOM_TIMEOUT_MS) {
      this.joinedRoom = null;
      this.emit('room-lost', 'timeout');
    }

    if (this.hostedRoom && this.hostedRoom.status === 'playing') {
      const stale = Array.from(this.hostedRoom.members.values()).filter(
        (m) => m.id !== this.myId && now - m.lastSeen > ROOM_MEMBER_TIMEOUT_MS
      );
      if (stale.length > 0) {
        for (const m of stale) {
          this.hostedRoom.members.delete(m.id);
          this.emit('room-member-left', m.id);
        }
        this.broadcastRosterToAll();
      }
    }
  }

  private emitRooms(): void {
    const list: RoomInfo[] = Array.from(this.openRooms.values()).map((r) => ({
      id: r.id,
      name: r.name,
      gameId: r.gameId,
      hostId: r.hostId,
      memberCount: r.memberCount,
      capacity: r.capacity
    }));
    this.emit('rooms', list);
  }

  private emitPeers(): void {
    const list: PeerInfo[] = Array.from(this.peers.values()).map((p) => this.toPeerInfo(p));
    this.emit('peers', list);
  }
}
