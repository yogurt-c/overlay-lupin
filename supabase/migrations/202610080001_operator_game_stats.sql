-- Run in Supabase SQL Editor after game_plays and guestbook_operators exist.
begin;

create or replace function public.operator_game_stats(days integer default 7)
returns table (
  game_id text, plays bigint, installations bigint,
  solo_plays bigint, duel_plays bigint, room_plays bigint,
  play_share_percent numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.guestbook_operators o where o.user_id = auth.uid()
  ) then
    raise exception 'Operator access required' using errcode = '42501';
  end if;
  if days is null or days not in (0, 7, 30) then
    raise exception 'Expected 0, 7 or 30 days' using errcode = '22023';
  end if;
  return query
  select e.game_id, count(*), count(distinct e.installation_id),
    count(*) filter (where e.mode = 'solo'),
    count(*) filter (where e.mode = 'duel'),
    count(*) filter (where e.mode = 'room'),
    round(100.0 * count(*) / nullif(sum(count(*)) over (), 0), 1)
  from public.game_play_events e
  where e.played_at <= now()
    and (days = 0 or e.played_at >= (
      (now() at time zone 'Asia/Seoul')::date - (days - 1)
    )::timestamp at time zone 'Asia/Seoul')
  group by e.game_id
  order by count(*) desc, e.game_id;
end;
$$;

revoke all on function public.operator_game_stats(integer) from public, anon, authenticated;
grant execute on function public.operator_game_stats(integer) to authenticated;
commit;
