-- Run in SQL Editor. Change 7 to 30 for the last 30 calendar days (Korea time).
-- Includes today; the denominator is installations that played any game in this period.
with period as (
  select * from public.game_play_events
  where played_at >= ((now() at time zone 'Asia/Seoul')::date - (7 - 1))::timestamp at time zone 'Asia/Seoul'
    and played_at <= now()
), totals as (
  select count(*) as plays, count(distinct installation_id) as users from period
)
select game_id as game,
  count(*) as plays,
  count(distinct installation_id) as installations,
  round(100.0 * count(*) / nullif((select plays from totals), 0), 1) as play_share_percent,
  round(100.0 * count(distinct installation_id) / nullif((select users from totals), 0), 1) as user_share_percent,
  count(*) filter (where mode = 'solo') as solo_plays,
  count(*) filter (where mode in ('duel', 'room')) as multiplayer_plays
from period
group by game_id
order by plays desc, game_id;
