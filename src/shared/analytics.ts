export interface GamePlayEvent {
  event_id: string;
  installation_id: string;
  game_id: string;
  mode: 'solo' | 'duel' | 'room';
  app_version: string;
  platform: string;
  played_at: string;
}

export interface AnalyticsStart {
  gameId: string;
  mode: GamePlayEvent['mode'];
}
