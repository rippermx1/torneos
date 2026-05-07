-- ============================================================
-- Ruta 1: cobro directo Flow por inscripcion. Wallet solo para
-- premios y retiros (sin depositos prepagados).
--
-- Cambios:
-- 1. prize_model: solo 'entry_pool' permitido. Drop 'fixed'.
-- 2. flow_payment_attempts: nueva columna intent para distinguir
--    flujos de inscripcion vs deposito legado.
-- 3. register_for_tournament: ya no debita wallet. Solo crea la
--    fila de inscripcion. El flujo de cobro lo maneja Flow.
-- 4. settle_tournament_registration: nueva funcion atomica
--    invocada desde el webhook Flow tras confirmar payment.
-- 5. wallet_withdrawable_balance: refunds de torneo retirables.
-- 6. dte_documents: tabla para tracking de boletas LibreDTE.
-- 7. wallet_credit_flow_payment: eliminada (no mas depositos).
-- 8. monthly_platform_finance: simplificada (entry_pool unico).
-- ============================================================

BEGIN;

-- 1) PRIZE_MODEL: SOLO ENTRY_POOL ────────────────────────────
-- Algunos torneos legacy/pre-release quedaron con apertura de inscripcion
-- igual al inicio de juego. Cualquier UPDATE futuro revalida el CHECK
-- registration_strictly_before_play, asi que se normalizan antes de tocar
-- prize_model.
UPDATE tournaments
SET registration_opens_at = play_window_start - interval '1 minute'
WHERE registration_opens_at >= play_window_start;

UPDATE tournaments
SET play_window_end = play_window_start + make_interval(secs => max_game_duration_seconds)
WHERE play_window_end < play_window_start + make_interval(secs => max_game_duration_seconds);

UPDATE tournaments
SET
  prize_model = 'entry_pool',
  prize_fund_bps = COALESCE(NULLIF(prize_fund_bps, 0), 8500),
  platform_fee_bps = COALESCE(NULLIF(platform_fee_bps, 0), 1500)
WHERE prize_model IS DISTINCT FROM 'entry_pool';

UPDATE registrations
SET prize_model = 'entry_pool'
WHERE prize_model IS DISTINCT FROM 'entry_pool';

-- Drop el CHECK auto-nombrado del ADD COLUMN original
DO $$
DECLARE
  v_constraint text;
BEGIN
  FOR v_constraint IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'tournaments'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%prize_model%fixed%'
  LOOP
    EXECUTE format('ALTER TABLE tournaments DROP CONSTRAINT %I', v_constraint);
  END LOOP;
END;
$$;

ALTER TABLE tournaments
  ADD CONSTRAINT tournaments_prize_model_check
  CHECK (prize_model = 'entry_pool');

ALTER TABLE tournaments
  ALTER COLUMN prize_model SET DEFAULT 'entry_pool';

ALTER TABLE registrations
  DROP CONSTRAINT IF EXISTS registrations_accounting_amounts_valid;

ALTER TABLE registrations
  ADD CONSTRAINT registrations_accounting_amounts_valid CHECK (
    (entry_fee_cents IS NULL OR entry_fee_cents >= 0)
    AND (prize_fund_contribution_cents IS NULL OR prize_fund_contribution_cents >= 0)
    AND (platform_fee_gross_cents IS NULL OR platform_fee_gross_cents >= 0)
    AND (platform_fee_net_cents IS NULL OR platform_fee_net_cents >= 0)
    AND (platform_fee_iva_cents IS NULL OR platform_fee_iva_cents >= 0)
    AND (prize_model IS NULL OR prize_model = 'entry_pool')
  );

-- 2) FLOW_PAYMENT_ATTEMPTS: INTENT + TOURNAMENT_ID ──────────
ALTER TABLE flow_payment_attempts
  ADD COLUMN IF NOT EXISTS intent text NOT NULL DEFAULT 'wallet_deposit'
    CHECK (intent IN ('wallet_deposit', 'tournament_registration')),
  ADD COLUMN IF NOT EXISTS tournament_id uuid REFERENCES tournaments(id);

ALTER TABLE flow_payment_attempts
  DROP CONSTRAINT IF EXISTS flow_attempts_intent_consistency;

ALTER TABLE flow_payment_attempts
  ADD CONSTRAINT flow_attempts_intent_consistency CHECK (
    (intent = 'tournament_registration' AND tournament_id IS NOT NULL)
    OR (intent = 'wallet_deposit' AND tournament_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_flow_attempts_tournament
  ON flow_payment_attempts(tournament_id) WHERE tournament_id IS NOT NULL;

-- 3) REGISTER_FOR_TOURNAMENT: SIN WALLET DEBIT ──────────────
DROP FUNCTION IF EXISTS register_for_tournament(uuid, uuid, bigint);

CREATE OR REPLACE FUNCTION register_for_tournament(
  p_user_id uuid,
  p_tournament_id uuid,
  p_entry_fee_cents bigint
) RETURNS uuid AS $$
DECLARE
  v_tournament tournaments%ROWTYPE;
  v_registration_count bigint;
  v_prize_fund_contribution bigint;
  v_platform_fee_gross bigint;
  v_platform_fee_iva bigint;
  v_platform_fee_net bigint;
  v_accounting_metadata jsonb;
  v_registration_id uuid;
BEGIN
  SELECT *
  INTO v_tournament
  FROM tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Torneo no encontrado: %', p_tournament_id;
  END IF;

  IF v_tournament.status NOT IN ('scheduled', 'open') THEN
    RAISE EXCEPTION 'Inscripciones cerradas';
  END IF;

  IF now() < v_tournament.registration_opens_at OR now() >= v_tournament.play_window_start THEN
    RAISE EXCEPTION 'Inscripciones cerradas';
  END IF;

  IF p_entry_fee_cents <> v_tournament.entry_fee_cents THEN
    RAISE EXCEPTION 'Cuota inconsistente: esperado=%, recibido=%',
      v_tournament.entry_fee_cents, p_entry_fee_cents;
  END IF;

  SELECT COUNT(*)
  INTO v_registration_count
  FROM registrations
  WHERE tournament_id = p_tournament_id;

  IF v_registration_count >= v_tournament.max_players THEN
    RAISE EXCEPTION 'Torneo lleno';
  END IF;

  IF p_entry_fee_cents > 0 THEN
    v_prize_fund_contribution :=
      ROUND((p_entry_fee_cents * v_tournament.prize_fund_bps)::numeric / 10000)::bigint;
    v_platform_fee_gross := p_entry_fee_cents - v_prize_fund_contribution;
    v_platform_fee_iva :=
      ROUND((v_platform_fee_gross * 1900)::numeric / 11900)::bigint;
    v_platform_fee_net := v_platform_fee_gross - v_platform_fee_iva;
  ELSE
    v_prize_fund_contribution := NULL;
    v_platform_fee_gross := NULL;
    v_platform_fee_iva := NULL;
    v_platform_fee_net := NULL;
  END IF;

  v_accounting_metadata := jsonb_strip_nulls(jsonb_build_object(
    'prize_model', v_tournament.prize_model,
    'entry_fee_cents', p_entry_fee_cents,
    'prize_fund_bps', v_tournament.prize_fund_bps,
    'platform_fee_bps', v_tournament.platform_fee_bps,
    'prize_fund_contribution_cents', v_prize_fund_contribution,
    'platform_fee_gross_cents', v_platform_fee_gross,
    'platform_fee_net_cents', v_platform_fee_net,
    'platform_fee_iva_cents', v_platform_fee_iva
  ));

  INSERT INTO registrations (
    tournament_id,
    user_id,
    entry_fee_cents,
    prize_fund_contribution_cents,
    platform_fee_gross_cents,
    platform_fee_net_cents,
    platform_fee_iva_cents,
    prize_model,
    accounting_metadata
  )
  VALUES (
    p_tournament_id,
    p_user_id,
    p_entry_fee_cents,
    v_prize_fund_contribution,
    v_platform_fee_gross,
    v_platform_fee_net,
    v_platform_fee_iva,
    v_tournament.prize_model,
    v_accounting_metadata
  )
  RETURNING id INTO v_registration_id;

  RETURN v_registration_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION register_for_tournament(uuid, uuid, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION register_for_tournament(uuid, uuid, bigint)
  TO service_role;

-- 4) SETTLE_TOURNAMENT_REGISTRATION: WEBHOOK FLOW ───────────
-- Llamada desde el webhook Flow tras validar status=paid.
-- Atomica: marca attempt paid + crea registration + retorna ids.
-- Idempotente por commerce_order.
CREATE OR REPLACE FUNCTION settle_tournament_registration(
  p_commerce_order text,
  p_flow_token text,
  p_flow_order bigint,
  p_amount_cents bigint,
  p_payment_method text,
  p_payer_email text,
  p_raw jsonb
) RETURNS jsonb AS $$
DECLARE
  v_attempt flow_payment_attempts%ROWTYPE;
  v_registration_id uuid;
  v_existing_id uuid;
BEGIN
  SELECT *
  INTO v_attempt
  FROM flow_payment_attempts
  WHERE commerce_order = p_commerce_order
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attempt no encontrado: %', p_commerce_order;
  END IF;

  IF v_attempt.intent <> 'tournament_registration' THEN
    RAISE EXCEPTION 'Intent invalido para settlement de torneo: %', v_attempt.intent;
  END IF;

  IF v_attempt.charged_amount_cents <> p_amount_cents THEN
    RAISE EXCEPTION 'Monto inconsistente: esperado=%, recibido=%',
      v_attempt.charged_amount_cents, p_amount_cents;
  END IF;

  -- Idempotencia: si ya esta paid, retornar registration existente
  IF v_attempt.status = 'paid' THEN
    SELECT id INTO v_existing_id
    FROM registrations
    WHERE tournament_id = v_attempt.tournament_id
      AND user_id = v_attempt.user_id
    LIMIT 1;
    RETURN jsonb_build_object(
      'idempotent', true,
      'registration_id', v_existing_id,
      'attempt_id', v_attempt.id
    );
  END IF;

  IF v_attempt.status <> 'pending' THEN
    RAISE EXCEPTION 'Attempt en estado no acreditable: %', v_attempt.status;
  END IF;

  -- Crear inscripcion (puede fallar por capacidad/ventana → abort transaccion)
  v_registration_id := register_for_tournament(
    v_attempt.user_id,
    v_attempt.tournament_id,
    v_attempt.net_amount_cents
  );

  -- Marcar attempt como paid
  UPDATE flow_payment_attempts
  SET
    status           = 'paid',
    flow_token       = COALESCE(flow_token, p_flow_token),
    flow_order       = COALESCE(flow_order, p_flow_order),
    flow_status_code = 2,
    payment_method   = p_payment_method,
    payer_email      = p_payer_email,
    raw_response     = p_raw,
    settled_at       = now()
  WHERE id = v_attempt.id;

  RETURN jsonb_build_object(
    'idempotent', false,
    'registration_id', v_registration_id,
    'attempt_id', v_attempt.id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION settle_tournament_registration(text, text, bigint, bigint, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION settle_tournament_registration(text, text, bigint, bigint, text, text, jsonb)
  TO service_role;

-- 5) WALLET_WITHDRAWABLE_BALANCE: REFUNDS DE TORNEO RETIRABLES
-- En Ruta 1, un refund de torneo (cancelacion) puede acreditarse a
-- wallet si Flow no permite reversa directa. Ese saldo debe ser
-- retirable; de lo contrario el dinero queda atrapado.
CREATE OR REPLACE FUNCTION wallet_withdrawable_balance(p_user_id uuid)
  RETURNS bigint
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
AS $$
  SELECT COALESCE(SUM(
    CASE
      WHEN type = 'prize_credit' THEN amount_cents
      WHEN type = 'withdrawal' THEN amount_cents
      WHEN type = 'refund' AND reference_type IN ('tournament', 'withdrawal') THEN amount_cents
      ELSE 0
    END
  ), 0)::bigint
  FROM wallet_transactions
  WHERE user_id = p_user_id;
$$;

-- 6) DTE_DOCUMENTS: TRACKING DE BOLETAS LIBREDTE ─────────────
CREATE TABLE IF NOT EXISTS dte_documents (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id          uuid REFERENCES registrations(id) ON DELETE SET NULL,
  flow_payment_attempt_id  uuid NOT NULL REFERENCES flow_payment_attempts(id),
  document_type            text NOT NULL CHECK (document_type IN ('boleta_electronica', 'nota_credito')),
  -- Montos en centavos CLP. total = net + iva.
  -- Para boleta de inscripcion: total = platform_fee_gross_cents.
  total_cents              bigint NOT NULL CHECK (total_cents > 0),
  net_cents                bigint NOT NULL CHECK (net_cents > 0),
  iva_cents                bigint NOT NULL CHECK (iva_cents >= 0),
  -- Estado de emision
  status                   text NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'emitting', 'emitted', 'failed', 'cancelled')),
  -- Datos LibreDTE post-emision
  libredte_track_id        text,
  folio                    bigint,
  -- Manejo de errores y reintentos
  error_message            text,
  retry_count              int NOT NULL DEFAULT 0,
  last_attempted_at        timestamptz,
  -- Para notas de credito: referencia al DTE original
  references_dte_id        uuid REFERENCES dte_documents(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  emitted_at               timestamptz,

  CONSTRAINT dte_total_consistency CHECK (total_cents = net_cents + iva_cents)
);

CREATE INDEX IF NOT EXISTS idx_dte_status_pending
  ON dte_documents(status, created_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_dte_registration
  ON dte_documents(registration_id) WHERE registration_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dte_attempt
  ON dte_documents(flow_payment_attempt_id);

CREATE INDEX IF NOT EXISTS idx_dte_folio
  ON dte_documents(folio) WHERE folio IS NOT NULL;

ALTER TABLE dte_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON dte_documents FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON dte_documents TO service_role;

-- 7) ELIMINAR WALLET_CREDIT_FLOW_PAYMENT (no mas depositos) ──
-- Pre-launch: no hay usuarios con depositos historicos.
DROP FUNCTION IF EXISTS wallet_credit_flow_payment(text, text, bigint, bigint, text, text, jsonb);

-- 8) MONTHLY_PLATFORM_FINANCE: SIN FILTRO ENTRY_POOL ─────────
-- Ahora todos los torneos son entry_pool, el filtro era redundante.
DROP VIEW IF EXISTS monthly_platform_finance;

CREATE VIEW monthly_platform_finance AS
SELECT
  to_char(
    date_trunc('month', (r.registered_at AT TIME ZONE 'America/Santiago')),
    'YYYY-MM'
  ) AS period,
  COUNT(*)::bigint                                                AS registrations_count,
  COUNT(DISTINCT r.user_id)::bigint                               AS unique_users,
  COUNT(DISTINCT r.tournament_id)::bigint                         AS tournaments_with_revenue,
  COALESCE(SUM(r.entry_fee_cents), 0)::bigint                     AS gross_revenue_cents,
  COALESCE(SUM(r.prize_fund_contribution_cents), 0)::bigint       AS prize_fund_cents,
  COALESCE(SUM(r.platform_fee_gross_cents), 0)::bigint            AS platform_fee_gross_cents,
  COALESCE(SUM(r.platform_fee_net_cents), 0)::bigint              AS platform_fee_net_cents,
  COALESCE(SUM(r.platform_fee_iva_cents), 0)::bigint              AS platform_fee_iva_cents
FROM registrations r
WHERE r.entry_fee_cents IS NOT NULL
  AND r.entry_fee_cents > 0
GROUP BY 1;

REVOKE ALL ON monthly_platform_finance FROM anon, authenticated;
GRANT SELECT ON monthly_platform_finance TO service_role;

COMMIT;
