-- G2048-09.3. Candidate only; never apply to the operating DB from a verifier.
-- Reviews are signals, not proof of automation. Existing financial SQL is retained.
CREATE SCHEMA IF NOT EXISTS integrity_private;
REVOKE ALL ON SCHEMA integrity_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA integrity_private TO service_role;

CREATE TABLE integrity_private.identity_claims (
  tournament_id uuid REFERENCES public.tournaments(id) NOT NULL,
  normalized_rut text NOT NULL,
  user_id uuid REFERENCES public.profiles(id) NOT NULL,
  PRIMARY KEY(tournament_id, normalized_rut),
  UNIQUE(tournament_id, user_id)
);
CREATE TABLE integrity_private.reviews (
  game_id uuid REFERENCES public.games(id) NOT NULL,
  code text NOT NULL CHECK(code IN ('regular_pace', 'identity_collision', 'settled_sanction')),
  evidence jsonb NOT NULL,
  decision text NOT NULL DEFAULT 'pending' CHECK(decision IN ('pending', 'cleared', 'sanctioned')),
  reviewed_by uuid REFERENCES public.profiles(id),
  review_reason text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(game_id, code)
);
CREATE TABLE integrity_private.sanctions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) NOT NULL,
  banned boolean NOT NULL,
  actor_id uuid REFERENCES public.profiles(id),
  reason text NOT NULL,
  invalidated_games int NOT NULL,
  settled_games int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE integrity_private.identity_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrity_private.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrity_private.sanctions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA integrity_private TO service_role;

CREATE FUNCTION integrity_private.normalized_identity(rut text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
  SELECT ltrim(upper(regexp_replace(rut,'[^0-9kK]','','g')),'0');
$$;

-- Snapshot verified identity at session creation: changing a profile later or
-- banning its account cannot transfer the same person's slot to another account.
CREATE FUNCTION integrity_private.claim_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.profiles%ROWTYPE; identity_key text; claimed_user uuid;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id=NEW.user_id FOR SHARE;
  IF NOT FOUND OR p.is_banned THEN
    RAISE EXCEPTION USING ERRCODE='PT403', MESSAGE='ACCOUNT_SUSPENDED';
  END IF;
  IF p.kyc_status='approved' THEN
    IF upper(regexp_replace(coalesce(p.rut,''),'[^0-9kK]','','g')) !~ '^[0-9]{7,8}[0-9K]$' THEN
      RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='IDENTITY_STATE_UNCONFIRMED';
    END IF;
    identity_key := integrity_private.normalized_identity(p.rut);
    INSERT INTO integrity_private.identity_claims(tournament_id, normalized_rut, user_id)
      VALUES(NEW.tournament_id, identity_key, NEW.user_id)
      ON CONFLICT(tournament_id, normalized_rut) DO NOTHING;
    SELECT user_id INTO claimed_user FROM integrity_private.identity_claims
      WHERE tournament_id=NEW.tournament_id AND normalized_rut=identity_key;
    IF claimed_user IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='IDENTITY_ALREADY_PARTICIPATING';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.games g JOIN public.profiles old_owner ON old_owner.id=g.user_id
      WHERE g.tournament_id=NEW.tournament_id AND g.user_id<>NEW.user_id AND old_owner.kyc_status='approved'
        AND integrity_private.normalized_identity(old_owner.rut)=identity_key
    ) THEN
      RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='IDENTITY_ALREADY_PARTICIPATING';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_2048_identity BEFORE INSERT ON public.games
  FOR EACH ROW EXECUTE FUNCTION integrity_private.claim_identity();

-- Scan persisted server times, including every sliding 30-interval window.
-- Include existing verified games in identity review, without automatically
-- banning either account or claiming to identify unverified people.
CREATE FUNCTION integrity_private.scan_tournament(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  INSERT INTO integrity_private.reviews(game_id,code,evidence)
  SELECT game_id,'regular_pace',jsonb_build_object('intervals',30,'min_ms',min(lo),'max_ms',max(hi))
  FROM (
    SELECT game_id, count(ms) OVER w AS n, min(ms) OVER w AS lo, max(ms) OVER w AS hi
    FROM (
      SELECT gm.game_id,gm.move_number,
        extract(epoch FROM (gm.server_timestamp-lag(gm.server_timestamp) OVER
          (PARTITION BY gm.game_id ORDER BY gm.move_number)))*1000 AS ms
      FROM public.game_moves gm JOIN public.games g ON g.id=gm.game_id
      WHERE g.tournament_id=p_id AND g.status IN ('active','completed') AND gm.direction IS NOT NULL
    ) intervals
    WINDOW w AS (PARTITION BY game_id ORDER BY move_number ROWS BETWEEN 29 PRECEDING AND CURRENT ROW)
  ) windows WHERE n=30 AND lo>=80 AND hi<=2000 AND hi-lo<=10
  GROUP BY game_id ON CONFLICT(game_id,code) DO NOTHING;

  INSERT INTO integrity_private.reviews(game_id,code,evidence)
  SELECT g.id,'identity_collision',jsonb_build_object('basis','verified_identity_in_same_tournament')
  FROM public.games g JOIN public.profiles p ON p.id=g.user_id
  WHERE g.tournament_id=p_id AND g.status IN ('active','completed') AND p.kyc_status='approved'
    AND p.rut IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.games other JOIN public.profiles op ON op.id=other.user_id
      WHERE other.tournament_id=p_id AND other.user_id<>g.user_id
        AND other.status IN ('active','completed') AND op.kyc_status='approved'
        AND integrity_private.normalized_identity(p.rut)=integrity_private.normalized_identity(op.rut)
    ) ON CONFLICT(game_id,code) DO NOTHING;
END $$;

-- Transition locks the tournament before scanning. Move commits stop at
-- finalizing. The completion guard also protects direct finalizer calls, and
-- raising rolls back ranking/credits in the existing finalizer transaction.
CREATE FUNCTION integrity_private.guard_finalization() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.game_type='2048_score' AND NEW.status IN ('finalizing','completed')
    AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM integrity_private.scan_tournament(NEW.id);
    IF NEW.status='completed' AND EXISTS (
      SELECT 1 FROM integrity_private.reviews r JOIN public.games g ON g.id=r.game_id
      WHERE g.tournament_id=NEW.id AND g.status IN ('active','completed') AND r.decision='pending'
    ) THEN
      RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='INTEGRITY_REVIEW_REQUIRED';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_2048_finalization BEFORE UPDATE OF status ON public.tournaments
  FOR EACH ROW EXECUTE FUNCTION integrity_private.guard_finalization();

CREATE FUNCTION public.inspect_2048_integrity(p_tournament_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE t public.tournaments%ROWTYPE; result jsonb;
BEGIN
  SELECT * INTO t FROM public.tournaments WHERE id=p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404', MESSAGE='TOURNAMENT_NOT_FOUND'; END IF;
  -- Avoid clearing evidence while the game's moves are still changing.
  IF t.game_type='2048_score' AND t.status='finalizing' THEN
    PERFORM integrity_private.scan_tournament(t.id);
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('gameId',r.game_id,'code',r.code,
    'evidence',r.evidence,'decision',r.decision,'reason',r.review_reason,'reviewedAt',r.reviewed_at)), '[]'::jsonb)
  INTO result FROM integrity_private.reviews r JOIN public.games g ON g.id=r.game_id
  WHERE g.tournament_id=t.id;
  RETURN result;
END $$;

CREATE FUNCTION public.resolve_2048_integrity(p_game_id uuid,p_code text,p_actor_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE tournament_id uuid; tournament_status text;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason))<10 OR length(p_reason)>1000 THEN
    RAISE EXCEPTION USING ERRCODE='PT400', MESSAGE='REVIEW_REASON_REQUIRED';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor_id AND is_admin AND NOT is_banned) THEN
    RAISE EXCEPTION USING ERRCODE='PT403', MESSAGE='ADMIN_REQUIRED';
  END IF;
  SELECT g.tournament_id INTO tournament_id FROM public.games g WHERE g.id=p_game_id;
  SELECT status INTO tournament_status FROM public.tournaments WHERE id=tournament_id FOR UPDATE;
  IF tournament_status IS DISTINCT FROM 'finalizing' THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='REVIEW_REQUIRES_FINALIZING';
  END IF;
  UPDATE integrity_private.reviews SET decision='cleared', reviewed_by=p_actor_id,
    review_reason=trim(p_reason), reviewed_at=clock_timestamp()
    WHERE game_id=p_game_id AND code=p_code AND decision='pending';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='REVIEW_NOT_PENDING'; END IF;
  RETURN jsonb_build_object('ok',true);
END $$;

-- Shared account lock precedes tournament/game locks. Finalizer uses tournament
-- then game locks. Record commits acquire profile SHARE before game UPDATE.
CREATE FUNCTION public.set_2048_account_sanction(p_user_id uuid,p_banned boolean,p_reason text,p_actor_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE p public.profiles%ROWTYPE; invalidated int:=0; settled int:=0;
BEGIN
  IF p_banned IS NULL OR p_reason IS NULL OR length(trim(p_reason))=0 OR length(p_reason)>1000 THEN
    RAISE EXCEPTION USING ERRCODE='PT400', MESSAGE='SANCTION_REASON_REQUIRED';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.profiles WHERE id=p_actor_id AND is_admin AND NOT is_banned
  ) THEN RAISE EXCEPTION USING ERRCODE='PT403', MESSAGE='ADMIN_REQUIRED'; END IF;
  SELECT * INTO p FROM public.profiles WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404', MESSAGE='ACCOUNT_NOT_FOUND'; END IF;
  IF p.is_admin THEN RAISE EXCEPTION USING ERRCODE='PT403', MESSAGE='ADMIN_PROTECTED'; END IF;
  PERFORM 1 FROM public.tournaments t WHERE EXISTS(
    SELECT 1 FROM public.games g WHERE g.tournament_id=t.id AND g.user_id=p_user_id
  ) ORDER BY t.id FOR UPDATE;
  UPDATE public.profiles SET is_banned=p_banned WHERE id=p_user_id;
  IF p_banned THEN
    UPDATE public.games g SET status='invalid',end_reason='invalid',ended_at=coalesce(g.ended_at,clock_timestamp())
      FROM public.tournaments t WHERE t.id=g.tournament_id AND g.user_id=p_user_id
      AND g.status IN ('active','completed') AND t.status NOT IN ('completed','cancelled');
    GET DIAGNOSTICS invalidated=ROW_COUNT;
    UPDATE integrity_private.reviews r SET decision='sanctioned',reviewed_by=p_actor_id,
      review_reason=trim(p_reason),reviewed_at=clock_timestamp()
      FROM public.games g WHERE g.id=r.game_id AND g.user_id=p_user_id
      AND g.status='invalid' AND r.decision='pending';
    INSERT INTO integrity_private.reviews(game_id,code,evidence)
      SELECT g.id,'settled_sanction',jsonb_build_object('action','review_existing_settlement')
      FROM public.games g JOIN public.tournaments t ON t.id=g.tournament_id
      WHERE g.user_id=p_user_id AND g.status='completed' AND t.status='completed'
      ON CONFLICT(game_id,code) DO NOTHING;
    SELECT count(*) INTO settled FROM public.games g JOIN public.tournaments t ON t.id=g.tournament_id
      WHERE g.user_id=p_user_id AND g.status='completed' AND t.status='completed';
  END IF;
  INSERT INTO integrity_private.sanctions(user_id,banned,actor_id,reason,invalidated_games,settled_games)
    VALUES(p_user_id,p_banned,p_actor_id,trim(p_reason),invalidated,settled);
  RETURN jsonb_build_object('ok',true,'banned',p_banned,'invalidatedGames',invalidated,'settledGames',settled);
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA integrity_private FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA integrity_private TO service_role;
REVOKE EXECUTE ON FUNCTION public.inspect_2048_integrity(uuid), public.resolve_2048_integrity(uuid,text,uuid,text),
  public.set_2048_account_sanction(uuid,boolean,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inspect_2048_integrity(uuid), public.resolve_2048_integrity(uuid,text,uuid,text),
  public.set_2048_account_sanction(uuid,boolean,text,uuid) TO service_role;

-- Preserve the existing commit/deadline checks; add a serialized account gate.
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
  owner_id uuid;
  account_banned boolean;
BEGIN
  SELECT user_id INTO owner_id FROM public.games WHERE id=p_game_id;
  SELECT is_banned INTO account_banned FROM public.profiles WHERE id=owner_id FOR SHARE;
  IF NOT FOUND OR account_banned THEN
    RAISE EXCEPTION USING ERRCODE='PT403', MESSAGE='ACCOUNT_SUSPENDED';
  END IF;
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
