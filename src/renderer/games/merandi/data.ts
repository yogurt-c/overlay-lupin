import type { Archetype, MainStat, MonsterKind, UnitMember, UpgradeLevels } from './types.js';

/**
 * 8-tier gacha ladder. `color` ("그림자 염료") is deliberately desaturated (15-25% saturation, lightness
 * pulled in close to the ink itself) so the field still reads as plain ink from a glance — grade shows
 * up as size + border thickness first, color is only a secondary tell for anyone looking closely. See
 * draw.ts for how 레전더리(5)+ layer a halo and a foil light-sweep on top of this, and engine.ts/draw.ts
 * for the map-wide celebration triggered on the same threshold.
 */
export interface GradeSpec {
  name: string;
  prob: number; // 0..1, sums to 1 across the table
  dmgMult: number;
  sizeMult: number; // also drives the icon border thickness in draw.ts
  rangeMult: number; // multiplies BASE_RANGE_PX
  color: string; // stroke color for this grade's unit icon — see draw.ts
}

export const GRADES: GradeSpec[] = [
  { name: '노멀', prob: 0.545, dmgMult: 1, sizeMult: 1.0, rangeMult: 1.0, color: '#5b5d54' },
  { name: '매직', prob: 0.305, dmgMult: 1.5, sizeMult: 1.1, rangeMult: 1.15, color: '#4d5c50' },
  { name: '레어', prob: 0.0886, dmgMult: 2.2, sizeMult: 1.2, rangeMult: 1.3, color: '#47565f' },
  { name: '에픽', prob: 0.0409, dmgMult: 3.3, sizeMult: 1.35, rangeMult: 1.5, color: '#565064' },
  { name: '유니크', prob: 0.0136, dmgMult: 5, sizeMult: 1.5, rangeMult: 1.75, color: '#63515d' },
  { name: '레전더리', prob: 0.0065, dmgMult: 7.5, sizeMult: 1.7, rangeMult: 2.1, color: '#6b5a48' },
  { name: '신화', prob: 0.0003, dmgMult: 11, sizeMult: 2.0, rangeMult: 2.5, color: '#6e4d3f' },
  { name: '초월', prob: 0.0001, dmgMult: 20, sizeMult: 2.5, rangeMult: 3.0, color: '#7c5a3a' }
];

/** 레전더리(5) 이상 — 후광·포일 스윕(draw.ts)과 맵 전체 축하 연출(engine.ts doDraw, draw.ts drawCelebrations) 둘 다 이 문턱을 공유한다. */
export const CELEBRATION_MIN_GRADE = 5;

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

/** Comeback assist for whoever has the fewest kills — see engine.ts's doDraw. Boosts every 레어+ (index >= 2) weight by this factor before rolling. */
export const LAST_PLACE_GRADE_BOOST = 1.4;

/**
 * `boost` (default 1 = no change) multiplies every 레어+ (index >= 2) weight before rolling — rather
 * than renormalizing 노멀/매직 down to compensate, the roll is drawn against the new (larger) total
 * weight directly, which has the same effect without needing to touch the base GRADES table at all.
 */
export function rollGrade(boost = 1): number {
  const weights = GRADES.map((g, i) => (i >= 2 ? g.prob * boost : g.prob));
  const total = weights.reduce((sum, w) => sum + w, 0);
  const roll = Math.random() * total;
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (roll < acc) return i;
  }
  return GRADES.length - 1;
}

/**
 * Soft pity floor: once a zone has drawn this many consecutive sub-레어 results, its next draw is
 * guaranteed 레어(index 2) or higher — see rollGradeWithPity(). Unlike LAST_PLACE_GRADE_BOOST (which
 * only ever helps whoever is behind in a 2+ player match), this applies to every zone unconditionally,
 * including solo play, so a bad-luck streak always has a hard ceiling. 15 is deliberately generous: at
 * the un-boosted ~15% 레어+ rate, P(no 레어+ in 15 draws) ≈ 0.85^15 ≈ 8.7%, so it only ever fires for a
 * genuinely unlucky minority instead of shaping the average game the way a tighter pity would.
 */
export const PITY_THRESHOLD = 15;

/**
 * Same roll as rollGrade(), except once `subRareStreak` (consecutive sub-레어 draws this zone has made
 * in a row) has reached PITY_THRESHOLD, the result is forced to land 레어+ — re-rolled among just the
 * 레어+ tiers at their existing relative weights, so a forced roll still favors 레어 over 초월 the same
 * way an unforced one would. `boost` is only applied to the normal (non-floored) path: pity is meant as
 * a floor under bad luck, not an extra multiplier stacked on top of an already-guaranteed 레어+.
 */
export function rollGradeWithPity(subRareStreak: number, boost = 1): number {
  if (subRareStreak < PITY_THRESHOLD) return rollGrade(boost);
  const weights = GRADES.map((g, i) => (i >= 2 ? g.prob : 0));
  const total = weights.reduce((sum, w) => sum + w, 0);
  const roll = Math.random() * total;
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
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

/**
 * Grade at which every archetype's unique special effect kicks in — shares CELEBRATION_MIN_GRADE's
 * threshold (레전더리+) on purpose: pulling one of these already triggers the map-wide celebration, so
 * the same rare pull immediately pays off again in actual combat. All five per-archetype effects below
 * scale across the 3 grades at/above this threshold via `tier = grade - SPECIAL_EFFECT_MIN_GRADE` (0/1/2
 * for 레전더리/신화/초월) — see engine.ts's stepCombat/stepStatusEffects for where each is applied.
 */
export const SPECIAL_EFFECT_MIN_GRADE = CELEBRATION_MIN_GRADE;

/** 마법사: splash radius (px) and secondary-target damage share, by tier. */
export const MAGE_SPLASH_RADIUS: [number, number, number] = [30, 45, 60];
export const MAGE_SPLASH_DAMAGE_FACTOR: [number, number, number] = [0.4, 0.5, 0.65];

/** 궁수: unlimited range (see BASE_RANGE_PX's use in engine.ts) plus an extra cooldown multiplier at the two highest tiers. */
export const ARCHER_COOLDOWN_MULT: [number, number, number] = [1, 0.9, 0.8];

/** 도적: DoT damage-per-second as a share of the triggering hit's damage, and how long it lasts (flat across tiers — only the strength scales). */
export const THIEF_DOT_RATE: [number, number, number] = [0.3, 0.45, 0.6];
export const THIEF_DOT_DURATION_MS = 3000;

/** 해적: flat bonus gold on top of the normal kill reward (goes through the same killer/team split as awardKillGold). */
export const PIRATE_KILL_BONUS: [number, number, number] = [5, 10, 20];

/** 전사: freezes the target in place, and separately amplifies ALL damage it takes (from anyone, including 도적's dot) for a bit longer than the freeze itself. */
export const WARRIOR_STAGGER_MS: [number, number, number] = [400, 600, 800];
export const WARRIOR_VULNERABLE_FACTOR: [number, number, number] = [1.15, 1.25, 1.35];
export const WARRIOR_VULNERABLE_MS = 2000;

/** Clamps an out-of-range grade into the 0..2 tier index the arrays above expect. */
export function specialEffectTier(grade: number): number {
  return Math.min(2, Math.max(0, grade - SPECIAL_EFFECT_MIN_GRADE));
}

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
 * synergy bonus from other upgrade tracks the way STR/DEX/LUK investors do. Its base rate was first
 * bumped just to match everyone else's ~0.20 total (main-only vs main+sub). On top of that, INT still
 * carries an all-or-nothing risk no growth-rate tweak can fix — investing in it is worthless if you
 * never draw a mage — so INT_BUFF pushes its raw value deliberately above the other three, as
 * compensation for that risk rather than for pure coverage parity.
 */
const INT_BUFF = 1.25;
export const LEVEL_GROWTH: Record<MainStat, number> = {
  str: 0.075 * EFFICIENCY_SCALE,
  int: 0.2 * EFFICIENCY_SCALE * INT_BUFF,
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
/** Separate dial from EFFICIENCY_SCALE (which only covers main stats) — sub stats are meant to stay a minor flavor bonus, not approach main-stat value. */
const SUB_EFFICIENCY_SCALE = 0.7;
const BASE_SUB_GROWTH = 0.05 * EFFICIENCY_SCALE * SUB_EFFICIENCY_SCALE;
/**
 * Equal expected value per level across all 4 sub stats still left DEX feeling stronger in practice:
 * it's the sub stat for 3 archetypes plus the main stat for archer, so 4 of 5 archetypes benefit from
 * it regardless of draw luck (vs. e.g. INT, useless unless you specifically drew mages) — lower
 * variance reads as "always good" even at equal average value. This extra penalty trims DEX's actual
 * payout on top of the 1/3 coverage split below, paid for that reliability.
 */
const DEX_SUB_PENALTY = 0.7;
export const SUB_GROWTH: Record<MainStat, number> = (() => {
  const coverage: Record<MainStat, number> = { str: 0, int: 0, dex: 0, luk: 0 };
  for (const a of ARCHETYPES) coverage[ARCHETYPE_SUB_STAT[a]]++;
  const result = {} as Record<MainStat, number>;
  for (const s of MAIN_STATS) result[s] = coverage[s] > 0 ? BASE_SUB_GROWTH / coverage[s] : 0;
  result.dex *= DEX_SUB_PENALTY;
  return result;
})();

/**
 * Shared by the engine (actual combat) and the UI (inspect panel) so the displayed damage number is
 * always exactly what the unit deals — never a separately-hand-computed approximation.
 */
/**
 * Xenon only ever comes up ~2.5% of draws (1/8 chance on an already 1-in-5 pirate roll) and averaging
 * three stat tracks instead of focusing one usually loses to a focused build anyway — this buff
 * compensates a rare pull for being weaker in practice than its rarity would suggest.
 */
const XENON_BUFF = 1.4;
export function computeMemberMultiplier(upLevels: UpgradeLevels, member: Pick<UnitMember, 'arche' | 'job'>): number {
  if (member.job === XENON_NAME) {
    const stats: MainStat[] = ['str', 'dex', 'luk'];
    const avg = stats.reduce((sum, s) => sum + upLevels[s] * LEVEL_GROWTH[s], 0) / stats.length;
    return 1 + avg * XENON_BUFF;
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
/**
 * Raised again (1.08 -> 1.085 -> 1.095 -> 1.105) to keep offsetting the wave-50 spawn count cut
 * (285 -> 200) and push late-game difficulty higher — exponential, so small bumps compound a lot by
 * wave 50. This last bump also compensates for settleFactor now cutting waves 1-2 far below their old
 * 50% floor (see below): those early waves no longer contribute meaningfully to how hard wave 50 feels
 * (settleFactor is 1 from SETTLE_WAVES onward regardless), so the growth rate alone carries the
 * late-game curve.
 */
export const HP_GROWTH_PER_WAVE = 1.105;
/**
 * Per-corner monster baseline — the engine multiplies this by the number of active players/corners
 * (see engine.ts's startWave), so density per corner stays constant regardless of player count instead
 * of a fixed total getting divided down for fewer players. 1p wave1 = 40, growing to 210 by wave 50
 * (nudged up slightly from 200 to offset LAST_PLACE_GRADE_BOOST making good units easier to find overall).
 */
const SPAWN_GROWTH_PER_WAVE = (210 - 40) / (TOTAL_WAVES - 1);
/**
 * From this wave on, spawn-count growth runs at SPAWN_TAPER_FACTOR of its normal rate instead of
 * continuing the full linear climb to 210. Reason: HP_GROWTH_PER_WAVE is already exponential, so late
 * waves were compounding two growing numbers at once (HP per monster AND monster count) — by wave 50 the
 * combined per-corner HP pool was roughly 160x wave 10's despite HP-per-monster alone only growing ~54x.
 * Tapering count growth specifically past wave 30 (instead of touching HP_GROWTH_PER_WAVE, which still
 * needs to carry the late-game curve on its own) leaves waves 1-30 byte-for-byte unchanged and only
 * softens the exact regime where both curves were stacking.
 */
const SPAWN_TAPER_WAVE = 30;
const SPAWN_TAPER_FACTOR = 0.5;
/**
 * Waves 1..SETTLE_WAVES ease in instead of hitting the full designed curve immediately: at wave 1 nobody
 * has placed a single unit yet, so the intended wave-1 count/HP was effectively unkillable for a 노멀
 * draw and only a lucky high-grade pull could tag anything — letting that one player snowball the whole
 * economy off kill gold while everyone else's board never gets off the ground. Ramping count and HP
 * back up to full by SETTLE_WAVES gives every grade a real chance to start clearing before the curve
 * catches up to its old (unchanged) shape from wave SETTLE_WAVES+1 onward.
 */
export const SETTLE_WAVES = 4;
/**
 * A flat 50% wave-1 floor still wasn't gentle enough in practice — with the old linear ramp, waves 1-2
 * still took most of the wave to clear (see BASE_RANGE_PX's fix for the bigger reason why: 노멀 units
 * couldn't hit anything at all until that changed). Squaring the ramp (t*t instead of t) front-loads the
 * easing hard: wave 1 drops to SETTLE_FLOOR, wave 2 barely rises off the floor, and only wave 3 climbs
 * back toward the full curve by wave SETTLE_WAVES — so the very first waves are near-instant clears
 * while players are still drawing/placing their first units, without moving wave 4+ at all.
 */
const SETTLE_FLOOR = 0.15;
/** wave1 spawns/HP at SETTLE_FLOOR, ramping (quadratically) to 100% by SETTLE_WAVES; untouched after. */
export function settleFactor(wave: number): number {
  if (wave >= SETTLE_WAVES) return 1;
  const t = (wave - 1) / (SETTLE_WAVES - 1);
  return SETTLE_FLOOR + (1 - SETTLE_FLOOR) * t * t;
}
export const MONSTERS_PER_WAVE_PER_PLAYER = (wave: number): number => {
  const taperedWave = wave <= SPAWN_TAPER_WAVE ? wave : SPAWN_TAPER_WAVE + (wave - SPAWN_TAPER_WAVE) * SPAWN_TAPER_FACTOR;
  return Math.round((40 + (taperedWave - 1) * SPAWN_GROWTH_PER_WAVE) * settleFactor(wave));
};
/**
 * Only wave 1 gets this — every player starts with zero units on the field, so the very first monster
 * shouldn't appear before anyone has had a chance to draw and place one. Folded into startWave's spawn
 * tickets rather than a separate timer so the rest of the spawn/wave-clock logic doesn't need to know
 * about it.
 */
export const INITIAL_GRACE_MS = 4000;
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
/**
 * How long after wave start (on top of any INITIAL_GRACE_MS) a boss wave's boss appears — spawns
 * alongside the regular roster now, not after it finishes, so the full BOSS_WAVE_MS timer is real time
 * to fight the boss instead of mostly burning on the trash spawn window first.
 */
export const BOSS_SPAWN_DELAY_MS = 400;

export function isBossWave(wave: number): boolean {
  return wave % 5 === 0;
}
