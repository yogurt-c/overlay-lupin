/** Merandi's own in-match state shapes. Another game owns its own version of these. */

export type Archetype = 'warrior' | 'mage' | 'archer' | 'thief' | 'pirate';

/** Main stat, MapleStory-style — upgrades are keyed by these, not by archetype (see data.ts's ARCHETYPE_MAIN_STAT). */
export type MainStat = 'str' | 'int' | 'dex' | 'luk';

export type ZoneLabel = 'P1' | 'P2' | 'P3' | 'P4';

export type MonsterKind = 'normal' | 'speed' | 'tank' | 'boss';

/** MapleStory-style potential option types — see data.ts's POTENTIAL_OPTION_NAME/POTENTIAL_OPTION_VALUE. */
export type PotentialOptionType = 'str' | 'int' | 'dex' | 'luk' | 'range' | 'crit' | 'killGold' | 'sellRefund' | 'jackpot' | 'statConvert';

export interface PotentialLine {
  type: PotentialOptionType;
  /** Meaning depends on type — see data.ts's rollPotential/computeMemberMultiplier. For 'statConvert', this is the divisor N in "every N levels of fromStat grants 1 level of toStat" (smaller = stronger). */
  value: number;
  /** Only set when type === 'statConvert' — always fromStat !== toStat. */
  fromStat?: MainStat;
  toStat?: MainStat;
}

/**
 * A unit's potential — separate from its grade (dmgMult/rangeMult/etc.) and completely independent of
 * upgrades. Every unit starts at 레어 (grade 0) with 3 rolled lines; rerolling (see engine.ts's
 * doRerollPotential) has a small, shrinking-per-tier chance to bump `grade` up one step
 * (레어→에픽→유니크→레전더리, capped at 3), and always re-rolls all 3 lines fresh at whatever grade results.
 */
export interface Potential {
  grade: number; // 0=레어 .. 3=레전더리 — an entirely separate scale from UnitMember.grade
  lines: PotentialLine[];
}

/** One individual placed unit — fights fully independently even when it shares a slot with others. */
export interface UnitMember {
  /** Stable identity across snapshots (each snapshot() clones members into fresh objects) — lets a click-to-inspect selection survive re-renders. */
  id: number;
  grade: number; // 0=노멀 .. 7=초월
  arche: Archetype;
  job: string; // flavor-only display name
  cooldownMs: number;
  potential: Potential;
}

/** One occupied slot in a zone's 6x6 grid — up to 3 members, any mix of grade/archetype (a slot is just a shared tile, not a "must match" stack). */
export interface UnitStack {
  members: UnitMember[];
}

export interface UpgradeLevels {
  str: number;
  int: number;
  dex: number;
  luk: number;
}

export interface Zone {
  id: string; // peer id owning this corner, '' if unclaimed
  label: ZoneLabel;
  name: string;
  gold: number;
  /** Total monster kills this zone has scored — shown as a per-player scoreboard, see draw.ts's drawKillBoard. */
  kills: number;
  upLevels: UpgradeLevels;
  /** 36 slots (6x6 grid), index-addressed; null = empty. */
  slots: (UnitStack | null)[];
  /** UI-only bookkeeping for the sell/upgrade two-step picker — see engine.ts. */
  armed: 'upgrade' | 'sell' | null;
  pendingArche: Archetype | null;
  lastMessage: string;
  /**
   * The most recent doRerollPotential() result, riding the same TTL as lastMessage (cleared together in
   * stepMessages) — carried on the fast quick-stream so a member sees their own reroll's new potential
   * right away instead of waiting for the next full heavy-stream (unit data) reassembly, which can lag
   * seconds behind at high entity counts. draw.ts's inspect panel prefers this over the live
   * member.potential whenever the ids match and this is still fresh.
   */
  lastRerollMemberId?: number;
  lastRerollPotential?: Potential;
}

export interface Monster {
  id: number;
  t: number; // 0..1 position around the loop perimeter
  hp: number;
  maxHp: number;
  kind: MonsterKind;
  speed: number; // perimeter fraction per ms
  /**
   * 레전더리+ archetype special-effect state (see data.ts's SPECIAL_EFFECT_MIN_GRADE and engine.ts's
   * stepStatusEffects) — all optional/absent on a fresh monster, only ever set once something with the
   * matching grade actually lands a hit. Every field is a plain countdown the host ticks down each
   * frame; a member never predicts these locally, it just renders whatever the snapshot says.
   */
  staggerMsLeft?: number; // 전사: frozen in place while > 0 (stepMonsters skips advancing t)
  vulnerableMsLeft?: number; // 전사: all incoming damage (direct hits and dotDamagePerSec ticks alike) multiplied by vulnerableFactor while > 0
  vulnerableFactor?: number;
  dotMsLeft?: number; // 도적: ticks dotDamagePerSec worth of damage per second while > 0
  dotDamagePerSec?: number;
  dotZoneLabel?: ZoneLabel; // whichever zone's thief applied the current dot — credited for any kill it lands
}

/**
 * A purely cosmetic projectile: combat still resolves instantly the moment a
 * unit fires (see MerandiEngine.stepCombat), this just animates a dot flying
 * from the shooter to where the target was at that instant, so the hit reads
 * as a shot instead of silent damage.
 */
export interface Shot {
  x: number;
  y: number;
  tx: number;
  ty: number;
  life: number;
  maxLife: number;
  grade: number;
  /** 레전더리+ 마법사's splash hit — draw.ts rings the impact point at splashRadiusForGrade(grade) once the shot lands. Absent for every other shot. */
  splash?: boolean;
}

/**
 * A map-wide celebration triggered by drawing 레전더리(grade 5)+ — see data.ts's CELEBRATION_MIN_GRADE,
 * engine.ts's doDraw/stepCelebrations, and draw.ts's drawCelebrations. Travels over the wire as a quick
 * atom (wire.ts) rather than a heavy one, same as zone gold/menus, so it never waits behind a heavy
 * chunk's up-to-~800ms reassembly — a 2-second spectacle arriving late would barely read as one.
 * `life` counts down from `maxLife` just like Shot; draw.ts derives elapsed as `maxLife - life`, so every
 * viewer's burst/particle physics are a pure function of this one server-authoritative number — nobody's
 * fireworks can drift out of sync with anyone else's.
 */
export interface Celebration {
  id: number;
  zoneLabel: ZoneLabel;
  grade: number;
  arche: Archetype;
  life: number;
  maxLife: number;
}

/** The host's authoritative simulation, broadcast to every member each tick. */
export interface MerandiWorld {
  wave: number;
  waveTotal: number;
  waveMsLeft: number;
  waveIsBoss: boolean;
  aliveMonsters: number;
  aliveThreshold: number;
  monsters: Monster[];
  zones: Zone[];
  shots: Shot[];
  celebrations: Celebration[];
  over: boolean;
  won: boolean;
}

/** One-shot commands a player can issue in a tick — an edge-triggered queue, not held state. */
export type MerandiCommand =
  | { type: 'draw' }
  | { type: 'armUpgrade' }
  | { type: 'armSell' }
  | { type: 'cancel' }
  | { type: 'pick'; index: number } // upgrade: 1..4 (stat) · sell: 1..5 (archetype) then 1..8 (grade)
  | { type: 'rerollPotential'; memberId: number }; // memberId is -1 as queued by input.ts — module.ts's step() fills in the real id from the current selection (or drops the command if nothing's selected) before it ever reaches the network

export interface MerandiInput {
  commands: MerandiCommand[];
}

/** What a member sends the host each tick — just their own intent, plus enough to lazily join them. */
export interface MerandiMemberPacket {
  name: string;
  input: MerandiInput;
}

export interface MerandiMemberPacketTagged extends MerandiMemberPacket {
  from: string;
}

/**
 * Click-to-inspect selection — purely a local UI concern (never sent over the network, never touches
 * the engine), tracked client-side in module.ts by id and re-resolved against the latest snapshot each
 * render (see draw.ts's drawInspectPanel), since a fresh MerandiWorld clones every object each tick.
 */
export type Selection = { kind: 'monster'; monsterId: number } | { kind: 'unit'; zoneLabel: ZoneLabel; memberId: number };
