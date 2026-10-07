/** Wire and simulation shapes for 뱀서. Phase 1 only needs the local ones. */

export interface SurvivorInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  /** Level-up card choices. Read as "pressed" rather than "held". */
  pick1: boolean;
  pick2: boolean;
  pick3: boolean;
  skip: boolean;
}

export const NO_INPUT: SurvivorInput = {
  left: false, right: false, up: false, down: false,
  pick1: false, pick2: false, pick3: false, skip: false
};

export interface PlayerView {
  id: string;
  name: string;
  x: number;
  y: number;
  hp: number;
  /** Ceiling after passives — the bar and the HUD both need it. */
  maxHp: number;
  /** -1 or 1 — which way the figure faces, and therefore which way the whip swings. */
  facing: 1 | -1;
  /** Ticks of invulnerability left; drives the blink while hurt. */
  invuln: number;
  alive: boolean;
}

/**
 * 0 박쥐 · 1 돌진형 · 3 사신 · 4 좀비 · 5 유령 · 6 분열체.
 *
 * A miniboss is not its own kind: it is one of the above with `ELITE` added,
 * drawn at boss scale. That way every type that joins the roster can show up
 * as the next elite, the way the original grows its bosses out of its swarm.
 */
export type EnemyKind = number;

/** Added to a kind to mark the elite (miniboss) version of it. */
export const ELITE = 8;
export const isElite = (kind: EnemyKind): boolean => kind >= ELITE;
export const baseKind = (kind: EnemyKind): EnemyKind => (kind >= ELITE ? kind - ELITE : kind);

export interface EnemyView {
  id: number;
  x: number;
  y: number;
  hp: number;
  /** Ticks left on the white flash after taking a hit. */
  flash: number;
  kind: EnemyKind;
}

export interface GemView {
  id: number;
  x: number;
  y: number;
  /** 1 | 5 | 25 — blue, green, red. */
  worth: number;
}

/** A swing, bolt or other instant hit on screen, kept only for drawing. */
export interface StrikeView {
  x: number;
  y: number;
  radius: number;
  facing: 1 | -1;
  age: number;
  life: number;
  /** 'arc' for a whip swing, 'bolt' for lightning, 'aura' for the garlic ring. */
  kind: 'arc' | 'bolt' | 'aura';
}

/** A thing in flight: knife, axe, wand shot, or an orbiting book. */
export interface ProjectileView {
  x: number;
  y: number;
  radius: number;
  /** Rotation for drawing, in radians. */
  spin: number;
  kind: 'homing' | 'shot' | 'lob' | 'orbit';
}

/** A patch of ground that keeps hurting — holy water and its evolution. */
export interface PoolView {
  x: number;
  y: number;
  radius: number;
  age: number;
  life: number;
}

/** Dropped by a miniboss. Walking over it evolves a weapon, or hands out levels. */
export interface ChestView {
  x: number;
  y: number;
}

/** A field pickup. 0 is the chicken; the magnet and the bomb will join it here. */
export interface ItemView {
  x: number;
  y: number;
  kind: 0;
}

/** One level-up offer. `weapon` is the id in WEAPONS; `level` is what it becomes. */
export interface CardOffer {
  weapon: string;
  level: number;
  label: string;
  detail: string;
}

export type Phase = 'run' | 'levelup' | 'over';

export interface SurvivorWorld {
  seed: number;
  tick: number;
  phase: Phase;
  players: PlayerView[];
  enemies: EnemyView[];
  gems: GemView[];
  strikes: StrikeView[];
  shots: ProjectileView[];
  pools: PoolView[];
  chests: ChestView[];
  items: ItemView[];
  /** Shared across the room: one bar, one level, one pause. */
  xp: number;
  level: number;
  kills: number;
  /** Only set while `phase === 'levelup'`. */
  offers: CardOffer[];
  /** Ids still owing a card choice, so the UI can say who everyone is waiting on. */
  pendingIds: string[];
  /** What each player already took this level-up: card index, or -1 for a skip. */
  picks: [id: string, index: number][];
  /** Set for the tick a chest evolves something, so the HUD can announce it. */
  evolved: string | null;
  /** True once the reaper is on the field. */
  reaper: boolean;
  /** Ticks until the first card is taken automatically; -1 means "wait forever" (solo). */
  pickDeadline: number;
  survived: boolean;
}
