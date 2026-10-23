import { DIRECTIONS, winningLine } from './engine.js';
import { SIZE } from './types.js';
import type { Difficulty, Stone } from './types.js';
function pattern(board: number[], cell: number, stone: number): number {
  const x = cell % SIZE, y = Math.floor(cell / SIZE);
  let value = 0;
  for (const [dx, dy] of DIRECTIONS) {
    let count = 1, open = 0;
    for (const sign of [-1, 1]) {
      let n = 1;
      for (; n < SIZE; n++) {
        const xx = x + dx * n * sign, yy = y + dy * n * sign;
        if (xx < 0 || xx >= SIZE || yy < 0 || yy >= SIZE) break;
        if (board[yy * SIZE + xx] !== stone) { if (!board[yy * SIZE + xx]) open++; break; }
        count++;
      }
    }
    value += count >= 5 ? 1000000 : open === 0 ? 0 : [0, 2, 20, 250, 12000][count] * (open === 2 ? 5 : 1);
  }
  return value;
}
function candidates(board: number[], stone: number): { cell: number; score: number }[] {
  const nearby = new Set<number>();
  board.forEach((v, cell) => {
    if (!v) return;
    const x = cell % SIZE, y = Math.floor(cell / SIZE);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && xx < SIZE && yy >= 0 && yy < SIZE && !board[yy * SIZE + xx]) nearby.add(yy * SIZE + xx);
    }
  });
  if (!nearby.size && !board[112]) nearby.add(112);
  return [...nearby].map(cell => ({ cell, score: pattern(board, cell, stone) + pattern(board, cell, 3 - stone) * 1.1 }))
    .sort((a, b) => b.score - a.score || Math.abs(a.cell % SIZE - 7) + Math.abs(Math.floor(a.cell / SIZE) - 7)
      - Math.abs(b.cell % SIZE - 7) - Math.abs(Math.floor(b.cell / SIZE) - 7));
}
/** Runs in a worker; iterative deepening keeps a completed answer within a hard time budget. */
export function chooseMove(source: readonly number[], stone: Stone, difficulty: Difficulty, random = Math.random): number {
  const board = [...source], choices = candidates(board, stone);
  if (!choices.length) return -1;
  for (const who of [stone, 3 - stone]) for (const { cell } of choices) {
    board[cell] = who;
    const win = winningLine(board, cell).length > 0;
    board[cell] = 0;
    if (win) return cell;
  }
  if (difficulty === 'easy') return choices[Math.min(choices.length - 1, Math.floor(random() * Math.min(3, choices.length)))].cell;
  const deadline = performance.now() + (difficulty === 'hard' ? 650 : 180);
  const timeout = Symbol('deadline');
  function search(who: number, depth: number, alpha: number, beta: number): number {
    if (performance.now() >= deadline) throw timeout;
    const list = candidates(board, who);
    if (!list.length) return 0;
    if (depth === 0) {
      const mine = Math.max(...list.map(c => pattern(board, c.cell, who)));
      const theirs = Math.max(...list.map(c => pattern(board, c.cell, 3 - who)));
      return mine - theirs * 1.15;
    }
    let best = -Infinity;
    for (const { cell } of list.slice(0, 10)) {
      board[cell] = who;
      let score: number;
      try { score = winningLine(board, cell).length ? 10000000 + depth : -search(3 - who, depth - 1, -beta, -alpha); }
      finally { board[cell] = 0; }
      best = Math.max(best, score); alpha = Math.max(alpha, score);
      if (alpha >= beta) break;
    }
    return best;
  }
  let answer = choices[0].cell;
  for (let depth = 1; depth <= (difficulty === 'hard' ? 4 : 2); depth++) {
    let best = -Infinity, next = answer;
    try {
      for (const { cell } of choices.slice(0, difficulty === 'hard' ? 16 : 10)) {
        board[cell] = stone;
        let score: number;
        try { score = -search(3 - stone, depth - 1, -Infinity, -best); }
        finally { board[cell] = 0; }
        if (score > best) { best = score; next = cell; }
      }
      answer = next;
    } catch (error) { if (error !== timeout) throw error; break; }
  }
  return answer;
}
