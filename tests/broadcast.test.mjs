import assert from 'node:assert/strict';
import { test } from 'node:test';
import { broadcastAddresses } from '../dist/main/broadcast.js';

const v4 = (address, netmask, internal = false) => ({ family: 'IPv4', address, netmask, internal });

test('targets each LAN subnet broadcast only', () => {
  const addrs = broadcastAddresses({
    en0: [v4('192.168.0.15', '255.255.255.0'), { family: 'IPv6', address: 'fe80::1', netmask: 'ffff::', internal: false }],
    en7: [v4('10.1.2.3', '255.255.0.0')]
  });
  assert.deepEqual(addrs, ['192.168.0.255', '10.1.255.255']);
});

test('falls back to the limited broadcast when only loopback, /32 tunnels and link-local remain', () => {
  const addrs = broadcastAddresses({
    lo0: [v4('127.0.0.1', '255.0.0.0', true)],
    utun4: [v4('10.8.0.2', '255.255.255.255')],
    en5: [v4('169.254.10.20', '255.255.0.0')]
  });
  assert.deepEqual(addrs, ['255.255.255.255']);
});

test('dedupes interfaces sharing one subnet', () => {
  const addrs = broadcastAddresses({
    en0: [v4('192.168.0.15', '255.255.255.0')],
    en8: [v4('192.168.0.16', '255.255.255.0')]
  });
  assert.deepEqual(addrs, ['192.168.0.255']);
});
