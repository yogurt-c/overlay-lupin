import { poseAt, poseIndex } from './types.js';
import type { JumpmapInput, JumpmapWorld, RunnerState } from './types.js';
import { PLATFORMS } from './field.js';

export function inputBits(input: JumpmapInput): number {
  return Number(input.left) | Number(input.right) << 1 | Number(input.jump) << 2 |
    Number(input.down) << 3 | Number(input.attack) << 4;
}
export function inputFromBits(bits: number): JumpmapInput {
  return { left: !!(bits & 1), right: !!(bits & 2), jump: !!(bits & 4), down: !!(bits & 8), attack: !!(bits & 16) };
}

/** Compact tuples keep six runners and their replay state in a single LAN datagram. */
export interface WorldPacket { v: 1; tick: number; phase: JumpmapWorld['phase']; timerMs: number; runners: [string, number[]][] }
const rounded = (value: number) => Math.round(value * 10000) / 10000;
export function encodeWorld(world: JumpmapWorld): WorldPacket {
  return { v: 1, tick: world.tick, phase: world.phase, timerMs: world.timerMs,
    runners: world.players.map(p => {
      const s = p.state!;
      return [p.id, [s.x, s.y, s.vy, s.facing, Number(s.airborne), s.knockVX,
        s.stunTicks, s.attackCooldown, s.atkAnim, Number(s.jumpHeld), Number(s.attackHeld),
        PLATFORMS.findIndex(p => p.id === s.standingOn), poseIndex(s.pose), s.poseTimer,
        s.finish ?? 0, p.ack ?? 0,
        s.impact ? PLATFORMS.findIndex(p => p.id === s.impact!.platformId) : -1,
        s.impact?.x ?? 0, s.impact?.tick ?? 0].map(rounded)];
    }) };
}
export function decodeWorld(packet: WorldPacket): JumpmapWorld {
  return { tick: packet.tick, phase: packet.phase, timerMs: packet.timerMs,
    players: packet.runners.map(([id, a]) => {
      const state: RunnerState = { x: a[0], y: a[1], vy: a[2], facing: a[3] as 1 | -1,
        airborne: !!a[4], knockVX: a[5], stunTicks: a[6], attackCooldown: a[7], atkAnim: a[8],
        jumpHeld: !!a[9], attackHeld: !!a[10], standingOn: PLATFORMS[a[11]]?.id ?? null,
        pose: poseAt(a[12]), poseTimer: a[13], finish: a[14] || undefined,
        impact: a[16] >= 0 ? { platformId: PLATFORMS[a[16]].id, x: a[17], tick: a[18] } : undefined };
      return { id, x: state.x, y: state.y, facing: state.facing, p: a[12],
        finish: state.finish, atk: state.atkAnim || undefined, impact: state.impact, ack: a[15], state };
    }) };
}
