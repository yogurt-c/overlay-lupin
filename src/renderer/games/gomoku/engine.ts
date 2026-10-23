import { CELLS, SIZE, stoneFor, turnStone } from './types.js';
import type { Command, Side, Stone, World } from './types.js';
export const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]] as const;
export function winningLine(board: readonly number[], cell: number): number[] {
  const stone = board[cell];
  if (!stone) return [];
  const x = cell % SIZE, y = Math.floor(cell / SIZE);
  for (const [dx, dy] of DIRECTIONS) {
    const line = [cell];
    for (const sign of [-1, 1]) {
      for (let n = 1; n < SIZE; n++) {
        const xx = x + dx * n * sign, yy = y + dy * n * sign;
        if (xx < 0 || xx >= SIZE || yy < 0 || yy >= SIZE || board[yy * SIZE + xx] !== stone) break;
        if (sign < 0) line.unshift(yy * SIZE + xx); else line.push(yy * SIZE + xx);
      }
    }
    if (line.length >= 5) return line;
  }
  return [];
}
export class GomokuEngine {
  world: World;
  private history: number[] = [];
  constructor(id = 'solo', black: Side = Math.random() < 0.5 ? 0 : 1) {
    this.world = { id, round: 1, revision: 0, board: Array(CELLS).fill(0), black, turn: 0, last: -1,
      result: 0, reason: '', line: [], ready: [false, false], ack: [0, 0] };
  }
  place(side: Side, cell: number): boolean {
    const w = this.world;
    if (w.result || stoneFor(w, side) !== turnStone(w) || !Number.isInteger(cell) || cell < 0 || cell >= CELLS || w.board[cell]) return false;
    const stone = turnStone(w);
    w.board[cell] = stone;
    this.history.push(cell);
    w.last = cell; w.turn++; w.revision++;
    w.line = winningLine(w.board, cell);
    if (w.line.length) { w.result = stone; w.reason = 'line'; }
    else if (w.turn === CELLS) { w.result = 3; w.reason = 'draw'; }
    return true;
  }
  command(side: Side, c: Command): void {
    const w = this.world;
    if (c.id !== w.id || c.round !== w.round || c.seq <= w.ack[side]) return;
    // Even rejected commands are acknowledged so the client never waits forever.
    w.ack[side] = c.seq; w.revision++;
    if (c.kind === 'place' && c.turn === w.turn) this.place(side, c.cell);
    if (c.kind === 'resign' && !w.result) {
      w.result = (3 - stoneFor(w, side)) as Stone; w.reason = 'resign';
    }
    if (c.kind === 'rematch' && w.result) {
      w.ready[side] = true;
      if (w.ready.every(Boolean)) this.restart();
    }
  }
  restart(): void {
    const w = this.world;
    w.round++; w.revision++; w.black = w.black === 0 ? 1 : 0;
    w.board = Array(CELLS).fill(0); w.turn = 0; w.last = -1;
    w.result = 0; w.reason = ''; w.line = []; w.ready = [false, false]; this.history = [];
  }
  canUndo(side: Side): boolean {
    return !this.world.result && this.history.length > (this.world.black === side ? 0 : 1);
  }
  undo(side: Side): boolean {
    if (!this.canUndo(side)) return false;
    const w = this.world;
    do { w.board[this.history.pop()!] = 0; w.turn--; }
    while (this.history.length && turnStone(w) !== stoneFor(w, side));
    w.last = this.history.at(-1) ?? -1; w.revision++; w.line = [];
    return true;
  }
}
