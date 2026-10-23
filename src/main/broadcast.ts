import os from 'node:os';

export const LIMITED_BROADCAST = '255.255.255.255';

type Interfaces = ReturnType<typeof os.networkInterfaces>;

const toInt = (ip: string): number => ip.split('.').reduce((n, part) => (n << 8) | Number(part), 0) >>> 0;
const toIp = (n: number): string => [24, 16, 8, 0].map((shift) => (n >>> shift) & 255).join('.');

/**
 * Where a discovery broadcast should go: every LAN subnet's directed broadcast.
 * 255.255.255.255 alone isn't enough — macOS (and Windows) send it out of a
 * single interface, and macOS can fail it outright with EHOSTUNREACH while the
 * subnet broadcast still works. It's only the fallback when there's no LAN at
 * all, so two instances on one offline machine can still find each other.
 */
export function broadcastAddresses(interfaces: Interfaces = os.networkInterfaces()): string[] {
  const targets = new Set<string>();
  for (const addrs of Object.values(interfaces)) {
    for (const addr of addrs ?? []) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      // /32 is a point-to-point tunnel (VPN utun) with no broadcast domain.
      if (addr.netmask === LIMITED_BROADCAST || addr.address.startsWith('169.254.')) continue;
      targets.add(toIp((toInt(addr.address) | ~toInt(addr.netmask)) >>> 0));
    }
  }
  return targets.size > 0 ? [...targets] : [LIMITED_BROADCAST];
}
