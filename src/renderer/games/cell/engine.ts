import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  BIG_FOOD_MASS,
  BIG_FOOD_MAX_COUNT,
  BIG_FOOD_SPAWN_INTERVAL_MS,
  EAT_RATIO,
  FOOD_COUNT,
  FOOD_MASS,
  MAX_CELLS_PER_PLAYER,
  MERGE_COOLDOWN_MS,
  MIN_CELL_MASS,
  RESPAWN_MS,
  SPLIT_LAUNCH_DRAG,
  SPLIT_LAUNCH_SPEED,
  SPLIT_LAUNCH_TICKS,
  SPLIT_MIN_MASS,
  START_MASS,
  TARGET_POPULATION,
  VIRUS_COUNT,
  VIRUS_LAUNCH_SPEED,
  VIRUS_POP_MASS,
  VIRUS_POP_PIECES,
  VIRUS_RADIUS,
  radiusFor
} from './arena.js';
import { computeBotInput, randomBotName } from './bot.js';
import type { CellInput, CellWorld, FoodDot, VirusDot } from './types.js';

const MOVE_ACCEL = 0.6;
const DRAG = 0.86;
const BASE_MAX_SPEED = 2.6;
/**
 * Gentle homing accel applied to a player's non-main cells, once their split/pop launch has settled, closing
 * the gap back to the player's biggest cell. The pieces are already carried along with the main blob (see
 * `stepPlayerMovement`), so this only has to reel in the distance the launch opened up.
 */
const REJOIN_PULL_ACCEL = 0.3;
/** Applied only to mass above `MIN_CELL_MASS`, so no blob ever idles its way down to nothing. */
const MASS_DECAY = 0.9998;

interface EngineCell {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  /** Earliest time this blob is allowed to remerge with a sibling from the same player. */
  mergeAt: number;
  /** Ticks of post-split/pop momentum remaining — see `stepCellMovement`. */
  launchTicksLeft: number;
}

interface EnginePlayer {
  id: string;
  name: string;
  cells: EngineCell[];
  /** false once every cell has been eaten, until the respawn delay elapses. */
  alive: boolean;
  input: CellInput;
  respawnAt: number;
  /** Piloted by `computeBotInput` each tick instead of a network packet. Never splits on its own. */
  isBot?: boolean;
  /** Last tick's `input.split`, so a held key fires once instead of every tick. */
  splitHeld: boolean;
}

const NO_INPUT: CellInput = { up: false, down: false, left: false, right: false, split: false };

function randomSpot(): { x: number; y: number } {
  return { x: Math.random() * ARENA_WIDTH, y: Math.random() * ARENA_HEIGHT };
}

function newCell(x: number, y: number, mass: number): EngineCell {
  return {
    id: `c${Math.random().toString(36).slice(2, 9)}`,
    x,
    y,
    vx: 0,
    vy: 0,
    mass,
    mergeAt: 0,
    launchTicksLeft: 0
  };
}

/** A player's main blob: the biggest one. It's the only cell that steers, and the one the rest trail behind. */
function mainCellOf(p: EnginePlayer): EngineCell {
  return p.cells.reduce((biggest, c) => (c.mass > biggest.mass ? c : biggest), p.cells[0]);
}

/** The player's current input direction, or — failing that — a cell's own heading, for aiming a split/pop launch. */
function facingDirection(input: CellInput, cell: EngineCell): { x: number; y: number } {
  const ax = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  const ay = (input.up ? -1 : 0) + (input.down ? 1 : 0);
  if (ax !== 0 || ay !== 0) {
    const len = Math.hypot(ax, ay);
    return { x: ax / len, y: ay / len };
  }
  const speed = Math.hypot(cell.vx, cell.vy);
  if (speed > 0.01) return { x: cell.vx / speed, y: cell.vy / speed };
  return { x: 1, y: 0 };
}

/**
 * The host-only authoritative simulation for one cell-growing match. Members
 * never run this themselves — they just render whatever snapshot arrives.
 */
export class CellEngine {
  players = new Map<string, EnginePlayer>();
  food: FoodDot[] = [];
  viruses: VirusDot[] = [];
  private nextBigFoodAt: number;
  private nextBotSeq = 1;

  constructor() {
    for (let i = 0; i < FOOD_COUNT; i++) this.food.push(randomSpot());
    this.nextBigFoodAt = Date.now() + BIG_FOOD_SPAWN_INTERVAL_MS;
    this.spawnViruses();
  }

  /** A loose grid across the arena, jittered so the hazards read as scattered rather than a visible lattice. */
  private spawnViruses(): void {
    const cols = 4;
    const rows = Math.ceil(VIRUS_COUNT / cols);
    const cellW = ARENA_WIDTH / cols;
    const cellH = ARENA_HEIGHT / rows;
    let seq = 0;
    for (let row = 0; row < rows && seq < VIRUS_COUNT; row++) {
      for (let col = 0; col < cols && seq < VIRUS_COUNT; col++) {
        const x = cellW * (col + 0.5) + (Math.random() - 0.5) * cellW * 0.5;
        const y = cellH * (row + 0.5) + (Math.random() - 0.5) * cellH * 0.5;
        this.viruses.push({ id: `virus-${seq++}`, x, y });
      }
    }
  }

  /** Lazily creates a player the first time we hear from them — a mid-session joiner needs no separate path. */
  ensurePlayer(id: string, name: string): void {
    let p = this.players.get(id);
    if (!p) {
      const spot = randomSpot();
      p = { id, name, cells: [newCell(spot.x, spot.y, START_MASS)], alive: true, input: NO_INPUT, respawnAt: 0, splitHeld: false };
      this.players.set(id, p);
    }
    p.name = name;
  }

  setInput(id: string, input: CellInput): void {
    const p = this.players.get(id);
    if (p) p.input = input;
  }

  removePlayer(id: string): void {
    this.players.delete(id);
  }

  /**
   * Tops the room up with bots until `TARGET_POPULATION` cells are alive. It
   * only ever adds — a bot that's already alive is never pulled out from
   * under a player just because more humans joined; the population target
   * is only re-checked once that bot actually dies (see `step`). A match
   * opts into this explicitly (see `CellMatch`) — plain `step()` never
   * spawns one on its own, so a bare `new CellEngine()` used in isolation
   * (tests) stays exactly as deterministic as before.
   */
  syncBotPopulation(): void {
    const bots = Array.from(this.players.values()).filter((p) => p.isBot);
    const humanCount = this.players.size - bots.length;
    const target = Math.max(0, TARGET_POPULATION - humanCount);
    for (let i = bots.length; i < target; i++) this.spawnBot();
  }

  private spawnBot(): void {
    const id = `bot-${this.nextBotSeq++}`;
    this.ensurePlayer(id, randomBotName());
    this.players.get(id)!.isBot = true;
  }

  /** Bots always aim themselves off their single biggest blob — good enough even right after a virus pop. */
  private botInputFor(p: EnginePlayer): CellInput {
    const self = p.cells.reduce((biggest, c) => (c.mass > biggest.mass ? c : biggest), p.cells[0]);
    const neighbors: { x: number; y: number; mass: number }[] = [];
    for (const other of this.players.values()) {
      if (other === p || !other.alive) continue;
      for (const c of other.cells) neighbors.push({ x: c.x, y: c.y, mass: c.mass });
    }
    return computeBotInput(self, neighbors, this.food);
  }

  /** True if bringing this dead bot back wouldn't push the room over `TARGET_POPULATION` for its current human count. */
  private hasRoomToRespawn(bot: EnginePlayer): boolean {
    let humanCount = 0;
    let otherBotCount = 0;
    for (const p of this.players.values()) {
      if (p.id === bot.id) continue;
      if (p.isBot) otherBotCount++;
      else humanCount++;
    }
    return otherBotCount < Math.max(0, TARGET_POPULATION - humanCount);
  }

  /** Advances the simulation by exactly one tick. */
  step(): void {
    const now = Date.now();
    for (const p of this.players.values()) {
      if (!p.alive) {
        if (now < p.respawnAt) continue;
        // Population is only re-checked at the moment a bot would come back — never by yanking a live one out.
        if (p.isBot && !this.hasRoomToRespawn(p)) this.players.delete(p.id);
        else this.respawn(p);
        continue;
      }
      if (p.isBot) p.input = this.botInputFor(p);
      else this.handleSplit(p, now);
      this.stepPlayerMovement(p);
      this.stepMerge(p, now);
      this.stepSeparation(p);
    }
    this.stepEating();
    this.stepFood();
    this.stepVirusPop(now);
    this.stepFoodSpawn(now);
  }

  private respawn(p: EnginePlayer): void {
    const spot = randomSpot();
    p.cells = [newCell(spot.x, spot.y, START_MASS)];
    p.alive = true;
  }

  /** Splits every eligible cell in half on the rising edge of `input.split` — held space doesn't fire every tick. */
  private handleSplit(p: EnginePlayer, now: number): void {
    const wantsSplit = p.input.split && !p.splitHeld;
    p.splitHeld = p.input.split;
    if (!wantsSplit) return;

    let slots = MAX_CELLS_PER_PLAYER - p.cells.length;
    if (slots <= 0) return;

    const candidates = [...p.cells].sort((a, b) => b.mass - a.mass);
    const spawned: EngineCell[] = [];
    for (const cell of candidates) {
      if (slots <= 0) break;
      if (cell.mass < SPLIT_MIN_MASS) continue;
      const dir = facingDirection(p.input, cell);
      const half = cell.mass / 2;
      cell.mass = half;
      cell.mergeAt = now + MERGE_COOLDOWN_MS;
      const twin = newCell(cell.x, cell.y, half);
      twin.vx = dir.x * SPLIT_LAUNCH_SPEED;
      twin.vy = dir.y * SPLIT_LAUNCH_SPEED;
      twin.mergeAt = now + MERGE_COOLDOWN_MS;
      twin.launchTicksLeft = SPLIT_LAUNCH_TICKS;
      spawned.push(twin);
      slots--;
    }
    p.cells.push(...spawned);
  }

  /**
   * Moves one player's blobs for the tick. Only the main blob steers: every settled piece is carried along by
   * exactly the main blob's own displacement and then nudged back toward it, so a split reads as one body with
   * bits stuck to it rather than several cells marching in parallel — and no piece can ever be left behind by
   * the main blob's speed. A piece still riding its launch momentum owns itself until that runs out.
   */
  private stepPlayerMovement(p: EnginePlayer): void {
    const main = mainCellOf(p);
    const fromX = main.x;
    const fromY = main.y;
    this.stepCellMovement(p.input, main);
    this.decay(main);
    const carryX = main.x - fromX;
    const carryY = main.y - fromY;

    for (const cell of p.cells) {
      if (cell === main) continue;
      if (cell.launchTicksLeft <= 0) {
        cell.x += carryX;
        cell.y += carryY;
        this.pullTowardMain(cell, main);
      }
      this.stepCellMovement(NO_INPUT, cell);
      this.decay(cell);
    }
  }

  /**
   * A gentle nudge toward the main blob, closing whatever gap a split's launch opened up. Once the piece is
   * home it stops pulling and drops whatever inward speed it arrived with, so it rests against the main blob
   * instead of grinding into it against `stepSeparation` every tick.
   */
  private pullTowardMain(cell: EngineCell, main: EngineCell): void {
    const dx = main.x - cell.x;
    const dy = main.y - cell.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;
    const nx = dx / dist;
    const ny = dy / dist;

    if (dist > radiusFor(cell.mass) + radiusFor(main.mass)) {
      cell.vx += nx * REJOIN_PULL_ACCEL;
      cell.vy += ny * REJOIN_PULL_ACCEL;
      return;
    }
    const inward = cell.vx * nx + cell.vy * ny;
    if (inward <= 0) return;
    cell.vx -= nx * inward;
    cell.vy -= ny * inward;
  }

  private stepCellMovement(input: CellInput, cell: EngineCell): void {
    const ax = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    const ay = (input.up ? -1 : 0) + (input.down ? 1 : 0);
    const launching = cell.launchTicksLeft > 0;

    if (ax !== 0 || ay !== 0) {
      const len = Math.hypot(ax, ay);
      cell.vx += (ax / len) * MOVE_ACCEL;
      cell.vy += (ay / len) * MOVE_ACCEL;
    } else if (!launching) {
      cell.vx *= DRAG;
      cell.vy *= DRAG;
    }
    if (launching) {
      cell.vx *= SPLIT_LAUNCH_DRAG;
      cell.vy *= SPLIT_LAUNCH_DRAG;
      cell.launchTicksLeft--;
    }

    const maxSpeed = BASE_MAX_SPEED * Math.sqrt(START_MASS / cell.mass);
    // While launching, momentum is allowed past the usual mass-based cap — that's the whole point of firing forward.
    const speedCap = launching ? Math.max(maxSpeed, SPLIT_LAUNCH_SPEED) : maxSpeed;
    const speed = Math.hypot(cell.vx, cell.vy);
    if (speed > speedCap) {
      cell.vx = (cell.vx / speed) * speedCap;
      cell.vy = (cell.vy / speed) * speedCap;
    }

    const r = radiusFor(cell.mass);
    cell.x = Math.max(r, Math.min(ARENA_WIDTH - r, cell.x + cell.vx));
    cell.y = Math.max(r, Math.min(ARENA_HEIGHT - r, cell.y + cell.vy));
  }

  private decay(cell: EngineCell): void {
    if (cell.mass <= MIN_CELL_MASS) return;
    cell.mass = MIN_CELL_MASS + (cell.mass - MIN_CELL_MASS) * MASS_DECAY;
  }

  /**
   * Merges a player's own cells back together once they're touching, either because the post-split cooldown
   * has passed, or — regardless of the cooldown — because a pair never actually got away from each other in
   * the first place (still touching once both have cleared their launch window). The latter covers a split
   * that had nowhere to fly to (a wall, a corner) and would otherwise just sit stacked on its sibling,
   * looking frozen, for the rest of `MERGE_COOLDOWN_MS`.
   */
  private stepMerge(p: EnginePlayer, now: number): void {
    let mergedAny = true;
    while (mergedAny) {
      mergedAny = false;
      merge: for (let i = 0; i < p.cells.length; i++) {
        for (let j = i + 1; j < p.cells.length; j++) {
          const a = p.cells[i];
          const b = p.cells[j];
          if (now < a.mergeAt || now < b.mergeAt) continue;
          if (Math.hypot(a.x - b.x, a.y - b.y) > radiusFor(a.mass) + radiusFor(b.mass)) continue;

          const totalMass = a.mass + b.mass;
          a.x = (a.x * a.mass + b.x * b.mass) / totalMass;
          a.y = (a.y * a.mass + b.y * b.mass) / totalMass;
          a.vx = (a.vx * a.mass + b.vx * b.mass) / totalMass;
          a.vy = (a.vy * a.mass + b.vy * b.mass) / totalMass;
          a.mass = totalMass;
          p.cells.splice(j, 1);
          mergedAny = true;
          break merge;
        }
      }
    }
  }

  /**
   * Pushes any of a player's own cells that still overlap apart, edge to edge, after `stepMerge` has already
   * folded together whatever pairs are actually eligible to merge this tick. Without this, a pair sitting out
   * the rest of the merge cooldown (or a split still flying apart) just sits stacked on top of each other.
   * The main blob never gives way; between two pieces, the heavier one gives way less.
   */
  private stepSeparation(p: EnginePlayer): void {
    const main = mainCellOf(p);
    for (let i = 0; i < p.cells.length; i++) {
      for (let j = i + 1; j < p.cells.length; j++) {
        const a = p.cells[i];
        const b = p.cells[j];
        const minDist = radiusFor(a.mass) + radiusFor(b.mass);
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        if (dist >= minDist) continue;
        if (dist < 0.001) {
          // Perfectly coincident (e.g. the instant a split spawns) — nudge apart along an arbitrary axis.
          dx = 1;
          dy = 0;
          dist = 1;
        }
        const overlap = minDist - dist;
        const nx = dx / dist;
        const ny = dy / dist;
        // The main blob is an anchor: a piece pressed against it slides around it instead of shoving it, or
        // the player's steering would get nudged off course every tick by their own tail.
        const aShare = b === main ? 1 : a === main ? 0 : b.mass / (a.mass + b.mass);
        const bShare = 1 - aShare;
        a.x -= nx * overlap * aShare;
        a.y -= ny * overlap * aShare;
        b.x += nx * overlap * bShare;
        b.y += ny * overlap * bShare;
      }
    }
    for (const cell of p.cells) {
      const r = radiusFor(cell.mass);
      cell.x = Math.max(r, Math.min(ARENA_WIDTH - r, cell.x));
      cell.y = Math.max(r, Math.min(ARENA_HEIGHT - r, cell.y));
    }
  }

  /** Bigger absorbs smaller when they touch, above `EAT_RATIO` — a player's own cells never eat each other. */
  private stepEating(): void {
    const now = Date.now();
    const refs: { player: EnginePlayer; cell: EngineCell }[] = [];
    for (const player of this.players.values()) {
      if (!player.alive) continue;
      for (const cell of player.cells) refs.push({ player, cell });
    }

    const eaten = new Set<EngineCell>();
    for (const a of refs) {
      if (eaten.has(a.cell)) continue;
      for (const b of refs) {
        if (a.player === b.player || eaten.has(b.cell) || eaten.has(a.cell)) continue;
        if (a.cell.mass < b.cell.mass * EAT_RATIO) continue;
        if (Math.hypot(a.cell.x - b.cell.x, a.cell.y - b.cell.y) > radiusFor(a.cell.mass)) continue;
        a.cell.mass += b.cell.mass;
        eaten.add(b.cell);
      }
    }
    if (eaten.size === 0) return;

    for (const player of this.players.values()) {
      if (!player.cells.some((c) => eaten.has(c))) continue;
      player.cells = player.cells.filter((c) => !eaten.has(c));
      if (player.cells.length === 0) {
        player.alive = false;
        player.respawnAt = now + RESPAWN_MS;
      }
    }
  }

  private stepFood(): void {
    for (const player of this.players.values()) {
      if (!player.alive) continue;
      for (const cell of player.cells) {
        const r = radiusFor(cell.mass);
        for (let i = this.food.length - 1; i >= 0; i--) {
          const dot = this.food[i];
          if (Math.hypot(cell.x - dot.x, cell.y - dot.y) > r) continue;
          cell.mass += dot.big ? BIG_FOOD_MASS : FOOD_MASS;
          this.food.splice(i, 1);
          // Big food is a rare bonus on top of the ambient count — only regular food gets replaced.
          if (!dot.big) this.food.push(randomSpot());
        }
      }
    }
  }

  /** Any cell big enough that touches a virus bursts into several smaller pieces flung outward. The virus stays put. */
  private stepVirusPop(now: number): void {
    for (const player of this.players.values()) {
      if (!player.alive) continue;
      for (let i = player.cells.length - 1; i >= 0; i--) {
        const cell = player.cells[i];
        if (cell.mass < VIRUS_POP_MASS) continue;
        const r = radiusFor(cell.mass);
        const hit = this.viruses.some((v) => Math.hypot(v.x - cell.x, v.y - cell.y) <= r);
        if (hit) this.popCell(player, cell, now);
      }
    }
  }

  private popCell(player: EnginePlayer, cell: EngineCell, now: number): void {
    const idx = player.cells.indexOf(cell);
    if (idx === -1) return;
    // Slots left for the whole player once this cell is replaced by its pieces.
    const availableSlots = MAX_CELLS_PER_PLAYER - (player.cells.length - 1);
    if (availableSlots < 2) return; // no room to pop safely — the cell just sits on the virus harmlessly
    const pieceCount = Math.max(2, Math.min(VIRUS_POP_PIECES, availableSlots));

    player.cells.splice(idx, 1);
    const pieceMass = Math.max(MIN_CELL_MASS, cell.mass / pieceCount);
    for (let i = 0; i < pieceCount; i++) {
      const angle = (i / pieceCount) * Math.PI * 2 + Math.random() * 0.5;
      const piece = newCell(cell.x, cell.y, pieceMass);
      piece.vx = Math.cos(angle) * VIRUS_LAUNCH_SPEED;
      piece.vy = Math.sin(angle) * VIRUS_LAUNCH_SPEED;
      piece.mergeAt = now + MERGE_COOLDOWN_MS;
      piece.launchTicksLeft = SPLIT_LAUNCH_TICKS;
      player.cells.push(piece);
    }
  }

  /** Drops a big food pellet on a timer, capped so the arena never gets flooded with them. */
  private stepFoodSpawn(now: number): void {
    if (now < this.nextBigFoodAt) return;
    this.nextBigFoodAt = now + BIG_FOOD_SPAWN_INTERVAL_MS;
    const bigCount = this.food.reduce((n, f) => n + (f.big ? 1 : 0), 0);
    if (bigCount >= BIG_FOOD_MAX_COUNT) return;
    this.food.push({ ...randomSpot(), big: true });
  }

  snapshot(): CellWorld {
    const now = Date.now();
    return {
      players: Array.from(this.players.values()).map((p) => ({
        id: p.id,
        name: p.name,
        cells: p.cells.map((c) => ({
          id: c.id,
          x: Math.round(c.x * 10) / 10,
          y: Math.round(c.y * 10) / 10,
          mass: Math.round(c.mass * 10) / 10
        })),
        alive: p.alive,
        respawnInMs: p.alive ? undefined : Math.max(0, p.respawnAt - now)
      })),
      food: this.food.map((f) => (f.big ? { x: f.x, y: f.y, big: true } : { x: f.x, y: f.y })),
      viruses: this.viruses.map((v) => ({ id: v.id, x: v.x, y: v.y }))
    };
  }
}
