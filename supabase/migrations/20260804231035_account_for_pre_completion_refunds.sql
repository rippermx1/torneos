-- Al completar un torneo, reconoce solo el ingreso diferido que permanece luego
-- de devoluciones previas. La version inicial sumaba ventas sin restar refunds.

BEGIN;

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
  WHERE e.event_type IN ('ticket_sale', 'ticket_refund')
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

REVOKE EXECUTE ON FUNCTION private.post_tournament_completion(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;

COMMIT;
