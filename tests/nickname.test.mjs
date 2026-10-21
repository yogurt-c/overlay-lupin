import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GameNetwork } from '../dist/main/network.js';
import { normalizeNickname, NICKNAME_MAX_LENGTH } from '../dist/shared/nickname.js';

const peer = { id: 'peer', address: '127.0.0.1', replyPort: 45678 };

test('normalizeNickname trims and collapses whitespace', () => {
  assert.equal(normalizeNickname('  낚시   왕  '), '낚시 왕');
});

test('normalizeNickname rejects empty, non-string and control-only input', () => {
  assert.equal(normalizeNickname(''), null);
  assert.equal(normalizeNickname('   '), null);
  assert.equal(normalizeNickname('\u0000\u001f'), null);
  assert.equal(normalizeNickname(42), null);
  assert.equal(normalizeNickname(undefined), null);
});

test('normalizeNickname strips control characters', () => {
  assert.equal(normalizeNickname('a\u0007b\nc'), 'ab c');
});

test('normalizeNickname rejects names longer than the limit, counting code points', () => {
  assert.equal(normalizeNickname('가'.repeat(NICKNAME_MAX_LENGTH)), '가'.repeat(NICKNAME_MAX_LENGTH));
  assert.equal(normalizeNickname('가'.repeat(NICKNAME_MAX_LENGTH + 1)), null);
  assert.equal(normalizeNickname('🐟'.repeat(NICKNAME_MAX_LENGTH)), '🐟'.repeat(NICKNAME_MAX_LENGTH));
});

test('GameNetwork starts with the given name', () => {
  const net = new GameNetwork('루팡');
  assert.equal(net.myName, '루팡');
  net.stop();
});

test('rename succeeds while idle', () => {
  const net = new GameNetwork('before');
  assert.equal(net.rename('after'), true);
  assert.equal(net.myName, 'after');
  net.stop();
});

for (const mode of ['host', 'guest', 'match', 'outgoing', 'incoming']) {
  test(`rename is refused while ${mode}`, () => {
    const net = new GameNetwork('before');
    if (mode === 'host') net.hostedRoom = { id: 'room', members: new Map([[peer.id, peer]]) };
    else if (mode === 'guest') net.joinedRoom = { id: 'room', hostAddress: peer.address, hostReplyPort: peer.replyPort };
    else if (mode === 'match') net.currentMatch = peer;
    else if (mode === 'outgoing') net.pendingOutgoing = { peer, gameId: 'fishing', sentAt: Date.now() };
    else net.pendingIncoming = { peer, gameId: 'fishing', receivedAt: Date.now() };
    assert.equal(net.canRename(), false);
    assert.equal(net.rename('after'), false);
    assert.equal(net.myName, 'before');
    net.stop();
  });
}

test('a known peer that changes its name re-emits the peer list', () => {
  const net = new GameNetwork('me');
  const seen = [];
  net.on('peers', (peers) => seen.push(peers.map((p) => p.name)));
  net.upsertPeer('p1', 'old', '127.0.0.1', 1);
  net.upsertPeer('p1', 'old', '127.0.0.1', 1);
  net.upsertPeer('p1', 'new', '127.0.0.1', 1);
  assert.deepEqual(seen, [['old'], ['new']]);
  net.stop();
});
