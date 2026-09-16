import { ANIMALS } from './animals.js';
import { MAX_ANIMALS, SWAP_TOKENS } from './types.js';
import type { AnimalPose, TowerWorld } from './types.js';

// Snapshots travel in independently bounded UDP chunks. A missing chunk leaves the previous complete
// frame intact; next cycle repairs it. Never combine animal poses from different simulation ticks.
const CHUNK_SIZE = 10;
export interface TowerPacket { t: 'tower-world'; part: number; total: number; world: TowerWorld; }
const integer = (n: number, max: number): boolean => Number.isInteger(n) && n >= 0 && n <= max;
const coord = (n: number): boolean => Number.isFinite(n) && Math.abs(n) <= 100000;
function validPose(p: unknown): p is AnimalPose {
  return Array.isArray(p) && p.length === 5 && integer(p[0], ANIMALS.length - 1)
    && integer(p[1], 1) && coord(p[2]) && coord(p[3]) && Number.isFinite(p[4]) && Math.abs(p[4]) <= Math.PI + 0.001;
}
function validPacket(p: unknown): p is TowerPacket {
  if (!p || typeof p !== 'object') return false;
  const { t, part, total, world: w } = p as TowerPacket;
  return t === 'tower-world' && integer(total, MAX_ANIMALS) && integer(part, Math.max(0, Math.ceil(total / CHUNK_SIZE) - 1))
    && !!w && Number.isSafeInteger(w.tick) && w.tick >= 0 && integer(w.turn, MAX_ANIMALS)
    && integer(w.side, 1) && ['aim', 'fall', 'over'].includes(w.phase)
    && integer(w.kind, ANIMALS.length - 1) && integer(w.next, ANIMALS.length - 1)
    && coord(w.x) && coord(w.y) && Number.isFinite(w.angle) && Math.abs(w.angle) <= Math.PI + 0.001
    && integer(w.score, total) && (w.loser === null || integer(w.loser, 1))
    && typeof w.complete === 'boolean' && Number.isSafeInteger(w.ack) && w.ack >= -1
    && Array.isArray(w.swaps) && w.swaps.length === 2 && w.swaps.every(n => integer(n, SWAP_TOKENS))
    && Array.isArray(w.bodies) && w.bodies.length === Math.min(CHUNK_SIZE, total - part * CHUNK_SIZE)
    && w.bodies.every(validPose);
}
const round = (n: number, factor: number): number => Math.round(n * factor) / factor;
export function encodeWorld(world: TowerWorld): TowerPacket[] {
  const bodies: AnimalPose[] = world.bodies.map(([k, o, x, y, a]) => [k, o, round(x, 10), round(y, 10), round(a, 1000)]);
  const packets: TowerPacket[] = [];
  for (let part = 0; part < Math.max(1, Math.ceil(bodies.length / CHUNK_SIZE)); part++) {
    packets.push({ t: 'tower-world', part, total: bodies.length,
      world: { ...world, swaps: [...world.swaps], x: round(world.x, 10), y: round(world.y, 10), angle: round(world.angle, 1000),
        bodies: bodies.slice(part * CHUNK_SIZE, (part + 1) * CHUNK_SIZE) } });
  }
  return packets;
}

export class WorldAssembler {
  private lastTick = -1;
  private pendingTick = -1;
  private pendingTotal = -1;
  private parts = new Map<number, AnimalPose[]>();
  ingest(packet: unknown): TowerWorld | null {
    if (!validPacket(packet)) return null;
    const { world, part, total } = packet;
    if (world.tick <= this.lastTick || world.tick < this.pendingTick) return null;
    if (world.tick > this.pendingTick) {
      this.pendingTick = world.tick; this.pendingTotal = total; this.parts.clear();
    }
    if (total !== this.pendingTotal) return null;
    this.parts.set(part, world.bodies.map(p => [...p] as AnimalPose));
    const count = Math.max(1, Math.ceil(total / CHUNK_SIZE));
    if (this.parts.size !== count) return null;
    const bodies: AnimalPose[] = [];
    for (let i = 0; i < count; i++) bodies.push(...this.parts.get(i)!);
    this.lastTick = world.tick;
    this.parts.clear();
    return { ...world, bodies };
  }
}
