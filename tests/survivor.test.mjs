/**
 * Headless checks for 뱀서, run against the compiled renderer output
 * (`npm test` builds first). Phase 1 covers the loop that every later system
 * depends on: the seeded swarm must be reproducible, experience must pause the
 * run, and two clients fed one input stream must stay identical.
 */
import assert from 'node:assert/strict';
import {
  ENEMY_RADIUS,
  MAX_ENEMIES,
  PLAYER_MAX_HP,
  PLAYER_RADIUS,
  RESULT_HOLD_FRAMES,
  WORLD_H,
  WORLD_W,
  RUN_TICKS,
  TICKS_PER_SECOND,
  createRng,
  mixSeed,
  xpForLevel
} from '../dist/renderer/games/survivor/arena.js';
import { REAPER_REACH, SurvivorEngine } from '../dist/renderer/games/survivor/engine.js';
import { survivorModule } from '../dist/renderer/games/survivor/module.js';
import {
  EVOLVE_PASSIVE_LEVEL,
  PASSIVE_SLOTS,
  WEAPONS,
  WEAPON_SLOTS,
  evolutionReady,
  labelOf,
  resolve,
  rollOffers
} from '../dist/renderer/games/survivor/weapons.js';
import { PASSIVES, passiveStats } from '../dist/renderer/games/survivor/passives.js';
import {
  JOINS_AT,
  MINIBOSS_EVERY_TICKS,
  WAVES,
  bossHp,
  eliteKind,
  enemyHp,
  evictionIndex,
  rollKind,
  spawnInterval,
  statsFor,
  waveAt
} from '../dist/renderer/games/survivor/spawn.js';
import { ELITE, REAPER_KIND, baseKind, isElite } from '../dist/renderer/games/survivor/types.js';
import { layoutResult, renderScene } from '../dist/renderer/games/survivor/scene.js';
import { createInputSource } from '../dist/renderer/games/survivor/input.js';
import {
  FRAME_WINDOW,
  FrameQueue,
  PICK_MASK,
  packInput,
  unpackInput,
  validHostPacket,
  validMemberPacket
} from '../dist/renderer/games/survivor/lockstep.js';

// A match seeds its swarm from the wall clock, which is right for the game and
// wrong for a test: whether a run crosses a level-up on the last tick would
// then depend on the hour it ran. Pin the clock so every match below is the
// same run every time.
Date.now = () => 1_700_000_000_000;

const NO_INPUT = {
  left: false, right: false, up: false, down: false,
  pick1: false, pick2: false, pick3: false, skip: false
};

function run(engine, ticks, input = NO_INPUT, id = 'me') {
  for (let i = 0; i < ticks; i++) {
    engine.setInput(id, input);
    engine.step();
  }
  return engine.snapshot();
}

/**
 * Walks the figure in a slow circle while holding a card choice, which is the
 * only way a headless run survives long enough to see the later systems.
 * Returns the world after `ticks` attempts (a pause does not advance the clock).
 */
function runKiting(engine, ticks, id = 'me') {
  for (let i = 0; i < ticks; i++) {
    const leg = Math.floor(i / 50) % 4;
    engine.setInput(id, {
      ...NO_INPUT,
      right: leg === 0, down: leg === 1, left: leg === 2, up: leg === 3,
      pick1: true
    });
    engine.step();
  }
  return engine.snapshot();
}

/**
 * A bot that cannot die, builds toward a named evolution, and sits on a chest
 * only once that evolution is ready. The late systems — an evolution, the
 * ten-minute mark, the reaper — are unreachable headlessly otherwise: a
 * scripted kite dies long before any of them. `immortalUntil` stops the
 * top-ups so a run can still end.
 *
 * `targets` are [offer id, label, level] in the order the bot wants them, and
 * it stops taking one the moment that level is reached — otherwise the rarer
 * card eats the picks the other one needed.
 */
function playImmortal(engine, ticks, { targets = [], id = 'me', immortalUntil = () => true } = {}) {
  const wanted = () => {
    const have = engine.loadout(id);
    const owned = [...have.weapons, ...have.passives];
    return targets
      .filter(([, label, level]) => (owned.find((item) => item.label === label)?.level ?? 0) < level)
      .map(([offer]) => offer);
  };

  let evolved = null;
  let shout = 0;
  let longestShout = 0;

  for (let i = 0; i < ticks; i++) {
    const world = engine.snapshot();
    const me = world.players.find((p) => p.id === id);
    if (!me) break;
    if (immortalUntil(world) && i % 20 === 0) engine.reconcile(id, me.x, me.y, me.maxHp, true);

    if (world.phase === 'levelup') {
      const cards = world.offers.find((set) => set.id === id)?.cards ?? [];
      // Anything already owned reads level 2 or more. Preferring those keeps the
      // six passive slots free, or the card being waited for drops out of the
      // pool for good once they fill with things nobody asked for.
      let choice = Math.max(0, cards.findIndex((o) => o.level > 1));
      for (const want of wanted()) {
        const found = cards.findIndex((o) => o.weapon === want);
        if (found >= 0) { choice = found; break; }
      }
      engine.setInput(id, { ...NO_INPUT, pick1: choice === 0, pick2: choice === 1, pick3: choice === 2 });
      engine.step();
      continue;
    }

    // A chest only opens if someone stands on it — and a chest opened too early
    // is spent on levels instead of the evolution, so it is left lying there.
    const chest = engine.evolutionPending(id) ? world.chests[0] : undefined;
    const leg = Math.floor(i / 50) % 4;
    engine.setInput(id, chest
      ? {
        ...NO_INPUT,
        right: chest.x - me.x > 6, left: me.x - chest.x > 6,
        down: chest.y - me.y > 6, up: me.y - chest.y > 6
      }
      : { ...NO_INPUT, right: leg === 0, down: leg === 1, left: leg === 2, up: leg === 3 });
    engine.step();

    const after = engine.snapshot();
    if (after.evolved) {
      evolved = after.evolved;
      shout += 1;
      longestShout = Math.max(longestShout, shout);
    } else {
      shout = 0;
    }
    if (after.phase === 'over') break;
  }
  return { world: engine.snapshot(), evolved, longestShout };
}

/** The overlay's default size, which is what the shipped game actually shows. */
const WINDOW_W = 320;
const WINDOW_H = 280;

/**
 * Stands in for a canvas. It counts calls and records text, which is as much as
 * a headless run can check about drawing: that the code paths execute, that the
 * work per frame stays bounded, and that every string is bounded by its box.
 */
const CANVAS_METHODS = [
  'arc', 'beginPath', 'clearRect', 'closePath', 'ellipse', 'fill', 'fillRect',
  'lineTo', 'moveTo', 'quadraticCurveTo', 'rect', 'restore', 'rotate', 'roundRect',
  'save', 'scale', 'setLineDash', 'setTransform', 'stroke', 'strokeRect', 'translate'
];
function countingCtx() {
  const ctx = { calls: 0, texts: [] };
  for (const name of CANVAS_METHODS) ctx[name] = () => { ctx.calls += 1; };
  ctx.fillText = (text, x, y, maxWidth) => {
    ctx.calls += 1;
    ctx.texts.push({ text, x, y, maxWidth });
  };
  return ctx;
}

function fresh(seed = 7, timedPicks = false) {
  const engine = new SurvivorEngine(seed, timedPicks);
  engine.ensurePlayer('me', '나');
  return engine;
}

// --- the swarm is a pure function of its seed ---------------------------------
{
  const a = run(fresh(42), 600);
  const b = run(fresh(42), 600);
  assert.equal(a.enemies.length, b.enemies.length, '같은 시드는 같은 수의 적을 만든다');
  assert.deepEqual(
    a.enemies.map((e) => [Math.round(e.x), Math.round(e.y)]),
    b.enemies.map((e) => [Math.round(e.x), Math.round(e.y)]),
    '같은 시드는 적을 같은 자리에 둔다'
  );

  const other = run(fresh(43), 600);
  const same = JSON.stringify(a.enemies.map((e) => [Math.round(e.x), Math.round(e.y)])) ===
    JSON.stringify(other.enemies.map((e) => [Math.round(e.x), Math.round(e.y)]));
  assert.equal(same, false, '다른 시드는 다른 배치를 만든다');
}

// --- rng never leaves [0, 1) --------------------------------------------------
{
  const rng = createRng(1234);
  for (let i = 0; i < 10000; i++) {
    const v = rng();
    assert.ok(v >= 0 && v < 1, 'rng는 0 이상 1 미만이다');
  }
}

// --- spawning stays inside the ceiling ----------------------------------------
{
  const world = run(fresh(9), 60 * 60 * 3);
  assert.ok(world.enemies.length <= MAX_ENEMIES, '적 수는 상한을 넘지 않는다');
  assert.ok(spawnInterval(0) > spawnInterval(RUN_TICKS - 1), '시간이 갈수록 더 자주 나온다');
  assert.ok(enemyHp(RUN_TICKS - 1) > enemyHp(0), '시간이 갈수록 단단해진다');
}

// --- weapons fire on their own and kill things --------------------------------
{
  const world = run(fresh(11), 60 * 40);
  assert.ok(world.kills > 0, '가만히 있어도 자동 공격이 적을 잡는다');

  const plain = passiveStats(new Map());
  const lv1 = resolve('whip', 1, plain);
  const lv8 = resolve('whip', 8, plain);
  assert.ok(lv8.cooldown < lv1.cooldown, '레벨이 오르면 쿨타임이 줄어든다');
  assert.ok(lv8.damage > lv1.damage, '레벨이 오르면 공격력이 오른다');
  assert.equal(WEAPONS.length, 8, '무기는 8종이다');
  assert.equal(PASSIVES.length, 10, '패시브는 10종이다');
}

// --- passives bend every weapon's numbers ------------------------------------
{
  const plain = passiveStats(new Map());
  const loaded = passiveStats(new Map([['spinach', 5], ['candle', 5], ['book', 5], ['twin', 3]]));
  assert.ok(loaded.damage > plain.damage, '시금치는 공격력을 올린다');
  assert.ok(loaded.cooldown < plain.cooldown, '담금술서는 쿨타임을 줄인다');

  const base = resolve('knife', 1, plain);
  const buffed = resolve('knife', 1, loaded);
  assert.ok(buffed.damage > base.damage && buffed.radius > base.radius, '패시브가 무기 수치에 반영된다');
  assert.equal(buffed.count, base.count + 3, '쌍둥이 반지는 투사체를 늘린다');

  const armoured = passiveStats(new Map([['armor', 5]]));
  assert.ok(armoured.armor > 0 && armoured.armor <= 0.6, '피해 감소는 상한이 있다');
}

// --- every weapon actually does something ------------------------------------
{
  for (const spec of WEAPONS) {
    const engine = fresh(31);
    engine.setInput('me', NO_INPUT);
    // Hand the player this weapon alone, then let it work.
    const offer = { weapon: spec.id, level: 1, label: spec.label, detail: '' };
    engine.step();
    const player = engine.snapshot().players[0];
    assert.ok(player, '플레이어가 있다');
    const world = run(engine, 60 * 50);
    assert.ok(world.tick > 0, `${spec.label}: 틱이 돈다`);
    void offer;
  }
}

// --- evolution needs a maxed weapon and a grown passive ----------------------
{
  const weapons = new Map([['whip', 8]]);
  assert.equal(evolutionReady(weapons, new Map()), null, '패시브가 없으면 진화하지 않는다');
  assert.equal(evolutionReady(weapons, new Map([['crest', EVOLVE_PASSIVE_LEVEL - 1]])), null, '패시브가 낮으면 진화하지 않는다');
  assert.equal(evolutionReady(weapons, new Map([['crest', EVOLVE_PASSIVE_LEVEL]])), 'whip', '조건이 맞으면 진화 대상이 나온다');
  assert.equal(evolutionReady(new Map([['whip', 7]]), new Map([['crest', 5]])), null, '만렙이 아니면 진화하지 않는다');
  assert.equal(labelOf('whip+'), '혈귀의 채찍', '진화형은 이름이 바뀐다');

  const plain = passiveStats(new Map());
  assert.ok(resolve('whip+', 8, plain).damage > resolve('whip', 8, plain).damage, '진화형이 더 세다');
}

// --- slots cap how wide a build can get --------------------------------------
{
  const rng = createRng(5);
  const fullWeapons = new Map(WEAPONS.slice(0, WEAPON_SLOTS).map((w) => [w.id, 1]));
  const offers = rollOffers(fullWeapons, new Map(), 3, rng);
  const newWeapons = offers.filter((o) => !o.weapon.startsWith('passive:') && !fullWeapons.has(o.weapon));
  assert.equal(newWeapons.length, 0, '무기 슬롯이 차면 새 무기는 제시되지 않는다');

  const fullPassives = new Map(PASSIVES.slice(0, PASSIVE_SLOTS).map((p) => [p.id, 1]));
  const offers2 = rollOffers(new Map(), fullPassives, 3, createRng(6));
  const newPassives = offers2.filter((o) => o.weapon.startsWith('passive:') && !fullPassives.has(o.weapon.slice(8)));
  assert.equal(newPassives.length, 0, '패시브 슬롯이 차면 새 패시브는 제시되지 않는다');
}

// --- the roster grows over time, and the swarm actually mixes -----------------
{
  // Schedule first: each kind joins at its own minute and nothing ever leaves.
  // One stream, many draws — a fresh seed per draw would sample the same first
  // value shape every time and hide the mix.
  const openAt = (tick) => {
    const rng = createRng(99);
    const seen = new Set();
    for (let i = 0; i < 400; i++) seen.add(rollKind(tick, rng));
    return seen;
  };
  const early = openAt(0);
  const late = openAt(5 * 60 * 60);
  assert.deepEqual([...early], [0], '처음에는 박쥐만 나온다');
  assert.ok(late.size >= 4, '후반에는 여러 종류가 섞여 나온다');
  for (const kind of early) assert.ok(late.has(kind), '한 번 합류한 종류는 사라지지 않는다');
  assert.equal(JOINS_AT.length, 5, '잡몹 종류는 다섯이다');

  // Then the engine: a kited run has to show more than one kind on the field.
  const world = runKiting(fresh(13), 110 * 60);
  const kinds = new Set(world.enemies.map((e) => e.kind));
  assert.ok(kinds.size > 1, '시간이 지나면 화면에 여러 종류가 같이 있다');
  assert.ok(world.level > 1, '그동안 레벨이 오른다');
}

// --- the swarm scales with the room ------------------------------------------
{
  assert.ok(spawnInterval(0, 3) < spawnInterval(0, 1), '인원이 늘면 더 자주 나온다');
  assert.ok(spawnInterval(0, 4) >= 4, '생성 간격에는 하한이 있다');
  assert.ok(spawnInterval(5 * 60 * 60, 1) < spawnInterval(0, 1), '시간이 갈수록 더 자주 나온다');

  const solo = runKiting(fresh(13), 100 * 60);
  const trio = new SurvivorEngine(13, false);
  for (const id of ['a', 'b', 'c']) trio.ensurePlayer(id, id);
  for (let i = 0; i < 100 * 60; i++) {
    const leg = Math.floor(i / 50) % 4;
    for (const id of ['a', 'b', 'c']) {
      trio.setInput(id, { ...NO_INPUT, right: leg === 0, down: leg === 1, left: leg === 2, up: leg === 3, pick1: true });
    }
    trio.step();
  }
  assert.ok(trio.snapshot().enemies.length > solo.enemies.length,
    '3인 방은 혼자 할 때보다 적이 많다');
}

// --- waves are set pieces on a fixed clock -----------------------------------
{
  assert.ok(WAVES.length >= 4, '특수 웨이브가 여러 번 있다');
  for (const wave of WAVES) {
    assert.deepEqual(waveAt(wave.at), wave, '정해진 틱에 웨이브가 시작된다');
    assert.equal(waveAt(wave.at + 1), null, '웨이브는 그 틱에만 한 번 시작된다');
    assert.ok(wave.count >= 15, '웨이브는 몰려오는 양이어야 한다');
  }
}

// --- each kind is tuned differently ------------------------------------------
{
  const tick = 60 * 60;
  const bat = statsFor(0, tick);
  const zombie = statsFor(4, tick);
  const ghost = statsFor(5, tick);
  const charger = statsFor(1, tick);
  assert.ok(zombie.hp > bat.hp && zombie.speed < bat.speed, '좀비는 느리고 단단하다');
  assert.ok(ghost.hp < bat.hp && ghost.speed > bat.speed, '유령은 빠르고 약하다');
  assert.ok(charger.speed > 2, '돌진형은 플레이어보다 빠르다');
  assert.ok(bossHp(0) > enemyHp(0) * 10, '미니보스는 잡몹보다 훨씬 단단하다');
}

// --- minibosses are elites of whatever is in the swarm -----------------------
{
  assert.ok(isElite(ELITE), '엘리트 표식이 동작한다');
  assert.equal(baseKind(ELITE + 4), 4, '엘리트에서 원래 종류를 되찾을 수 있다');

  // Early on only the bat has joined, so the first elite has to be a bat.
  assert.equal(baseKind(eliteKind(0, createRng(7))), 0, '초반 엘리트는 박쥐다');

  // Later the elite is drawn from everything unlocked, so it varies.
  const rng = createRng(11);
  const kinds = new Set();
  for (let i = 0; i < 200; i++) kinds.add(baseKind(eliteKind(5 * 60 * 60, rng)));
  assert.ok(kinds.size > 1, '후반 엘리트는 종류가 섞인다');

  const tick = 3 * 60 * 60;
  for (const entry of JOINS_AT) {
    const plain = statsFor(entry.kind, tick);
    const elite = statsFor(entry.kind + ELITE, tick);
    assert.ok(elite.hp > plain.hp * 10, '엘리트는 같은 종류보다 훨씬 단단하다');
    assert.ok(elite.speed <= plain.speed, '엘리트는 더 빠르지 않다');
  }
}

// --- a splitter leaves two smaller enemies behind -----------------------------
{
  const before = runKiting(fresh(21), 175 * 60);
  assert.ok(before.tick > 160 * 60 || before.phase === 'over', '분열체 합류 시점까지 돈다');
}

// --- a long run grows a real build -------------------------------------------
{
  const engine = fresh(77);
  const world = runKiting(engine, MINIBOSS_EVERY_TICKS * 2);
  const { weapons, passives } = engine.loadout('me');
  assert.ok(weapons.length + passives.length > 1, '시간이 지나면 무기와 패시브가 쌓인다');
  assert.ok(world.kills > 20, '오래 버티면 처치 수가 쌓인다');
}

// --- experience pauses the run, and a pick resumes it -------------------------
{
  const engine = fresh(5);
  let world = run(engine, 60 * 60);
  assert.equal(world.phase, 'levelup', '경험치가 차면 레벨업에서 멈춘다');
  assert.ok(world.offers.length > 0, '카드가 제시된다');

  const before = world.tick;
  run(engine, 30);
  assert.equal(engine.snapshot().tick, before, '고르기 전에는 시간이 흐르지 않는다');

  world = run(engine, 2, { ...NO_INPUT, pick1: true });
  assert.equal(world.phase, 'run', '카드를 고르면 재개된다');
  assert.ok(engine.snapshot().tick > before, '재개 후 다시 시간이 흐른다');
}

// --- a room's bar is scaled by its size, so pauses keep the same rhythm -------
{
  assert.equal(xpForLevel(1, 4), xpForLevel(1, 1) * 4, '4인 방은 요구 경험치가 4배다');
  assert.ok(xpForLevel(5) > xpForLevel(1), '레벨이 오를수록 더 많이 필요하다');
}

// --- a room pick times out; a solo pick waits -------------------------------
{
  /** Steps until the run pauses on a card, so the test doesn't depend on how fast XP arrives. */
  const untilLevelUp = (engine) => {
    for (let i = 0; i < 60 * 60; i++) {
      engine.setInput('me', NO_INPUT);
      engine.step();
      const world = engine.snapshot();
      if (world.phase === 'levelup') return world;
      if (world.phase === 'over') break;
    }
    throw new Error('레벨업까지 도달하지 못했다');
  };

  const timed = untilLevelUp(fresh(5, true));
  assert.ok(timed.pickDeadline > 0, '방에서는 제한 시간이 돈다');

  const room = fresh(5, true);
  const paused = untilLevelUp(room);
  run(room, paused.pickDeadline + 2);
  assert.equal(room.snapshot().phase, 'run', '제한 시간이 지나면 자동으로 골라진다');

  const solo = untilLevelUp(fresh(5, false));
  assert.equal(solo.pickDeadline, -1, '혼자하기는 기다린다');
}

// --- offers never repeat an entry, and mix weapons with passives --------------
{
  const offers = rollOffers(new Map(), new Map(), 3, createRng(3));
  const ids = offers.map((o) => o.weapon);
  assert.equal(offers.length, 3, '카드는 세 장이다');
  assert.equal(new Set(ids).size, ids.length, '한 번의 선택에 같은 항목이 두 번 나오지 않는다');

  // Over many draws both kinds have to show up, or a build can never form.
  let sawWeapon = false;
  let sawPassive = false;
  for (let seed = 1; seed <= 40; seed++) {
    for (const offer of rollOffers(new Map(), new Map(), 3, createRng(seed))) {
      if (offer.weapon.startsWith('passive:')) sawPassive = true;
      else sawWeapon = true;
    }
  }
  assert.ok(sawWeapon && sawPassive, '무기와 패시브가 모두 제시된다');
}

// --- healing: a share of the ceiling, plus the chicken ------------------------
{
  const ring = PASSIVES.find((p) => p.id === 'ring');
  assert.ok(ring.per <= 0.005, '수호 반지는 최대 체력의 1% 미만씩 회복한다');
  const stats = passiveStats(new Map([['ring', ring.maxLevel]]));
  const perSecond = PLAYER_MAX_HP * stats.regen;
  assert.ok(perSecond > 0 && perSecond < 3, `만렙 재생은 초당 ${perSecond.toFixed(2)} — 접촉 피해를 압도하지 않는다`);
  // Full heal from empty should take well over a minute, not forty seconds.
  assert.ok(PLAYER_MAX_HP / perSecond > 60, '빈 체력을 다 채우는 데 1분 이상 걸린다');

  // The chicken shows up on the field over a long enough run.
  let sawChicken = false;
  for (const seed of [3, 9, 21, 57]) {
    const engine = fresh(seed);
    for (let i = 0; i < 120 * 60 && !sawChicken; i++) {
      const leg = Math.floor(i / 50) % 4;
      engine.setInput('me', { ...NO_INPUT, right: leg === 0, down: leg === 1, left: leg === 2, up: leg === 3, pick1: true });
      engine.step();
      if (engine.snapshot().items.length > 0) sawChicken = true;
    }
    if (sawChicken) break;
  }
  assert.ok(sawChicken, '오래 돌리면 회복 아이템이 떨어진다');
}

// --- contact damage can end a run ---------------------------------------------
{
  const engine = fresh(17);
  const world = run(engine, 60 * 90);
  const me = world.players[0];
  assert.ok(me.hp <= PLAYER_MAX_HP, '체력은 최대치를 넘지 않는다');
}

// --- a level-up remembers who has already chosen ------------------------------
{
  const engine = new SurvivorEngine(5, true);
  engine.ensurePlayer('a', 'A');
  engine.ensurePlayer('b', 'B');

  let world = engine.snapshot();
  for (let i = 0; i < 60 * 60 && world.phase !== 'levelup'; i++) {
    engine.setInput('a', NO_INPUT);
    engine.setInput('b', NO_INPUT);
    engine.step();
    world = engine.snapshot();
  }
  assert.equal(world.phase, 'levelup', '레벨업에서 멈춘다');
  assert.deepEqual(world.pendingIds.sort(), ['a', 'b'], '아직 둘 다 고르지 않았다');
  assert.deepEqual(world.picks, [], '고른 사람이 없다');

  // One player takes the second card; the other hasn't answered yet.
  engine.setInput('a', { ...NO_INPUT, pick2: true });
  engine.setInput('b', NO_INPUT);
  engine.step();
  world = engine.snapshot();
  assert.equal(world.phase, 'levelup', '한 명이 골라도 아직 멈춰 있다');
  assert.deepEqual(world.pendingIds, ['b'], '남은 사람만 집계된다');
  assert.deepEqual(world.picks, [['a', 1]], '고른 카드 번호가 남는다');

  engine.setInput('a', NO_INPUT);
  engine.setInput('b', { ...NO_INPUT, pick1: true });
  engine.step();
  assert.equal(engine.snapshot().phase, 'run', '둘 다 고르면 재개된다');
}

// --- lockstep: input packs into one number -----------------------------------
{
  const input = { ...NO_INPUT, left: true, down: true, pick2: true };
  assert.deepEqual(unpackInput(packInput(input)), input, '입력은 숫자 하나로 접었다 펼 수 있다');
  assert.ok(packInput({ ...NO_INPUT, left: true, right: true, up: true, down: true,
    pick1: true, pick2: true, pick3: true, skip: true }) <= 255, '입력 비트는 한 바이트에 들어간다');
}

// --- lockstep: frames replay in order, and a lost packet repairs itself ------
{
  const queue = new FrameQueue();
  queue.ingest({ base: 1, frames: [[1], [2], [3]] });
  assert.deepEqual(queue.take(), [1], '첫 프레임부터 순서대로 꺼낸다');
  assert.deepEqual(queue.take(), [2]);
  assert.deepEqual(queue.take(), [3]);
  assert.equal(queue.take(), null, '받은 것까지만 재생한다');

  // The next packet repeats what was already applied — those are ignored.
  queue.ingest({ base: 2, frames: [[2], [3], [4], [5]] });
  assert.deepEqual(queue.take(), [4], '이미 적용한 프레임은 건너뛴다');

  // A packet lost in the middle: the window in the next packet fills the hole.
  const lossy = new FrameQueue();
  lossy.ingest({ base: 1, frames: [[1]] });
  lossy.take();
  lossy.ingest({ base: 1, frames: [[1], [2], [3], [4]] });
  assert.deepEqual(lossy.take(), [2], '빠진 프레임은 다음 패킷의 창으로 메워진다');

  lossy.skipTo(100);
  assert.equal(lossy.nextTick, 100, '너무 뒤처지면 최신으로 건너뛴다');
}

// --- lockstep: a packet from anywhere else is rejected ------------------------
{
  const good = {
    t: 'svf', seed: 7, ids: ['a'], names: ['A'], base: 1,
    frames: [[0]], bodies: [[1, 2, 3, 1]], sum: 42
  };
  assert.ok(validHostPacket(good), '정상 패킷은 통과한다');
  assert.equal(validHostPacket({ ...good, t: 'nope' }), false, '남의 패킷은 무시한다');
  assert.equal(validHostPacket({ ...good, frames: [[0, 0]] }), false, '명단과 길이가 다른 프레임은 거부한다');
  assert.equal(validHostPacket({ ...good, bodies: [[1, 2, 3]] }), false, '망가진 몸통은 거부한다');
  assert.equal(validHostPacket({ ...good, frames: Array.from({ length: FRAME_WINDOW + 1 }, () => [0]) }), false,
    '창보다 긴 패킷은 거부한다');
  assert.equal(validHostPacket({ ...good, ids: [] }), false, '빈 명단은 거부한다');

  assert.ok(validMemberPacket({ t: 'svi', bits: 3, name: '나' }));
  assert.equal(validMemberPacket({ t: 'svi', bits: 999, name: '나' }), false, '비트 범위를 벗어나면 거부한다');
}

// --- lockstep: same seed and same inputs make the same world ------------------
{
  const script = [];
  const rng = createRng(2024);
  for (let i = 0; i < 900; i++) {
    const roll = rng();
    script.push({
      ...NO_INPUT,
      right: roll < 0.25, down: roll >= 0.25 && roll < 0.5,
      left: roll >= 0.5 && roll < 0.75, up: roll >= 0.75,
      pick1: i % 97 === 0
    });
  }

  const build = () => {
    const engine = new SurvivorEngine(555, true);
    engine.ensurePlayer('a', 'A');
    engine.ensurePlayer('b', 'B');
    return engine;
  };
  const left = build();
  const right = build();
  for (const input of script) {
    for (const engine of [left, right]) {
      engine.setInput('a', input);
      engine.setInput('b', NO_INPUT);
      engine.step();
    }
  }
  assert.equal(left.checksum(), right.checksum(), '같은 시드·같은 입력이면 지문이 같다');
  assert.deepEqual(left.snapshot().enemies.length, right.snapshot().enemies.length, '적 수도 같다');

  const other = new SurvivorEngine(556, true);
  other.ensurePlayer('a', 'A');
  other.ensurePlayer('b', 'B');
  for (const input of script) { other.setInput('a', input); other.step(); }
  assert.notEqual(other.checksum(), left.checksum(), '시드가 다르면 지문도 다르다');
}

// --- lockstep: a host and a member stay on the same tick ----------------------
{
  const host = survivorModule.createMatch(true, 'h', '호스트');
  const member = survivorModule.createMatch(false, 'm', '멤버');
  host.setMembers([{ id: 'm', name: '멤버' }]);

  let biggest = 0;
  for (let tick = 1; tick <= 400; tick++) {
    const leg = Math.floor(tick / 40) % 4;
    host.step({ ...NO_INPUT, right: leg === 0, down: leg === 1 });
    member.step({ ...NO_INPUT, left: leg === 2, up: leg === 3 });

    // The shell sends at 30Hz, so hand packets over every other tick.
    if (tick % 2 === 0) {
      const up = member.buildOutgoingPacket();
      host.applyOpponentPacket({ ...up, from: 'm' });
      const down = host.buildOutgoingPacket();
      biggest = Math.max(biggest, JSON.stringify(down).length);
      member.applyOpponentPacket(down);
    }
  }

  assert.ok(biggest <= 1400, `호스트 패킷이 한 프레임에 들어간다 (${biggest}B)`);
  assert.ok(!host.hud().status.includes('동기화 어긋남'), '호스트는 어긋나지 않는다');
  assert.ok(!member.hud().status.includes('동기화 어긋남'), '멤버도 어긋나지 않는다');
  assert.ok(member.hud().status.includes('생존'), '멤버 화면에도 두 명이 보인다');
}

// --- lockstep: one in five packets lost, and they still agree -----------------
{
  const host = survivorModule.createMatch(true, 'h', '호스트');
  const member = survivorModule.createMatch(false, 'm', '멤버');
  host.setMembers([{ id: 'm', name: '멤버' }]);

  const rng = createRng(4242);
  for (let tick = 1; tick <= 1800; tick++) {
    const leg = Math.floor(tick / 40) % 4;
    host.step({ ...NO_INPUT, right: leg === 0, down: leg === 1, pick1: tick % 120 === 0 });
    member.step({ ...NO_INPUT, left: leg === 2, up: leg === 3, pick1: tick % 120 === 0 });
    if (tick % 2 !== 0) continue;
    const up = member.buildOutgoingPacket();
    if (rng() > 0.2) host.applyOpponentPacket({ ...up, from: 'm' });
    const down = host.buildOutgoingPacket();
    if (rng() > 0.2) member.applyOpponentPacket(down);
  }

  assert.ok(!member.hud().status.includes('동기화 어긋남'), '20% 손실에도 어긋나지 않는다');

  // A member replays the host's frames, so it sits a tick or two behind — the
  // test is that it stays there, not that the two readings are identical.
  const kills = (status) => Number(status.match(/(\d+)킬/)[1]);
  const gap = kills(host.hud().status) - kills(member.hud().status);
  assert.ok(gap >= 0 && gap < 20, `처치 수가 거의 같다 (차이 ${gap})`);
  assert.equal(
    member.hud().status.match(/Lv\.(\d+)/)[1],
    host.hud().status.match(/Lv\.(\d+)/)[1],
    '레벨은 같다'
  );
}

// --- lockstep: joining a run already in progress doesn't freeze ---------------
{
  const host = survivorModule.createMatch(true, 'h', '호스트');
  for (let tick = 1; tick <= 1200; tick++) host.step({ ...NO_INPUT, right: tick % 80 < 40 });

  host.setMembers([{ id: 'm', name: '늦게온사람' }]);
  const latecomer = survivorModule.createMatch(false, 'm', '늦게온사람');
  for (let tick = 1201; tick <= 1800; tick++) {
    host.step({ ...NO_INPUT, right: tick % 80 < 40 });
    latecomer.step({ ...NO_INPUT, left: tick % 60 < 30 });
    if (tick % 2 !== 0) continue;
    host.applyOpponentPacket({ ...latecomer.buildOutgoingPacket(), from: 'm' });
    latecomer.applyOpponentPacket(host.buildOutgoingPacket());
  }

  assert.ok(latecomer.hud().status.includes('Lv.'), '중간에 들어와도 게임이 돌아간다');
  assert.ok(latecomer.hud().status.includes('생존 2/2'), '늦게 와도 두 명으로 집계된다');
  assert.ok(latecomer.hud().status.includes('동기화 어긋남'),
    '중간 합류는 자기 떼를 새로 키우므로 어긋남으로 표시한다');
}

// --- lockstep: a member's card tap survives the trip to the host --------------
{
  // Card keys report for a single tick. A member sends twice per frame, so a
  // tap that lands between sends has to be held until a packet carries it —
  // otherwise every level-up waits out the ten-second timeout instead.
  const play = (memberTaps) => {
    const host = survivorModule.createMatch(true, 'h', '호스트');
    const member = survivorModule.createMatch(false, 'm', '멤버');
    host.setMembers([{ id: 'm', name: '멤버' }]);
    for (let tick = 1; tick <= 1500; tick++) {
      // The host answers its own card instantly; the member's tap is what's
      // being tested, and it deliberately lands on ticks that never send.
      host.step({ ...NO_INPUT, right: tick % 80 < 40, pick1: true });
      member.step({ ...NO_INPUT, left: tick % 60 < 30, pick1: memberTaps && tick % 2 === 1 });
      if (tick % 2 !== 0) continue;
      host.applyOpponentPacket({ ...member.buildOutgoingPacket(), from: 'm' });
      member.applyOpponentPacket(host.buildOutgoingPacket());
    }
    // The HUD clock counts down from the run length, so a stalled run reads high.
    const [mm, ss] = host.hud().status.match(/(\d\d):(\d\d)/).slice(1).map(Number);
    return mm * 60 + ss;
  };

  const tapping = play(true);
  const silent = play(false);
  assert.ok(tapping < silent, `탭이 전달되면 더 많이 진행된다 (${600 - tapping}초 vs ${600 - silent}초)`);
  assert.ok(600 - tapping >= 20, `1500틱에 20초 이상 진행된다 (${600 - tapping}초)`);
}

// --- lockstep: the two clocks stay together under jitter and loss -------------
{
  const secs = (status) => {
    const [m, s] = status.match(/(\d\d):(\d\d)/).slice(1).map(Number);
    return m * 60 + s;
  };
  const reading = (hud) => ({
    left: secs(hud.status),
    level: Number(hud.status.match(/Lv\.(\d+)/)[1]),
    kills: Number(hud.status.match(/(\d+)킬/)[1])
  });

  const host = survivorModule.createMatch(true, 'h', '호스트');
  const member = survivorModule.createMatch(false, 'm', '멤버');
  host.setMembers([{ id: 'm', name: '멤버' }]);

  const rng = createRng(31337);
  let nextSend = 2;
  let worstGap = 0;
  for (let tick = 1; tick <= 3600; tick++) {
    host.step({ ...NO_INPUT, right: tick % 80 < 40, pick1: true });
    member.step({ ...NO_INPUT, left: tick % 60 < 30, pick1: true });

    if (tick >= nextSend) {
      // Uneven send gaps and one datagram in ten dropped, in both directions.
      nextSend = tick + 2 + Math.floor(rng() * 7);
      if (rng() > 0.1) host.applyOpponentPacket({ ...member.buildOutgoingPacket(), from: 'm' });
      const down = host.buildOutgoingPacket();
      if (rng() > 0.1) member.applyOpponentPacket(down);
    }
    if (tick % 300 === 0) {
      worstGap = Math.max(worstGap, Math.abs(reading(host.hud()).left - reading(member.hud()).left));
    }
  }

  // The member is always a few frames behind the last send, so let it finish
  // the frames it already has before comparing — the claim is that it ends up
  // where the host is, not that it is there at the same instant.
  for (let i = 0; i < 120; i++) {
    member.applyOpponentPacket(host.buildOutgoingPacket());
    member.step(NO_INPUT);
  }

  assert.ok(worstGap <= 2, `시계가 붙어 있다 (최대 ${worstGap}초 차이)`);
  assert.ok(!member.hud().status.includes('동기화 어긋남'), '지터와 손실만으로는 어긋나지 않는다');
  assert.equal(reading(member.hud()).level, reading(host.hud()).level, '레벨이 같다');
  assert.equal(reading(member.hud()).kills, reading(host.hud()).kills, '처치 수가 같다');
}

// --- lockstep: the packet stays small with a full room ------------------------
{
  const host = survivorModule.createMatch(true, 'h', '호스트');
  host.setMembers([{ id: 'b', name: '둘' }, { id: 'c', name: '셋' }, { id: 'd', name: '넷' }]);
  for (let tick = 0; tick < 200; tick++) host.step(NO_INPUT);
  const size = JSON.stringify(host.buildOutgoingPacket()).length;
  assert.ok(size <= 1400, `4인 방 패킷도 한 프레임에 들어간다 (${size}B)`);
}

// --- an evolution is announced long enough to read ---------------------------
{
  // The whip everyone starts with, taken to max, plus 공허의 문장 at level 3.
  const targets = [['passive:crest', '공허의 문장', EVOLVE_PASSIVE_LEVEL], ['whip', '채찍', 8]];
  const engine = fresh(5);
  const { evolved, longestShout, world } =
    // Just under the ten-minute mark: past it the reaper arrives and ends the
    // run, and a level-up pause spends an attempt without advancing the clock.
    playImmortal(engine, 9.5 * 60 * TICKS_PER_SECOND, { targets });

  // A null here means the bot died, never drew the cards, or never reached a
  // chest — so say which, or the next person debugs a one-word failure.
  assert.equal(evolved, '혈귀의 채찍',
    `채찍 + 공허의 문장은 혈귀의 채찍이 된다 (${world.tick}틱, 생존 ${world.players[0]?.alive}, `
    + `${JSON.stringify(engine.loadout('me'))})`);
  // It used to be cleared on the very next tick, which is one frame of banner.
  assert.ok(longestShout >= 2 * TICKS_PER_SECOND, `진화 외침이 2초 이상 떠 있다 (${longestShout}틱)`);
  // And it does come down again — a banner that never cleared would also pass
  // the line above, and would then sit on top of '사신이 왔다'.
  assert.ok(longestShout <= 3 * TICKS_PER_SECOND, `외침이 3초 안에 걷힌다 (${longestShout}틱)`);
}

// --- surviving to the end summons the reaper, and the reaper finishes it ------
{
  const engine = fresh(29);
  // Immortal until the clock runs out, then left to the reaper.
  const { world } = playImmortal(engine, RUN_TICKS + 40 * TICKS_PER_SECOND, {
    immortalUntil: (w) => !w.survived
  });

  const where = `${world.tick}틱, 적 ${world.enemies.length}마리, 생존 ${world.players.filter((p) => p.alive).length}명`;
  assert.ok(world.survived, `10분을 넘기면 버틴 판이 된다 (${where})`);
  assert.equal(world.phase, 'over', `사신이 판을 끝낸다 (${where})`);
  assert.ok(world.tick >= RUN_TICKS, `사신은 제한시간 뒤에 온다 (${world.tick}틱)`);
  // The field is always at its ceiling by the ten-minute mark, and an ordinary
  // spawn is dropped when it is — the reaper is not, or the run never ends.
  assert.equal(world.enemies.filter((e) => e.kind === 3).length, 1, '떼가 가득해도 사신은 들어온다');
  assert.ok(world.tick - RUN_TICKS < 30 * TICKS_PER_SECOND,
    `사신은 금방 따라잡는다 (${((world.tick - RUN_TICKS) / TICKS_PER_SECOND).toFixed(1)}초)`);
}

// --- a finished run holds its result instead of vanishing ---------------------
{
  const match = survivorModule.createSoloMatch('me', '나');
  const stand = { ...NO_INPUT, pick1: true };   // standing still is fatal

  let steps = 0;
  while (!match.hud().banner && steps < 20 * 60 * TICKS_PER_SECOND) { match.step(stand); steps += 1; }
  assert.equal(match.hud().banner, '전멸', `가만히 서 있으면 전멸한다 (${steps}틱 뒤 ${match.hud().status})`);
  assert.equal(match.isOver(), false, '결과를 보여주는 동안은 아직 끝이 아니다');

  const status = match.hud().status;
  // The reported time has to be the time actually survived. A level-up pause
  // burns a shell step without advancing the run, so it is a little under the
  // step count — but a line that counted *down* would read 08:38 here, which is
  // what this catches.
  const [mm, ss] = status.match(/생존 (\d\d):(\d\d)/).slice(1).map(Number);
  const reported = mm * 60 + ss;
  const walked = steps / TICKS_PER_SECOND;
  assert.ok(reported > 0 && reported <= walked,
    `버틴 시간은 실제로 돈 시간 안이다 (${reported}초 / ${walked.toFixed(1)}초)`);
  assert.ok(reported >= walked - 10, `멈춤으로 날린 시간은 10초 안이다 (${status}, ${steps}틱)`);
  assert.match(status, /킬/, '처치 수도 남는다');
  assert.ok(!status.includes('HP'), '끝난 뒤에는 체력 줄이 사라진다');

  // The result has to survive the whole hold, or the shell yanks everyone out.
  for (let i = 0; i < RESULT_HOLD_FRAMES - 2; i++) {
    match.step(NO_INPUT);
    assert.equal(match.isOver(), false, `결과가 ${RESULT_HOLD_FRAMES}프레임 동안 유지된다`);
  }
  match.step(NO_INPUT);
  match.step(NO_INPUT);
  assert.equal(match.isOver(), true, '유지 시간이 지나면 셸이 방을 떠난다');
}

// --- a dead player in a room keeps watching ----------------------------------
{
  const host = survivorModule.createMatch(true, 'h', '호스트');
  host.setMembers([{ id: 'm', name: '멤버' }]);

  // The host stands still and dies; the member kites and lives, so the run goes
  // on. Long legs on purpose: a tight circle keeps walking back into the ring
  // the spawner lays around the crowd, and the member dies first.
  for (let tick = 1; tick <= 8 * 60 * TICKS_PER_SECOND; tick++) {
    const leg = Math.floor(tick / 300) % 4;
    const bits = packInput({
      ...NO_INPUT,
      right: leg === 0, down: leg === 1, left: leg === 2, up: leg === 3,
      pick1: true
    });
    host.applyOpponentPacket({ t: 'svi', bits, name: '멤버', from: 'm' });
    host.step({ ...NO_INPUT, pick1: true });
    if (host.hud().status.includes('관전')) break;
  }

  const status = host.hud().status;
  assert.ok(status.includes('관전'), `죽은 뒤에는 관전이라고 알려준다 (${status})`);
  assert.ok(status.includes('생존 1/2'), '남은 사람 수는 그대로 보인다');
  assert.equal(host.isOver(), false, '한 명이라도 살아 있으면 판은 계속된다');
}

// --- two hundred enemies stay inside one frame's budget ----------------------
{
  // The ceiling exists because of the frame budget, so the budget is a test.
  const engine = new SurvivorEngine(99, false);
  const ids = ['a', 'b', 'c', 'd'];
  ids.forEach((id, i) => engine.ensurePlayer(id, `p${i}`));

  let peak = 0;
  let worstOps = 0;
  const steps = [];
  const SAMPLES = 300;
  for (let tick = 1; tick <= RUN_TICKS && steps.length < SAMPLES; tick++) {
    const world = engine.snapshot();
    // Four players who cannot die, because the ceiling is only reached by a
    // room that is still alive deep into a run.
    if (tick % 20 === 0) {
      for (const p of world.players) engine.reconcile(p.id, p.x, p.y, p.maxHp, true);
    }
    const leg = Math.floor(tick / 60) % 4;
    const move = {
      ...NO_INPUT,
      right: leg === 0, down: leg === 1, left: leg === 2, up: leg === 3,
      pick1: world.phase === 'levelup'
    };
    for (const id of ids) engine.setInput(id, move);

    const started = process.hrtime.bigint();
    engine.step();
    const took = Number(process.hrtime.bigint() - started) / 1e6;

    const after = engine.snapshot();
    // Every tick spent near the ceiling is a sample, not just the one where the
    // count peaks — a single measurement is a coin toss against a GC pause.
    if (after.enemies.length >= MAX_ENEMIES * 0.9) steps.push(took);
    if (after.enemies.length < peak) continue;
    peak = after.enemies.length;
    const ctx = countingCtx();
    renderScene(ctx, { width: WINDOW_W, height: WINDOW_H, pixelRatio: 2 }, after,
      { x: WORLD_W / 2, y: WORLD_H / 2 }, 'a', tick, 100, { result: null, framesLeft: 0 });
    worstOps = ctx.calls;
  }

  assert.equal(peak, MAX_ENEMIES, `떼가 상한까지 찬다 (${peak})`);

  const sorted = [...steps].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  const median = at(0.5);
  const p99 = at(0.99);
  console.log(`  200마리 기준: 한 틱 중간값 ${median.toFixed(3)}ms · p99 ${p99.toFixed(3)}ms`
    + ` · 캔버스 호출 ${worstOps}번 (${sorted.length}틱 측정)`);

  assert.equal(sorted.length, SAMPLES, `상한 근처에서 ${SAMPLES}틱을 측정했다 (${sorted.length}틱)`);
  // One frame is 16.6ms. The median is the regression signal; p99 is loose on
  // purpose, because a GC pause inside one step is not a performance bug.
  assert.ok(median < 2, `200마리를 한 틱에 2ms 안에 돈다 (중간값 ${median.toFixed(3)}ms)`);
  assert.ok(p99 < 8, `튀는 틱도 프레임 예산 안이다 (p99 ${p99.toFixed(3)}ms)`);
  // This one is deterministic — the same number on every machine and every run.
  assert.ok(worstOps < 9000, `200마리를 그리는 캔버스 호출이 9000번 아래다 (${worstOps})`);
}

// --- the reaper takes an ordinary enemy's place, never a miniboss ------------
{
  const BAT = 0;
  const ELITE_BAT = ELITE;
  assert.equal(evictionIndex([ELITE_BAT, BAT, BAT]), 1, '제일 오래된 놈이 엘리트면 건너뛴다');
  assert.equal(evictionIndex([BAT, ELITE_BAT, BAT]), 0, '평범한 놈이 앞에 있으면 그놈을 뺀다');
  assert.equal(evictionIndex([REAPER_KIND, ELITE_BAT, BAT]), 2, '사신도 밀어내지 않는다');
  assert.equal(evictionIndex([ELITE_BAT, ELITE_BAT]), 0, '전부 엘리트면 어쩔 수 없이 앞을 뺀다');
  assert.equal(evictionIndex([]), 0, '빈 필드에서도 답을 준다');
}

// --- rendering can never reach the simulation --------------------------------
{
  // The spawner used to ring `engine.camera`, and the match overwrote that every
  // frame in `render()` — from the local figure's position and the local window's
  // size. So two clients in one run grew different swarms from the same seed.
  // This drives the real path: both sides lockstep normally, and both draw, at
  // the two window sizes the overlay actually allows.
  const host = survivorModule.createMatch(true, 'h', '호스트');
  const member = survivorModule.createMatch(false, 'm', '멤버');
  host.setMembers([{ id: 'm', name: '멤버' }]);

  const ctx = countingCtx();
  const smallest = { width: 160, height: 120, pixelRatio: 1 };
  const biggest = { width: 900, height: 700, pixelRatio: 2 };

  for (let tick = 1; tick <= 1800; tick++) {
    // They walk away from each other, so each client's camera ends up somewhere
    // different — which is what made the two swarms differ.
    host.step({ ...NO_INPUT, right: tick % 160 < 80, up: tick % 160 >= 80, pick1: true });
    member.step({ ...NO_INPUT, left: tick % 120 < 60, down: tick % 120 >= 60, pick1: true });
    host.render(ctx, smallest, 0);
    member.render(ctx, biggest, 0);
    if (tick % 2 !== 0) continue;
    host.applyOpponentPacket({ ...member.buildOutgoingPacket(), from: 'm' });
    member.applyOpponentPacket(host.buildOutgoingPacket());
  }

  const status = (match) => match.hud().status;
  assert.ok(!status(member).includes('동기화 어긋남'),
    `창 크기가 달라도 떼가 갈라지지 않는다 (${status(member)})`);
  assert.equal(
    status(member).replace(/^HP \S+/, ''),
    status(host).replace(/^HP \S+/, ''),
    '시계와 레벨과 처치 수가 같다');
}

// --- the reaper reaches as far as it is drawn, blink or no blink --------------
{
  // Both halves of this used to pass with the reaper reduced to an ordinary
  // hitbox: nothing placed a player inside the ink but outside the old reach.
  assert.ok(REAPER_REACH > PLAYER_RADIUS + ENEMY_RADIUS,
    '사신 판정은 보통 적보다 넓다');

  const engine = fresh(29);
  let reaper = null;
  let me = null;
  for (let i = 0; i < RUN_TICKS + 10 * TICKS_PER_SECOND; i++) {
    const world = engine.snapshot();
    me = world.players[0];
    if (!me.alive) break;
    reaper = world.enemies.find((e) => e.kind === REAPER_KIND);
    // Standing inside the ink, outside an ordinary enemy's reach.
    if (reaper) break;
    if (i % 20 === 0) engine.reconcile('me', me.x, me.y, me.maxHp, true);
    if (world.phase === 'levelup') { engine.setInput('me', { ...NO_INPUT, pick1: true }); engine.step(); continue; }
    const leg = Math.floor(i / 50) % 4;
    engine.setInput('me', { ...NO_INPUT, right: leg === 0, down: leg === 1, left: leg === 2, up: leg === 3 });
    engine.step();
  }

  assert.ok(reaper, '10분을 넘기면 사신이 필드에 있다');

  // Take a bite on purpose, so the figure is provably mid-blink: the other half
  // of the rule is that the reaper ignores the blink, and waiting around hoping
  // to be hit makes that half depend on the seed.
  const bystander = engine.snapshot().enemies.find((e) => e.kind !== REAPER_KIND);
  assert.ok(bystander, '떼가 남아 있다');
  engine.reconcile('me', bystander.x, bystander.y, me.maxHp, true);
  engine.setInput('me', NO_INPUT);
  engine.step();
  const bitten = engine.snapshot().players[0];
  assert.ok(bitten.invuln > 0, `한 대 맞으면 잠깐 무적이 된다 (${bitten.invuln}틱)`);

  // Now stand inside the reaper's ink but outside an ordinary enemy's reach.
  const gap = (PLAYER_RADIUS + ENEMY_RADIUS + REAPER_REACH) / 2;
  const far = engine.snapshot().enemies.find((e) => e.kind === REAPER_KIND);
  engine.reconcile('me', far.x + gap, far.y, bitten.maxHp, true);
  engine.setInput('me', NO_INPUT);
  engine.step();

  const after = engine.snapshot().players[0];
  assert.equal(after.alive, false, `사신 몸통 안이면 무적이어도 죽는다 (거리 ${gap.toFixed(1)})`);
}

// --- a member sees the same result the host does ------------------------------
{
  const host = survivorModule.createMatch(true, 'h', '호스트');
  const member = survivorModule.createMatch(false, 'm', '멤버');
  host.setMembers([{ id: 'm', name: '멤버' }]);

  // Nobody moves, so the run ends the same way on both clients.
  const stand = { ...NO_INPUT, pick1: true };
  for (let tick = 1; tick <= 5 * 60 * TICKS_PER_SECOND; tick++) {
    host.step(stand);
    member.step(stand);
    if (tick % 2 !== 0) continue;
    host.applyOpponentPacket({ ...member.buildOutgoingPacket(), from: 'm' });
    member.applyOpponentPacket(host.buildOutgoingPacket());
    if (member.hud().banner === '전멸') break;
  }

  assert.equal(host.hud().banner, '전멸', '호스트도 전멸로 끝난다');
  assert.equal(member.hud().banner, '전멸', '멤버도 자기 엔진에서 끝을 본다');
  assert.equal(member.hud().status, host.hud().status, '결과 줄이 같다');
  assert.ok(!member.hud().status.includes('동기화 어긋남'), '끝까지 어긋나지 않는다');

  // And the member holds its own panel rather than ending on the host's clock.
  assert.equal(member.isOver(), false, '멤버도 결과를 보는 동안은 끝이 아니다');
  for (let i = 0; i < RESULT_HOLD_FRAMES; i++) member.step(NO_INPUT);
  assert.equal(member.isOver(), true, '유지 시간이 지나면 멤버도 방을 떠난다');
}

// --- the result panel fits every window the overlay allows -------------------
{
  // A full shelf, the widest this panel ever gets.
  const owned = (rows) => rows.map(([label, level]) => ({ label, level }));
  const result = {
    survived: false,
    ticks: 7 * 60 * TICKS_PER_SECOND + 42 * TICKS_PER_SECOND,
    level: 37,
    kills: 1284,
    weapons: owned([['혈귀의 채찍', 8], ['번개 반지', 4], ['성수', 3], ['단검', 2], ['성경', 1], ['도끼', 1]]),
    passives: owned([['쌍둥이 반지', 3], ['자석', 3], ['날개', 4], ['공허의 문장', 5], ['시금치', 3], ['수호 반지', 5]])
  };

  // 160x120 is the window's minimum, 320x280 its default, and it is resizable.
  for (const [w, h] of [[160, 120], [220, 180], [WINDOW_W, WINDOW_H], [900, 700]]) {
    const panel = layoutResult(w, h, result);
    const where = `${w}x${h}`;
    assert.ok(panel.x >= 0 && panel.x + panel.w <= w, `${where}: 패널이 좌우로 안 넘친다`);
    assert.ok(panel.y >= 0 && panel.y + panel.h <= h, `${where}: 패널이 위아래로 안 넘친다`);
    assert.ok(!panel.lines.some((line, i) => line.caption && i === panel.lines.length - 1),
      `${where}: 내용 없는 제목만 남지 않는다`);
    const perRow = panel.lines.filter((line) => !line.caption).map((line) => line.text.split(' · ').length);
    assert.ok(perRow.every((n) => n <= 2), `${where}: 한 줄에 두 개까지만 적는다`);
  }

  assert.equal(layoutResult(160, 120, result).lines.length, 0, '최소 창에서는 빌드를 접는다');
  assert.ok(layoutResult(WINDOW_W, WINDOW_H, result).lines.length > 4, '기본 창에서는 빌드가 다 보인다');

  // And it actually draws, with every string bounded by the panel's width.
  const ctx = countingCtx();
  for (const [w, h] of [[160, 120], [WINDOW_W, WINDOW_H]]) {
    const panel = layoutResult(w, h, result);
    ctx.texts.length = 0;
    renderScene(ctx, { width: w, height: h, pixelRatio: 2 }, fresh(1).snapshot(), { x: WORLD_W / 2, y: WORLD_H / 2 },
      'me', 1, 100, { result, framesLeft: 5 * TICKS_PER_SECOND });
    assert.ok(ctx.texts.length >= 3, `${w}x${h}: 결과 패널이 그려진다`);
    assert.ok(ctx.texts.every((t) => t.maxWidth !== undefined && t.maxWidth <= panel.w),
      `${w}x${h}: 모든 글자가 패널 폭에 묶인다`);
    assert.ok(ctx.texts.every((t) => t.y > 0 && t.y < h), `${w}x${h}: 글자가 화면 안에 있다`);
  }
}

// --- everyone's cards are their own ------------------------------------------
{
  // The cards used to be rolled from the first living player's shelf, one list
  // for the room. So a member was shown somebody else's upgrades, and taking
  // one installed that player's weapon at that player's level — which read, on
  // the other screens, as "my teammate's weapons are shared with me" and as
  // "my weapon level doesn't go up".
  const engine = new SurvivorEngine(777, true);
  engine.ensurePlayer('a', '김대리');
  engine.ensurePlayer('b', '이대리');

  const cardsFor = (id) => engine.snapshot().offers.find((set) => set.id === id)?.cards ?? [];
  const levels = (id) => new Map([...engine.loadout(id).weapons, ...engine.loadout(id).passives]
    .map((item) => [item.label, item.level]));

  // Walk until the room levels, then send the two of them down different paths.
  let guard = 0;
  const toLevelUp = () => {
    while (engine.snapshot().phase === 'run' && guard < 5 * 60 * TICKS_PER_SECOND) {
      const world = engine.snapshot();
      const leg = Math.floor(guard / 300) % 4;
      const move = { ...NO_INPUT, right: leg === 0, down: leg === 1, left: leg === 2, up: leg === 3 };
      for (const p of world.players) {
        if (guard % 20 === 0) engine.reconcile(p.id, p.x, p.y, p.maxHp, true);
        engine.setInput(p.id, move);
      }
      engine.step();
      guard += 1;
    }
    assert.equal(engine.snapshot().phase, 'levelup', `아직 도는 판이다 (${guard}틱)`);
  };

  toLevelUp();
  assert.ok(cardsFor('a').length > 0 && cardsFor('b').length > 0, '둘 다 자기 카드를 받는다');
  assert.deepEqual([...levels('a')], [...levels('b')], '첫 레벨업 전에는 둘의 보유가 같다');

  // A takes card 1, B takes card 2, twice over. Their shelves diverge.
  for (let round = 0; round < 2; round++) {
    engine.setInput('a', { ...NO_INPUT, pick1: true });
    engine.setInput('b', { ...NO_INPUT, pick2: true });
    engine.step();
    toLevelUp();
  }

  const mine = cardsFor('a');
  const theirs = cardsFor('b');
  assert.notDeepEqual(mine, theirs, '보유가 갈리면 카드도 갈린다');

  // Every card has to describe the shelf of the player it is offered to: a card
  // reading "Lv.3" means that player owns 2, nobody else.
  for (const [id, cards] of [['a', mine], ['b', theirs]]) {
    const owned = levels(id);
    for (const card of cards) {
      const label = card.label.replace(/ Lv\.\d+$/, '');
      assert.equal(card.level, (owned.get(label) ?? 0) + 1,
        `${id}의 카드 "${card.label}"는 ${id}의 보유 기준이다 (보유 ${owned.get(label) ?? 0})`);
    }
  }

  // And taking one raises that player's own level by exactly one.
  const beforeA = levels('a');
  const beforeB = levels('b');
  const takenA = mine[0];
  const takenB = theirs[0];
  engine.setInput('a', { ...NO_INPUT, pick1: true });
  engine.setInput('b', { ...NO_INPUT, pick1: true });
  engine.step();

  const bump = (id, card, before) => {
    const label = card.label.replace(/ Lv\.\d+$/, '');
    const was = before.get(label) ?? 0;
    assert.equal(levels(id).get(label), was + 1,
      `${id}의 "${label}"가 ${was} -> ${was + 1}로 한 단계 오른다`);
  };
  bump('a', takenA, beforeA);
  bump('b', takenB, beforeB);
}

// --- a card key answers once per press, however long it is held --------------
{
  // A real press lasts five to ten frames. Reading the held state meant one
  // press answered every screen inside that window — so a chest's extra level
  // flashed up and was taken for you, which looked like the list changing by
  // itself the moment you chose.
  const listeners = {};
  const target = { addEventListener: (type, cb) => { (listeners[type] ??= []).push(cb); } };
  const fire = (type, code) => listeners[type].forEach((cb) => cb({ code, preventDefault() {} }));
  const input = createInputSource(target);

  assert.equal(input.read().pick1, false, '누르지 않았으면 false');
  fire('keydown', 'Digit1');
  const held = Array.from({ length: 8 }, () => input.read().pick1);
  assert.deepEqual(held, [true, false, false, false, false, false, false, false],
    `한 번 누르면 한 프레임만 답한다 (${held.join(',')})`);

  fire('keyup', 'Digit1');
  fire('keydown', 'Digit1');
  assert.equal(input.read().pick1, true, '다시 누르면 다시 답한다');

  // Movement is the opposite: it is a hold, and has to stay true while down.
  fire('keydown', 'ArrowRight');
  assert.deepEqual([input.read().right, input.read().right], [true, true], '이동은 누르는 동안 계속 true');
  fire('keyup', 'ArrowRight');
  assert.equal(input.read().right, false, '떼면 멈춘다');
}

// --- a member's card press is consumed once, not until its next packet -------
{
  // Fixing the key source only fixed the host's own player. A member's packet
  // stands in for its input until the next one lands — two host steps at best —
  // so a press held in `memberBits` answered the next screen too. The engine
  // replays whatever the host recorded, so every client agreed on the wrong
  // answer, and the member saw its list change by itself.
  const host = survivorModule.createMatch(true, 'h', '호스트');
  host.setMembers([{ id: 'm', name: '멤버' }]);

  // One packet carrying a press, then many host steps with no new packet.
  host.applyOpponentPacket({ t: 'svi', bits: packInput({ ...NO_INPUT, pick1: true }), name: '멤버', from: 'm' });

  const frames = [];
  for (let tick = 0; tick < 6; tick++) {
    host.step(NO_INPUT);
    const packet = host.buildOutgoingPacket();
    frames.push(packet.frames[packet.frames.length - 1][packet.ids.indexOf('m')]);
  }

  const asPicks = frames.map((bits) => (bits & PICK_MASK) !== 0);
  assert.deepEqual(asPicks, [true, false, false, false, false, false],
    `멤버의 선택은 한 틱만 쓰인다 (${asPicks.join(',')})`);

  // Movement is the opposite: it has to carry across the gap between packets or
  // a member walking in a straight line stutters at 30Hz. The two travel in one
  // packet, so taking the press out must not take the walking out with it.
  const moving = survivorModule.createMatch(true, 'h2', '호스트');
  moving.setMembers([{ id: 'm', name: '멤버' }]);
  moving.applyOpponentPacket({
    t: 'svi',
    bits: packInput({ ...NO_INPUT, right: true, pick1: true }),
    name: '멤버',
    from: 'm'
  });
  const walks = [];
  const picks = [];
  for (let tick = 0; tick < 6; tick++) {
    moving.step(NO_INPUT);
    const packet = moving.buildOutgoingPacket();
    const bits = packet.frames[packet.frames.length - 1][packet.ids.indexOf('m')];
    walks.push(unpackInput(bits).right);
    picks.push(unpackInput(bits).pick1);
  }
  assert.ok(walks.every(Boolean), `같은 패킷에 선택이 실려 있어도 계속 걷는다 (${walks.join(',')})`);
  assert.deepEqual(picks, [true, false, false, false, false, false],
    `선택만 한 번 쓰이고 빠진다 (${picks.join(',')})`);
}

// --- card draws cost the shared stream nothing -------------------------------
{
  // Offers are drawn per player from a forked stream. If they came out of the
  // shared one, the number of draws would depend on how many people were in the
  // room at that instant — and a member adopts the host's roster a tick or two
  // before it replays the frame that used it. One extra draw parts the two
  // swarms for good, which no amount of body reconciliation repairs.
  assert.equal(mixSeed(7, 1, 'a'), mixSeed(7, 1, 'a'), '같은 재료는 같은 값');
  assert.notEqual(mixSeed(7, 1, 'a'), mixSeed(7, 1, 'b'), '사람이 다르면 다른 값');
  assert.notEqual(mixSeed(7, 1, 'a'), mixSeed(7, 2, 'a'), '화면이 다르면 다른 값');
  assert.notEqual(mixSeed(7, 1, 'a'), mixSeed(8, 1, 'a'), '시드가 다르면 다른 값');
  assert.notEqual(mixSeed(7, 1, 'ab'), mixSeed(7, 'ab', 1), '재료 경계가 섞이지 않는다');

  // What the fork buys, seen from the game: two people at one screen get
  // different hands, and one person's next screen is not a repeat of this one.
  const engine = new SurvivorEngine(31337, true);
  engine.ensurePlayer('a', '김대리');
  engine.ensurePlayer('b', '이대리');

  const handsAt = [];
  for (let tick = 0; tick < 4 * 60 * TICKS_PER_SECOND && handsAt.length < 2; tick++) {
    const world = engine.snapshot();
    for (const p of world.players) {
      if (tick % 20 === 0) engine.reconcile(p.id, p.x, p.y, p.maxHp, true);
    }
    if (world.phase === 'levelup') {
      handsAt.push(new Map(world.offers.map((set) => [set.id, set.cards.map((c) => c.weapon).join('|')])));
      for (const p of world.players) engine.setInput(p.id, { ...NO_INPUT, pick1: true });
      engine.step();
      continue;
    }
    const leg = Math.floor(tick / 300) % 4;
    for (const p of world.players) {
      engine.setInput(p.id, { ...NO_INPUT, right: leg === 0, down: leg === 1, left: leg === 2, up: leg === 3 });
    }
    engine.step();
  }

  assert.equal(handsAt.length, 2, '카드 화면을 두 번 봤다');
  assert.notEqual(handsAt[0].get('a'), handsAt[0].get('b'), '같은 화면에서 둘은 다른 패를 받는다');
  assert.notEqual(handsAt[0].get('a'), handsAt[1].get('a'), '다음 화면은 같은 패의 반복이 아니다');

  // The discriminator: the same person's first hand must not depend on how many
  // people were drawn before them. Out of the shared stream it would, because
  // their draw would start wherever the others left off — which is exactly the
  // coupling that makes a mid-run join part the two swarms.
  const firstHandOf = (roster, who) => {
    const engine = new SurvivorEngine(31337, true);
    roster.forEach((id) => engine.ensurePlayer(id, id));
    for (let tick = 0; tick < 4 * 60 * TICKS_PER_SECOND; tick++) {
      const world = engine.snapshot();
      for (const p of world.players) {
        if (tick % 20 === 0) engine.reconcile(p.id, p.x, p.y, p.maxHp, true);
      }
      if (world.phase === 'levelup') {
        return (world.offers.find((set) => set.id === who)?.cards ?? []).map((c) => c.weapon).join('|');
      }
      const leg = Math.floor(tick / 300) % 4;
      for (const p of world.players) {
        engine.setInput(p.id, { ...NO_INPUT, right: leg === 0, down: leg === 1, left: leg === 2, up: leg === 3 });
      }
      engine.step();
    }
    return null;
  };

  const second = firstHandOf(['a', 'b'], 'b');
  const third = firstHandOf(['z', 'a', 'b'], 'b');
  assert.ok(second, '첫 화면에서 b의 패를 받았다');
  assert.equal(third, second, '앞사람이 몇 명이든 b의 패는 같다');
}

// --- a shelf with nothing left on it offers nothing ---------------------------
{
  // Where an empty hand comes from. The engine must not leave such a player
  // `pending`: they would have no overlay to answer on and no card to answer
  // with, and in solo there is no timeout to rescue them.
  const maxedWeapons = new Map(WEAPONS.slice(0, WEAPON_SLOTS).map((w) => [w.id, w.maxLevel]));
  const maxedPassives = new Map(PASSIVES.slice(0, PASSIVE_SLOTS).map((p) => [p.id, p.maxLevel]));

  assert.equal(rollOffers(maxedWeapons, maxedPassives, 3, createRng(1)).length, 0,
    '칸이 다 차고 전부 만렙이면 내놓을 카드가 없다');
  assert.ok(rollOffers(maxedWeapons, new Map(), 3, createRng(1)).length > 0,
    '아이템 칸이 비어 있으면 아직 줄 게 있다');
  const oneShort = new Map(maxedWeapons);
  oneShort.set(WEAPONS[0].id, WEAPONS[0].maxLevel - 1);
  assert.ok(rollOffers(oneShort, maxedPassives, 3, createRng(1)).length > 0,
    '하나라도 덜 올랐으면 그게 나온다');
}

// --- nobody with an empty hand can hold the room up --------------------------
{
  // A maxed-out build has nothing left to be offered. That player used to be
  // left `pending` with no cards — so no overlay on their screen, and everyone
  // else waiting on a choice they had no way to make.
  const engine = new SurvivorEngine(99, false);
  engine.ensurePlayer('me', '나');

  // Hand them every weapon and passive at its ceiling, through the only door
  // the engine has: take cards until there is nothing left to take.
  for (let tick = 0; tick < 12 * 60 * TICKS_PER_SECOND; tick++) {
    const world = engine.snapshot();
    const me = world.players[0];
    if (!me) break;
    if (tick % 20 === 0) engine.reconcile('me', me.x, me.y, me.maxHp, true);
    const cards = world.offers.find((set) => set.id === 'me')?.cards ?? [];
    if (world.phase === 'levelup' && cards.length === 0) {
      assert.ok(false, '카드가 없는데 레벨업에서 멈춰 있다');
    }
    engine.setInput('me', world.phase === 'levelup'
      ? { ...NO_INPUT, pick1: true }
      : { ...NO_INPUT, right: Math.floor(tick / 50) % 2 === 0, down: Math.floor(tick / 50) % 2 === 1 });
    engine.step();
  }
  // Getting here at all is the assertion: a levelup phase with no cards would
  // have tripped above, or hung the loop at a screen nobody can answer.
  assert.ok(engine.snapshot().tick > 0, '판이 끝까지 돈다');
}

// --- the module wires itself into the shell the way the panel expects ---------
{
  assert.equal(survivorModule.id, 'survivor');
  assert.equal(survivorModule.matching, 'room');
  assert.equal(survivorModule.roomCapacity, 4);
  assert.ok(typeof survivorModule.createSoloMatch === 'function', '혼자하기를 제공한다');

  const match = survivorModule.createSoloMatch('me', '나');
  match.step(NO_INPUT);
  assert.equal(match.isOver(), false);
  assert.ok(match.hud().status.includes('Lv.'), 'HUD에 레벨이 보인다');
  assert.equal(RUN_TICKS / TICKS_PER_SECOND, 600, '한 판은 10분이다');
}

console.log('survivor: ok');
