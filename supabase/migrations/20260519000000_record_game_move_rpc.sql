-- Atomic write: INSERT game_moves + UPDATE games in a single round-trip.
-- Replaces the two sequential DB calls in the move route, cutting write
-- latency by ~40-60 ms per move under normal Supabase conditions.
CREATE OR REPLACE FUNCTION record_game_move(
  p_game_id          uuid,
  p_move_number      int,
  p_direction        text,
  p_board_before     jsonb,
  p_board_after      jsonb,
  p_score_gained     int,
  p_spawned_tile     jsonb      DEFAULT NULL,
  p_client_timestamp bigint     DEFAULT 0,
  p_current_board    jsonb      DEFAULT NULL,
  p_final_score      bigint     DEFAULT 0,
  p_highest_tile     int        DEFAULT 0,
  p_move_count       int        DEFAULT 0,
  p_status           text       DEFAULT NULL,
  p_end_reason       text       DEFAULT NULL,
  p_ended_at         timestamptz DEFAULT NULL
)
RETURNS TABLE(server_timestamp timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO game_moves (
    game_id, move_number, direction,
    board_before, board_after,
    score_gained, spawned_tile, client_timestamp
  ) VALUES (
    p_game_id, p_move_number, p_direction,
    p_board_before, p_board_after,
    p_score_gained, p_spawned_tile, p_client_timestamp
  );

  UPDATE games
  SET
    current_board = COALESCE(p_current_board, current_board),
    final_score   = p_final_score,
    highest_tile  = p_highest_tile,
    move_count    = p_move_count,
    status        = CASE WHEN p_status IS NOT NULL THEN p_status ELSE status END,
    end_reason    = CASE WHEN p_end_reason IS NOT NULL THEN p_end_reason ELSE end_reason END,
    ended_at      = CASE WHEN p_ended_at IS NOT NULL THEN p_ended_at ELSE ended_at END
  WHERE id = p_game_id;

  RETURN QUERY
    SELECT gm.server_timestamp
    FROM game_moves gm
    WHERE gm.game_id = p_game_id AND gm.move_number = p_move_number;
END;
$$;

GRANT EXECUTE ON FUNCTION record_game_move TO service_role;
REVOKE EXECUTE ON FUNCTION record_game_move FROM PUBLIC, anon, authenticated;
