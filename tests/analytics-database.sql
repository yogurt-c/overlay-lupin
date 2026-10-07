-- Against an isolated Postgres database only, after creating Supabase roles and applying the migration.
-- All fixtures roll back; never run against the production project.
\set ON_ERROR_STOP on
begin;
set local role service_role;
select public.ingest_game_plays(jsonb_build_array(jsonb_build_object(
  'event_id', '10000000-0000-4000-8000-000000000001',
  'installation_id', '20000000-0000-4000-8000-000000000001',
  'game_id', 'soccer', 'mode', 'solo', 'app_version', 'test', 'platform', 'darwin', 'played_at', now()
)));
-- Duplicate IDs do not increase counts or overwrite immutable data.
select public.ingest_game_plays(jsonb_build_array(jsonb_build_object(
  'event_id', '10000000-0000-4000-8000-000000000001',
  'installation_id', '20000000-0000-4000-8000-000000000001',
  'game_id', 'tower', 'mode', 'room', 'app_version', 'test', 'platform', 'darwin', 'played_at', now()
)));
reset role;
do $$ begin
  if (select count(*) from public.game_play_events) <> 1 or
    (select game_id from public.game_play_events limit 1) <> 'soccer' then
    raise exception 'Duplicate handling failed';
  end if;
  if has_table_privilege('anon', 'public.game_play_events', 'select') or
    has_table_privilege('authenticated', 'public.game_play_events', 'insert') or
    has_function_privilege('anon', 'public.ingest_game_plays(jsonb)', 'execute') or
    has_function_privilege('authenticated', 'public.ingest_game_plays(jsonb)', 'execute') then
    raise exception 'Unexpected public access';
  end if;
end $$;

set local role anon;
do $$ begin
  begin
    perform * from public.game_play_events;
    raise exception 'Anonymous read unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.ingest_game_plays('[]'::jsonb);
    raise exception 'Anonymous RPC unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Fill the per-installation window, then verify the server-side bound.
insert into public.game_play_events (event_id, installation_id, game_id, mode, app_version, platform, played_at)
select gen_random_uuid(), '20000000-0000-4000-8000-000000000001', 'soccer', 'solo', 'test', 'darwin', now()
from generate_series(1,119);
set local role service_role;
do $$ begin
  begin
    perform public.ingest_game_plays(jsonb_build_array(jsonb_build_object(
      'event_id', gen_random_uuid(), 'installation_id', '20000000-0000-4000-8000-000000000001',
      'game_id', 'soccer', 'mode', 'solo', 'app_version', 'test', 'platform', 'darwin', 'played_at', now()
    )));
    raise exception 'Rate limit missing';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'rate_limit' then raise; end if;
  end;
end $$;
reset role;
\ir ../supabase/game-stats.sql
rollback;
