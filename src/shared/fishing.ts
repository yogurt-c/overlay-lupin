/** Shared catalog and save contract. Species IDs are permanent across releases. */
export const RARITIES = ['일반', '고급', '희귀', '에픽', '전설', '신화'] as const;
export type FishShape = 'round' | 'slim' | 'eel' | 'flat' | 'puffer' | 'angler' | 'dragon';
export interface Species {
  id: string; name: string; artVariant: number; rarity: number; minMm: number; maxMm: number;
  shape: FishShape; pattern: number; feature: number; fantasy: boolean; description: string;
}
// Each catalog group (IDs and artwork stay stable): 6 common, 5 uncommon, 4 rare, 2 epic, 2 legendary, 1 mythic.
// Three epic slots replace legendary/mythic slots below: 36/30/24/15/10/5.
const names = [
  ['붕어','송사리','참붕어','미꾸라지','버들붕어','납자루','잉어','메기','동자개','금붕어','가물치','비단잉어','황어','블루길','배스','황금붕어','연꽃메기','천년잉어','비취붕어','연못수호어'],
  ['피라미','버들치','모래무지','돌고기','갈겨니','쉬리','은어','누치','꺽지','밀어','미유기','쏘가리','뱀장어','열목어','산천어','홍련연어','청옥송어','폭포비룡어','은실장어','강의이무기'],
  ['멸치','전갱이','고등어','학공치','망둑어','청어','숭어','쥐치','볼락','복섬','놀래기','참돔','넙치','감성돔','돌돔','달꼬리참치','산호복어','해무장어','진주가자미','해룡잉어'],
  ['눈꽃심해어','먹점심해어','실꼬리어','은바늘어','깃털심해어','밤비늘어','푸른턱심해어','톱등심해어','긴수염심해어','둥근배심해어','유령지느러미어','초롱아귀','풍선장어','산갈치','도끼고기','검은등불어','붉은눈심해어','심연왕아귀','심해유리어','심연의용어'],
  ['달점송사리','초승붕어','별꼬리금붕어','안개피라미','잠꾸러기어','물방울어','유리송사리','리본베타','꽃잎붕어','반딧불메기','종이배어','달무늬잉어','오로라장어','혜성복어','은하가자미','월식아귀','꿈결송어','별빛잉어','달그림자어','구름비늘어'],
  ['구름송사리','돌비늘어','새싹잉어','솜꼬리어','모래시계어','먹구름메기','바람지느러미어','여우꼬리어','봉오리복어','눈송이붕어','종소리어','비늘갑옷어','불꽃송어','얼음장어','번개가자미','봉황지느러미어','무지개수염어','시간의잉어','유성꼬리어','용잉어']
];
/** Real species keep real-world lengths (cm), so a 미꾸라지 never comes out 40cm long. */
const REAL_CM: Record<string, [number, number]> = {
  붕어:[10,40], 송사리:[2,4], 참붕어:[4,10], 미꾸라지:[8,20], 버들붕어:[4,8], 납자루:[4,10],
  잉어:[25,100], 메기:[25,100], 동자개:[10,30], 금붕어:[5,25], 가물치:[30,100],
  비단잉어:[30,90], 황어:[20,50], 블루길:[10,25], 배스:[20,60],
  피라미:[8,15], 버들치:[6,15], 모래무지:[10,25], 돌고기:[6,12], 갈겨니:[10,20], 쉬리:[8,13],
  은어:[15,30], 누치:[20,50], 꺽지:[10,25], 밀어:[4,8], 미유기:[15,30],
  쏘가리:[25,60], 뱀장어:[40,100], 열목어:[30,70], 산천어:[20,40],
  멸치:[6,15], 전갱이:[15,40], 고등어:[20,50], 학공치:[20,40], 망둑어:[8,25], 청어:[20,40],
  숭어:[30,80], 쥐치:[15,30], 볼락:[15,30], 복섬:[8,15], 놀래기:[10,30],
  참돔:[30,100], 넙치:[30,100], 감성돔:[25,60], 돌돔:[25,60],
  초롱아귀:[10,40], 풍선장어:[40,100], 산갈치:[100,300], 도끼고기:[3,8]
};
/** Imagined species grow with rarity, so a rarer catch can always come out bigger; body shape stretches or squats the range. */
const FANTASY_CM: [number, number][] = [[4,18],[8,32],[15,55],[30,130],[60,220],[120,400]];
const SHAPE_SCALE: Record<FishShape, number> = { round: 1, slim: .9, eel: 1.6, flat: 1, puffer: .6, angler: .85, dragon: 1.4 };
function sizeRange(name: string, rarity: number, shape: FishShape, i: number, artVariant: number): [number, number] {
  const real = REAL_CM[name];
  if (real) return [real[0]*10, real[1]*10];
  // A stable per-species ±15% so two fantasy fish of one tier and shape still differ.
  const k = SHAPE_SCALE[shape] * (.85 + ((i*7 + artVariant*13) % 10) / 30), [lo, hi] = FANTASY_CM[rarity];
  return [Math.round(lo*k*10), Math.round(hi*k*10)];
}
/** Version 1 sizes, kept only to rescale old saves onto the new ranges. */
function legacyRange(s: Species): [number, number] {
  const i = s.feature, minMm = s.shape === 'eel' ? 100 + s.artVariant*20 : 25 + i*12;
  return [minMm, minMm + 100 + i*37 + s.artVariant*60];
}
const forms: FishShape[] = ['round','slim','round','eel','puffer','flat','round','angler','slim','puffer','eel','round','eel','slim','flat','slim','puffer','dragon','flat','dragon'];
const features = ['둥근 등지느러미','긴 갈래 꼬리','짧은 수염','구불구불한 몸','작은 가시','납작한 몸통','이중 등지느러미','긴 턱수염','뾰족한 주둥이','부채 꼬리','리본 지느러미','넓은 꼬리','긴 등선','가는 몸통','줄무늬','뿔 같은 지느러미','꽃잎 꼬리','긴 용수염','별무늬','작은 뿔'];
export const SPECIES: Species[] = names.flatMap((list, artVariant) => list.map((name, i) => {
  let rarity = i < 6 ? 0 : i < 11 ? 1 : i < 15 ? 2 : i < 17 ? 3 : i < 19 ? 4 : 5;
  if ((artVariant === 0 && i === 19) || (artVariant === 1 && i === 18) || (artVariant === 2 && i === 18)) rarity = 3;
  let shape = forms[i];
  if (/장어|미꾸라지|산갈치/.test(name)) shape = 'eel';
  else if (/가자미|넙치|도끼/.test(name)) shape = 'flat';
  else if (/복어|복섬/.test(name)) shape = 'puffer';
  else if (/아귀/.test(name)) shape = 'angler';
  else if (/용|이무기/.test(name)) shape = 'dragon';
  else if (/메기|동자개|미유기/.test(name)) shape = 'angler';
  else if (/잉어|붕어|돔/.test(name)) shape = 'round';
  else if (/송사리|피라미|멸치|학공치|송어|연어/.test(name)) shape = 'slim';
  const [minMm, maxMm] = sizeRange(name, rarity, shape, i, artVariant);
  const fantasy = artVariant >= 4 || (artVariant === 3 && i < 11) || i >= 15;
  return { id: `fish-${artVariant}-${i}`, name, artVariant, rarity, minMm, maxMm,
    shape, pattern: (i + artVariant) % 5, feature: i, fantasy,
    description: `${features[i]}${fantasy ? '가 인상적인 상상 속 물고기' : '가 보이는 물고기'}. ${['느긋하게 물살을 탄다','잠깐 멈췄다가 재빨리 움직인다','짧은 돌진을 반복한다','넓게 헤엄치다 방향을 바꾼다','떨림 뒤에 크게 움직인다'][(i + artVariant) % 5]}.` };
}));
export const SPECIES_BY_ID = new Map(SPECIES.map(s => [s.id, s]));
export interface FishCatch { id: string; speciesId: string; sizeMm: number; caughtAt: string; favorite: boolean; released: boolean }
export const SAVE_VERSION = 2;
export interface FishingSave { version: typeof SAVE_VERSION; profileId: string; catches: FishCatch[] }
export type FishingAction = { kind: 'catch'; fish: FishCatch } | { kind: 'release' | 'favorite'; id: string };
export interface FishingReply { ok: boolean; data?: FishingSave; error?: string; cancelled?: boolean }
export function validCatch(value: unknown): value is FishCatch {
  if (!value || typeof value !== 'object') return false;
  const c = value as FishCatch, s = SPECIES_BY_ID.get(c.speciesId);
  return !!s && typeof c.id === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(c.id) && Number.isInteger(c.sizeMm) && c.sizeMm >= s.minMm && c.sizeMm <= s.maxMm &&
    typeof c.caughtAt === 'string' && Number.isFinite(Date.parse(c.caughtAt)) && typeof c.favorite === 'boolean' && typeof c.released === 'boolean';
}
export function isFishingSave(value: unknown): value is FishingSave {
  if (!value || typeof value !== 'object') return false;
  const d = value as FishingSave;
  return d.version === SAVE_VERSION && typeof d.profileId === 'string' && d.profileId.length <= 120 && Array.isArray(d.catches) && d.catches.every(validCatch) && new Set(d.catches.map(c => c.id)).size === d.catches.length;
}
/**
 * Brings an older save (or export) up to SAVE_VERSION. Version 1 sizes are rescaled onto the new ranges at the same
 * relative position, so a near-record catch stays near the record. Anything unrecognised passes through untouched
 * and is then rejected by isFishingSave.
 */
export function migrateSave(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const d = value as { version?: unknown; catches?: unknown };
  if (d.version !== 1 || !Array.isArray(d.catches)) return value;
  const catches = d.catches.map((c: unknown) => {
    const fish = c as FishCatch, s = fish && typeof fish === 'object' ? SPECIES_BY_ID.get(fish.speciesId) : undefined;
    if (!s || !Number.isFinite(fish.sizeMm)) return c;
    const [oldMin, oldMax] = legacyRange(s), t = Math.min(1, Math.max(0, (fish.sizeMm - oldMin) / (oldMax - oldMin)));
    return { ...fish, sizeMm: Math.round(s.minMm + t * (s.maxMm - s.minMm)) };
  });
  return { ...d, version: SAVE_VERSION, catches };
}
