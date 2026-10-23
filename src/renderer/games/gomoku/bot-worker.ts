import { chooseMove } from './bot.js';
import type { Difficulty, Stone } from './types.js';
self.onmessage = (event: MessageEvent<{ board: number[]; stone: Stone; difficulty: Difficulty }>) => {
  const { board, stone, difficulty } = event.data;
  self.postMessage(chooseMove(board, stone, difficulty));
};
