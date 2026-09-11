import type { Archetype, MainStat, MonsterKind, UnitMember, UpgradeLevels } from './types.js';

/** 8-tier gacha ladder. No color is ever used to tell these apart — see draw.ts (size + border only). */
export interface GradeSpec {
  name: string;
  prob: number; // 0..1, sums to 1 across the table
  dmgMult: number;
  sizeMult: number; // also drives the icon border thickness in draw.ts
  rangeMult: number; // multiplies BASE_RANGE_PX
}

export const GRADES: GradeSpec[] = [
  { name: '노멀', prob: 0.545, dmgMult: 1, sizeMult: 1.0, rangeMult: 1.0 },
  { name: '매직', prob: 0.305, dmgMult: 1.5, sizeMult: 1.1, rangeMult: 1.15 },
  { name: '레어', prob: 0.0886, dmgMult: 2.2, sizeMult: 1.2, rangeMult: 1.3 },
  { name: '에픽', prob: 0.0409, dmgMult: 3.3, sizeMult: 1.35, rangeMult: 1.5 },
  { name: '유니크', prob: 0.0136, dmgMult: 5, sizeMult: 1.5, rangeMult: 1.75 },
  { name: '레전더리', prob: 0.0065, dmgMult: 7.5, sizeMult: 1.7, rangeMult: 2.1 },
  { name: '신화', prob: 0.0003, dmgMult: 11, sizeMult: 2.0, rangeMult: 2.5 },
  { name: '초월', prob: 0.0001, dmgMult: 20, sizeMult: 2.5, rangeMult: 3.0 }
];

export const ARCHETYPES: Archetype[] = ['warrior', 'mage', 'archer', 'thief', 'pirate'];

export const ARCHETYPE_NAME: Record<Archetype, string> = {
  warrior: '전사',
  mage: '마법사',
  archer: '궁수',
  thief: '도적',
  pirate: '해적'
};

/** Flavor-only job names, 48 total — grade/archetype drive mechanics, this is purely a text label. */
export const JOB_POOL: Record<Archetype, string[]> = {
  warrior: ['히어로', '팔라딘', '다크나이트', '소울마스터', '미하일', '아란', '블래스터', '데몬슬레이어', '데몬어벤져', '카이저', '제로', '아델', '렌'],
  mage: ['아크메이지(불,독)', '아크메이지(썬,콜)', '비숍', '플레임위자드', '에반', '루미너스', '배틀메이지', '키네시스', '일리움', '라라', '시아 아스텔'],
  archer: ['보우마스터', '신궁', '패스파인더', '메르세데스', '윈드브레이커', '카인', '아이엘'],
  thief: ['나이트로드', '섀도어', '듀얼블레이드', '나이트워커', '팬텀', '칼리', '호영', '카데나'],
  pirate: ['바이퍼', '캡틴', '캐논슈터', '스트라이커', '메카닉', '은월', '아크', '엔젤릭버스터']
};

export const MAIN_STATS: MainStat[] = ['str', 'int', 'dex', 'luk'];

export const MAIN_STAT_NAME: Record<MainStat, string> = {
  str: 'STR',
  int: 'INT',
  dex: 'DEX',
  luk: 'LUK'
};

/** Which main stat's upgrade track powers each archetype — 전사/해적 share STR, unlike separate per-job tracks. */
export const ARCHETYPE_MAIN_STAT: Record<Archetype, MainStat> = {
  warrior: 'str',
  pirate: 'str',
  mage: 'int',
  archer: 'dex',
  thief: 'luk'
};

/** MapleStory-flavored secondary stat per archetype — a much smaller bonus on top of the main stat, see SUB_GROWTH. */
export const ARCHETYPE_SUB_STAT: Record<Archetype, MainStat> = {
  warrior: 'dex',
  pirate: 'dex',
  mage: 'luk',
  archer: 'str',
  thief: 'dex'
};

/** 제논: 해적 소속이지만 STR+DEX+LUK 세 업그레이드 트랙 전부의 영향을 받는 하이브리드 특수 유닛. */
export const XENON_NAME = '제논';
export const XENON_ARCHE: Archetype = 'pirate';
export const XENON_BONUS_STATS: MainStat[] = ['dex', 'luk'];

export function rollJobName(arche: Archetype): string {
  // A small, flavor-only chance the roll lands on 제논 instead of a regular pirate name.
  if (arche === 'pirate' && Math.random() < 1 / JOB_POOL.pirate.length) return XENON_NAME;
  const pool = JOB_POOL[arche];
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Flat job-name dictionary (48 real jobs + 제논 = 49 entries), used only at the network wire boundary
 * (see wire.ts) so a unit's `job` string never has to cross the wire as raw UTF-8 text — a small
 * integer index is enough, since both sides already have this exact same table built in.
 */
export const JOB_ID_LIST: string[] = [...ARCHETYPES.flatMap((a) => JOB_POOL[a]), XENON_NAME];
const JOB_ID_INDEX = new Map(JOB_ID_LIST.map((name, i) => [name, i]));
export function jobNameToId(name: string): number {
  return JOB_ID_INDEX.get(name) ?? 0;
}
export function jobIdToName(id: number): string {
  return JOB_ID_LIST[id] ?? JOB_ID_LIST[0];
}

export function rollGrade(): number {
  const roll = Math.random();
  let acc = 0;
  for (let i = 0; i < GRADES.length; i++) {
    acc += GRADES[i].prob;
    if (roll < acc) return i;
  }
  return GRADES.length - 1;
}

export function rollArchetype(): Archetype {
  return ARCHETYPES[Math.floor(Math.random() * ARCHETYPES.length)];
}

/** Slot grid: 6x6 per zone, up to 3 stacked per slot — 108 units max per player. */
export const SLOT_COLS = 6;
export const SLOT_ROWS = 6;
export const SLOT_COUNT = SLOT_COLS * SLOT_ROWS;
export const STACK_MAX = 3;

export const DRAW_COST_BASE = 30;
/** Keeps pace with the kill-reward curve (also +something per 10 waves) so the "kills needed per draw" ratio doesn't just get easier forever as waves escalate. */
export function drawCost(wave: number): number {
  return DRAW_COST_BASE + Math.floor(wave / 10) * 5;
}
export const SELL_REFUND = 15; // ~50% of DRAW_COST_BASE, matching the intended refund ratio
export const UPGRADE_BASE_COST = 15;
export const UPGRADE_GROWTH = 1.011;
export const UPGRADE_MAX_LEVEL = 300;
export function upgradeCost(level: number): number {
  return Math.round(UPGRADE_BASE_COST * Math.pow(UPGRADE_GROWTH, level));
}

/** Per-archetype combat role — how a unit's grade-scaled damage actually gets applied. */
export const ARCHETYPE_ROLE: Record<Archetype, 'attack' | 'attackSpeed' | 'crit'> = {
  warrior: 'attack',
  pirate: 'attack',
  mage: 'attack',
  archer: 'attackSpeed',
  thief: 'crit'
};

export const BASE_DMG = 3;
/** Across-the-board upgrade efficiency dial — scales every LEVEL_GROWTH/SUB_GROWTH value down together so the carefully-tuned ratios between stats never drift while the overall payoff gets cheaper or richer. */
const EFFICIENCY_SCALE = 0.9;
/**
 * Flat growth per upgrade level, per main stat. STR powers two archetypes (전사+해적) instead of one —
 * at an equal rate it would let a single upgrade track cover 40% of all draws instead of the 20% every
 * other stat covers, making it strictly more gold-efficient. Its rate is halved to cancel that out, so
 * investing in STR delivers roughly the same total army-wide value as focusing any other stat.
 *
 * INT is the mirror case: no archetype uses it as a sub stat (see ARCHETYPE_SUB_STAT), so mage gets no
 * synergy bonus from other upgrade tracks the way STR/DEX/LUK investors do. Its own rate is bumped up
 * so INT's total army-wide value (main only) still lands on par with a stat that gets both main+sub
 * coverage (~0.20 either way — see the SUB_GROWTH comment for the sub-side half of this balance).
 */
export const LEVEL_GROWTH: Record<MainStat, number> = {
  str: 0.075 * EFFICIENCY_SCALE,
  int: 0.2 * EFFICIENCY_SCALE,
  dex: 0.15 * EFFICIENCY_SCALE,
  luk: 0.15 * EFFICIENCY_SCALE
};

/**
 * Sub stat growth, coverage-normalized the same way STR's main growth was halved: a stat used as the
 * sub stat for N archetypes (see ARCHETYPE_SUB_STAT — DEX covers 전사/해적/도적) gets 1/N of
 * BASE_SUB_GROWTH, so no sub stat ends up more gold-efficient than another just because more jobs
 * happen to lean on it. Always far weaker than any main stat's growth — this is flavor/synergy on top
 * of the main stat, not a second main stat.
 */
const BASE_SUB_GROWTH = 0.05 * EFFICIENCY_SCALE;
export const SUB_GROWTH: Record<MainStat, number> = (() => {
  const coverage: Record<MainStat, number> = { str: 0, int: 0, dex: 0, luk: 0 };
  for (const a of ARCHETYPES) coverage[ARCHETYPE_SUB_STAT[a]]++;
  const result = {} as Record<MainStat, number>;
  for (const s of MAIN_STATS) result[s] = coverage[s] > 0 ? BASE_SUB_GROWTH / coverage[s] : 0;
  return result;
})();

/**
 * Shared by the engine (actual combat) and the UI (inspect panel) so the displayed damage number is
 * always exactly what the unit deals — never a separately-hand-computed approximation.
 */
export function computeMemberMultiplier(upLevels: UpgradeLevels, member: Pick<UnitMember, 'arche' | 'job'>): number {
  if (member.job === XENON_NAME) {
    const stats: MainStat[] = ['str', 'dex', 'luk'];
    const avg = stats.reduce((sum, s) => sum + upLevels[s] * LEVEL_GROWTH[s], 0) / stats.length;
    return 1 + avg;
  }
  const mainStat = ARCHETYPE_MAIN_STAT[member.arche];
  const subStat = ARCHETYPE_SUB_STAT[member.arche];
  const mainBonus = upLevels[mainStat] * LEVEL_GROWTH[mainStat];
  const subBonus = upLevels[subStat] * SUB_GROWTH[subStat];
  return 1 + mainBonus + subBonus;
}

export function computeMemberDamage(upLevels: UpgradeLevels, member: Pick<UnitMember, 'arche' | 'job' | 'grade'>): number {
  return BASE_DMG * GRADES[member.grade].dmgMult * computeMemberMultiplier(upLevels, member);
}

export interface MonsterSpec {
  hpMult: number;
  speedMult: number;
}

export const MONSTER_KINDS: Record<MonsterKind, MonsterSpec> = {
  normal: { hpMult: 1, speedMult: 1 },
  speed: { hpMult: 0.6, speedMult: 1.6 },
  tank: { hpMult: 2.5, speedMult: 0.7 },
  boss: { hpMult: 10, speedMult: 1 }
};

export const MONSTER_KIND_NAME: Record<MonsterKind, string> = {
  normal: '기본형',
  speed: '스피드형',
  tank: '탱커형',
  boss: '보스'
};

export const TOTAL_WAVES = 50;
export const NORMAL_WAVE_MS = 30_000;
export const BOSS_WAVE_MS = 60_000;
export const HP_GROWTH_PER_WAVE = 1.08;
/**
 * Per-corner monster baseline — the engine multiplies this by the number of active players/corners
 * (see engine.ts's startWave), so density per corner stays constant regardless of player count instead
 * of a fixed total getting divided down for fewer players. 1p wave1 = 40, growing +5/wave from there.
 */
export const MONSTERS_PER_WAVE_PER_PLAYER = (wave: number): number => 40 + (wave - 1) * 5;
/**
 * Cap on how many monsters may be alive at once before it's a loss — doesn't grow per wave, only per
 * active player: 1p ≈ 150, 4p ≈ 400 (see engine.ts's aliveThreshold(), linear on player count).
 */
export const ALIVE_THRESHOLD_SOLO = 150;
export const ALIVE_THRESHOLD_PER_EXTRA_PLAYER = 83;
/**
 * Regular monsters spread out evenly across this much of the wave (spawn gap = this / monster count),
 * instead of a fixed per-monster gap — keeps the "still trickling in" feel constant across every wave
 * regardless of how many monsters that wave actually spawns, leaving a quiet tail before the next wave.
 */
export const SPAWN_WINDOW_MS = 25_000;
/** How long after the last regular monster a boss wave's boss appears. */
export const BOSS_SPAWN_DELAY_MS = 400;

export function isBossWave(wave: number): boolean {
  return wave % 5 === 0;
}
