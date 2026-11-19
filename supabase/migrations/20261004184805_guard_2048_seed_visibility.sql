-- Competitive 2048 never exposes its active RNG seed to a browser role.
-- Preserve owned safe-state reads and service_role access for gameplay/audit.
BEGIN;
REVOKE SELECT ON TABLE public.games FROM PUBLIC, anon, authenticated;
REVOKE SELECT (seed) ON TABLE public.games FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, tournament_id, user_id, status, final_score, highest_tile,
  move_count, current_board, started_at, ended_at, end_reason)
  ON TABLE public.games TO authenticated;
COMMIT;
