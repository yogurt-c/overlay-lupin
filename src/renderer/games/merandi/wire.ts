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
 * This module shrinks each snapshot two ways:
 *  - flat number arrays ("atoms") instead of repeated object keys per entity
 *  - job names replaced by a small integer index into JOB_ID_LIST (both
 *    sides already share this exact table, so no dictionary needs sending)
 *
 * It then splits the result into two independent streams sent together every
 * tick (see module.ts's buildOutgoingPacket):
 *  - "quick" atoms (wave clock + each zone's gold/upgrades/armed-menu/message,
 *    plus any active map-wide celebration — see types.ts's Celebration) —
 *    always small (4 zones, and celebrations are rare/short-lived), so they
 *    always fit a single packet whole and are sent complete every tick, no
 *    reassembly. A 2-second celebration riding the slower heavy stream instead
 *    would often finish decaying before it ever fully arrived.
 *  - "heavy" atoms (placed units, monsters, shots) — can be arbitrarily large
 *    at high entity counts, so these still use the old chunk-and-reassemble
 *    scheme, one MTU-safe chunk per tick, applied once every chunk of a
 *    version has arrived.
 * Splitting them matters because a member used to have to wait for the
 * *entire* heavy reassembly (worst case ~800ms at high monster counts) before
 * seeing even a gold/armed-menu change reflected — a menu press felt
 * sluggish precisely when the field was busiest. Quick atoms bypass that
 * wait entirely: gold, upgrades, and the sell/upgrade menu now update within
 * one network tick regardless of how many monsters are on screen.
 */
import { ARCHETYPES, MAIN_STATS, POTENTIAL_OPTION_TYPES, SLOT_COUNT, jobIdToName, jobNameToId } from './data.js';
import { ZONE_LABELS } from './field.js';
import type { Celebration, MerandiWorld, Monster, MonsterKind, Potential, PotentialLine, Shot, UnitMember, UnitStack, Zone, ZoneLabel } from './types.js';

const MONSTER_KIND_LIST: MonsterKind[] = ['normal', 'speed', 'tank', 'boss'];
const ARMED_CODE: Record<'upgrade' | 'sell' | 'none', number> = { none: 0, upgrade: 1, sell: 2 };

/** A unit's potential, flattened to 13 numbers (grade + 3 lines x 4 fields) — shared by the 'S' atom (every placed unit) and the 'Z' atom's lastRerollPotential (see wire.ts's header comment). */
function encodePotential(p: Potential): unknown[] {
  const out: unknown[] = [p.grade];
  for (let li = 0; li < 3; li++) {
    const line = p.lines[li];
    if (!line) {
      out.push(-1, 0, -1, -1);
      continue;
    }
    out.push(POTENTIAL_OPTION_TYPES.indexOf(line.type), line.value, line.fromStat ? MAIN_STATS.indexOf(line.fromStat) : -1, line.toStat ? MAIN_STATS.indexOf(line.toStat) : -1);
  }
  return out;
}

function decodePotential(fields: number[]): Potential {
  const lines: PotentialLine[] = [];
  for (let li = 0; li < 3; li++) {
    const base = 1 + li * 4;
    const typeIdx = fields[base];
    if (typeIdx < 0) continue;
    const line: PotentialLine = { type: POTENTIAL_OPTION_TYPES[typeIdx], value: fields[base + 1] };
    if (fields[base + 2] >= 0) line.fromStat = MAIN_STATS[fields[base + 2]];
    if (fields[base + 3] >= 0) line.toStat = MAIN_STATS[fields[base + 3]];
    lines.push(line);
  }
  return { grade: fields[0], lines };
}

/**
 * Leaves headroom under the ~1472-byte Ethernet MTU for the outer `{t:'ROOM_WORLD', roomId, payload}`
 * envelope, IP/UDP headers, AND this tick's quick atoms (~650-700 bytes worst case for 4 zones with
 * long names/messages) riding along in the same packet — see buildOutgoingPacket(). Measured worst
 * case at this budget: ~1350 bytes total, comfortably under the MTU.
 */
const CHUNK_BYTE_BUDGET = 600;

const byteLen = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).length;

function buildQuickAtoms(world: MerandiWorld): unknown[] {
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
    const zoneAtom: unknown[] = [
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
    ];
    // Piggybacks the just-rerolled unit's fresh potential on the quick stream (see doRerollPotential) —
    // absent (-1) once its shared TTL with lastMessage expires, same as any other feedback toast.
    if (z.lastRerollMemberId != null && z.lastRerollPotential) {
      zoneAtom.push(z.lastRerollMemberId, ...encodePotential(z.lastRerollPotential));
    } else {
      zoneAtom.push(-1);
    }
    // Same trick for the just-starforced unit's new star count (see doStarforce) — comes right after the
    // reroll block above, whatever length that turned out to be.
    if (z.lastStarforceMemberId != null && z.lastStarforceLevel != null) {
      zoneAtom.push(z.lastStarforceMemberId, z.lastStarforceLevel);
    } else {
      zoneAtom.push(-1);
    }
    atoms.push(zoneAtom);
  });
  for (const c of world.celebrations) {
    atoms.push(['C', c.id, ZONE_LABELS.indexOf(c.zoneLabel), c.grade, ARCHETYPES.indexOf(c.arche), Math.round(c.life), Math.round(c.maxLife)]);
  }
  return atoms;
}

function buildHeavyAtoms(world: MerandiWorld): unknown[] {
  const atoms: unknown[] = [];
  world.zones.forEach((z, zi) => {
    z.slots.forEach((slot, si) => {
      if (!slot || !slot.members.length) return;
      const flat: unknown[] = ['S', zi, si];
      for (const m of slot.members) {
        flat.push(m.id, m.grade, ARCHETYPES.indexOf(m.arche), jobNameToId(m.job), Math.round(m.cooldownMs), m.starforce, ...encodePotential(m.potential));
      }
      atoms.push(flat);
    });
  });
  for (const m of world.monsters) {
    const atom: unknown[] = ['N', m.id, Math.round(m.t * 1e5) / 1e5, Math.round(m.hp * 10) / 10, m.maxHp, MONSTER_KIND_LIST.indexOf(m.kind), m.speed];
    // 레전더리+ status effects (전사 stagger/vulnerable, 도적 dot) are rare and short-lived — only the
    // handful of monsters actually affected pay these extra bytes, everyone else's atom is unchanged.
    if ((m.staggerMsLeft ?? 0) > 0 || (m.vulnerableMsLeft ?? 0) > 0 || (m.dotMsLeft ?? 0) > 0) {
      atom.push(
        Math.round(m.staggerMsLeft ?? 0),
        Math.round(m.vulnerableMsLeft ?? 0),
        Math.round((m.vulnerableFactor ?? 1) * 100) / 100,
        Math.round(m.dotMsLeft ?? 0),
        Math.round((m.dotDamagePerSec ?? 0) * 10) / 10,
        m.dotZoneLabel ? ZONE_LABELS.indexOf(m.dotZoneLabel) : -1
      );
    }
    atoms.push(atom);
  }
  for (const s of world.shots) {
    const atom: unknown[] = ['T', Math.round(s.x * 10) / 10, Math.round(s.y * 10) / 10, Math.round(s.tx * 10) / 10, Math.round(s.ty * 10) / 10, Math.round(s.life), Math.round(s.maxLife), s.grade];
    if (s.splash) atom.push(1);
    atoms.push(atom);
  }
  return atoms;
}

export interface WireChunk {
  v: number;
  i: number;
  n: number;
  a: unknown[];
}

/** Every tick's outgoing packet: complete quick atoms plus one MTU-safe slice of the current heavy cycle. */
export interface WirePacket extends WireChunk {
  q: unknown[];
}

/** Greedily bin-packs heavy atoms into MTU-safe chunks — never splits a single atom, so every chunk is independently valid JSON. */
export function encodeHeavyChunks(world: MerandiWorld, version: number): WireChunk[] {
  const atoms = buildHeavyAtoms(world);
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

/** Attaches this tick's fresh quick atoms to whichever heavy chunk is due to go out. */
export function buildOutgoingPacket(world: MerandiWorld, heavyChunk: WireChunk): WirePacket {
  return { ...heavyChunk, q: buildQuickAtoms(world) };
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

interface QuickState {
  wave: number;
  waveTotal: number;
  waveMsLeft: number;
  waveIsBoss: boolean;
  aliveMonsters: number;
  aliveThreshold: number;
  over: boolean;
  won: boolean;
  zones: Zone[]; // slots always empty here — filled in from the heavy stream at merge time
  celebrations: Celebration[];
}

function decodeQuickAtoms(atoms: unknown[]): QuickState {
  let meta: unknown[] | null = null;
  const zonesByIdx = new Map<number, Zone>();
  const celebrations: Celebration[] = [];

  for (const raw of atoms) {
    if (!Array.isArray(raw) || raw.length === 0) continue;
    if (raw[0] === 'M') {
      meta = raw;
    } else if (raw[0] === 'Z') {
      const [, zi, id, name, gold, str, int, dex, luk, armedCode, pendingArcheIdx, lastMessage, kills, rerollMemberId] = raw;
      const label = ZONE_LABELS[zi] ?? ZONE_LABELS[0];
      const zone: Zone = {
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
      };
      // The reroll block is either 1 element (-1, absent) or 14 (memberId + 13 potential fields) — the
      // starforce block that follows starts right after however long that turned out to be.
      let starforceStart = 14;
      if (rerollMemberId != null && rerollMemberId >= 0) {
        zone.lastRerollMemberId = rerollMemberId;
        zone.lastRerollPotential = decodePotential(raw.slice(14));
        starforceStart = 27;
      }
      const starforceMemberId = raw[starforceStart];
      if (starforceMemberId != null && starforceMemberId >= 0) {
        zone.lastStarforceMemberId = starforceMemberId;
        zone.lastStarforceLevel = raw[starforceStart + 1];
      }
      zonesByIdx.set(zi, zone);
    } else if (raw[0] === 'C') {
      const [, id, zi, grade, archeIdx, life, maxLife] = raw;
      celebrations.push({
        id,
        zoneLabel: ZONE_LABELS[zi] ?? ZONE_LABELS[0],
        grade,
        arche: ARCHETYPES[archeIdx] ?? ARCHETYPES[0],
        life,
        maxLife
      });
    }
  }

  const metaTuple = (meta ?? ['M', 1, 60, 0, 0, 0, 999, 0, 0]) as [string, number, number, number, number, number, number, number, number];
  const [, wave, waveTotal, waveMsLeft, waveIsBoss, aliveMonsters, aliveThreshold, over, won] = metaTuple;

  return {
    wave,
    waveTotal,
    waveMsLeft,
    waveIsBoss: !!waveIsBoss,
    aliveMonsters,
    aliveThreshold,
    over: !!over,
    won: !!won,
    zones: ZONE_LABELS.map((label, zi) => zonesByIdx.get(zi) ?? freshEmptyZone(label)),
    celebrations
  };
}

interface HeavyState {
  slotsByZoneIndex: Map<number, (UnitStack | null)[]>;
  monsters: Monster[];
  shots: Shot[];
}

function decodeHeavyAtoms(atoms: unknown[]): HeavyState {
  const slotsByZoneIndex = new Map<number, (UnitStack | null)[]>();
  const monsters: Monster[] = [];
  const shots: Shot[] = [];

  for (const raw of atoms) {
    if (!Array.isArray(raw) || raw.length === 0) continue;
    const tag = raw[0];
    if (tag === 'S') {
      const [, zi, si, ...rest] = raw;
      const members: UnitMember[] = [];
      const STRIDE = 19; // 5 base fields + 1 starforce + 13 potential fields (grade + 3 lines * (typeIdx, value, fromIdx, toIdx))
      for (let k = 0; k + STRIDE - 1 < rest.length; k += STRIDE) {
        members.push({
          id: rest[k],
          grade: rest[k + 1],
          arche: ARCHETYPES[rest[k + 2]],
          job: jobIdToName(rest[k + 3]),
          cooldownMs: rest[k + 4],
          starforce: rest[k + 5],
          potential: decodePotential(rest.slice(k + 6, k + STRIDE))
        });
      }
      let slots = slotsByZoneIndex.get(zi);
      if (!slots) {
        slots = new Array<UnitStack | null>(SLOT_COUNT).fill(null);
        slotsByZoneIndex.set(zi, slots);
      }
      if (si >= 0 && si < slots.length) slots[si] = { members };
    } else if (tag === 'N') {
      const [, id, t, hp, maxHp, kindIdx, speed, staggerMsLeft, vulnerableMsLeft, vulnerableFactor, dotMsLeft, dotDamagePerSec, dotZoneIdx] = raw;
      const monster: Monster = { id, t, hp, maxHp, kind: MONSTER_KIND_LIST[kindIdx] ?? 'normal', speed };
      if (raw.length > 7) {
        monster.staggerMsLeft = staggerMsLeft;
        monster.vulnerableMsLeft = vulnerableMsLeft;
        monster.vulnerableFactor = vulnerableFactor;
        monster.dotMsLeft = dotMsLeft;
        monster.dotDamagePerSec = dotDamagePerSec;
        if (dotZoneIdx >= 0) monster.dotZoneLabel = ZONE_LABELS[dotZoneIdx];
      }
      monsters.push(monster);
    } else if (tag === 'T') {
      const [, x, y, tx, ty, life, maxLife, grade, splashFlag] = raw;
      shots.push({ x, y, tx, ty, life, maxLife, grade, ...(splashFlag ? { splash: true } : {}) });
    }
  }

  return { slotsByZoneIndex, monsters, shots };
}

function mergeQuickAndHeavy(quick: QuickState, heavy: HeavyState | null): MerandiWorld {
  return {
    wave: quick.wave,
    waveTotal: quick.waveTotal,
    waveMsLeft: quick.waveMsLeft,
    waveIsBoss: quick.waveIsBoss,
    aliveMonsters: quick.aliveMonsters,
    aliveThreshold: quick.aliveThreshold,
    over: quick.over,
    won: quick.won,
    monsters: heavy?.monsters ?? [],
    shots: heavy?.shots ?? [],
    celebrations: quick.celebrations,
    zones: quick.zones.map((z, zi) => {
      const slots = heavy?.slotsByZoneIndex.get(zi);
      return slots ? { ...z, slots } : z;
    })
  };
}

/**
 * Reassembles the heavy stream's chunks (possibly interleaved across ticks) and combines them with
 * whichever quick atoms arrived most recently — quick atoms need no reassembly (they're always sent
 * whole) so `getWorld()` reflects them the instant they arrive, even mid-way through a heavy cycle.
 * Never throws — a malformed/corrupt packet is simply ignored, since crashing here would freeze the
 * receiver's own frame loop, the exact class of bug this whole module exists to avoid on the sending side.
 */
export class SnapshotAssembler {
  private quick: QuickState | null = null;
  private heavy: HeavyState | null = null;
  private heavyVersion = -1;
  private heavyTotal = 0;
  private heavyReceived = new Map<number, unknown[]>();
  private heavyUpdatedAtMs = 0;

  ingest(raw: unknown): MerandiWorld | null {
    try {
      const packet = raw as Partial<WirePacket>;
      if (Array.isArray(packet?.q)) {
        this.quick = decodeQuickAtoms(packet.q);
      }
      if (typeof packet?.v === 'number' && typeof packet.i === 'number' && typeof packet.n === 'number' && Array.isArray(packet.a)) {
        if (packet.v !== this.heavyVersion) {
          this.heavyVersion = packet.v;
          this.heavyTotal = packet.n;
          this.heavyReceived = new Map();
        }
        this.heavyReceived.set(packet.i, packet.a);
        if (this.heavyReceived.size >= this.heavyTotal) {
          const atoms: unknown[] = [];
          for (let i = 0; i < this.heavyTotal; i++) {
            const part = this.heavyReceived.get(i);
            if (!part) break;
            atoms.push(...part);
          }
          if (atoms.length || this.heavyTotal === 0) {
            this.heavy = decodeHeavyAtoms(atoms);
            this.heavyUpdatedAtMs = Date.now();
          }
        }
      }
      if (!this.quick) return null;
      return mergeQuickAndHeavy(this.quick, this.heavy);
    } catch {
      return null;
    }
  }

  /** How long ago the heavy (unit/monster/shot) portion last fully updated — used to extrapolate monster motion between reassemblies, since quick-stream updates alone don't mean new positions arrived. */
  heavyAgeMs(): number {
    return this.heavyUpdatedAtMs === 0 ? 0 : Date.now() - this.heavyUpdatedAtMs;
  }
}
