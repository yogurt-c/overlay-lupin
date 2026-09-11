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
  MAIN_STATS,
  MAIN_STAT_NAME,
  MONSTERS_PER_WAVE_PER_PLAYER,
  BOSS_SPAWN_DELAY_MS,
  BOSS_WAVE_MS,
  DRAW_COST_BASE,
  drawCost,
  GRADES,
  HP_GROWTH_PER_WAVE,
  MONSTER_KINDS,
  NORMAL_WAVE_MS,
  SELL_REFUND,
  SLOT_COUNT,
  SPAWN_WINDOW_MS,
  STACK_MAX,
  TOTAL_WAVES,
  UPGRADE_MAX_LEVEL,
  computeMemberDamage,
  isBossWave,
  rollArchetype,
  rollGrade,
  rollJobName,
  upgradeCost
} from './data.js';
import { ZONE_LABELS, perimeterPoint, slotDepth, slotPosition, squareLoopPoints } from './field.js';
import type { Archetype, MainStat, Monster, MonsterKind, MerandiInput, MerandiWorld, Shot, UnitMember, UnitStack, Zone, ZoneLabel } from './types.js';

const PATH_PTS = squareLoopPoints(260, 24);
const LOOP_MS = 9000; // one full lap at normal speed
const BASE_MONSTER_HP = 23;
const BASE_RANGE_PX = 60;
const BASE_COOLDOWN_MS = 650;
/** How long a cosmetic shot stays on screen before fading out. */
const SHOT_LIFE_MS = 220;
/** How long a one-shot feedback message ("골드가 부족합니다" etc.) stays on screen before clearing itself. */
const MESSAGE_TTL_MS = 2200;

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
  private messageMsLeft = new Map<ZoneLabel, number>();

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
    if (z) this.zones.set(z.label, freshZone(z.label));
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
    const tickets: SpawnTicket[] = [];
    for (let i = 0; i < count; i++) {
      tickets.push({ atMs: Math.round(i * gap), kind: monsterKindFor(wave, false) });
    }
    if (boss) tickets.push({ atMs: Math.round(count * gap) + BOSS_SPAWN_DELAY_MS, kind: 'boss' });
    tickets.sort((a, b) => a.atMs - b.atMs);
    this.spawnQueue = tickets;
  }

  private spawnMonster(kind: MonsterKind): void {
    const activeLabels = ZONE_LABELS.filter((l) => this.zones.get(l)!.id !== '');
    if (!activeLabels.length) return; // no one to defend against yet — hold off spawning
    const label = activeLabels[Math.floor(Math.random() * activeLabels.length)];
    const cornerT = ZONE_LABELS.indexOf(label) / 4;
    const spec = MONSTER_KINDS[kind];
    const hp = Math.round(BASE_MONSTER_HP * spec.hpMult * Math.pow(HP_GROWTH_PER_WAVE, this.wave - 1));
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
    for (const m of this.monsters) m.t += m.speed * dtMs;
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
          const range = BASE_RANGE_PX * grade.rangeMult;

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
          member.cooldownMs = cooldown;

          const targetPosAtFire = perimeterPoint(PATH_PTS, target.t);
          this.shots.push({
            x: pos[0],
            y: pos[1],
            tx: targetPosAtFire[0],
            ty: targetPosAtFire[1],
            life: SHOT_LIFE_MS,
            maxLife: SHOT_LIFE_MS,
            grade: member.grade
          });

          target.hp -= dmg;
          if (target.hp <= 0) {
            // +1 every 20 waves (not 10) — monster count already grows every wave, so stacking a faster
            // per-kill escalation on top of that was compounding into a gold snowball by the early-mid game.
            zone.gold += 2 + Math.floor(this.wave / 20);
            zone.kills++;
            this.monsters = this.monsters.filter((m) => m !== target);
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

  private slotReach(index: number, grade: (typeof GRADES)[number]): boolean {
    // slotDepth 0 (corner) .. 1 (center); range scales the same way the design's grade table intends —
    // a low grade can only sit near the corner, a high grade can sit anywhere in the zone.
    return slotDepth(index) <= (grade.rangeMult - 1) / (GRADES[GRADES.length - 1].rangeMult - 1) + 0.18;
  }

  /**
   * A slot is just a shared tile for up to STACK_MAX independent units — it never requires them to
   * match grade or archetype. So placement only ever fails once the whole 36-slot grid is truly full
   * at capacity (36 * STACK_MAX units), never because "this exact combo has nowhere to go."
   */
  private placeDraw(zone: Zone, grade: number, arche: Archetype, job: string): boolean {
    const spec = GRADES[grade];
    const member: UnitMember = { id: this.nextMemberId++, grade, arche, job, cooldownMs: 0 };

    // 1) Prefer the deepest slot with room that this grade's range comfortably reaches — keeps the "낮은 등급은 앞줄" flavor.
    let best = -1;
    let bestDepth = -1;
    for (let i = 0; i < zone.slots.length; i++) {
      const s = zone.slots[i];
      if (s && s.members.length >= STACK_MAX) continue;
      if (!this.slotReach(i, spec)) continue;
      const d = slotDepth(i);
      if (d > bestDepth) {
        bestDepth = d;
        best = i;
      }
    }
    // 2) Nothing in the ideal reach band has room — fall back to ANY slot with room at all, empty or not.
    if (best === -1) {
      for (let i = 0; i < zone.slots.length; i++) {
        const s = zone.slots[i];
        if (!s || s.members.length < STACK_MAX) {
          best = i;
          break;
        }
      }
    }
    if (best === -1) return false; // every slot is at the 3-member cap — the zone is genuinely full (108 units)

    const slot = zone.slots[best];
    if (slot) slot.members.push(member);
    else zone.slots[best] = { members: [member] };
    return true;
  }

  private doDraw(zone: Zone): void {
    const cost = drawCost(this.wave);
    if (zone.gold < cost) {
      this.setMessage(zone, '골드가 부족합니다.');
      return;
    }
    const grade = rollGrade();
    const arche = rollArchetype();
    const job = rollJobName(arche);
    if (!this.placeDraw(zone, grade, arche, job)) {
      this.setMessage(zone, '자리가 없습니다 — 먼저 판매하세요.');
      return;
    }
    zone.gold -= cost;
    this.setMessage(zone, `${GRADES[grade].name} · ${job} 획득!`);
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
    if (this.over) return;
    this.stepSpawning(dtMs);
    this.stepMonsters(dtMs);
    this.stepCombat(dtMs);
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
      over: this.over,
      won: this.won
    };
  }
}
