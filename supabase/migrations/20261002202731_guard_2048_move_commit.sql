-- G2048-04.4: serialize movement against timeout/finalization and reject stale
-- calculations. Local application was explicitly authorized by the owner.
CREATE OR REPLACE FUNCTION public.record_game_move(
  p_game_id uuid,
  p_move_number int,
  p_direction text,
  p_board_before jsonb,
  p_board_after jsonb,
  p_score_gained int,
  p_spawned_tile jsonb DEFAULT NULL,
  p_client_timestamp bigint DEFAULT 0,
  p_current_board jsonb DEFAULT NULL,
  p_final_score bigint DEFAULT 0,
  p_highest_tile int DEFAULT 0,
  p_move_count int DEFAULT 0,
  p_status text DEFAULT NULL,
  p_end_reason text DEFAULT NULL,
  p_ended_at timestamptz DEFAULT NULL
)
RETURNS TABLE(server_timestamp timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  locked_game public.games%ROWTYPE;
  play_window_start timestamptz;
  play_window_end timestamptz;
  max_duration int;
  tournament_status text;
  commit_time timestamptz;
BEGIN
  -- The timeout UPDATE locks this same row. A pending move waits, then observes
  -- the completed row; it cannot change a score already returned as final.
  SELECT g.* INTO locked_game FROM public.games g
  WHERE g.id = p_game_id FOR UPDATE;
  IF NOT FOUND OR locked_game.status <> 'active' THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'GAME_COMMIT_CLOSED';
  END IF;

  SELECT t.play_window_start, t.play_window_end, t.max_game_duration_seconds, t.status
    INTO play_window_start, play_window_end, max_duration, tournament_status
  FROM public.tournaments t WHERE t.id = locked_game.tournament_id;
  -- clock_timestamp(), rather than transaction-start now(), includes lock wait.
  commit_time := clock_timestamp();
  IF NOT FOUND OR tournament_status <> 'live' OR locked_game.started_at IS NULL
    OR commit_time < play_window_start
    OR commit_time >= LEAST(play_window_end,
      locked_game.started_at + make_interval(secs => max_duration)) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'GAME_COMMIT_DEADLINE';
  END IF;
  IF p_move_number IS DISTINCT FROM locked_game.move_count + 2
    OR p_move_count IS DISTINCT FROM locked_game.move_count + 1
    OR p_board_before IS DISTINCT FROM locked_game.current_board THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'GAME_COMMIT_CONFLICT';
  END IF;

  INSERT INTO public.game_moves (
    game_id, move_number, direction, board_before, board_after,
    score_gained, spawned_tile, client_timestamp
  ) VALUES (
    p_game_id, p_move_number, p_direction, p_board_before, p_board_after,
    p_score_gained, p_spawned_tile, p_client_timestamp
  );
  UPDATE public.games SET
    current_board = COALESCE(p_current_board, current_board),
    final_score = p_final_score,
    highest_tile = p_highest_tile,
    move_count = p_move_count,
    status = COALESCE(p_status, status),
    end_reason = COALESCE(p_end_reason, end_reason),
    ended_at = COALESCE(p_ended_at, ended_at)
  WHERE id = p_game_id;

  RETURN QUERY SELECT gm.server_timestamp FROM public.game_moves gm
  WHERE gm.game_id = p_game_id AND gm.move_number = p_move_number;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.record_game_move FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_game_move TO service_role;
