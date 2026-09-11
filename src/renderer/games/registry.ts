import { soccerModule } from './soccer/module.js';
import { volleyballModule } from './volleyball/module.js';
import { fenceModule } from './fence/module.js';
import { cellModule } from './cell/module.js';
import { wormModule } from './worm/module.js';
import { merandiModule } from './merandi/module.js';
import type { GameModule } from './types.js';

/** Every game exposed in the matching panel. Add a new module here to expose it. */
export const GAME_MODULES: GameModule[] = [
  soccerModule,
  volleyballModule,
  fenceModule,
  cellModule,
  wormModule,
  merandiModule
];
