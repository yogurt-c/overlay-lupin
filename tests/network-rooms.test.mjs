import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GameNetwork } from '../dist/main/network.js';

const rinfo = { address: '192.168.0.20', port: 47474 };
const roomOpen = (memberCount) => Buffer.from(JSON.stringify({
  t: 'ROOM_OPEN', id: 'host', name: 'host room', roomId: 'r1', gameId: 'fishing', capacity: 6, memberCount, replyPort: 5000
}));

test('repeated ROOM_OPEN adverts only re-emit the room list when the room changes', () => {
  const net = new GameNetwork();
  let emits = 0;
  net.on('rooms', () => emits++);

  net.handleMessage(roomOpen(1), rinfo);
  net.handleMessage(roomOpen(1), rinfo);
  net.handleMessage(roomOpen(1), rinfo);
  assert.equal(emits, 1);

  net.handleMessage(roomOpen(2), rinfo);
  assert.equal(emits, 2);
  assert.ok(net.openRooms.get('r1').lastSeen > 0);
});
