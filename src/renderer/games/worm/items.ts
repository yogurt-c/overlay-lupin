/**
 * Pickups that appear on the ground during a match. Weapons are the common
 * drop, a heal is almost as common, and a shield is deliberately rare — ten
 * seconds of immunity in a six-way brawl is the strongest thing in the game.
 */

import type { WeaponId } from './weapons.js';

export type ItemKind = 'heal' | 'shield' | 'shotgun' | 'rocket' | 'cluster';

/** Wire order. Append only — an item travels as an index into this. */
export const ITEM_ORDER: ItemKind[] = ['heal', 'shield', 'shotgun', 'rocket', 'cluster'];

/** Relative spawn frequency. Everything is drawn from this one table. */
const WEIGHTS: Record<ItemKind, number> = {
  heal: 3,
  shield: 1,
  shotgun: 3,
  rocket: 2,
  cluster: 2
};

const TOTAL_WEIGHT = ITEM_ORDER.reduce((sum, kind) => sum + WEIGHTS[kind], 0);

export function itemIndex(kind: ItemKind): number {
  return ITEM_ORDER.indexOf(kind);
}

export function itemAt(index: number): ItemKind {
  return ITEM_ORDER[index] ?? 'heal';
}

/** The weapon a pickup grants, or null for the ones that aren't weapons. */
export function weaponFor(kind: ItemKind): WeaponId | null {
  if (kind === 'shotgun' || kind === 'rocket' || kind === 'cluster') return kind;
  return null;
}

/** Rolls one pickup against the weight table. */
export function rollItemKind(random: () => number): ItemKind {
  let ticket = random() * TOTAL_WEIGHT;
  for (const kind of ITEM_ORDER) {
    ticket -= WEIGHTS[kind];
    if (ticket <= 0) return kind;
  }
  return 'heal';
}
