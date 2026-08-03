-- ============================================================
-- Pagos de premios: autorización, transferencia y evidencia.
--
-- Antes, status='approved' mezclaba dos hechos distintos:
--   1) el administrador autorizó pagar;
--   2) el dinero efectivamente salió del banco.
-- Esta migración separa ambos momentos y agrega el respaldo necesario
-- para conciliar el ledger interno con la cuenta bancaria.
-- ============================================================

BEGIN;

ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS wallet_transaction_id uuid
    REFERENCES public.wallet_transactions(id),
  ADD COLUMN IF NOT EXISTS paid_by uuid
    REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS bank_transfer_reference text,
  ADD COLUMN IF NOT EXISTS proof_storage_path text,
  ADD COLUMN IF NOT EXISTS receipt_number text,
  ADD COLUMN IF NOT EXISTS payment_notes text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_wallet_transaction
  ON public.withdrawal_requests(wallet_transaction_id)
  WHERE wallet_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_receipt_number
  ON public.withdrawal_requests(receipt_number)
  WHERE receipt_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_withdrawals_paid_at
  ON public.withdrawal_requests(paid_at DESC)
  WHERE paid_at IS NOT NULL;

-- El CHECK original fue creado sin nombre explícito en 004_admin_tables.sql.
-- Lo encontramos por definición para tolerar entornos con nombres distintos.
DO $$
DECLARE
  v_constraint text;
BEGIN
  FOR v_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.withdrawal_requests'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%pending%approved%rejected%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.withdrawal_requests DROP CONSTRAINT %I',
      v_constraint
    );
  END LOOP;
END $$;

-- Históricamente "approved" significaba que el pago ya se había procesado.
-- Se conserva esa semántica como pago legado, dejando visible que carece del
-- comprobante que ahora será obligatorio desde la aplicación.
UPDATE public.withdrawal_requests
SET
  status = 'paid',
  paid_by = reviewed_by,
  paid_at = COALESCE(reviewed_at, created_at),
  bank_transfer_reference = 'LEGACY-' || upper(substr(replace(id::text, '-', ''), 1, 12)),
  receipt_number = 'TP-PREM-' || to_char(COALESCE(reviewed_at, created_at) AT TIME ZONE 'America/Santiago', 'YYYYMMDD')
    || '-' || upper(substr(replace(id::text, '-', ''), 1, 12)),
  payment_notes = concat_ws(E'\n', NULLIF(payment_notes, ''), 'Pago migrado desde el estado aprobado; evidencia bancaria pendiente de regularización.')
WHERE status = 'approved';

ALTER TABLE public.withdrawal_requests
  ADD CONSTRAINT withdrawal_requests_status_check
  CHECK (status IN ('pending', 'approved', 'paid', 'rejected'));

DROP INDEX IF EXISTS public.idx_withdrawals_one_pending_per_user;
CREATE UNIQUE INDEX idx_withdrawals_one_open_per_user
  ON public.withdrawal_requests(user_id)
  WHERE status IN ('pending', 'approved');

-- Los torneos de prueba pueden generar movimientos para ensayar la UI, pero no
-- deben convertirse en una obligación bancaria real. El ledger conserva esos
-- movimientos; sólo se excluyen del monto cobrable.
CREATE OR REPLACE FUNCTION public.wallet_withdrawable_balance(p_user_id uuid)
  RETURNS bigint
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT GREATEST(COALESCE(SUM(
    CASE
      WHEN wt.type = 'prize_credit'
        AND NOT EXISTS (
          SELECT 1 FROM public.tournaments t
          WHERE t.id = wt.reference_id AND t.is_test = true
        )
        THEN wt.amount_cents
      WHEN wt.type = 'withdrawal' THEN wt.amount_cents
      WHEN wt.type = 'refund' AND wt.reference_type = 'withdrawal'
        THEN wt.amount_cents
      WHEN wt.type = 'refund' AND wt.reference_type = 'tournament'
        AND NOT EXISTS (
          SELECT 1 FROM public.tournaments t
          WHERE t.id = wt.reference_id AND t.is_test = true
        )
        THEN wt.amount_cents
      ELSE 0
    END
  ), 0), 0)::bigint
  FROM public.wallet_transactions wt
  WHERE wt.user_id = p_user_id;
$$;

REVOKE EXECUTE ON FUNCTION public.wallet_withdrawable_balance(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_withdrawable_balance(uuid)
  TO service_role;

-- Bucket separado de KYC: ambos son privados, pero tienen finalidad,
-- retención y permisos distintos. Las cargas y descargas se hacen únicamente
-- desde handlers server-side con service_role; no se concede acceso directo.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payout-proofs',
  'payout-proofs',
  false,
  6291456,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Aprobar sólo autoriza la transferencia; todavía no reconoce salida bancaria.
CREATE OR REPLACE FUNCTION public.approve_withdrawal(
  p_request_id uuid,
  p_admin_id uuid,
  p_notes text DEFAULT NULL
) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  UPDATE public.withdrawal_requests
  SET
    status = 'approved',
    admin_notes = p_notes,
    reviewed_by = p_admin_id,
    reviewed_at = now()
  WHERE id = p_request_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud no encontrada o ya procesada: %', p_request_id;
  END IF;
END;
$$;

-- Un pago autorizado aún puede cancelarse antes de transferir. En ambos casos
-- se devuelve al ledger el importe debitado al crear la solicitud.
CREATE OR REPLACE FUNCTION public.reject_withdrawal(
  p_request_id uuid,
  p_admin_id uuid,
  p_notes text DEFAULT NULL
) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_req public.withdrawal_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req
  FROM public.withdrawal_requests
  WHERE id = p_request_id AND status IN ('pending', 'approved')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud no encontrada o ya procesada: %', p_request_id;
  END IF;

  PERFORM public.wallet_insert_transaction(
    v_req.user_id,
    'refund',
    v_req.amount_cents,
    'withdrawal',
    p_request_id,
    jsonb_build_object(
      'reason', 'withdrawal_rejected',
      'original_wallet_transaction_id', v_req.wallet_transaction_id
    )
  );

  UPDATE public.withdrawal_requests
  SET
    status = 'rejected',
    admin_notes = p_notes,
    reviewed_by = p_admin_id,
    reviewed_at = now()
  WHERE id = p_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_withdrawal(
  p_request_id uuid,
  p_admin_id uuid,
  p_bank_transfer_reference text,
  p_proof_storage_path text,
  p_notes text DEFAULT NULL
) RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_receipt_number text;
BEGIN
  IF length(trim(COALESCE(p_bank_transfer_reference, ''))) < 3 THEN
    RAISE EXCEPTION 'La referencia bancaria es obligatoria';
  END IF;

  IF split_part(COALESCE(p_proof_storage_path, ''), '/', 1) <> p_request_id::text THEN
    RAISE EXCEPTION 'La evidencia no pertenece a esta solicitud';
  END IF;

  v_receipt_number := 'TP-PREM-'
    || to_char(now() AT TIME ZONE 'America/Santiago', 'YYYYMMDD')
    || '-' || upper(substr(replace(p_request_id::text, '-', ''), 1, 12));

  UPDATE public.withdrawal_requests
  SET
    status = 'paid',
    paid_by = p_admin_id,
    paid_at = now(),
    bank_transfer_reference = trim(p_bank_transfer_reference),
    proof_storage_path = p_proof_storage_path,
    receipt_number = v_receipt_number,
    payment_notes = NULLIF(trim(COALESCE(p_notes, '')), '')
  WHERE id = p_request_id AND status = 'approved';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pago no está autorizado o ya fue registrado: %', p_request_id;
  END IF;

  RETURN v_receipt_number;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_withdrawal(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reject_withdrawal(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_withdrawal(uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.approve_withdrawal(uuid, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.reject_withdrawal(uuid, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_withdrawal(uuid, uuid, text, text, text)
  TO service_role;

COMMIT;
