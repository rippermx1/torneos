BEGIN;

-- Recheck the hard registration deadline after acquiring the tournament lock.
-- The historical registration RPC and every paid-format contract stay intact.
CREATE FUNCTION private.guard_community_free_registration_clock()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.tournaments%ROWTYPE; observed_at timestamptz;
BEGIN
  SELECT * INTO t FROM public.tournaments
    WHERE id=NEW.tournament_id AND preset_key='community_free_v1' FOR SHARE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  observed_at:=clock_timestamp();
  IF t.status IS NULL OR t.status NOT IN ('scheduled','open')
    OR t.registration_opens_at IS NULL OR t.play_window_start IS NULL
    OR observed_at<t.registration_opens_at OR observed_at>=t.play_window_start THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Inscripciones cerradas';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_community_free_registration_clock()
  FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_community_free_registration_clock
  BEFORE INSERT ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION private.guard_community_free_registration_clock();

COMMENT ON FUNCTION private.guard_community_free_registration_clock() IS
  'Community registration only: DB wall clock after tournament lock; registration_opens_at <= now < play_window_start. Legacy RPC and paid formats unchanged.';

COMMIT;
