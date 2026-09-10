import { soccerModule } from './soccer/module.js';
import { cellModule } from './cell/module.js';
import type { GameModule } from './types.js';

/** Every game exposed in the matching panel. Add a new module here to expose it. */
export const GAME_MODULES: GameModule[] = [soccerModule, cellModule];
