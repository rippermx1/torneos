-- G2048-09.2 review candidate ONLY. Not an auto-applied migration.
-- All playable Unity clients use server APIs. Closed-game audit reads seeds
-- through service_role and renders fingerprints, never raw browser SELECT.
BEGIN;
REVOKE SELECT ON TABLE public.games FROM PUBLIC, anon, authenticated;
REVOKE SELECT (seed) ON TABLE public.games FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, tournament_id, user_id, status, final_score, highest_tile,
  move_count, current_board, started_at, ended_at, end_reason)
  ON TABLE public.games TO authenticated;
COMMIT;
