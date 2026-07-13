-- Impide que un usuario abra mas de una revision KYC simultanea y registra
-- la version de los terminos aceptada, no solo la fecha.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_version text;

UPDATE public.profiles
SET terms_version = '1.1'
WHERE terms_accepted_at IS NOT NULL
  AND terms_version IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.kyc_submissions
    WHERE status = 'pending'
    GROUP BY user_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'No se puede crear idx_kyc_one_pending_per_user: existen usuarios con mas de una solicitud KYC pendiente.';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_kyc_one_pending_per_user
  ON public.kyc_submissions(user_id)
  WHERE status = 'pending';

COMMIT;
