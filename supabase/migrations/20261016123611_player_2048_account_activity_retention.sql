BEGIN;

-- Self-reported authenticated-account activity. Not a score, proof of play,
-- competitive eligibility, prize, human identity or monetary event.
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE private.player_2048_activity_days (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_day date NOT NULL,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  practice boolean NOT NULL DEFAULT false,
  daily boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, activity_day),
  CHECK (practice OR daily),
  CHECK (first_seen_at <= last_seen_at),
  CHECK (activity_day = (first_seen_at AT TIME ZONE 'America/Santiago')::date),
  CHECK (activity_day = (last_seen_at AT TIME ZONE 'America/Santiago')::date)
);
CREATE INDEX player_2048_activity_days_day_idx
  ON private.player_2048_activity_days(activity_day, user_id);
ALTER TABLE private.player_2048_activity_days ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.player_2048_activity_days FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT SELECT, INSERT, UPDATE ON private.player_2048_activity_days TO service_role;

CREATE FUNCTION public.record_2048_player_activity(p_user_id uuid, p_mode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  observed_at timestamptz := clock_timestamp();
  chile_day date := (observed_at AT TIME ZONE 'America/Santiago')::date;
BEGIN
  IF p_user_id IS NULL OR p_mode IS NULL OR p_mode NOT IN ('practice', 'daily') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid 2048 account activity';
  END IF;
  INSERT INTO private.player_2048_activity_days AS existing
    (user_id, activity_day, first_seen_at, last_seen_at, practice, daily)
  VALUES (p_user_id, chile_day, observed_at, observed_at, p_mode = 'practice', p_mode = 'daily')
  ON CONFLICT (user_id, activity_day) DO UPDATE SET
    first_seen_at = LEAST(existing.first_seen_at, EXCLUDED.first_seen_at),
    last_seen_at = GREATEST(existing.last_seen_at, EXCLUDED.last_seen_at),
    practice = existing.practice OR EXCLUDED.practice,
    daily = existing.daily OR EXCLUDED.daily;
  RETURN jsonb_build_object('activityDay', chile_day);
END;
$$;
REVOKE ALL ON FUNCTION public.record_2048_player_activity(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_2048_player_activity(uuid, text) TO service_role;

CREATE FUNCTION public.report_2048_player_retention(p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  as_of_day date := (clock_timestamp() AT TIME ZONE 'America/Santiago')::date;
  result jsonb;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 89 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Expected an inclusive date range of at most 90 days';
  END IF;
  WITH first_known AS (
    -- Read the entire retained history before filtering acquisition cohorts.
    SELECT user_id, min(activity_day) AS cohort_day
    FROM private.player_2048_activity_days GROUP BY user_id
  ), account_returns AS (
    SELECT f.user_id, f.cohort_day,
      f.cohort_day + 1 < as_of_day AS d1_mature,
      f.cohort_day + 7 < as_of_day AS d7_mature,
      EXISTS (SELECT 1 FROM private.player_2048_activity_days a WHERE a.user_id = f.user_id AND a.activity_day = f.cohort_day + 1) AS d1_returned,
      EXISTS (SELECT 1 FROM private.player_2048_activity_days a WHERE a.user_id = f.user_id AND a.activity_day = f.cohort_day + 7) AS d7_returned
    FROM first_known f WHERE f.cohort_day BETWEEN p_from AND p_to
  ), days AS (
    SELECT p_from + offset_day AS cohort_day FROM generate_series(0, p_to - p_from) AS offset_day
  ), aggregates AS (
    SELECT d.cohort_day, count(a.user_id) AS accounts,
      count(a.user_id) FILTER (WHERE a.d1_mature) AS d1_eligible,
      count(a.user_id) FILTER (WHERE a.d1_mature AND a.d1_returned) AS d1_returned,
      count(a.user_id) FILTER (WHERE a.d7_mature) AS d7_eligible,
      count(a.user_id) FILTER (WHERE a.d7_mature AND a.d7_returned) AS d7_returned
    FROM days d LEFT JOIN account_returns a USING (cohort_day)
    GROUP BY d.cohort_day
  ), totals AS (
    SELECT sum(accounts) AS accounts, sum(d1_eligible) AS d1_eligible, sum(d1_returned) AS d1_returned,
      sum(d7_eligible) AS d7_eligible, sum(d7_returned) AS d7_returned FROM aggregates
  )
  SELECT jsonb_build_object(
    'version', 1, 'unit', 'accounts', 'source', 'self_reported_first_valid_move',
    'cohortBasis', 'first_known_activity_day', 'timezone', 'America/Santiago',
    'from', p_from, 'to', p_to, 'asOfChileDay', as_of_day,
    'cohorts', (SELECT jsonb_agg(jsonb_build_object(
      'cohortDay', cohort_day, 'accounts', accounts,
      'day1', jsonb_build_object('eligibleAccounts', d1_eligible, 'returnedAccounts', d1_returned, 'rate', d1_returned::numeric / NULLIF(d1_eligible, 0)),
      'day7', jsonb_build_object('eligibleAccounts', d7_eligible, 'returnedAccounts', d7_returned, 'rate', d7_returned::numeric / NULLIF(d7_eligible, 0))
    ) ORDER BY cohort_day) FROM aggregates),
    'totals', (SELECT jsonb_build_object(
      'accounts', accounts,
      'day1', jsonb_build_object('eligibleAccounts', d1_eligible, 'returnedAccounts', d1_returned, 'rate', d1_returned::numeric / NULLIF(d1_eligible, 0)),
      'day7', jsonb_build_object('eligibleAccounts', d7_eligible, 'returnedAccounts', d7_returned, 'rate', d7_returned::numeric / NULLIF(d7_eligible, 0))
    ) FROM totals)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.report_2048_player_retention(date, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.report_2048_player_retention(date, date) TO service_role;

COMMENT ON TABLE private.player_2048_activity_days IS
  'Self-reported first-valid-move activity, one authenticated account/day in America/Santiago. Not verified play, people, acquisition, competitive integrity or payment.';
COMMENT ON FUNCTION public.report_2048_player_retention(date, date) IS
  'Aggregate account cohorts from first known retained activity; exact calendar D1/D7 eligible only after the target Chile day has ended. No PII.';

COMMIT;
