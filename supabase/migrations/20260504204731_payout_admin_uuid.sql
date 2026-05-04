-- ============================================================
-- Corrige firmas de funciones de payout tras migrar reviewed_by
-- de text a uuid.
-- ============================================================

BEGIN;

DROP FUNCTION IF EXISTS approve_withdrawal(uuid, text, text);
DROP FUNCTION IF EXISTS reject_withdrawal(uuid, text, text);

CREATE OR REPLACE FUNCTION approve_withdrawal(
  p_request_id uuid,
  p_admin_id   uuid,
  p_notes      text DEFAULT NULL
) RETURNS void AS $$
BEGIN
  UPDATE withdrawal_requests
  SET
    status      = 'approved',
    admin_notes = p_notes,
    reviewed_by = p_admin_id,
    reviewed_at = now()
  WHERE id = p_request_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud no encontrada o ya procesada: %', p_request_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION reject_withdrawal(
  p_request_id uuid,
  p_admin_id   uuid,
  p_notes      text DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_req withdrawal_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req
  FROM withdrawal_requests
  WHERE id = p_request_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud no encontrada o ya procesada: %', p_request_id;
  END IF;

  PERFORM wallet_insert_transaction(
    v_req.user_id,
    'refund',
    v_req.amount_cents,
    'withdrawal',
    p_request_id,
    jsonb_build_object('reason', 'withdrawal_rejected')
  );

  UPDATE withdrawal_requests
  SET
    status      = 'rejected',
    admin_notes = p_notes,
    reviewed_by = p_admin_id,
    reviewed_at = now()
  WHERE id = p_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
