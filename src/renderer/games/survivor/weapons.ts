/**
 * Weapons, their evolutions, and the cards a level-up offers.
 *
 * `kind` is the only thing the engine branches on — everything else is a
 * number it reads through the owner's passive multipliers. Adding a weapon is
 * a row here plus one case in `fireWeapons`.
 */

import { PASSIVES } from './passives.js';
import type { CardOffer } from './types.js';

export type WeaponKind =
  | 'arc'      // a swing in the facing direction (whip)
  | 'homing'   // seeks the nearest enemy (magic wand)
  | 'shot'     // straight line, pierces (knife)
  | 'lob'      // thrown outward, keeps flying (axe)
  | 'pool'     // a patch of ground that keeps hurting (holy water)
  | 'aura'     // a ring that hugs the player (garlic)
  | 'orbit'    // bodies circling the player (bible)
  | 'bolt';    // strikes random enemies on screen (lightning ring)

export interface WeaponSpec {
  id: string;
  label: string;
  kind: WeaponKind;
  /** Ticks between activations at level 1. */
  cooldown: number;
  damage: number;
  /** Reach, blast radius, or orbit radius depending on `kind`. */
  radius: number;
  /** How long one instance lives, in ticks. */
  life: number;
  /** Projectiles (or orbiting bodies) per activation. */
  count: number;
  /** Projectile speed, world units per tick. Unused by arc/aura/pool. */
  speed: number;
  maxLevel: number;
  /**
   * Passive that unlocks the evolution, and what it becomes. The numbers are
   * multipliers applied on top of the weapon at max level — flat values would
   * make an evolution weaker than the level 8 it replaces.
   */
  evolvesWith?: string;
  evolvesInto?: { label: string; damage: number; cooldown: number; radius: number; count: number };
  hint: string;
}

export const WEAPONS: WeaponSpec[] = [
  {
    id: 'whip', label: '채찍', kind: 'arc',
    cooldown: 60, damage: 12, radius: 54, life: 9, count: 1, speed: 0, maxLevel: 8,
    evolvesWith: 'crest',
    evolvesInto: { label: '혈귀의 채찍', damage: 1.8, cooldown: 0.55, radius: 1.35, count: 2 },
    hint: '바라보는 쪽을 가로로 벤다'
  },
  {
    id: 'wand', label: '마법봉', kind: 'homing',
    cooldown: 80, damage: 9, radius: 7, life: 110, count: 1, speed: 3.6, maxLevel: 8,
    evolvesWith: 'book',
    evolvesInto: { label: '신성한 봉', damage: 1.7, cooldown: 0.4, radius: 1.3, count: 4 },
    hint: '가장 가까운 적을 따라간다'
  },
  {
    id: 'knife', label: '단검', kind: 'shot',
    cooldown: 46, damage: 7, radius: 6, life: 70, count: 1, speed: 5.4, maxLevel: 8,
    evolvesWith: 'twin',
    evolvesInto: { label: '천 개의 칼날', damage: 1.6, cooldown: 0.45, radius: 1.2, count: 5 },
    hint: '바라보는 쪽으로 빠르게 던진다'
  },
  {
    id: 'axe', label: '도끼', kind: 'lob',
    cooldown: 110, damage: 22, radius: 12, life: 95, count: 1, speed: 3.1, maxLevel: 8,
    evolvesWith: 'candle',
    evolvesInto: { label: '죽음의 나선', damage: 1.9, cooldown: 0.6, radius: 1.4, count: 4 },
    hint: '위로 던져 적을 관통한다'
  },
  {
    id: 'water', label: '성수', kind: 'pool',
    cooldown: 150, damage: 2.2, radius: 40, life: 180, count: 1, speed: 2.2, maxLevel: 8,
    evolvesWith: 'crest',
    evolvesInto: { label: '대홍수', damage: 1.8, cooldown: 0.55, radius: 1.45, count: 3 },
    hint: '바닥에 장판을 만든다'
  },
  {
    id: 'garlic', label: '마늘', kind: 'aura',
    cooldown: 30, damage: 3.5, radius: 46, life: 1, count: 1, speed: 0, maxLevel: 8,
    evolvesWith: 'heart',
    evolvesInto: { label: '영혼 흡수기', damage: 2.0, cooldown: 0.6, radius: 1.35, count: 1 },
    hint: '몸 주위를 계속 태운다'
  },
  {
    id: 'bible', label: '성경', kind: 'orbit',
    cooldown: 200, damage: 8, radius: 62, life: 150, count: 1, speed: 0.055, maxLevel: 8,
    evolvesWith: 'ring',
    evolvesInto: { label: '천상의 찬가', damage: 1.8, cooldown: 0.6, radius: 1.25, count: 4 },
    hint: '몸 주위를 돈다'
  },
  {
    id: 'bolt', label: '번개 반지', kind: 'bolt',
    cooldown: 130, damage: 18, radius: 34, life: 10, count: 1, speed: 0, maxLevel: 8,
    evolvesWith: 'spinach',
    evolvesInto: { label: '천둥 고리', damage: 1.7, cooldown: 0.6, radius: 1.3, count: 4 },
    hint: '화면 안 적에게 벼락을 떨어뜨린다'
  }
];

export const WEAPON_SLOTS = 6;
export const PASSIVE_SLOTS = 6;
/** A passive must reach this level before it can carry an evolution. */
export const EVOLVE_PASSIVE_LEVEL = 3;

export const weaponById = (id: string): WeaponSpec => WEAPONS.find((w) => w.id === id) ?? WEAPONS[0];

/** An evolved weapon keeps its slot but stops levelling — it is already the end of the line. */
export const isEvolved = (id: string): boolean => id.endsWith('+');
export const baseIdOf = (id: string): string => (isEvolved(id) ? id.slice(0, -1) : id);

export function labelOf(id: string): string {
  const spec = weaponById(baseIdOf(id));
  return isEvolved(id) ? spec.evolvesInto?.label ?? spec.label : spec.label;
}

/** Final numbers for one weapon at one level, after the owner's passives. */
export interface Resolved {
  kind: WeaponKind;
  cooldown: number;
  damage: number;
  radius: number;
  life: number;
  count: number;
  speed: number;
}

export function resolve(
  id: string,
  level: number,
  stats: { damage: number; area: number; cooldown: number; amount: number; duration: number }
): Resolved {
  const spec = weaponById(baseIdOf(id));
  const evo = isEvolved(id) ? spec.evolvesInto : undefined;

  // An evolved weapon is measured against its own max level, never against the
  // level it happened to be carrying when the chest opened.
  const peak = evo ? spec.maxLevel : level;
  const baseDamage = spec.damage * (1 + 0.35 * (peak - 1)) * (evo?.damage ?? 1);
  const baseCooldown = spec.cooldown * (1 - 0.07 * (peak - 1)) * (evo?.cooldown ?? 1);
  const baseRadius = spec.radius * (1 + 0.08 * (peak - 1)) * (evo?.radius ?? 1);
  const baseCount = evo ? evo.count : spec.count + Math.floor((level - 1) / 3);

  return {
    kind: spec.kind,
    damage: baseDamage * stats.damage,
    cooldown: Math.max(8, Math.round(baseCooldown * stats.cooldown)),
    radius: baseRadius * stats.area,
    life: Math.round(spec.life * stats.duration),
    // Extra projectiles only make sense for weapons that throw things.
    count: baseCount + (spec.kind === 'arc' || spec.kind === 'aura' ? 0 : stats.amount),
    speed: spec.speed
  };
}

/** Which weapon, if any, is ready to evolve given what the player owns. */
export function evolutionReady(
  weapons: Map<string, number>,
  passives: Map<string, number>
): string | null {
  for (const [id, level] of weapons) {
    if (isEvolved(id)) continue;
    const spec = weaponById(id);
    if (level < spec.maxLevel || !spec.evolvesWith) continue;
    if ((passives.get(spec.evolvesWith) ?? 0) >= EVOLVE_PASSIVE_LEVEL) return id;
  }
  return null;
}

/**
 * Picks the cards for one level-up. Owned things offer their next level,
 * unowned ones offer themselves — but only while a slot is free, which is what
 * forces a build instead of a shopping list.
 */
export function rollOffers(
  weapons: Map<string, number>,
  passives: Map<string, number>,
  count: number,
  rng: () => number
): CardOffer[] {
  const pool: CardOffer[] = [];

  const weaponSlotsFree = weapons.size < WEAPON_SLOTS;
  for (const spec of WEAPONS) {
    const have = weapons.get(spec.id) ?? 0;
    if (have === 0 && !weaponSlotsFree) continue;
    if (have >= spec.maxLevel) continue;
    pool.push({
      weapon: spec.id,
      level: have + 1,
      label: have === 0 ? spec.label : `${spec.label} Lv.${have + 1}`,
      detail: have === 0 ? spec.hint : '공격력 · 범위 · 쿨타임 개선'
    });
  }

  const passiveSlotsFree = passives.size < PASSIVE_SLOTS;
  for (const spec of PASSIVES) {
    const have = passives.get(spec.id) ?? 0;
    if (have === 0 && !passiveSlotsFree) continue;
    if (have >= spec.maxLevel) continue;
    pool.push({
      weapon: `passive:${spec.id}`,
      level: have + 1,
      label: have === 0 ? spec.label : `${spec.label} Lv.${have + 1}`,
      detail: spec.hint
    });
  }

  const picked: CardOffer[] = [];
  while (picked.length < count && pool.length > 0) {
    picked.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return picked;
}

/** True for an offer that upgrades a passive rather than a weapon. */
export const isPassiveOffer = (offer: CardOffer): boolean => offer.weapon.startsWith('passive:');
export const passiveIdOf = (offer: CardOffer): string => offer.weapon.slice('passive:'.length);
