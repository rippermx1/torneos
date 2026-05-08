-- ============================================================
-- TorneosPlay — Seed de demo
-- Crea perfiles de prueba, torneos en distintos estados,
-- partidas y resultados para validar la plataforma localmente.
--
-- IMPORTANTE: requiere que el schema y las migraciones ya estén
-- aplicados. Ejecutar con:
--   psql -h localhost -p 15432 -U postgres -d postgres -f supabase/seed/demo.sql
--
-- El admin real (valdescarlos17@gmail.com) ya está insertado
-- por el script de bootstrap. Este seed NO lo vuelve a insertar.
-- ============================================================

-- ── Perfiles de jugadores de prueba ─────────────────────────
insert into profiles (id, username, full_name, kyc_status, is_admin)
values
  ('demo_player_001', 'alex_gamer',    'Alejandro Fuentes', 'approved', false),
  ('demo_player_002', 'maria_tile',    'María González',    'approved', false),
  ('demo_player_003', 'pedro_2048',    'Pedro Ramírez',     'approved', false),
  ('demo_player_004', 'sofia_score',   'Sofía Vidal',       'approved', false),
  ('demo_player_005', 'carlos_moves',  'Carlos Morales',    'approved', false),
  ('demo_player_006', 'lucia_blocks',  'Lucía Herrera',     'approved', false),
  ('demo_player_007', 'diego_maxile',  'Diego Castro',      'approved', false),
  ('demo_player_008', 'valentina_run', 'Valentina Rojas',   'approved', false)
on conflict (id) do nothing;

-- Saldos iniciales (5.000 CLP cada uno)
insert into wallet_transactions (user_id, type, amount_cents, balance_after_cents, metadata)
select
  id,
  'deposit',
  500000,
  500000,
  '{"reason":"demo_seed"}'::jsonb
from profiles
where id like 'demo_player_%'
on conflict do nothing;


-- ── 1. Torneo COMPLETADO — Semana pasada ────────────────────
insert into tournaments (
  id, name, description, tournament_type,
  entry_fee_cents, prize_1st_cents, prize_2nd_cents, prize_3rd_cents,
  min_players, max_players,
  registration_opens_at, play_window_start, play_window_end,
  max_game_duration_seconds, status, created_by
) values (
  '00000000-0000-0000-0000-000000000001',
  'Torneo Estándar #1',
  'El primer torneo de la plataforma. Competencia de habilidad pura.',
  'standard',
  300000, 1500000, 800000, 400000,
  4, 100,
  now() - interval '8 days',
  now() - interval '7 days',
  now() - interval '6 days',
  600, 'completed',
  (select id from profiles where is_admin = true limit 1)
) on conflict (id) do nothing;

-- Inscripciones del torneo completado
insert into registrations (tournament_id, user_id)
select '00000000-0000-0000-0000-000000000001', id
from profiles where id like 'demo_player_%'
on conflict do nothing;

-- Partidas finalizadas
insert into games (tournament_id, user_id, seed, status, final_score, highest_tile, move_count, started_at, ended_at, end_reason)
values
  ('00000000-0000-0000-0000-000000000001', 'demo_player_001', 'seed_a1', 'completed', 48720, 1024, 342, now()-interval '6 days 22h', now()-interval '6 days 21h', 'no_moves'),
  ('00000000-0000-0000-0000-000000000001', 'demo_player_002', 'seed_a2', 'completed', 38560, 512,  290, now()-interval '6 days 20h', now()-interval '6 days 19h', 'no_moves'),
  ('00000000-0000-0000-0000-000000000001', 'demo_player_003', 'seed_a3', 'completed', 31200, 512,  251, now()-interval '6 days 18h', now()-interval '6 days 17h', 'self_ended'),
  ('00000000-0000-0000-0000-000000000001', 'demo_player_004', 'seed_a4', 'completed', 24840, 256,  198, now()-interval '6 days 16h', now()-interval '6 days 15h', 'no_moves'),
  ('00000000-0000-0000-0000-000000000001', 'demo_player_005', 'seed_a5', 'completed', 18320, 256,  175, now()-interval '6 days 14h', now()-interval '6 days 13h', 'timeout'),
  ('00000000-0000-0000-0000-000000000001', 'demo_player_006', 'seed_a6', 'completed', 12480, 128,  130, now()-interval '6 days 12h', now()-interval '6 days 11h', 'no_moves'),
  ('00000000-0000-0000-0000-000000000001', 'demo_player_007', 'seed_a7', 'completed',  8960, 128,  102, now()-interval '6 days 10h', now()-interval '6 days 9h',  'no_moves'),
  ('00000000-0000-0000-0000-000000000001', 'demo_player_008', 'seed_a8', 'completed',  5120, 64,    78, now()-interval '6 days 8h',  now()-interval '6 days 7h',  'self_ended')
on conflict do nothing;

-- Resultados oficiales del torneo completado
insert into tournament_results (tournament_id, user_id, rank, final_score, prize_awarded_cents)
values
  ('00000000-0000-0000-0000-000000000001', 'demo_player_001', 1, 48720, 1500000),
  ('00000000-0000-0000-0000-000000000001', 'demo_player_002', 2, 38560,  800000),
  ('00000000-0000-0000-0000-000000000001', 'demo_player_003', 3, 31200,  400000),
  ('00000000-0000-0000-0000-000000000001', 'demo_player_004', 4, 24840,       0),
  ('00000000-0000-0000-0000-000000000001', 'demo_player_005', 5, 18320,       0),
  ('00000000-0000-0000-0000-000000000001', 'demo_player_006', 6, 12480,       0),
  ('00000000-0000-0000-0000-000000000001', 'demo_player_007', 7,  8960,       0),
  ('00000000-0000-0000-0000-000000000001', 'demo_player_008', 8,  5120,       0)
on conflict do nothing;


-- ── 2. Torneo EN VIVO — Hoy ──────────────────────────────────
insert into tournaments (
  id, name, description, tournament_type,
  entry_fee_cents, prize_1st_cents, prize_2nd_cents, prize_3rd_cents,
  min_players, max_players,
  registration_opens_at, play_window_start, play_window_end,
  max_game_duration_seconds, status, created_by
) values (
  '00000000-0000-0000-0000-000000000002',
  'Torneo Estándar #2',
  'Torneo en curso. Puedes inscribirte y jugar ahora mismo.',
  'standard',
  300000, 1500000, 800000, 400000,
  4, 100,
  now() - interval '2 hours',
  now() - interval '1 hour',
  now() + interval '23 hours',
  600, 'live',
  (select id from profiles where is_admin = true limit 1)
) on conflict (id) do nothing;

-- Inscripciones del torneo live
insert into registrations (tournament_id, user_id)
select '00000000-0000-0000-0000-000000000002', id
from profiles where id like 'demo_player_%'
on conflict do nothing;

-- Partidas en curso / terminadas del torneo live
insert into games (tournament_id, user_id, seed, status, final_score, highest_tile, move_count, started_at, ended_at, end_reason)
values
  ('00000000-0000-0000-0000-000000000002', 'demo_player_001', 'seed_b1', 'completed', 52400, 2048, 401, now()-interval '50min', now()-interval '30min', 'no_moves'),
  ('00000000-0000-0000-0000-000000000002', 'demo_player_002', 'seed_b2', 'completed', 41280, 1024, 310, now()-interval '45min', now()-interval '28min', 'no_moves'),
  ('00000000-0000-0000-0000-000000000002', 'demo_player_003', 'seed_b3', 'active',    29760, 512,  222, now()-interval '20min', null,               null),
  ('00000000-0000-0000-0000-000000000002', 'demo_player_004', 'seed_b4', 'active',    18240, 256,  145, now()-interval '15min', null,               null),
  ('00000000-0000-0000-0000-000000000002', 'demo_player_005', 'seed_b5', 'completed', 14320, 256,  121, now()-interval '40min', now()-interval '32min', 'self_ended'),
  ('00000000-0000-0000-0000-000000000002', 'demo_player_006', 'seed_b6', 'completed',  9600, 128,   98, now()-interval '35min', now()-interval '25min', 'no_moves')
on conflict do nothing;


-- ── 3. Torneo EXPRESS — Empieza en 1 hora ───────────────────
insert into tournaments (
  id, name, description, tournament_type,
  entry_fee_cents, prize_1st_cents, prize_2nd_cents, prize_3rd_cents,
  min_players, max_players,
  registration_opens_at, play_window_start, play_window_end,
  max_game_duration_seconds, status, created_by
) values (
  '00000000-0000-0000-0000-000000000003',
  'Flash Express #1',
  'Solo 2 horas. Acción rápida, premio rápido.',
  'express',
  100000, 800000, 300000, 0,
  4, 50,
  now() - interval '30 minutes',
  now() + interval '1 hour',
  now() + interval '3 hours',
  480, 'open',
  (select id from profiles where is_admin = true limit 1)
) on conflict (id) do nothing;

-- Inscripciones del torneo express (3 jugadores)
insert into registrations (tournament_id, user_id)
select '00000000-0000-0000-0000-000000000003', id
from profiles where id in ('demo_player_001','demo_player_002','demo_player_003')
on conflict do nothing;


-- ── 4. Torneo ÉLITE — Próxima semana ────────────────────────
insert into tournaments (
  id, name, description, tournament_type,
  entry_fee_cents, prize_1st_cents, prize_2nd_cents, prize_3rd_cents,
  min_players, max_players,
  registration_opens_at, play_window_start, play_window_end,
  max_game_duration_seconds, status, created_by
) values (
  '00000000-0000-0000-0000-000000000004',
  'Gran Premio Élite',
  'Cupos limitados. El mayor premio de la plataforma.',
  'elite',
  1000000, 6000000, 2500000, 1000000,
  4, 20,
  now() + interval '2 days',
  now() + interval '3 days',
  now() + interval '5 days',
  900, 'scheduled',
  (select id from profiles where is_admin = true limit 1)
) on conflict (id) do nothing;


-- ── 5. Freeroll — Abierto ahora ─────────────────────────────
insert into tournaments (
  id, name, description, tournament_type,
  entry_fee_cents, prize_1st_cents, prize_2nd_cents, prize_3rd_cents,
  min_players, max_players,
  registration_opens_at, play_window_start, play_window_end,
  max_game_duration_seconds, status, created_by
) values (
  '00000000-0000-0000-0000-000000000005',
  'Freeroll Bienvenida',
  'Torneo gratuito para nuevos jugadores. Demuestra tu nivel sin costo.',
  'freeroll',
  0, 500000, 0, 0,
  2, 200,
  now() - interval '1 day',
  now() - interval '12 hours',
  now() + interval '36 hours',
  600, 'live',
  (select id from profiles where is_admin = true limit 1)
) on conflict (id) do nothing;

-- Inscripciones del freeroll
insert into registrations (tournament_id, user_id)
select '00000000-0000-0000-0000-000000000005', id
from profiles where id like 'demo_player_%'
on conflict do nothing;

-- Partidas del freeroll
insert into games (tournament_id, user_id, seed, status, final_score, highest_tile, move_count, started_at, ended_at, end_reason)
values
  ('00000000-0000-0000-0000-000000000005', 'demo_player_001', 'seed_c1', 'completed', 38400, 1024, 280, now()-interval '10h', now()-interval '9h30m', 'no_moves'),
  ('00000000-0000-0000-0000-000000000005', 'demo_player_002', 'seed_c2', 'completed', 29600, 512,  220, now()-interval '9h',  now()-interval '8h40m', 'no_moves'),
  ('00000000-0000-0000-0000-000000000005', 'demo_player_003', 'seed_c3', 'active',    15200, 256,  120, now()-interval '1h',  null,                  null),
  ('00000000-0000-0000-0000-000000000005', 'demo_player_004', 'seed_c4', 'active',     8800, 128,   72, now()-interval '30m', null,                  null)
on conflict do nothing;


-- ── Resumen ──────────────────────────────────────────────────
select
  t.name,
  t.tournament_type,
  t.status,
  t.entry_fee_cents / 100 as entry_fee_clp,
  t.prize_1st_cents  / 100 as prize_1st_clp,
  count(distinct r.user_id) as inscritos,
  count(distinct g.id)      as partidas
from tournaments t
left join registrations r on r.tournament_id = t.id
left join games g on g.tournament_id = t.id
group by t.id, t.name, t.tournament_type, t.status, t.entry_fee_cents, t.prize_1st_cents
order by t.created_at;
