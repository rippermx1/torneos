-- ============================================================================
-- CONTABILIDAD CANONICA: INSCRIPCION AFECTA A IVA + LIBRO DE DOBLE PARTIDA
--
-- Modelo de negocio gobernado por esta migracion:
--   * El usuario compra una inscripcion individual a un torneo identificado.
--   * No existe deposito, custodia, pozo de terceros ni saldo monetario gastable.
--   * El precio publicado es final e incluye IVA. El voucher Flow respalda el
--     total cobrado; los premios son un gasto separado y NO rebajan el IVA.
--   * Una devolucion solo rebaja el debito fiscal cuando existe nota de credito.
--
-- El journal es inmutable, balanceado, idempotente y solo legible por service_role.
-- Los nombres wallet_* que aun existan son implementacion legada del subledger de
-- premios por cobrar; no representan una billetera financiera del usuario.
-- ============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

-- Reglas de piloto. Una nueva version debe publicarse mediante otra migracion;
-- nunca se reescribe historia contractual de torneos ya publicados.
CREATE TABLE IF NOT EXISTS public.platform_business_rules (
  version                  integer PRIMARY KEY,
  effective_from           timestamptz NOT NULL,
  vat_bps                  integer NOT NULL CHECK (vat_bps = 1900),
  prize_budget_bps         integer NOT NULL CHECK (prize_budget_bps BETWEEN 0 AND 10000),
  max_total_prize_cents    bigint NOT NULL CHECK (max_total_prize_cents > 0),
  max_first_prize_cents    bigint NOT NULL CHECK (max_first_prize_cents > 0),
  rewards_enabled          boolean NOT NULL,
  flow_fee_net_bps         integer NOT NULL CHECK (flow_fee_net_bps BETWEEN 0 AND 10000),
  flow_refund_fee_net_cents bigint NOT NULL CHECK (flow_refund_fee_net_cents >= 0),
  notes                    text NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_business_rules_prize_caps_valid
    CHECK (max_first_prize_cents <= max_total_prize_cents)
);

INSERT INTO public.platform_business_rules (
  version,
  effective_from,
  vat_bps,
  prize_budget_bps,
  max_total_prize_cents,
  max_first_prize_cents,
  rewards_enabled,
  flow_fee_net_bps,
  flow_refund_fee_net_cents,
  notes
) VALUES (
  1,
  '2026-08-04T00:00:00-04:00',
  1900,
  6500,
  7000000, -- $70.000 CLP
  4900000, -- $49.000 CLP: bajo el umbral operativo de revision reforzada
  false,
  319,
  20200,   -- $202 CLP netos
  'Piloto: precio final IVA incluido; premios no rebajan IVA; recompensas acumulables desactivadas.'
)
ON CONFLICT (version) DO NOTHING;

ALTER TABLE public.platform_business_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_business_rules FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.platform_business_rules TO service_role;

-- Los defaults solo afectan torneos nuevos. Los torneos ya publicados conservan
-- sus condiciones y premios.
ALTER TABLE public.tournaments
  ALTER COLUMN prize_fund_bps SET DEFAULT 6500,
  ALTER COLUMN platform_fee_bps SET DEFAULT 3500;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tournaments_pilot_prize_caps'
      AND conrelid = 'public.tournaments'::regclass
  ) THEN
    ALTER TABLE public.tournaments
      ADD CONSTRAINT tournaments_pilot_prize_caps
      CHECK (
        is_test
        OR (
          prize_1st_cents <= 4900000
          AND prize_1st_cents + prize_2nd_cents + prize_3rd_cents <= 7000000
        )
      ) NOT VALID;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tournament_prize_tiers_pilot_caps'
      AND conrelid = 'public.tournament_prize_tiers'::regclass
  ) THEN
    ALTER TABLE public.tournament_prize_tiers
      ADD CONSTRAINT tournament_prize_tiers_pilot_caps
      CHECK (prize_1st_cents <= 4900000 AND prize_fund_cents <= 7000000) NOT VALID;
  END IF;
END;
$$;

-- Seguimiento documental de devoluciones. Flow devuelve el dinero, pero para
-- rebajar el IVA del voucher se debe registrar la nota de credito correspondiente.
ALTER TABLE public.flow_refund_attempts
  ADD COLUMN IF NOT EXISTS tax_document_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS tax_document_number text,
  ADD COLUMN IF NOT EXISTS tax_document_issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS tax_document_notes text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'flow_refund_attempts_tax_document_status_check'
      AND conrelid = 'public.flow_refund_attempts'::regclass
  ) THEN
    ALTER TABLE public.flow_refund_attempts
      ADD CONSTRAINT flow_refund_attempts_tax_document_status_check
      CHECK (tax_document_status IN ('not_required', 'required', 'issued'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'flow_refund_attempts_tax_document_trace_check'
      AND conrelid = 'public.flow_refund_attempts'::regclass
  ) THEN
    ALTER TABLE public.flow_refund_attempts
      ADD CONSTRAINT flow_refund_attempts_tax_document_trace_check
      CHECK (
        tax_document_status <> 'issued'
        OR (
          length(trim(COALESCE(tax_document_number, ''))) >= 1
          AND tax_document_issued_at IS NOT NULL
        )
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_flow_refunds_tax_document_pending
  ON public.flow_refund_attempts(settled_at)
  WHERE status = 'completed' AND tax_document_status = 'required';

-- --------------------------------------------------------------------------
-- Plan de cuentas y journal inmutable.
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.accounting_accounts (
  code            text PRIMARY KEY,
  name            text NOT NULL,
  category        text NOT NULL CHECK (category IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  normal_balance  text NOT NULL CHECK (normal_balance IN ('debit', 'credit')),
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.accounting_accounts (code, name, category, normal_balance) VALUES
  ('110100', 'Banco', 'asset', 'debit'),
  ('110200', 'Flow por liquidar', 'asset', 'debit'),
  ('110300', 'IVA credito fiscal', 'asset', 'debit'),
  ('110400', 'IVA de notas de credito pendientes', 'asset', 'debit'),
  ('210100', 'IVA debito fiscal por pagar', 'liability', 'credit'),
  ('210200', 'Premios por pagar', 'liability', 'credit'),
  ('210300', 'Ingresos diferidos por torneos', 'liability', 'credit'),
  ('310100', 'Ajustes de apertura', 'equity', 'credit'),
  ('410100', 'Ingresos netos por inscripciones', 'revenue', 'credit'),
  ('410200', 'Devoluciones de inscripciones', 'revenue', 'debit'),
  ('510100', 'Gasto por premios de torneos', 'expense', 'debit'),
  ('520100', 'Comision de recaudacion Flow', 'expense', 'debit'),
  ('520200', 'Comision por reembolsos Flow', 'expense', 'debit'),
  ('520300', 'Premios promocionales y freerolls', 'expense', 'debit')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  normal_balance = EXCLUDED.normal_balance;

CREATE TABLE IF NOT EXISTS public.accounting_journal_entries (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_key      text NOT NULL UNIQUE,
  event_type     text NOT NULL,
  source_table   text NOT NULL,
  source_id      uuid,
  tournament_id  uuid,
  user_id        uuid,
  occurred_at    timestamptz NOT NULL,
  period         text NOT NULL CHECK (period ~ '^[0-9]{4}-[0-9]{2}$'),
  description    text NOT NULL,
  is_estimate    boolean NOT NULL DEFAULT false,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.accounting_postings (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  journal_entry_id  bigint NOT NULL REFERENCES public.accounting_journal_entries(id) ON DELETE RESTRICT,
  account_code      text NOT NULL REFERENCES public.accounting_accounts(code) ON DELETE RESTRICT,
  debit_cents       bigint NOT NULL DEFAULT 0 CHECK (debit_cents >= 0),
  credit_cents      bigint NOT NULL DEFAULT 0 CHECK (credit_cents >= 0),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounting_postings_one_side_check
    CHECK ((debit_cents > 0 AND credit_cents = 0) OR (credit_cents > 0 AND debit_cents = 0))
);

CREATE INDEX IF NOT EXISTS idx_accounting_entries_period
  ON public.accounting_journal_entries(period, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_accounting_entries_event_type
  ON public.accounting_journal_entries(event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_accounting_entries_tournament
  ON public.accounting_journal_entries(tournament_id)
  WHERE tournament_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_accounting_entries_user
  ON public.accounting_journal_entries(user_id)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_accounting_postings_entry
  ON public.accounting_postings(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_accounting_postings_account
  ON public.accounting_postings(account_code, journal_entry_id);

ALTER TABLE public.accounting_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_postings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.accounting_accounts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.accounting_journal_entries FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.accounting_postings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.accounting_accounts TO service_role;
GRANT SELECT ON public.accounting_journal_entries TO service_role;
GRANT SELECT ON public.accounting_postings TO service_role;

CREATE OR REPLACE FUNCTION private.prevent_accounting_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'El libro contable es inmutable; registre un asiento reverso';
END;
$$;

CREATE OR REPLACE FUNCTION private.assert_accounting_entry_balanced()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_entry_id bigint := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
  v_debits bigint;
  v_credits bigint;
BEGIN
  SELECT COALESCE(SUM(p.debit_cents), 0), COALESCE(SUM(p.credit_cents), 0)
  INTO v_debits, v_credits
  FROM public.accounting_postings AS p
  WHERE p.journal_entry_id = v_entry_id;

  IF v_debits <= 0 OR v_debits <> v_credits THEN
    RAISE EXCEPTION 'Asiento % desbalanceado: debe=%, haber=%', v_entry_id, v_debits, v_credits;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS accounting_entries_immutable ON public.accounting_journal_entries;
CREATE TRIGGER accounting_entries_immutable
  BEFORE UPDATE OR DELETE ON public.accounting_journal_entries
  FOR EACH ROW EXECUTE FUNCTION private.prevent_accounting_mutation();

DROP TRIGGER IF EXISTS accounting_postings_immutable ON public.accounting_postings;
CREATE TRIGGER accounting_postings_immutable
  BEFORE UPDATE OR DELETE ON public.accounting_postings
  FOR EACH ROW EXECUTE FUNCTION private.prevent_accounting_mutation();

DROP TRIGGER IF EXISTS accounting_postings_balanced ON public.accounting_postings;
CREATE CONSTRAINT TRIGGER accounting_postings_balanced
  AFTER INSERT ON public.accounting_postings
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION private.assert_accounting_entry_balanced();

CREATE OR REPLACE FUNCTION private.post_accounting_entry(
  p_event_key text,
  p_event_type text,
  p_source_table text,
  p_source_id uuid,
  p_tournament_id uuid,
  p_user_id uuid,
  p_occurred_at timestamptz,
  p_description text,
  p_postings jsonb,
  p_is_estimate boolean DEFAULT false,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_entry_id bigint;
  v_count integer;
  v_debits bigint;
  v_credits bigint;
BEGIN
  IF length(trim(COALESCE(p_event_key, ''))) = 0 THEN
    RAISE EXCEPTION 'event_key es obligatorio';
  END IF;
  IF p_occurred_at IS NULL THEN
    RAISE EXCEPTION 'occurred_at es obligatorio';
  END IF;
  IF jsonb_typeof(p_postings) <> 'array' THEN
    RAISE EXCEPTION 'postings debe ser un arreglo JSON';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_event_key, 0));

  SELECT e.id INTO v_entry_id
  FROM public.accounting_journal_entries AS e
  WHERE e.event_key = p_event_key;
  IF FOUND THEN
    RETURN v_entry_id;
  END IF;

  SELECT
    COUNT(*)::integer,
    COALESCE(SUM(x.debit_cents), 0)::bigint,
    COALESCE(SUM(x.credit_cents), 0)::bigint
  INTO v_count, v_debits, v_credits
  FROM jsonb_to_recordset(p_postings) AS x(
    account_code text,
    debit_cents bigint,
    credit_cents bigint
  );

  IF v_count < 2 OR v_debits <= 0 OR v_debits <> v_credits THEN
    RAISE EXCEPTION 'Asiento invalido: lineas=%, debe=%, haber=%', v_count, v_debits, v_credits;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_postings) AS x(
      account_code text,
      debit_cents bigint,
      credit_cents bigint
    )
    WHERE length(trim(COALESCE(x.account_code, ''))) = 0
       OR COALESCE(x.debit_cents, 0) < 0
       OR COALESCE(x.credit_cents, 0) < 0
       OR NOT (
         (COALESCE(x.debit_cents, 0) > 0 AND COALESCE(x.credit_cents, 0) = 0)
         OR (COALESCE(x.credit_cents, 0) > 0 AND COALESCE(x.debit_cents, 0) = 0)
       )
  ) THEN
    RAISE EXCEPTION 'Cada linea debe usar exactamente un lado y un monto positivo';
  END IF;

  INSERT INTO public.accounting_journal_entries (
    event_key,
    event_type,
    source_table,
    source_id,
    tournament_id,
    user_id,
    occurred_at,
    period,
    description,
    is_estimate,
    metadata
  ) VALUES (
    p_event_key,
    p_event_type,
    p_source_table,
    p_source_id,
    p_tournament_id,
    p_user_id,
    p_occurred_at,
    to_char(p_occurred_at AT TIME ZONE 'America/Santiago', 'YYYY-MM'),
    p_description,
    p_is_estimate,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_entry_id;

  INSERT INTO public.accounting_postings (
    journal_entry_id,
    account_code,
    debit_cents,
    credit_cents
  )
  SELECT
    v_entry_id,
    x.account_code,
    COALESCE(x.debit_cents, 0),
    COALESCE(x.credit_cents, 0)
  FROM jsonb_to_recordset(p_postings) AS x(
    account_code text,
    debit_cents bigint,
    credit_cents bigint
  );

  RETURN v_entry_id;
END;
$$;

-- --------------------------------------------------------------------------
-- Adaptadores de eventos de negocio -> asientos.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.post_flow_payment(p_attempt_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempt public.flow_payment_attempts%ROWTYPE;
  v_gross bigint;
  v_iva bigint;
  v_net bigint;
  v_fee_net bigint;
  v_fee_iva bigint;
  v_fee_gross bigint;
BEGIN
  SELECT * INTO v_attempt
  FROM public.flow_payment_attempts
  WHERE id = p_attempt_id;

  IF NOT FOUND
     OR v_attempt.intent <> 'tournament_registration'
     OR v_attempt.flow_status_code <> 2
     OR v_attempt.status NOT IN ('paid', 'cancelled')
     OR v_attempt.payment_method = 'simulation' THEN
    RETURN;
  END IF;

  v_gross := v_attempt.charged_amount_cents;
  v_iva := ROUND((v_gross * 1900)::numeric / 11900)::bigint;
  v_net := v_gross - v_iva;

  PERFORM private.post_accounting_entry(
    'ticket_sale:' || v_attempt.id,
    'ticket_sale',
    'flow_payment_attempts',
    v_attempt.id,
    v_attempt.tournament_id,
    v_attempt.user_id,
    COALESCE(v_attempt.settled_at, v_attempt.created_at),
    'Venta de inscripcion con precio final IVA incluido',
    jsonb_build_array(
      jsonb_build_object('account_code', '110200', 'debit_cents', v_gross, 'credit_cents', 0),
      jsonb_build_object('account_code', '210100', 'debit_cents', 0, 'credit_cents', v_iva),
      jsonb_build_object('account_code', '210300', 'debit_cents', 0, 'credit_cents', v_net)
    ),
    false,
    jsonb_build_object(
      'commerce_order', v_attempt.commerce_order,
      'flow_order', v_attempt.flow_order,
      'gross_cents', v_gross,
      'net_cents', v_net,
      'iva_cents', v_iva,
      'tax_document', 'flow_voucher'
    )
  );

  -- La tarifa es una provision de gestion. El credito fiscal solo se lleva al
  -- F29 cuando la factura Flow aparece en el RCV; por eso is_estimate=true.
  v_fee_net := ROUND((v_gross * 319)::numeric / 10000)::bigint;
  v_fee_iva := ROUND((v_fee_net * 1900)::numeric / 10000)::bigint;
  v_fee_gross := v_fee_net + v_fee_iva;
  IF v_fee_gross > 0 THEN
    PERFORM private.post_accounting_entry(
      'flow_fee_estimate:' || v_attempt.id,
      'flow_fee_estimate',
      'flow_payment_attempts',
      v_attempt.id,
      v_attempt.tournament_id,
      v_attempt.user_id,
      COALESCE(v_attempt.settled_at, v_attempt.created_at),
      'Provision estimada de comision Flow 3,19% mas IVA',
      jsonb_build_array(
        jsonb_build_object('account_code', '520100', 'debit_cents', v_fee_net, 'credit_cents', 0),
        jsonb_build_object('account_code', '110300', 'debit_cents', v_fee_iva, 'credit_cents', 0),
        jsonb_build_object('account_code', '110200', 'debit_cents', 0, 'credit_cents', v_fee_gross)
      ),
      true,
      jsonb_build_object('fee_net_bps', 319, 'requires_flow_invoice_reconciliation', true)
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.post_tournament_completion(
  p_tournament_id uuid,
  p_occurred_at timestamptz DEFAULT now()
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tournament public.tournaments%ROWTYPE;
  v_deferred_net bigint;
  v_prizes bigint;
  v_expense_account text;
BEGIN
  SELECT * INTO v_tournament
  FROM public.tournaments
  WHERE id = p_tournament_id;
  IF NOT FOUND OR v_tournament.status <> 'completed' OR v_tournament.is_test THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(p.credit_cents - p.debit_cents), 0)::bigint
  INTO v_deferred_net
  FROM public.accounting_journal_entries AS e
  JOIN public.accounting_postings AS p ON p.journal_entry_id = e.id
  WHERE e.event_type = 'ticket_sale'
    AND e.tournament_id = p_tournament_id
    AND p.account_code = '210300';

  IF v_deferred_net > 0 THEN
    PERFORM private.post_accounting_entry(
      'tournament_revenue_recognized:' || p_tournament_id,
      'tournament_revenue_recognized',
      'tournaments',
      p_tournament_id,
      p_tournament_id,
      NULL,
      p_occurred_at,
      'Servicio del torneo completado; reconocimiento del ingreso neto',
      jsonb_build_array(
        jsonb_build_object('account_code', '210300', 'debit_cents', v_deferred_net, 'credit_cents', 0),
        jsonb_build_object('account_code', '410100', 'debit_cents', 0, 'credit_cents', v_deferred_net)
      )
    );
  END IF;

  SELECT COALESCE(SUM(r.prize_awarded_cents), 0)::bigint
  INTO v_prizes
  FROM public.tournament_results AS r
  WHERE r.tournament_id = p_tournament_id;

  IF v_prizes > 0 THEN
    v_expense_account := CASE WHEN v_tournament.entry_fee_cents = 0 THEN '520300' ELSE '510100' END;
    PERFORM private.post_accounting_entry(
      'prizes_awarded:' || p_tournament_id,
      'prizes_awarded',
      'tournaments',
      p_tournament_id,
      p_tournament_id,
      NULL,
      p_occurred_at,
      'Premios adjudicados y obligacion de pago reconocida',
      jsonb_build_array(
        jsonb_build_object('account_code', v_expense_account, 'debit_cents', v_prizes, 'credit_cents', 0),
        jsonb_build_object('account_code', '210200', 'debit_cents', 0, 'credit_cents', v_prizes)
      )
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.post_flow_refund(p_refund_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_refund public.flow_refund_attempts%ROWTYPE;
  v_attempt public.flow_payment_attempts%ROWTYPE;
  v_net bigint;
  v_iva bigint;
  v_revenue_recognized boolean;
  v_refund_account text;
  v_fee_net bigint := 20200;
  v_fee_iva bigint;
  v_fee_gross bigint;
BEGIN
  SELECT * INTO v_refund
  FROM public.flow_refund_attempts
  WHERE id = p_refund_id;
  IF NOT FOUND OR v_refund.status <> 'completed' THEN
    RETURN;
  END IF;

  SELECT * INTO v_attempt
  FROM public.flow_payment_attempts
  WHERE id = v_refund.flow_payment_attempt_id;
  IF NOT FOUND OR v_attempt.payment_method = 'simulation' THEN
    RETURN;
  END IF;

  -- Garantiza que tambien exista la venta para pagos confirmados que no pudieron
  -- asentar inscripcion y pasaron directamente de pending a cancelled.
  PERFORM private.post_flow_payment(v_attempt.id);

  v_iva := ROUND((v_refund.amount_cents * 1900)::numeric / 11900)::bigint;
  v_net := v_refund.amount_cents - v_iva;
  SELECT EXISTS (
    SELECT 1 FROM public.accounting_journal_entries AS e
    WHERE e.event_key = 'tournament_revenue_recognized:' || v_refund.tournament_id
  ) INTO v_revenue_recognized;
  v_refund_account := CASE WHEN v_revenue_recognized THEN '410200' ELSE '210300' END;

  PERFORM private.post_accounting_entry(
    'ticket_refund:' || v_refund.flow_payment_attempt_id,
    'ticket_refund',
    'flow_refund_attempts',
    v_refund.id,
    v_refund.tournament_id,
    v_refund.user_id,
    COALESCE(v_refund.settled_at, v_refund.created_at),
    'Devolucion de inscripcion completada por Flow',
    jsonb_build_array(
      jsonb_build_object('account_code', v_refund_account, 'debit_cents', v_net, 'credit_cents', 0),
      jsonb_build_object('account_code', '110400', 'debit_cents', v_iva, 'credit_cents', 0),
      jsonb_build_object('account_code', '110200', 'debit_cents', 0, 'credit_cents', v_refund.amount_cents)
    ),
    false,
    jsonb_build_object('credit_note_required', true, 'gross_cents', v_refund.amount_cents, 'iva_cents', v_iva)
  );

  v_fee_iva := ROUND((v_fee_net * 1900)::numeric / 10000)::bigint;
  v_fee_gross := v_fee_net + v_fee_iva;
  PERFORM private.post_accounting_entry(
    'flow_refund_fee_estimate:' || v_refund.id,
    'flow_refund_fee_estimate',
    'flow_refund_attempts',
    v_refund.id,
    v_refund.tournament_id,
    v_refund.user_id,
    COALESCE(v_refund.settled_at, v_refund.created_at),
    'Provision estimada de tarifa Flow por reembolso',
    jsonb_build_array(
      jsonb_build_object('account_code', '520200', 'debit_cents', v_fee_net, 'credit_cents', 0),
      jsonb_build_object('account_code', '110300', 'debit_cents', v_fee_iva, 'credit_cents', 0),
      jsonb_build_object('account_code', '110200', 'debit_cents', 0, 'credit_cents', v_fee_gross)
    ),
    true,
    jsonb_build_object('requires_flow_invoice_reconciliation', true)
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.post_refund_credit_note(p_refund_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_refund public.flow_refund_attempts%ROWTYPE;
  v_iva bigint;
BEGIN
  SELECT * INTO v_refund
  FROM public.flow_refund_attempts
  WHERE id = p_refund_id;
  IF NOT FOUND OR v_refund.status <> 'completed' OR v_refund.tax_document_status <> 'issued' THEN
    RETURN;
  END IF;

  PERFORM private.post_flow_refund(v_refund.id);
  v_iva := ROUND((v_refund.amount_cents * 1900)::numeric / 11900)::bigint;
  IF v_iva > 0 THEN
    PERFORM private.post_accounting_entry(
      'refund_credit_note:' || v_refund.flow_payment_attempt_id,
      'refund_credit_note',
      'flow_refund_attempts',
      v_refund.id,
      v_refund.tournament_id,
      v_refund.user_id,
      v_refund.tax_document_issued_at,
      'Nota de credito emitida; rebaja documentada del debito fiscal',
      jsonb_build_array(
        jsonb_build_object('account_code', '210100', 'debit_cents', v_iva, 'credit_cents', 0),
        jsonb_build_object('account_code', '110400', 'debit_cents', 0, 'credit_cents', v_iva)
      ),
      false,
      jsonb_build_object('tax_document_number', v_refund.tax_document_number)
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.post_prize_payout(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payout public.withdrawal_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_payout
  FROM public.withdrawal_requests
  WHERE id = p_request_id;
  IF NOT FOUND OR v_payout.status <> 'paid' OR v_payout.paid_at IS NULL THEN
    RETURN;
  END IF;

  PERFORM private.post_accounting_entry(
    'prize_payout:' || v_payout.id,
    'prize_payout',
    'withdrawal_requests',
    v_payout.id,
    NULL,
    v_payout.user_id,
    v_payout.paid_at,
    'Transferencia bancaria de premios al ganador',
    jsonb_build_array(
      jsonb_build_object('account_code', '210200', 'debit_cents', v_payout.amount_cents, 'credit_cents', 0),
      jsonb_build_object('account_code', '110100', 'debit_cents', 0, 'credit_cents', v_payout.amount_cents)
    ),
    false,
    jsonb_build_object(
      'receipt_number', v_payout.receipt_number,
      'bank_transfer_reference', v_payout.bank_transfer_reference,
      'proof_storage_path', v_payout.proof_storage_path
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.on_flow_payment_accounting()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.post_flow_payment(NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.on_tournament_completion_accounting()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'completed'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM private.post_tournament_completion(NEW.id, now());
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.on_refund_accounting()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.tax_document_status = 'not_required' THEN
      NEW.tax_document_status := 'required';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.after_refund_accounting()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'completed' THEN
    PERFORM private.post_flow_refund(NEW.id);
    IF NEW.tax_document_status = 'issued' THEN
      PERFORM private.post_refund_credit_note(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.on_prize_payout_accounting()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM private.post_prize_payout(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS flow_payment_accounting ON public.flow_payment_attempts;
CREATE TRIGGER flow_payment_accounting
  AFTER INSERT OR UPDATE ON public.flow_payment_attempts
  FOR EACH ROW EXECUTE FUNCTION private.on_flow_payment_accounting();

DROP TRIGGER IF EXISTS tournament_completion_accounting ON public.tournaments;
CREATE TRIGGER tournament_completion_accounting
  AFTER UPDATE ON public.tournaments
  FOR EACH ROW EXECUTE FUNCTION private.on_tournament_completion_accounting();

DROP TRIGGER IF EXISTS refund_tax_document_required ON public.flow_refund_attempts;
CREATE TRIGGER refund_tax_document_required
  BEFORE INSERT OR UPDATE ON public.flow_refund_attempts
  FOR EACH ROW EXECUTE FUNCTION private.on_refund_accounting();

DROP TRIGGER IF EXISTS flow_refund_accounting ON public.flow_refund_attempts;
CREATE TRIGGER flow_refund_accounting
  AFTER INSERT OR UPDATE ON public.flow_refund_attempts
  FOR EACH ROW EXECUTE FUNCTION private.after_refund_accounting();

DROP TRIGGER IF EXISTS prize_payout_accounting ON public.withdrawal_requests;
CREATE TRIGGER prize_payout_accounting
  AFTER UPDATE ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION private.on_prize_payout_accounting();

-- Vistas solo administrativas. security_invoker evita privilegios heredados del
-- creador; service_role es el unico rol con SELECT sobre tablas y vistas.
DROP VIEW IF EXISTS public.accounting_trial_balance;
CREATE VIEW public.accounting_trial_balance
WITH (security_invoker = true)
AS
SELECT
  e.period,
  e.is_estimate,
  a.code AS account_code,
  a.name AS account_name,
  a.category,
  a.normal_balance,
  COALESCE(SUM(p.debit_cents), 0)::bigint AS debit_cents,
  COALESCE(SUM(p.credit_cents), 0)::bigint AS credit_cents,
  CASE
    WHEN a.normal_balance = 'debit'
      THEN COALESCE(SUM(p.debit_cents - p.credit_cents), 0)::bigint
    ELSE COALESCE(SUM(p.credit_cents - p.debit_cents), 0)::bigint
  END AS balance_cents
FROM public.accounting_journal_entries AS e
JOIN public.accounting_postings AS p ON p.journal_entry_id = e.id
JOIN public.accounting_accounts AS a ON a.code = p.account_code
GROUP BY e.period, e.is_estimate, a.code, a.name, a.category, a.normal_balance;

DROP VIEW IF EXISTS public.accounting_journal_lines;
CREATE VIEW public.accounting_journal_lines
WITH (security_invoker = true)
AS
SELECT
  e.id AS journal_entry_id,
  e.event_key,
  e.event_type,
  e.source_table,
  e.source_id,
  e.tournament_id,
  e.user_id,
  e.occurred_at,
  e.period,
  e.description,
  e.is_estimate,
  p.id AS posting_id,
  p.account_code,
  a.name AS account_name,
  p.debit_cents,
  p.credit_cents
FROM public.accounting_journal_entries AS e
JOIN public.accounting_postings AS p ON p.journal_entry_id = e.id
JOIN public.accounting_accounts AS a ON a.code = p.account_code;

REVOKE ALL ON public.accounting_trial_balance FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.accounting_journal_lines FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.accounting_trial_balance TO service_role;
GRANT SELECT ON public.accounting_journal_lines TO service_role;

-- No se permite invocar estas funciones desde Data API.
REVOKE EXECUTE ON FUNCTION private.prevent_accounting_mutation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.assert_accounting_entry_balanced() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.post_accounting_entry(text, text, text, uuid, uuid, uuid, timestamptz, text, jsonb, boolean, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.post_flow_payment(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.post_tournament_completion(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.post_flow_refund(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.post_refund_credit_note(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.post_prize_payout(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.on_flow_payment_accounting() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.on_tournament_completion_accounting() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.on_refund_accounting() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.after_refund_accounting() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.on_prize_payout_accounting() FROM PUBLIC, anon, authenticated;

-- Backfill idempotente de datos reales existentes.
UPDATE public.flow_refund_attempts
SET tax_document_status = 'required'
WHERE status = 'completed' AND tax_document_status = 'not_required';

DO $$
DECLARE v_id uuid;
BEGIN
  FOR v_id IN
    SELECT id FROM public.flow_payment_attempts
    WHERE intent = 'tournament_registration'
      AND flow_status_code = 2
      AND status IN ('paid', 'cancelled')
      AND payment_method IS DISTINCT FROM 'simulation'
  LOOP
    PERFORM private.post_flow_payment(v_id);
  END LOOP;

  FOR v_id IN
    SELECT id FROM public.tournaments
    WHERE status = 'completed' AND NOT is_test
  LOOP
    PERFORM private.post_tournament_completion(v_id, now());
  END LOOP;

  FOR v_id IN
    SELECT id FROM public.flow_refund_attempts WHERE status = 'completed'
  LOOP
    PERFORM private.post_flow_refund(v_id);
    PERFORM private.post_refund_credit_note(v_id);
  END LOOP;

  FOR v_id IN
    SELECT id FROM public.withdrawal_requests WHERE status = 'paid'
  LOOP
    PERFORM private.post_prize_payout(v_id);
  END LOOP;
END;
$$;

COMMIT;
