/** Merandi's own in-match state shapes. Another game owns its own version of these. */

export type Archetype = 'warrior' | 'mage' | 'archer' | 'thief' | 'pirate';

/** Main stat, MapleStory-style — upgrades are keyed by these, not by archetype (see data.ts's ARCHETYPE_MAIN_STAT). */
export type MainStat = 'str' | 'int' | 'dex' | 'luk';

export type ZoneLabel = 'P1' | 'P2' | 'P3' | 'P4';

export type MonsterKind = 'normal' | 'speed' | 'tank' | 'boss';

/** One individual placed unit — fights fully independently even when it shares a slot with others. */
export interface UnitMember {
  /** Stable identity across snapshots (each snapshot() clones members into fresh objects) — lets a click-to-inspect selection survive re-renders. */
  id: number;
  grade: number; // 0=노멀 .. 7=초월
  arche: Archetype;
  job: string; // flavor-only display name
  cooldownMs: number;
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
  upLevels: UpgradeLevels;
  /** 36 slots (6x6 grid), index-addressed; null = empty. */
  slots: (UnitStack | null)[];
  /** UI-only bookkeeping for the sell/upgrade two-step picker — see engine.ts. */
  armed: 'upgrade' | 'sell' | null;
  pendingArche: Archetype | null;
  lastMessage: string;
}

export interface Monster {
  id: number;
  t: number; // 0..1 position around the loop perimeter
  hp: number;
  maxHp: number;
  kind: MonsterKind;
  speed: number; // perimeter fraction per ms
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
  over: boolean;
  won: boolean;
}

/** One-shot commands a player can issue in a tick — an edge-triggered queue, not held state. */
export type MerandiCommand =
  | { type: 'draw' }
  | { type: 'armUpgrade' }
  | { type: 'armSell' }
  | { type: 'cancel' }
  | { type: 'pick'; index: number }; // upgrade: 1..4 (stat) · sell: 1..5 (archetype) then 1..8 (grade)

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
