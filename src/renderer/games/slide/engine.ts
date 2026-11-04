import { PROMPT_DELAY, SIZE, WIN_EXP, tileValue } from './types.js';
import type { Dir, Ghost, MergeEvent, Phase, SlideInput, Tile } from './types.js';

/** One in ten new tiles is a 4, as in the classic. */
const FOUR_CHANCE = 0.1;

/**
 * Pure board logic: no DOM, no timers, seeded randomness — the tests drive it
 * tick by tick. Visual effects live in the match; this only reports what merged.
 */
export class SlideEngine {
  tick = 0;
  /** Ticks spent in 'play' — the clock freezes on result cards. */
  playTicks = 0;
  phase: Phase = 'play';
  score = 0;
  /** 0 or 1: which result-card button is highlighted (left one first). */
  choice = 0;
  /** Already past 2048 once — continuing must not ask again. */
  won = false;
  tiles: Tile[] = [];
  /** What the latest move consumed and created, for drawing and effects. */
  ghosts: Ghost[] = [];
  merges: MergeEvent[] = [];
  /** Tick of the latest move; 0 before the first. */
  moveTick = 0;
  /** Bumps on every move so observers can tell a new move from the same one. */
  moves = 0;
  /** Direction of the latest move, for the board's kick. */
  lastDir: Dir = 'left';
  /** Bumps on every fresh run (다시하기 included). */
  runs = 0;
  private nextId = 1;
  private rng: number;

  constructor(seed = (Math.random() * 0xffffffff) >>> 0) {
    this.rng = seed || 1;
    this.reset();
  }

  /** A fresh run on the same engine: empty board with two starting tiles. */
  reset(): void {
    this.tiles = []; this.ghosts = []; this.merges = [];
    this.phase = 'play'; this.score = 0; this.playTicks = 0; this.choice = 0; this.won = false;
    this.moveTick = this.tick;
    this.runs++;
    this.spawn(); this.spawn();
  }

  private random(): number {
    this.rng ^= this.rng << 13; this.rng ^= this.rng >>> 17; this.rng ^= this.rng << 5;
    return (this.rng >>> 0) / 4294967296;
  }

  private at(row: number, col: number): Tile | undefined {
    return this.tiles.find((t) => t.row === row && t.col === col);
  }

  private spawn(): void {
    const empty: [number, number][] = [];
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!this.at(r, c)) empty.push([r, c]);
    if (empty.length === 0) return;
    const [row, col] = empty[Math.floor(this.random() * empty.length)];
    const exp = this.random() < FOUR_CHANCE ? 2 : 1;
    this.tiles.push({ id: this.nextId++, exp, row, col, fromRow: row, fromCol: col, born: this.tick, merged: false });
  }

  /** Exposed for tests: rows of exponents, 0 for empty. */
  setBoard(rows: number[][]): void {
    this.tiles = [];
    rows.forEach((line, row) => line.forEach((exp, col) => {
      if (exp > 0) this.tiles.push({ id: this.nextId++, exp, row, col, fromRow: row, fromCol: col, born: this.tick, merged: false });
    }));
  }

  /** Exposed for tests: the board as rows of exponents. */
  board(): number[][] {
    const rows = Array.from({ length: SIZE }, () => new Array<number>(SIZE).fill(0));
    for (const t of this.tiles) rows[t.row][t.col] = t.exp;
    return rows;
  }

  get maxExp(): number { return this.tiles.reduce((m, t) => Math.max(m, t.exp), 0); }

  canMove(): boolean {
    if (this.tiles.length < SIZE * SIZE) return true;
    for (const t of this.tiles) {
      const right = this.at(t.row, t.col + 1), below = this.at(t.row + 1, t.col);
      if (right?.exp === t.exp || below?.exp === t.exp) return true;
    }
    return false;
  }

  /** Slides every tile toward `dir`; each tile merges at most once. Returns whether anything changed. */
  move(dir: Dir): boolean {
    for (const t of this.tiles) { t.fromRow = t.row; t.fromCol = t.col; t.merged = false; }
    const ghosts: Ghost[] = [], merges: MergeEvent[] = [];
    const next: Tile[] = [];
    let changed = false;

    for (let line = 0; line < SIZE; line++) {
      // Cells of this line, ordered from the wall the tiles slide toward.
      const cells: [number, number][] = [];
      for (let i = 0; i < SIZE; i++) {
        const k = dir === 'left' || dir === 'up' ? i : SIZE - 1 - i;
        cells.push(dir === 'left' || dir === 'right' ? [line, k] : [k, line]);
      }
      const placed: Tile[] = [];
      for (const [r, c] of cells) {
        const tile = this.at(r, c);
        if (!tile) continue;
        const last = placed[placed.length - 1];
        if (last && !last.merged && last.exp === tile.exp) {
          const [row, col] = cells[placed.length - 1];
          ghosts.push({ exp: last.exp, fromRow: last.fromRow, fromCol: last.fromCol, row, col });
          ghosts.push({ exp: tile.exp, fromRow: tile.fromRow, fromCol: tile.fromCol, row, col });
          const exp = tile.exp + 1, gain = tileValue(exp);
          placed[placed.length - 1] = { id: this.nextId++, exp, row, col, fromRow: row, fromCol: col, born: this.tick, merged: true };
          merges.push({ row, col, exp, gain });
          this.score += gain;
          changed = true;
        } else {
          placed.push(tile);
        }
      }
      placed.forEach((tile, i) => {
        const [row, col] = cells[i];
        if (tile.row !== row || tile.col !== col) changed = true;
        tile.row = row; tile.col = col;
        next.push(tile);
      });
    }

    if (!changed) return false;
    this.tiles = next;
    this.ghosts = ghosts;
    this.merges = merges;
    this.moveTick = this.tick;
    this.lastDir = dir;
    this.moves++;
    this.spawn();
    return true;
  }

  step(input: SlideInput): void {
    this.tick++;
    if (this.phase === 'ended') return;
    if (this.phase === 'play') {
      this.playTicks++;
      const dir: Dir | null = input.left ? 'left' : input.right ? 'right' : input.up ? 'up' : input.down ? 'down' : null;
      if (!dir || !this.move(dir)) return;
      if (!this.won && this.maxExp >= WIN_EXP) { this.won = true; this.phase = 'won'; this.choice = 0; }
      else if (!this.canMove()) { this.phase = 'over'; this.choice = 0; }
      return;
    }
    // A result card ignores keys until the merge that raised it has landed and the card is on screen.
    if (!this.promptReady) return;
    if (input.quit) { this.phase = 'ended'; return; }
    if (input.left) this.choice = 0;
    if (input.right) this.choice = 1;
    if (!input.confirm) return;
    if (this.choice === 1) this.phase = 'ended';
    else if (this.phase === 'won') this.phase = 'play';
    else this.reset();
  }

  get promptReady(): boolean { return this.tick - this.moveTick >= PROMPT_DELAY; }

  get isOver(): boolean { return this.phase === 'ended'; }
}
