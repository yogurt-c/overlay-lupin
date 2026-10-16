import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GameNetwork } from '../dist/main/network.js';

const peer = { id: 'peer', address: '127.0.0.1', replyPort: 45678 };

for (const mode of ['host', 'guest', 'match']) {
  test(`late ${mode} state and leave requests are harmless after shutdown`, () => {
    const net = new GameNetwork();
    // Keep session state present, just as it is when before-quit runs before
    // the renderer's remaining IPC requests have been drained.
    if (mode === 'host') {
      net.hostedRoom = { id: 'room', members: new Map([[peer.id, peer]]) };
    } else if (mode === 'guest') {
      net.joinedRoom = { id: 'room', hostAddress: peer.address, hostReplyPort: peer.replyPort };
    } else {
      net.currentMatch = peer;
    }
    net.stop();
    assert.doesNotThrow(() => {
      net.sendRoomState({ x: 1 });
      net.sendLocalState({ x: 1 });
      net.broadcastHello();
      net.broadcastRoomOpen();
      net.leaveRoom();
      net.leaveMatch();
      net.stop();
    });
  });
}
