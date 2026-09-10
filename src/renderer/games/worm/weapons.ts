/**
 * Every weapon a worm can hold. The default one is unlimited; the rest come
 * off the ground with a few rounds and hand the worm back to the default when
 * they run dry, so nothing a player picks up makes them permanently stronger.
 *
 * Wire note: a shell carries its weapon as the index into `WEAPON_ORDER`, so
 * that order is part of the protocol — append to it, never reorder it.
 */

export type WeaponId = 'basic' | 'shotgun' | 'rocket' | 'cluster' | 'clusterlet';

export interface Weapon {
  id: WeaponId;
  /** Shown in the HUD while held. */
  label: string;
  /** Rounds granted on pickup; 0 means unlimited (the default weapon only). */
  rounds: number;
  /** Shells produced per shot. */
  shots: number;
  /** Total fan width in degrees across those shells. */
  spreadDeg: number;
  speedMin: number;
  speedRange: number;
  gravity: number;
  blastRadius: number;
  craterRadius: number;
  damageMax: number;
  damageMin: number;
  reloadFrames: number;
  chargeFrames: number;
  /** Splits into this many `clusterlet` shells at the top of its arc. */
  splitInto?: number;
  /** Drawn radius, so a rocket reads as heavier than a pellet. */
  drawRadius: number;
}

export const WEAPONS: Record<WeaponId, Weapon> = {
  basic: {
    id: 'basic',
    label: '기본',
    rounds: 0,
    shots: 1,
    spreadDeg: 0,
    speedMin: 2.2,
    speedRange: 8.0,
    gravity: 0.22,
    blastRadius: 26,
    craterRadius: 22,
    damageMax: 34,
    damageMin: 6,
    reloadFrames: 72,
    chargeFrames: 90,
    drawRadius: 3
  },
  shotgun: {
    id: 'shotgun',
    label: '산탄',
    rounds: 4,
    shots: 3,
    spreadDeg: 14,
    speedMin: 2.6,
    speedRange: 8.4,
    // Heavier fall than the default, which is what keeps it a close-range weapon.
    gravity: 0.3,
    blastRadius: 16,
    craterRadius: 12,
    damageMax: 16,
    damageMin: 3,
    reloadFrames: 60,
    chargeFrames: 70,
    drawRadius: 2.2
  },
  rocket: {
    id: 'rocket',
    label: '로켓',
    rounds: 3,
    shots: 1,
    spreadDeg: 0,
    // Fast and barely affected by gravity: the arc is nearly a straight line,
    // so aiming it feels different from everything else in the game.
    speedMin: 4.0,
    speedRange: 9.5,
    gravity: 0.15,
    blastRadius: 38,
    craterRadius: 34,
    damageMax: 46,
    damageMin: 10,
    reloadFrames: 96,
    chargeFrames: 100,
    drawRadius: 4.2
  },
  cluster: {
    id: 'cluster',
    label: '클러스터',
    rounds: 3,
    shots: 1,
    spreadDeg: 0,
    speedMin: 2.2,
    speedRange: 8.0,
    gravity: 0.22,
    // Weak on its own — the payload is what does the work.
    blastRadius: 16,
    craterRadius: 12,
    damageMax: 14,
    damageMin: 3,
    reloadFrames: 96,
    chargeFrames: 90,
    splitInto: 4,
    drawRadius: 3.8
  },
  clusterlet: {
    id: 'clusterlet',
    label: '파편',
    rounds: 0,
    shots: 1,
    spreadDeg: 0,
    speedMin: 0,
    speedRange: 0,
    gravity: 0.26,
    blastRadius: 20,
    craterRadius: 15,
    damageMax: 20,
    damageMin: 4,
    reloadFrames: 0,
    chargeFrames: 0,
    drawRadius: 2.4
  }
};

/** Wire order. Append only — a shell's weapon travels as an index into this. */
export const WEAPON_ORDER: WeaponId[] = ['basic', 'shotgun', 'rocket', 'cluster', 'clusterlet'];

export function weaponIndex(id: WeaponId): number {
  return WEAPON_ORDER.indexOf(id);
}

export function weaponAt(index: number): Weapon {
  return WEAPONS[WEAPON_ORDER[index] ?? 'basic'];
}
