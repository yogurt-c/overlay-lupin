import { soccerRules } from './soccer.js';
import type { GameRules } from './rules.js';

export const RULES: Record<string, GameRules> = {
  soccer: soccerRules
};
