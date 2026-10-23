import { CELLS } from './types.js';
import type { Command, World } from './types.js';
const integer = (n: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): n is number => Number.isSafeInteger(n) && (n as number) >= min && (n as number) <= max;
export function validCommand(raw: unknown): raw is Command {
  if (!raw || typeof raw !== 'object') return false;
  const c = raw as Command;
  return typeof c.id === 'string' && c.id.length <= 80 && integer(c.round, 1) && integer(c.seq, 1) && integer(c.turn, 0, CELLS)
    && ['place', 'rematch', 'resign'].includes(c.kind) && integer(c.cell, 0, CELLS - 1);
}
export function encodeWorld(w: World) { return { t: 'gomoku-world', ...w, board: w.board.join('') }; }
export function decodeWorld(raw: unknown): World | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (p.t !== 'gomoku-world' || typeof p.id !== 'string' || p.id.length > 80 || !integer(p.round, 1) || !integer(p.revision)
    || typeof p.board !== 'string' || !/^[012]{225}$/.test(p.board) || !integer(p.black, 0, 1)
    || !integer(p.turn, 0, CELLS) || !integer(p.last, -1, CELLS - 1) || !integer(p.result, 0, 3)
    || !['', 'line', 'draw', 'resign'].includes(p.reason as string)
    || !Array.isArray(p.line) || p.line.length > 15 || !p.line.every(n => integer(n, 0, CELLS - 1))
    || !Array.isArray(p.ready) || p.ready.length !== 2 || !p.ready.every(n => typeof n === 'boolean')
    || !Array.isArray(p.ack) || p.ack.length !== 2 || !p.ack.every(n => integer(n))) return null;
  const board = [...p.board].map(Number);
  const black = board.filter(n => n === 1).length, white = board.filter(n => n === 2).length;
  if (black + white !== p.turn || black !== Math.ceil(p.turn / 2) || white !== Math.floor(p.turn / 2)
    || (p.turn === 0 ? p.last !== -1 : p.last === -1 || !board[p.last])) return null;
  return { id: p.id, round: p.round, revision: p.revision, board, black: p.black, turn: p.turn, last: p.last,
    result: p.result, reason: p.reason, line: [...p.line], ready: [...p.ready], ack: [...p.ack] } as World;
}
