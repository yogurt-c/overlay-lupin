/** Shared insect catalog and save contract. Species IDs are permanent across releases. */
export const RARITIES = ['일반', '고급', '희귀', '전설', '신화'] as const;
export const ENVS = ['air', 'tree', 'ground'] as const;
export type Env = typeof ENVS[number];
export const ENV_NAMES: Record<Env, string> = { air: '공중', tree: '나무', ground: '지상' };
/** Body plans the art kit knows how to draw. */
export type Plan = 'butterfly' | 'dragonfly' | 'damselfly' | 'cicada' | 'beetle' | 'ladybug' | 'stag' | 'rhino' | 'longhorn' | 'jewel' | 'tiger' | 'dung'
  | 'grasshopper' | 'conehead' | 'longhead' | 'katydid' | 'cricket' | 'molecricket' | 'mantis' | 'firefly';
/** How a live insect moves around the field. */
export type Move = 'flutter' | 'hover' | 'skim' | 'glide' | 'drift' | 'circle' | 'patrol' | 'perch'
  | 'sing' | 'crawl' | 'still' | 'hop' | 'dig' | 'nod' | 'walk' | 'dash' | 'roll';
/** How it leaves when it is scared off. */
export type Flee = 'up' | 'dart' | 'zigzag' | 'buzz' | 'fly' | 'hide' | 'hop' | 'dig' | 'run';
export interface Species {
  id: string; name: string; env: Env; rarity: number; minMm: number; maxMm: number;
  plan: Plan; variant: number; size: 0 | 1 | 2; move: Move; flee: Flee; sings: boolean; description: string;
}
type Row = [name: string, minMm: number, maxMm: number, plan: Plan, variant: number, size: 0 | 1 | 2, move: Move, flee: Flee, description: string];
// The first release: each habitat lists 4 일반, 3 고급, 2 희귀 and 1 전설, in that order.
const ROWS: Record<Env, Row[]> = {
  air: [
    ['노랑나비', 20, 28, 'butterfly', 0, 1, 'flutter', 'up', '노란 날개에 작은 눈무늬. 꽃 높이에서 위아래로 팔랑인다.'],
    ['고추잠자리', 35, 45, 'dragonfly', 0, 1, 'hover', 'dart', '빨간 배의 가을 잠자리. 공중에 멈췄다가 휙 움직인다.'],
    ['배추흰나비', 20, 30, 'butterfly', 1, 1, 'flutter', 'up', '흰 날개 끝에 검은 점. 낮게 지그재그로 난다.'],
    ['밀잠자리', 45, 55, 'dragonfly', 1, 1, 'skim', 'dart', '푸른 잿빛 배. 땅 가까이 낮게 날다 풀끝에 앉는다.'],
    ['호랑나비', 35, 60, 'butterfly', 2, 2, 'glide', 'up', '노랑과 검정 줄무늬의 큰 나비. 느긋하게 활공한다.'],
    ['실잠자리', 25, 35, 'damselfly', 0, 0, 'drift', 'hide', '바늘처럼 가는 몸. 떠다니듯 천천히 움직인다.'],
    ['제비나비', 45, 65, 'butterfly', 3, 2, 'circle', 'up', '검은 날개에 청록빛 광택. 큰 원을 그리며 빠르게 난다.'],
    ['왕잠자리', 65, 80, 'dragonfly', 2, 2, 'patrol', 'zigzag', '초록 가슴의 큰 잠자리. 넓은 구간을 빠르게 왕복한다.'],
    ['꼬리명주나비', 22, 30, 'butterfly', 4, 1, 'drift', 'up', '긴 꼬리를 늘어뜨리고 미끄러지듯 느리게 난다.'],
    ['붉은점모시나비', 25, 32, 'butterfly', 5, 1, 'perch', 'up', '비치는 흰 날개에 붉은 점. 낮게 날다 자주 앉는다.']
  ],
  tree: [
    ['참매미', 33, 38, 'cicada', 0, 1, 'sing', 'buzz', '줄기에 붙어 맴맴 운다. 초록과 검정 무늬.'],
    ['풍뎅이', 15, 24, 'beetle', 0, 0, 'crawl', 'fly', '반짝이는 초록 등딱지. 줄기를 천천히 오르내린다.'],
    ['말매미', 40, 48, 'cicada', 1, 1, 'sing', 'buzz', '가장 크게 우는 검은 매미.'],
    ['무당벌레', 5, 8, 'ladybug', 0, 0, 'crawl', 'fly', '빨간 등에 검은 점. 놀라면 뒤집혀 죽은 척한다.'],
    ['넓적사슴벌레', 25, 85, 'stag', 0, 2, 'still', 'hide', '넓적한 몸과 굵은 턱. 가끔 턱을 벌린다.'],
    ['톱사슴벌레', 23, 75, 'stag', 1, 2, 'crawl', 'hide', '톱니 같은 휜 턱을 든 붉은 갈색 사슴벌레.'],
    ['유지매미', 32, 38, 'cicada', 2, 1, 'sing', 'buzz', '기름종이 같은 갈색 날개. 느린 박자로 운다.'],
    ['장수풍뎅이', 30, 85, 'rhino', 0, 2, 'crawl', 'fly', '큰 뿔을 까딱이는 숲의 장수.'],
    ['비단벌레', 25, 40, 'jewel', 0, 1, 'still', 'hide', '초록·청록 무지갯빛이 일렁이는 보석 같은 딱정벌레.'],
    ['장수하늘소', 65, 110, 'longhorn', 0, 2, 'crawl', 'fly', '긴 더듬이의 거대한 하늘소. 천연기념물.']
  ],
  ground: [
    ['벼메뚜기', 16, 40, 'grasshopper', 0, 1, 'hop', 'hop', '연둣빛 메뚜기. 작게 톡톡 뛰어다닌다.'],
    ['왕귀뚜라미', 26, 40, 'cricket', 0, 1, 'sing', 'hide', '풀 근처에서 귀뚤귀뚤 운다.'],
    ['섬서구메뚜기', 20, 42, 'conehead', 0, 1, 'still', 'hop', '뾰족한 머리. 풀잎 위에 가만히 붙어 있다.'],
    ['땅강아지', 29, 35, 'molecricket', 0, 1, 'dig', 'dig', '삽 같은 앞다리로 흙을 판다.'],
    ['방아깨비', 40, 80, 'longhead', 0, 2, 'nod', 'hop', '긴 몸으로 방아 찧듯 끄덕인다.'],
    ['여치', 30, 40, 'katydid', 0, 1, 'sing', 'hop', '통통한 초록 몸과 긴 더듬이. 긴 박자로 운다.'],
    ['좀사마귀', 45, 65, 'mantis', 1, 1, 'walk', 'fly', '갈색 사마귀. 흔들흔들 걷는다.'],
    ['왕사마귀', 65, 95, 'mantis', 0, 2, 'walk', 'fly', '앞다리를 든 큰 초록 사마귀.'],
    ['길앞잡이', 18, 22, 'tiger', 0, 0, 'dash', 'run', '알록달록한 몸. 짧게 달리고 멈추기를 반복한다.'],
    ['소똥구리', 8, 16, 'dung', 0, 0, 'roll', 'run', '작은 경단을 굴리는 딱정벌레. 국내에서 거의 사라졌다.']
  ]
};
const FIRST_RARITY = [0, 0, 0, 0, 1, 1, 1, 2, 2, 3];
/** Added with 신화: each row carries its rarity and keeps numbering after the first ten of its habitat. */
const ADDED: Record<Env, [number, ...Row][]> = {
  air: [
    [0, '네발나비', 20, 30, 'butterfly', 6, 1, 'flutter', 'up', '주황 날개에 검은 점, 들쭉날쭉한 가장자리. 앞다리 한 쌍이 작아 발이 넷처럼 보인다.'],
    [0, '된장잠자리', 37, 45, 'dragonfly', 3, 1, 'patrol', 'dart', '된장빛 누런 잠자리. 바다를 건너와 여름 하늘을 떼 지어 난다.'],
    [1, '남방부전나비', 9, 14, 'butterfly', 7, 0, 'flutter', 'zigzag', '손톱만 한 하늘색 나비. 괭이밥 근처를 낮게 맴돈다.'],
    [1, '물잠자리', 50, 60, 'damselfly', 1, 1, 'drift', 'hide', '검은 날개에 금속빛 초록 몸. 맑은 개울가에서 나풀나풀 난다.'],
    [2, '긴꼬리제비나비', 55, 70, 'butterfly', 8, 2, 'glide', 'up', '길게 늘어진 꼬리와 붉은 점의 검은 나비. 그늘진 숲길을 따라 활공한다.'],
    [2, '장수잠자리', 90, 110, 'dragonfly', 4, 2, 'patrol', 'zigzag', '노란 띠의 검은 몸, 초록 겹눈. 우리나라에서 가장 큰 잠자리.'],
    [3, '산굴뚝나비', 25, 32, 'butterfly', 9, 1, 'perch', 'up', '눈알 무늬의 갈색 나비. 한라산 높은 곳에만 사는 천연기념물.'],
    [4, '애반딧불이', 7, 10, 'firefly', 0, 0, 'drift', 'up', '꽁무니에서 연둣빛 불을 깜빡인다. 맑은 물가가 남은 여름밤에만 만날 수 있다.']
  ],
  tree: [
    [0, '애매미', 26, 32, 'cicada', 3, 1, 'sing', 'buzz', '작은 초록 매미. "씨-요 씨-요" 하고 장난스럽게 운다.'],
    [0, '흰점박이꽃무지', 17, 25, 'beetle', 1, 0, 'crawl', 'fly', '구릿빛 등에 흰 점이 흩어진 꽃무지. 수액에 모여든다.'],
    [1, '털매미', 20, 25, 'cicada', 4, 1, 'sing', 'buzz', '얼룩덜룩한 잿빛 날개. 나무껍질에 붙으면 감쪽같이 숨는다.'],
    [1, '남생이무당벌레', 8, 13, 'ladybug', 1, 0, 'crawl', 'fly', '가장 큰 무당벌레. 등의 검은 테두리가 거북 등딱지 같다.'],
    [2, '왕사슴벌레', 27, 77, 'stag', 2, 2, 'still', 'hide', '굵게 안으로 휜 턱의 검은 사슴벌레. 참나무 구멍 깊이 숨어 지낸다.'],
    [2, '루리하늘소', 16, 30, 'longhorn', 1, 1, 'crawl', 'fly', '하늘빛 몸에 검은 점. 더듬이 마디마다 검은 털뭉치가 달렸다.'],
    [3, '두점박이사슴벌레', 25, 65, 'stag', 3, 2, 'crawl', 'hide', '황갈색 몸, 가슴에 검은 점 두 개. 제주 숲에만 사는 귀한 사슴벌레.'],
    [4, '수염풍뎅이', 31, 40, 'beetle', 2, 1, 'still', 'fly', '부채 같은 더듬이에 흰 대리석 무늬. 수십 년째 자취를 감춘 전설 속 풍뎅이.']
  ],
  ground: [
    [0, '팥중이', 25, 40, 'grasshopper', 1, 1, 'hop', 'hop', '팥빛이 도는 잿빛 메뚜기. 마른 땅에 앉으면 흙과 구별되지 않는다.'],
    [0, '넓적배사마귀', 45, 70, 'mantis', 2, 1, 'walk', 'fly', '넓적한 배에 흰 점 하나. 풀숲에서 앞다리를 모으고 기다린다.'],
    [0, '중베짱이', 33, 45, 'katydid', 1, 1, 'sing', 'hop', '등에 갈색 띠를 두른 베짱이. 낮에도 "쓰르륵" 운다.'],
    [1, '긴꼬리', 13, 20, 'cricket', 1, 0, 'sing', 'hide', '연둣빛 가냘픈 귀뚜라미. 투명한 날개를 세워 "루루루" 맑게 운다.'],
    [1, '풀무치', 45, 65, 'grasshopper', 2, 2, 'hop', 'hop', '굵고 큰 메뚜기. 한 번 뛰면 멀리 날아간다.'],
    [2, '방울벌레', 15, 20, 'cricket', 2, 0, 'sing', 'hide', '넓적한 날개의 까만 귀뚜라미. "링-링" 방울 소리로 운다.'],
    [2, '꼬마길앞잡이', 9, 12, 'tiger', 1, 0, 'dash', 'run', '흰 물결무늬의 작은 길앞잡이. 물가 모래밭을 쏜살같이 달린다.'],
    [3, '애기뿔소똥구리', 13, 18, 'dung', 1, 0, 'roll', 'run', '머리에 작은 뿔이 솟은 소똥구리. 멸종위기 야생생물.'],
    [4, '닻무늬길앞잡이', 13, 16, 'tiger', 2, 0, 'dash', 'run', '등에 흰 닻무늬를 새긴 길앞잡이. 서해 바닷가 모래밭에서만 드물게 발견된다.']
  ]
};
const SINGERS = new Set(['참매미', '말매미', '유지매미', '왕귀뚜라미', '여치', '애매미', '털매미', '중베짱이', '긴꼬리', '방울벌레']);
function species(env: Env, e: number, i: number, rarity: number, [name, minMm, maxMm, plan, variant, size, move, flee, description]: Row): Species {
  return { id: `bug-${e}-${i}`, name, env, rarity, minMm, maxMm, plan, variant, size, move, flee, sings: SINGERS.has(name), description };
}
/** The first release keeps its catalog order (wire snapshots index into it); additions follow. */
export const SPECIES: Species[] = [
  ...ENVS.flatMap((env, e) => ROWS[env].map((row, i) => species(env, e, i, FIRST_RARITY[i], row))),
  ...ENVS.flatMap((env, e) => ADDED[env].map(([rarity, ...row], i) => species(env, e, ROWS[env].length + i, rarity, row)))
];
export const SPECIES_BY_ID = new Map(SPECIES.map(s => [s.id, s]));
/** Chance a new insect rolls 금색: every species, every rarity alike. */
export const GOLDEN_CHANCE = 1 / 50;
export const RARITY_WEIGHTS = [55, 27, 13, 4, 1];
export interface InsectCatch { id: string; speciesId: string; sizeMm: number; golden: boolean; caughtAt: string; favorite: boolean; released: boolean }
export const SAVE_VERSION = 1;
export interface InsectSave { version: typeof SAVE_VERSION; profileId: string; catches: InsectCatch[] }
export type InsectAction = { kind: 'catch'; bug: InsectCatch } | { kind: 'release' | 'favorite'; id: string };
export interface InsectReply { ok: boolean; data?: InsectSave; error?: string; cancelled?: boolean }
export function validCatch(value: unknown): value is InsectCatch {
  if (!value || typeof value !== 'object') return false;
  const c = value as InsectCatch, s = SPECIES_BY_ID.get(c.speciesId);
  return !!s && typeof c.id === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(c.id) && Number.isInteger(c.sizeMm) && c.sizeMm >= s.minMm && c.sizeMm <= s.maxMm &&
    typeof c.golden === 'boolean' && typeof c.caughtAt === 'string' && Number.isFinite(Date.parse(c.caughtAt)) && typeof c.favorite === 'boolean' && typeof c.released === 'boolean';
}
export function isInsectSave(value: unknown): value is InsectSave {
  if (!value || typeof value !== 'object') return false;
  const d = value as InsectSave;
  return d.version === SAVE_VERSION && typeof d.profileId === 'string' && d.profileId.length <= 120 && Array.isArray(d.catches) && d.catches.every(validCatch) && new Set(d.catches.map(c => c.id)).size === d.catches.length;
}
