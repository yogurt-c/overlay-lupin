/**
 * The host-only authoritative simulation for one merandi match. Members never
 * run this themselves — they just render whatever snapshot arrives, same
 * split as cell's CellEngine.
 */
import {
  ARCHETYPES,
  ARCHETYPE_ROLE,
  ALIVE_THRESHOLD_PER_EXTRA_PLAYER,
  ALIVE_THRESHOLD_SOLO,
  ARCHER_COOLDOWN_MULT,
  CELEBRATION_MIN_GRADE,
  MAGE_SPLASH_DAMAGE_FACTOR,
  MAGE_SPLASH_RADIUS,
  MAIN_STATS,
  MAIN_STAT_NAME,
  MONSTERS_PER_WAVE_PER_PLAYER,
  BOSS_SPAWN_DELAY_MS,
  BOSS_WAVE_MS,
  DRAW_COST_BASE,
  drawCost,
  GRADES,
  HP_GROWTH_PER_WAVE,
  INITIAL_GRACE_MS,
  LAST_PLACE_GRADE_BOOST,
  MONSTER_KINDS,
  NORMAL_WAVE_MS,
  PIRATE_KILL_BONUS,
  SELL_REFUND,
  SLOT_COUNT,
  SPAWN_WINDOW_MS,
  SPECIAL_EFFECT_MIN_GRADE,
  STACK_MAX,
  THIEF_DOT_DURATION_MS,
  THIEF_DOT_RATE,
  TOTAL_WAVES,
  UPGRADE_MAX_LEVEL,
  WARRIOR_STAGGER_MS,
  WARRIOR_VULNERABLE_FACTOR,
  WARRIOR_VULNERABLE_MS,
  computeMemberDamage,
  isBossWave,
  rollArchetype,
  rollGradeWithPity,
  rollJobName,
  settleFactor,
  specialEffectTier,
  upgradeCost
} from './data.js';
import { ZONE_LABELS, perimeterPoint, slotPosition, squareLoopPoints } from './field.js';
import type { Point } from './field.js';
import type {
  Archetype,
  Celebration,
  MainStat,
  Monster,
  MonsterKind,
  MerandiInput,
  MerandiWorld,
  Shot,
  UnitMember,
  UnitStack,
  Zone,
  ZoneLabel
} from './types.js';

const PATH_PTS = squareLoopPoints(260, 24);
const LOOP_MS = 9000; // one full lap at normal speed
const BASE_MONSTER_HP = 23;
/**
 * Was 60 — measured (see the min-slot-distance check this constant was tuned against) the closest any
 * slot ever gets to the path is 65.6px, so at 60 a plain 노멀 (rangeMult 1.0 → 60px reach) could
 * mathematically never hit a single monster no matter the wave, the grade table, or upgrade levels —
 * it just never entered its own range. That's the real reason 노멀-heavy squads barely landed kills:
 * only 매직+ (rangeMult ≥ 1.15, already ≥ 69px) could ever connect. Raised so every grade, including the
 * most common 55%-of-draws 노멀 roll, has an actual (if brief) hit window near its corner.
 */
const BASE_RANGE_PX = 80;
const BASE_COOLDOWN_MS = 650;
/** How long a cosmetic shot stays on screen before fading out. */
const SHOT_LIFE_MS = 220;
/** How long a map-wide celebration (draw.ts's drawCelebrations) plays before it clears itself — long enough for every staggered burst to finish, short enough not to sit over real-time combat for long. */
const CELEBRATION_LIFE_MS = 2000;
/** How long a one-shot feedback message ("골드가 부족합니다" etc.) stays on screen before clearing itself. */
const MESSAGE_TTL_MS = 2200;
/** Fraction of kill gold the killer keeps — the rest splits evenly across every other active player, see awardKillGold(). */
const KILLER_GOLD_SHARE = 0.6;
/**
 * Flat, fixed bonus paid to every active player the instant a boss dies — on top of whatever
 * awardKillGold already paid out for that kill. A boss (10x HP, and now a hard timeout loss if it isn't
 * killed in time) used to pay out exactly the same per-kill gold as a regular monster despite taking far
 * more effort; this gives boss kills a reward that actually reflects that.
 */
const BOSS_CLEAR_BONUS = 100;

function freshUpLevels() {
  return { str: 0, int: 0, dex: 0, luk: 0 };
}

function freshZone(label: ZoneLabel): Zone {
  return {
    id: '',
    label,
    name: '',
    gold: DRAW_COST_BASE * 5, // enough for 5 draws at the base cost up front
    kills: 0,
    upLevels: freshUpLevels(),
    slots: new Array<UnitStack | null>(SLOT_COUNT).fill(null),
    armed: null,
    pendingArche: null,
    lastMessage: ''
  };
}

function monsterKindFor(wave: number, isBoss: boolean): MonsterKind {
  if (isBoss) return 'boss';
  const roll = Math.random();
  if (wave >= 10 && roll < 0.15) return 'tank';
  if (wave >= 5 && roll < 0.4) return 'speed';
  return 'normal';
}

interface SpawnTicket {
  atMs: number; // ms into the wave
  kind: MonsterKind;
}

export class MerandiEngine {
  private zones = new Map<ZoneLabel, Zone>(ZONE_LABELS.map((l) => [l, freshZone(l)]));
  private pendingInputs = new Map<string, MerandiInput>();
  private monsters: Monster[] = [];
  private nextMonsterId = 1;
  private nextMemberId = 1;
  private shots: Shot[] = [];
  private celebrations: Celebration[] = [];
  private nextCelebrationId = 1;
  private messageMsLeft = new Map<ZoneLabel, number>();
  /** Consecutive sub-레어 draws per zone, host-side only — see data.ts's rollGradeWithPity/PITY_THRESHOLD. Never sent over the wire (not part of Zone/wire.ts) since members never need to see it, same as messageMsLeft. */
  private pityStreaks = new Map<ZoneLabel, number>();

  private wave = 1;
  private waveMsLeft = NORMAL_WAVE_MS;
  private spawnQueue: SpawnTicket[] = [];
  private waveElapsedMs = 0;

  private over = false;
  private won = false;

  constructor() {
    this.startWave(1);
  }

  private activePlayerCount(): number {
    let n = 0;
    for (const z of this.zones.values()) if (z.id !== '') n++;
    return Math.max(1, n);
  }

  private zoneByPeer(id: string): Zone | null {
    for (const z of this.zones.values()) if (z.id === id) return z;
    return null;
  }

  /** Every feedback message goes through here so it always carries a fresh TTL — see `stepMessages`. */
  private setMessage(zone: Zone, text: string): void {
    zone.lastMessage = text;
    this.messageMsLeft.set(zone.label, MESSAGE_TTL_MS);
  }

  private stepMessages(dtMs: number): void {
    for (const label of ZONE_LABELS) {
      const left = this.messageMsLeft.get(label);
      if (left == null) continue;
      const remaining = left - dtMs;
      if (remaining <= 0) {
        this.messageMsLeft.delete(label);
        this.zones.get(label)!.lastMessage = '';
      } else {
        this.messageMsLeft.set(label, remaining);
      }
    }
  }

  /** Lazily assigns a peer to the next free corner the first time we hear from them. */
  ensurePlayer(id: string, name: string): void {
    const existing = this.zoneByPeer(id);
    if (existing) {
      existing.name = name;
      return;
    }
    for (const label of ZONE_LABELS) {
      const z = this.zones.get(label)!;
      if (z.id === '') {
        z.id = id;
        z.name = name;
        return;
      }
    }
    // Room is capped at 4 by roomCapacity, so this shouldn't happen.
  }

  removePlayer(id: string): void {
    const z = this.zoneByPeer(id);
    if (z) {
      this.zones.set(z.label, freshZone(z.label));
      this.pityStreaks.delete(z.label);
    }
  }

  /** Appends rather than overwrites — a peer can send more than one packet between two step() calls (network jitter), and each one's commands must survive, not just the most recent. */
  setInput(id: string, input: MerandiInput): void {
    const existing = this.pendingInputs.get(id);
    this.pendingInputs.set(id, existing ? { commands: [...existing.commands, ...input.commands] } : input);
  }

  private startWave(wave: number): void {
    this.wave = wave;
    const boss = isBossWave(wave);
    // The per-wave timer is now just a safety cap — a fully-cleared wave (see stepWaveClock) advances immediately.
    this.waveMsLeft = boss ? BOSS_WAVE_MS : NORMAL_WAVE_MS;
    this.waveElapsedMs = 0;

    // Per-corner baseline × active corners, so density per corner stays constant regardless of player count.
    const count = Math.max(1, MONSTERS_PER_WAVE_PER_PLAYER(wave) * this.activePlayerCount());
    // Spread across a fixed window regardless of count, so every wave "still has monsters trickling in"
    // for the same ~25s stretch instead of finishing instantly once count gets large.
    const gap = SPAWN_WINDOW_MS / count;
    // Wave 1 only: nobody has a unit on the field yet, so hold every spawn back by a flat grace
    // window instead of dropping the first monster on an empty board at t=0 — see INITIAL_GRACE_MS.
    const graceMs = wave === 1 ? INITIAL_GRACE_MS : 0;
    const tickets: SpawnTicket[] = [];
    for (let i = 0; i < count; i++) {
      tickets.push({ atMs: graceMs + Math.round(i * gap), kind: monsterKindFor(wave, false) });
    }
    // Spawns alongside the regular roster (same grace delay), not after it — it used to wait until the
    // whole SPAWN_WINDOW_MS trash roster finished (~25s in), which quietly burned over a third of
    // BOSS_WAVE_MS before the boss (and its HP bar) ever appeared, leaving far less than 60s of real
    // fight time against the boss-timeout loss. See BOSS_SPAWN_DELAY_MS.
    if (boss) tickets.push({ atMs: graceMs + BOSS_SPAWN_DELAY_MS, kind: 'boss' });
    tickets.sort((a, b) => a.atMs - b.atMs);
    this.spawnQueue = tickets;
  }

  private spawnMonster(kind: MonsterKind): void {
    const activeLabels = ZONE_LABELS.filter((l) => this.zones.get(l)!.id !== '');
    if (!activeLabels.length) return; // no one to defend against yet — hold off spawning
    const label = activeLabels[Math.floor(Math.random() * activeLabels.length)];
    const cornerT = ZONE_LABELS.indexOf(label) / 4;
    const spec = MONSTER_KINDS[kind];
    const hp = Math.round(
      BASE_MONSTER_HP * spec.hpMult * Math.pow(HP_GROWTH_PER_WAVE, this.wave - 1) * settleFactor(this.wave)
    );
    this.monsters.push({
      id: this.nextMonsterId++,
      t: cornerT,
      hp,
      maxHp: hp,
      kind,
      speed: spec.speedMult / LOOP_MS
    });
  }

  private stepSpawning(dtMs: number): void {
    this.waveElapsedMs += dtMs;
    while (this.spawnQueue.length && this.spawnQueue[0].atMs <= this.waveElapsedMs) {
      const ticket = this.spawnQueue.shift()!;
      this.spawnMonster(ticket.kind);
    }
  }

  private stepMonsters(dtMs: number): void {
    for (const m of this.monsters) {
      if ((m.staggerMsLeft ?? 0) > 0) continue; // 전사 special — frozen in place, see stepStatusEffects
      m.t += m.speed * dtMs;
    }
  }

  /**
   * Killer keeps most of the reward but shares a cut with every other active player — a fast-growing
   * player still benefits most from their own kills, but can't hoard the entire team's gold while
   * everyone else falls behind. Shares are kept exact (no per-kill rounding) so nothing leaks from the
   * economy over hundreds of kills — see draw.ts/module.ts for where gold gets floored for display.
   * `bonus` is 해적's flat per-kill special (see killMonster) — folded in before the split so the team
   * benefits from a legendary+ pirate's kills too, same as any other kill gold.
   */
  private awardKillGold(killer: Zone, bonus = 0): void {
    const reward = (this.wave <= 5 ? 3 : 2 + Math.floor(this.wave / 20)) + bonus;
    const others = ZONE_LABELS.filter((l) => l !== killer.label && this.zones.get(l)!.id !== '');
    if (!others.length) {
      killer.gold += reward;
      return;
    }
    const killerShare = reward * KILLER_GOLD_SHARE;
    const perOther = (reward - killerShare) / others.length;
    killer.gold += killerShare;
    for (const l of others) this.zones.get(l)!.gold += perOther;
  }

  /** Flat reward for every active player the moment a boss dies — see BOSS_CLEAR_BONUS. */
  private awardBossClearBonus(): void {
    for (const label of ZONE_LABELS) {
      const zone = this.zones.get(label)!;
      if (zone.id === '') continue;
      zone.gold += BOSS_CLEAR_BONUS;
      this.setMessage(zone, `보스 클리어 보상! +${BOSS_CLEAR_BONUS}G`);
    }
  }

  /**
   * Applies damage with 전사's vulnerability special folded in (amplifies every source — direct hits,
   * 마법사 splash, 도적 dot ticks — the same way), and returns the resulting hp so callers can just
   * check `<= 0` instead of re-reading target.hp themselves.
   */
  private applyDamage(target: Monster, dmg: number): number {
    const factor = (target.vulnerableMsLeft ?? 0) > 0 ? (target.vulnerableFactor ?? 1) : 1;
    target.hp -= dmg * factor;
    return target.hp;
  }

  /** Single place a monster actually leaves the field — used by the primary hit, 마법사's splash targets, and 도적's dot ticks alike, so every kill (however it happened) is credited the same way. */
  private killMonster(target: Monster, creditLabel: ZoneLabel, bonusGold = 0): void {
    const zone = this.zones.get(creditLabel)!;
    this.awardKillGold(zone, bonusGold);
    if (target.kind === 'boss') this.awardBossClearBonus();
    zone.kills++;
    this.monsters = this.monsters.filter((m) => m !== target);
  }

  /** Ticks every monster's 레전더리+ status timers (전사 stagger/vulnerable, 도적 dot) and applies dot damage — runs once per frame, independent of whether anyone's currently firing. */
  private stepStatusEffects(dtMs: number): void {
    for (const m of [...this.monsters]) {
      if (m.staggerMsLeft && m.staggerMsLeft > 0) m.staggerMsLeft -= dtMs;
      if (m.vulnerableMsLeft && m.vulnerableMsLeft > 0) m.vulnerableMsLeft -= dtMs;
      if (m.dotMsLeft && m.dotMsLeft > 0) {
        m.dotMsLeft -= dtMs;
        const tick = (m.dotDamagePerSec ?? 0) * (dtMs / 1000);
        const label = m.dotZoneLabel;
        if (tick > 0 && label && this.applyDamage(m, tick) <= 0) {
          this.killMonster(m, label);
        }
      }
    }
  }

  private stepCombat(dtMs: number): void {
    if (!this.monsters.length) return;
    for (const label of ZONE_LABELS) {
      const zone = this.zones.get(label)!;
      if (zone.id === '') continue;
      for (let i = 0; i < zone.slots.length; i++) {
        const slot = zone.slots[i];
        if (!slot) continue;
        const pos = slotPosition(label, i);

        // Each member fires fully independently — a slot is just a shared tile, not a "same unit ×N" stack.
        for (const member of slot.members) {
          member.cooldownMs -= dtMs;
          if (member.cooldownMs > 0) continue;

          const grade = GRADES[member.grade];
          const special = member.grade >= SPECIAL_EFFECT_MIN_GRADE;
          const tier = specialEffectTier(member.grade);
          // 궁수's special is unlimited range — every other archetype keeps the normal grade-scaled reach.
          const range = special && member.arche === 'archer' ? Infinity : BASE_RANGE_PX * grade.rangeMult;

          let target: Monster | null = null;
          let bestDist = Infinity;
          for (const m of this.monsters) {
            const mp = perimeterPoint(PATH_PTS, m.t);
            const d = Math.hypot(mp[0] - pos[0], mp[1] - pos[1]);
            if (d <= range && d < bestDist) {
              bestDist = d;
              target = m;
            }
          }
          if (!target) continue;

          const role = ARCHETYPE_ROLE[member.arche];
          let dmg = computeMemberDamage(zone.upLevels, member);
          let cooldown = BASE_COOLDOWN_MS;
          if (role === 'attackSpeed') cooldown *= 0.65;
          if (role === 'crit' && Math.random() < 0.25) dmg *= 2;
          if (special && member.arche === 'archer') cooldown *= ARCHER_COOLDOWN_MULT[tier];
          member.cooldownMs = cooldown;

          const targetPosAtFire = perimeterPoint(PATH_PTS, target.t);
          const isMageSplash = special && member.arche === 'mage';
          this.shots.push({
            x: pos[0],
            y: pos[1],
            tx: targetPosAtFire[0],
            ty: targetPosAtFire[1],
            life: SHOT_LIFE_MS,
            maxLife: SHOT_LIFE_MS,
            grade: member.grade,
            ...(isMageSplash ? { splash: true } : {})
          });

          if (special && member.arche === 'warrior') {
            target.staggerMsLeft = WARRIOR_STAGGER_MS[tier];
            // Take the stronger of an existing amplification vs. this hit's — never let a weaker re-hit water down an already-applied buff, but always refresh its remaining duration.
            target.vulnerableFactor = Math.max(target.vulnerableFactor ?? 0, WARRIOR_VULNERABLE_FACTOR[tier]);
            target.vulnerableMsLeft = WARRIOR_VULNERABLE_MS;
          }

          const pirateBonus = special && member.arche === 'pirate' ? PIRATE_KILL_BONUS[tier] : 0;
          if (this.applyDamage(target, dmg) <= 0) {
            this.killMonster(target, label, pirateBonus);
          } else if (special && member.arche === 'thief') {
            const dotAmount = dmg * THIEF_DOT_RATE[tier];
            target.dotDamagePerSec = Math.max(target.dotDamagePerSec ?? 0, dotAmount);
            target.dotMsLeft = THIEF_DOT_DURATION_MS;
            target.dotZoneLabel = label;
          }

          if (isMageSplash) {
            const splashRadius = MAGE_SPLASH_RADIUS[tier];
            const splashDmg = dmg * MAGE_SPLASH_DAMAGE_FACTOR[tier];
            for (const m of [...this.monsters]) {
              if (m === target) continue;
              const mp = perimeterPoint(PATH_PTS, m.t);
              if (Math.hypot(mp[0] - targetPosAtFire[0], mp[1] - targetPosAtFire[1]) <= splashRadius) {
                if (this.applyDamage(m, splashDmg) <= 0) this.killMonster(m, label);
              }
            }
          }
        }
      }
    }
  }

  private stepShots(dtMs: number): void {
    if (!this.shots.length) return;
    for (const s of this.shots) s.life -= dtMs;
    this.shots = this.shots.filter((s) => s.life > 0);
  }

  private stepCelebrations(dtMs: number): void {
    if (!this.celebrations.length) return;
    for (const c of this.celebrations) c.life -= dtMs;
    this.celebrations = this.celebrations.filter((c) => c.life > 0);
  }

  /** A small flat reward (exactly one draw's worth) for every active player when a wave finishes, on top of whatever they earned from kills. */
  private awardWaveClearBonus(): void {
    for (const label of ZONE_LABELS) {
      const zone = this.zones.get(label)!;
      if (zone.id === '') continue;
      const bonus = drawCost(this.wave);
      zone.gold += bonus;
      this.setMessage(zone, `웨이브 클리어! +${bonus}G`);
    }
  }

  private stepWaveClock(dtMs: number): void {
    if (this.over) return;
    this.waveMsLeft -= dtMs;
    // Cleared the whole roster early (nothing left alive and nothing left to spawn) — no reason to sit out the rest of the timer.
    const clearedEarly = this.spawnQueue.length === 0 && this.monsters.length === 0;
    if (this.waveMsLeft > 0 && !clearedEarly) return;
    // Boss waves are a hard DPS check: letting the boss just carry over into the next wave once the
    // clock runs out would make BOSS_WAVE_MS meaningless. If it's still alive at the buzzer, it's a loss —
    // this also covers the final wave (50 is a boss wave), so clearing the last boss is required to win.
    if (isBossWave(this.wave) && this.monsters.some((m) => m.kind === 'boss')) {
      this.over = true;
      this.won = false;
      return;
    }
    if (this.wave >= TOTAL_WAVES) {
      this.over = true;
      this.won = this.monsters.length <= this.aliveThreshold();
      return;
    }
    this.awardWaveClearBonus();
    this.startWave(this.wave + 1);
  }

  private aliveThreshold(): number {
    return ALIVE_THRESHOLD_SOLO + (this.activePlayerCount() - 1) * ALIVE_THRESHOLD_PER_EXTRA_PLAYER;
  }

  private checkLoss(): void {
    if (this.over) return;
    if (this.monsters.length > this.aliveThreshold()) {
      this.over = true;
      this.won = false;
    }
  }

  // ---------------------------------------------------------------- commands

  /** How many points around the loop to sample when scoring a slot's coverage — plenty of resolution for a 36-slot grid, and this only ever runs once per draw (a rate-limited, player-triggered action), never per combat tick. */
  private static readonly COVERAGE_SAMPLES = 200;

  /** Fraction (0..1) of the loop that lies within `range` of `pos` — how much of a monster's lap this slot could actually hit. */
  private slotCoverage(pos: Point, range: number): number {
    let hits = 0;
    for (let k = 0; k < MerandiEngine.COVERAGE_SAMPLES; k++) {
      const p = perimeterPoint(PATH_PTS, k / MerandiEngine.COVERAGE_SAMPLES);
      if (Math.hypot(p[0] - pos[0], p[1] - pos[1]) <= range) hits++;
    }
    return hits / MerandiEngine.COVERAGE_SAMPLES;
  }

  /**
   * A slot is just a shared tile for up to STACK_MAX independent units — it never requires them to
   * match grade or archetype. So placement only ever fails once the whole 36-slot grid is truly full
   * at capacity (36 * STACK_MAX units), never because "this exact combo has nowhere to go."
   *
   * Picks whichever slot with room actually covers the most of the loop at this grade's real range —
   * not just "the deepest slot within an idealized reach band," since that band was only a proxy and
   * (per a manual audit) isn't always the slot that truly sees the most of the track.
   */
  private placeDraw(zone: Zone, grade: number, arche: Archetype, job: string): boolean {
    const spec = GRADES[grade];
    const range = BASE_RANGE_PX * spec.rangeMult;
    const member: UnitMember = { id: this.nextMemberId++, grade, arche, job, cooldownMs: 0 };

    let best = -1;
    let bestCoverage = -1;
    for (let i = 0; i < zone.slots.length; i++) {
      const s = zone.slots[i];
      if (s && s.members.length >= STACK_MAX) continue;
      const coverage = this.slotCoverage(slotPosition(zone.label, i), range);
      if (coverage > bestCoverage) {
        bestCoverage = coverage;
        best = i;
      }
    }
    if (best === -1) return false; // every slot is at the 3-member cap — the zone is genuinely full (108 units)

    const slot = zone.slots[best];
    if (slot) slot.members.push(member);
    else zone.slots[best] = { members: [member] };
    return true;
  }

  /** True once at least one other active player exists and this zone is (tied for) the fewest kills — see LAST_PLACE_GRADE_BOOST. */
  private isLastPlace(zone: Zone): boolean {
    const active = ZONE_LABELS.map((l) => this.zones.get(l)!).filter((z) => z.id !== '');
    if (active.length < 2) return false;
    const minKills = Math.min(...active.map((z) => z.kills));
    return zone.kills === minKills;
  }

  private doDraw(zone: Zone): void {
    const cost = drawCost(this.wave);
    if (zone.gold < cost) {
      this.setMessage(zone, '골드가 부족합니다.');
      return;
    }
    const streak = this.pityStreaks.get(zone.label) ?? 0;
    const grade = rollGradeWithPity(streak, this.isLastPlace(zone) ? LAST_PLACE_GRADE_BOOST : 1);
    const arche = rollArchetype();
    const job = rollJobName(arche);
    if (!this.placeDraw(zone, grade, arche, job)) {
      this.setMessage(zone, '자리가 없습니다 — 먼저 판매하세요.');
      return;
    }
    zone.gold -= cost;
    this.pityStreaks.set(zone.label, grade >= 2 ? 0 : streak + 1);
    this.setMessage(zone, `${GRADES[grade].name} · ${job} 획득!`);
    if (grade >= CELEBRATION_MIN_GRADE) {
      this.celebrations.push({
        id: this.nextCelebrationId++,
        zoneLabel: zone.label,
        grade,
        arche,
        life: CELEBRATION_LIFE_MS,
        maxLife: CELEBRATION_LIFE_MS
      });
    }
  }

  private doUpgrade(zone: Zone, stat: MainStat): void {
    const lvl = zone.upLevels[stat];
    if (lvl >= UPGRADE_MAX_LEVEL) {
      this.setMessage(zone, '이미 최대 레벨입니다.');
      return;
    }
    const cost = upgradeCost(lvl);
    if (zone.gold < cost) {
      this.setMessage(zone, `골드 부족 — ${cost}G 필요.`);
      return;
    }
    zone.gold -= cost;
    zone.upLevels[stat] = lvl + 1;
    this.setMessage(zone, `${MAIN_STAT_NAME[stat]} Lv.${lvl + 1} (다음 ${upgradeCost(lvl + 1)}G)`);
  }

  private doSellCombo(zone: Zone, arche: Archetype, maxGrade: number): void {
    let refund = 0;
    let sold = 0;
    for (let i = 0; i < zone.slots.length; i++) {
      const slot = zone.slots[i];
      if (!slot) continue;
      const keep = slot.members.filter((m) => !(m.arche === arche && m.grade <= maxGrade));
      const removed = slot.members.length - keep.length;
      if (removed === 0) continue;
      sold += removed;
      refund += removed * SELL_REFUND;
      zone.slots[i] = keep.length ? { members: keep } : null;
    }
    if (!sold) {
      this.setMessage(zone, '해당 조건의 유닛이 없습니다.');
      return;
    }
    zone.gold += refund;
    this.setMessage(zone, `${sold}마리 판매, +${refund}G`);
  }

  private processCommands(): void {
    for (const [id, input] of this.pendingInputs) {
      const zone = this.zoneByPeer(id);
      if (!zone) continue;
      for (const cmd of input.commands) {
        if (cmd.type === 'draw') this.doDraw(zone);
        else if (cmd.type === 'armUpgrade') {
          zone.armed = zone.armed === 'upgrade' ? null : 'upgrade';
          zone.pendingArche = null;
        } else if (cmd.type === 'armSell') {
          zone.armed = zone.armed === 'sell' ? null : 'sell';
          zone.pendingArche = null;
        } else if (cmd.type === 'cancel') {
          zone.armed = null;
          zone.pendingArche = null;
        } else if (cmd.type === 'pick') {
          if (zone.armed === 'upgrade' && cmd.index >= 1 && cmd.index <= MAIN_STATS.length) {
            this.doUpgrade(zone, MAIN_STATS[cmd.index - 1]);
          } else if (zone.armed === 'sell') {
            if (zone.pendingArche == null) {
              if (cmd.index >= 1 && cmd.index <= ARCHETYPES.length) {
                zone.pendingArche = ARCHETYPES[cmd.index - 1];
                this.setMessage(zone, '이제 등급(이하 전체)을 선택하세요.');
              }
            } else if (cmd.index >= 1 && cmd.index <= GRADES.length) {
              this.doSellCombo(zone, zone.pendingArche, cmd.index - 1);
              zone.pendingArche = null;
            }
          }
        }
      }
    }
    this.pendingInputs.clear();
  }

  // -------------------------------------------------------------------- api

  step(dtMs: number): void {
    this.processCommands();
    this.stepMessages(dtMs);
    this.stepShots(dtMs);
    this.stepCelebrations(dtMs);
    if (this.over) return;
    this.stepSpawning(dtMs);
    this.stepMonsters(dtMs);
    this.stepCombat(dtMs);
    this.stepStatusEffects(dtMs);
    this.checkLoss();
    this.stepWaveClock(dtMs);
  }

  snapshot(): MerandiWorld {
    return {
      wave: this.wave,
      waveTotal: TOTAL_WAVES,
      waveMsLeft: Math.max(0, this.waveMsLeft),
      waveIsBoss: isBossWave(this.wave),
      aliveMonsters: this.monsters.length,
      aliveThreshold: this.aliveThreshold(),
      monsters: this.monsters.map((m) => ({ ...m })),
      zones: ZONE_LABELS.map((l) => {
        const z = this.zones.get(l)!;
        return {
          ...z,
          upLevels: { ...z.upLevels },
          slots: z.slots.map((s) => (s ? { members: s.members.map((m) => ({ ...m })) } : null))
        };
      }),
      shots: this.shots.map((s) => ({ ...s })),
      celebrations: this.celebrations.map((c) => ({ ...c })),
      over: this.over,
      won: this.won
    };
  }
}
