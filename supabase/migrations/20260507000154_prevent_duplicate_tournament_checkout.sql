BEGIN;

-- Un usuario no puede tener mas de un cobro activo para el mismo torneo.
-- Sin este guard, dos clicks/reintentos podian crear dos ordenes Flow;
-- la segunda podia cobrarse y luego fallar al insertar la inscripcion unica.

UPDATE public.flow_payment_attempts
SET
  status = 'expired',
  settled_at = COALESCE(settled_at, now())
WHERE intent = 'tournament_registration'
  AND status = 'pending'
  AND tournament_id IS NOT NULL
  AND created_at < now() - interval '60 minutes';

WITH ranked AS (
  SELECT
    id,
    status,
    row_number() OVER (
      PARTITION BY user_id, tournament_id
      ORDER BY
        CASE WHEN status = 'paid' THEN 0 ELSE 1 END,
        created_at DESC
    ) AS row_number
  FROM public.flow_payment_attempts
  WHERE intent = 'tournament_registration'
    AND status IN ('pending', 'paid')
    AND tournament_id IS NOT NULL
)
UPDATE public.flow_payment_attempts attempts
SET
  status = 'expired',
  settled_at = COALESCE(attempts.settled_at, now())
FROM ranked
WHERE attempts.id = ranked.id
  AND ranked.row_number > 1
  AND attempts.status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_flow_attempts_one_active_tournament_checkout
  ON public.flow_payment_attempts (user_id, tournament_id)
  WHERE intent = 'tournament_registration'
    AND tournament_id IS NOT NULL
    AND status IN ('pending', 'paid');

COMMIT;
