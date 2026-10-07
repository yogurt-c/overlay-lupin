/**
 * Passive items. They never attack on their own — each one bends the numbers
 * every weapon reads, which is what makes a build out of a pile of weapons.
 *
 * `stat` is the knob and `per` is how much one level turns it. The engine
 * folds them into a single multiplier set once per tick (see `passiveStats`),
 * so a weapon never has to know which items the player owns.
 */

export type PassiveStat =
  | 'damage'     // 공격력
  | 'area'       // 범위
  | 'cooldown'   // 쿨타임 (낮을수록 빠르다)
  | 'amount'     // 투사체 수
  | 'duration'   // 지속 시간
  | 'speed'      // 이동 속도
  | 'maxHp'      // 최대 체력
  | 'armor'      // 받는 피해 감소
  | 'regen'      // 초당 회복
  | 'magnet';    // 보석 획득 반경

export interface PassiveSpec {
  id: string;
  label: string;
  stat: PassiveStat;
  /** Change per level. A ratio for multipliers and regen, a flat count for amount. */
  per: number;
  maxLevel: number;
  hint: string;
}

export const PASSIVES: PassiveSpec[] = [
  { id: 'spinach',  label: '시금치',        stat: 'damage',   per: 0.10, maxLevel: 5, hint: '공격력 +10%' },
  { id: 'armor',    label: '갑옷',          stat: 'armor',    per: 0.12, maxLevel: 5, hint: '받는 피해 -12%' },
  { id: 'heart',    label: '속이 빈 심장',  stat: 'maxHp',    per: 0.20, maxLevel: 5, hint: '최대 체력 +20%' },
  { id: 'ring',     label: '수호 반지',     stat: 'regen',    per: 0.0025, maxLevel: 5, hint: '최대 체력의 0.25%씩 회복' },
  { id: 'wings',    label: '날개',          stat: 'speed',    per: 0.10, maxLevel: 5, hint: '이동 속도 +10%' },
  { id: 'candle',   label: '촛대',          stat: 'area',     per: 0.10, maxLevel: 5, hint: '공격 범위 +10%' },
  { id: 'book',     label: '빈 담금술서',   stat: 'cooldown', per: 0.08, maxLevel: 5, hint: '쿨타임 -8%' },
  { id: 'twin',     label: '쌍둥이 반지',   stat: 'amount',   per: 1,    maxLevel: 3, hint: '투사체 +1' },
  { id: 'crest',    label: '공허의 문장',   stat: 'duration', per: 0.15, maxLevel: 5, hint: '지속 시간 +15%' },
  { id: 'magnet',   label: '자석',          stat: 'magnet',   per: 0.30, maxLevel: 3, hint: '보석 획득 반경 +30%' }
];

export const passiveById = (id: string): PassiveSpec | undefined => PASSIVES.find((p) => p.id === id);

export interface Stats {
  damage: number;
  area: number;
  cooldown: number;
  amount: number;
  duration: number;
  speed: number;
  maxHp: number;
  armor: number;
  regen: number;
  magnet: number;
}

const BASE: Stats = {
  damage: 1, area: 1, cooldown: 1, amount: 0, duration: 1,
  speed: 1, maxHp: 1, armor: 0, regen: 0, magnet: 1
};

/** Folds a player's owned passives into one multiplier set. */
export function passiveStats(owned: Map<string, number>): Stats {
  const out: Stats = { ...BASE };
  for (const [id, level] of owned) {
    const spec = passiveById(id);
    if (!spec) continue;
    const amount = spec.per * level;
    switch (spec.stat) {
      case 'cooldown': out.cooldown = Math.max(0.4, out.cooldown - amount); break;
      case 'armor': out.armor = Math.min(0.6, out.armor + amount); break;
      case 'amount': out.amount += amount; break;
      case 'regen': out.regen += amount; break;
      default: out[spec.stat] += amount;
    }
  }
  return out;
}
