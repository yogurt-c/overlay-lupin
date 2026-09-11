/**
 * Compact wire encoding for the host's ROOM_WORLD broadcast.
 *
 * A raw MerandiWorld snapshot at realistic late-game entity counts (hundreds
 * of monsters, up to 108 units per player) serializes to tens of kilobytes of
 * JSON — 10-50x the ~1472-byte UDP MTU that `network.ts`'s `sendDirect` sends
 * as a single unfragmented datagram with no chunking of its own. Oversized
 * datagrams get silently dropped far more often on real LAN/Wi-Fi hops, which
 * starved members of ROOM_WORLD updates for long enough to trip their own
 * ROOM_TIMEOUT_MS and boot them — the "자주 튕기는" bug.
 *
 * This module shrinks each snapshot two ways, then splits it into several
 * MTU-safe pieces sent one per tick (see module.ts's buildOutgoingPacket):
 *  - flat number arrays ("atoms") instead of repeated object keys per entity
 *  - job names replaced by a small integer index into JOB_ID_LIST (both
 *    sides already share this exact table, so no dictionary needs sending)
 *
 * A member reassembles chunks by version (see SnapshotAssembler) and only
 * replaces its rendered world once every chunk of that version has arrived —
 * a single dropped chunk costs one stale-but-harmless frame of staleness,
 * never a crash or a disconnect, since `sendRoomState` is still called every
 * tick regardless (each call already refreshes the receiver's keepalive).
 */
import { ARCHETYPES, SLOT_COUNT, jobIdToName, jobNameToId } from './data.js';
import { ZONE_LABELS } from './field.js';
import type { MerandiWorld, Monster, MonsterKind, Shot, UnitMember, UnitStack, Zone, ZoneLabel } from './types.js';

const MONSTER_KIND_LIST: MonsterKind[] = ['normal', 'speed', 'tank', 'boss'];
const ARMED_CODE: Record<'upgrade' | 'sell' | 'none', number> = { none: 0, upgrade: 1, sell: 2 };

/** Leaves headroom under the ~1472-byte Ethernet MTU for the outer `{t:'ROOM_WORLD', roomId, payload}` envelope and IP/UDP headers. */
const CHUNK_BYTE_BUDGET = 1100;

const byteLen = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).length;

function buildAtoms(world: MerandiWorld): unknown[] {
  const atoms: unknown[] = [
    [
      'M',
      world.wave,
      world.waveTotal,
      world.waveMsLeft,
      world.waveIsBoss ? 1 : 0,
      world.aliveMonsters,
      world.aliveThreshold,
      world.over ? 1 : 0,
      world.won ? 1 : 0
    ]
  ];

  world.zones.forEach((z, zi) => {
    atoms.push([
      'Z',
      zi,
      z.id,
      z.name,
      z.gold,
      z.upLevels.str,
      z.upLevels.int,
      z.upLevels.dex,
      z.upLevels.luk,
      ARMED_CODE[z.armed ?? 'none'],
      z.pendingArche ? ARCHETYPES.indexOf(z.pendingArche) : -1,
      z.lastMessage,
      z.kills
    ]);
    z.slots.forEach((slot, si) => {
      if (!slot || !slot.members.length) return;
      const flat: unknown[] = ['S', zi, si];
      for (const m of slot.members) {
        flat.push(m.id, m.grade, ARCHETYPES.indexOf(m.arche), jobNameToId(m.job), Math.round(m.cooldownMs));
      }
      atoms.push(flat);
    });
  });

  for (const m of world.monsters) {
    atoms.push(['N', m.id, Math.round(m.t * 1e5) / 1e5, Math.round(m.hp * 10) / 10, m.maxHp, MONSTER_KIND_LIST.indexOf(m.kind), m.speed]);
  }
  for (const s of world.shots) {
    atoms.push(['T', Math.round(s.x * 10) / 10, Math.round(s.y * 10) / 10, Math.round(s.tx * 10) / 10, Math.round(s.ty * 10) / 10, Math.round(s.life), Math.round(s.maxLife), s.grade]);
  }
  return atoms;
}

export interface WireChunk {
  v: number;
  i: number;
  n: number;
  a: unknown[];
}

/** Greedily bin-packs atoms into MTU-safe chunks — never splits a single atom, so every chunk is independently valid JSON. */
export function encodeWorldToChunks(world: MerandiWorld, version: number): WireChunk[] {
  const atoms = buildAtoms(world);
  const groups: unknown[][] = [[]];
  let curBytes = 24; // rough overhead for the {v,i,n,a:[...]} wrapper itself
  for (const atom of atoms) {
    const atomBytes = byteLen(atom) + 1;
    const current = groups[groups.length - 1];
    if (curBytes + atomBytes > CHUNK_BYTE_BUDGET && current.length > 0) {
      groups.push([]);
      curBytes = 24;
    }
    groups[groups.length - 1].push(atom);
    curBytes += atomBytes;
  }
  const n = groups.length;
  return groups.map((a, i) => ({ v: version, i, n, a }));
}

function freshEmptyZone(label: ZoneLabel): Zone {
  return {
    id: '',
    label,
    name: '',
    gold: 0,
    kills: 0,
    upLevels: { str: 0, int: 0, dex: 0, luk: 0 },
    slots: new Array<UnitStack | null>(SLOT_COUNT).fill(null),
    armed: null,
    pendingArche: null,
    lastMessage: ''
  };
}

function decodeAtoms(atoms: unknown[]): MerandiWorld {
  let meta: unknown[] | null = null;
  const zonesByIdx = new Map<number, Zone>();
  const monsters: Monster[] = [];
  const shots: Shot[] = [];

  for (const raw of atoms) {
    if (!Array.isArray(raw) || raw.length === 0) continue;
    const tag = raw[0];
    if (tag === 'M') {
      meta = raw;
    } else if (tag === 'Z') {
      const [, zi, id, name, gold, str, int, dex, luk, armedCode, pendingArcheIdx, lastMessage, kills] = raw;
      const label = ZONE_LABELS[zi] ?? ZONE_LABELS[0];
      zonesByIdx.set(zi, {
        id,
        label,
        name,
        gold,
        kills: kills ?? 0,
        upLevels: { str, int, dex, luk },
        slots: new Array<UnitStack | null>(SLOT_COUNT).fill(null),
        armed: armedCode === 1 ? 'upgrade' : armedCode === 2 ? 'sell' : null,
        pendingArche: pendingArcheIdx >= 0 ? ARCHETYPES[pendingArcheIdx] : null,
        lastMessage
      });
    } else if (tag === 'S') {
      const [, zi, si, ...rest] = raw;
      const members: UnitMember[] = [];
      for (let k = 0; k + 4 < rest.length; k += 5) {
        members.push({
          id: rest[k],
          grade: rest[k + 1],
          arche: ARCHETYPES[rest[k + 2]],
          job: jobIdToName(rest[k + 3]),
          cooldownMs: rest[k + 4]
        });
      }
      const zone = zonesByIdx.get(zi);
      if (zone && si >= 0 && si < zone.slots.length) zone.slots[si] = { members };
    } else if (tag === 'N') {
      const [, id, t, hp, maxHp, kindIdx, speed] = raw;
      monsters.push({ id, t, hp, maxHp, kind: MONSTER_KIND_LIST[kindIdx] ?? 'normal', speed });
    } else if (tag === 'T') {
      const [, x, y, tx, ty, life, maxLife, grade] = raw;
      shots.push({ x, y, tx, ty, life, maxLife, grade });
    }
  }

  const metaTuple = (meta ?? ['M', 1, 50, 0, 0, 0, 999, 0, 0]) as [string, number, number, number, number, number, number, number, number];
  const [, wave, waveTotal, waveMsLeft, waveIsBoss, aliveMonsters, aliveThreshold, over, won] = metaTuple;

  return {
    wave,
    waveTotal,
    waveMsLeft,
    waveIsBoss: !!waveIsBoss,
    aliveMonsters,
    aliveThreshold,
    monsters,
    zones: ZONE_LABELS.map((label, zi) => zonesByIdx.get(zi) ?? freshEmptyZone(label)),
    shots,
    over: !!over,
    won: !!won
  };
}

/**
 * Reassembles chunks (possibly interleaved across ticks) into a full MerandiWorld once every chunk of
 * a version has arrived. Never throws — a malformed/corrupt packet is simply ignored, since crashing
 * here would freeze the receiver's own frame loop, the exact class of bug this whole module exists to
 * avoid on the sending side.
 */
export class SnapshotAssembler {
  private version = -1;
  private total = 0;
  private received = new Map<number, unknown[]>();

  ingest(raw: unknown): MerandiWorld | null {
    try {
      const chunk = raw as Partial<WireChunk>;
      if (typeof chunk?.v !== 'number' || typeof chunk.i !== 'number' || typeof chunk.n !== 'number' || !Array.isArray(chunk.a)) {
        return null;
      }
      if (chunk.v !== this.version) {
        this.version = chunk.v;
        this.total = chunk.n;
        this.received = new Map();
      }
      this.received.set(chunk.i, chunk.a);
      if (this.received.size < this.total) return null;

      const atoms: unknown[] = [];
      for (let i = 0; i < this.total; i++) {
        const part = this.received.get(i);
        if (!part) return null;
        atoms.push(...part);
      }
      return decodeAtoms(atoms);
    } catch {
      return null;
    }
  }
}
