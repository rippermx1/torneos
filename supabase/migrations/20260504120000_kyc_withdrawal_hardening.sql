-- ============================================================
-- KYC y retiros: evidencia documental, auditoria y una solicitud
-- de retiro pendiente por usuario.
-- ============================================================

BEGIN;

-- ── RETIROS ─────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM withdrawal_requests
    WHERE status = 'pending'
    GROUP BY user_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'No se puede crear idx_withdrawals_one_pending_per_user: existen usuarios con mas de un retiro pendiente.';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_one_pending_per_user
  ON withdrawal_requests(user_id)
  WHERE status = 'pending';

-- ── STORAGE PRIVADO PARA DOCUMENTOS KYC ─────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'kyc-documents',
  'kyc-documents',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Usuario sube sus documentos KYC" ON storage.objects;
CREATE POLICY "Usuario sube sus documentos KYC"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'kyc-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Usuario ve sus documentos KYC" ON storage.objects;
CREATE POLICY "Usuario ve sus documentos KYC"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'kyc-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Admin ve documentos KYC" ON storage.objects;
CREATE POLICY "Admin ve documentos KYC"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'kyc-documents'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_admin = true
    )
  );

-- ── TABLAS DE KYC ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kyc_submissions (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id              uuid REFERENCES profiles(id) NOT NULL,
  full_name            text NOT NULL,
  rut                  text NOT NULL,
  birth_date           date NOT NULL,
  phone                text NOT NULL,
  city                 text NOT NULL,
  document_type        text NOT NULL
                       CHECK (document_type IN ('cedula_chilena', 'passport', 'other')),
  document_number      text NOT NULL,
  document_front_path  text NOT NULL,
  document_back_path   text,
  bank_account_holder  text NOT NULL,
  bank_account_rut     text NOT NULL,
  status               text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'approved', 'rejected')),
  review_notes         text,
  reviewed_by          uuid REFERENCES profiles(id),
  reviewed_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE kyc_submissions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_kyc_submissions_user_created
  ON kyc_submissions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kyc_submissions_status_created
  ON kyc_submissions(status, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_kyc_submissions_updated_at ON kyc_submissions;
CREATE TRIGGER set_kyc_submissions_updated_at
  BEFORE UPDATE ON kyc_submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS "Usuario ve sus solicitudes KYC" ON kyc_submissions;
CREATE POLICY "Usuario ve sus solicitudes KYC"
  ON kyc_submissions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admin ve todas las solicitudes KYC" ON kyc_submissions;
CREATE POLICY "Admin ve todas las solicitudes KYC"
  ON kyc_submissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = auth.uid() AND p.is_admin = true
    )
  );

CREATE TABLE IF NOT EXISTS kyc_audit_events (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid REFERENCES profiles(id) NOT NULL,
  actor_id    uuid REFERENCES profiles(id),
  event_type  text NOT NULL,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE kyc_audit_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_kyc_audit_user_created
  ON kyc_audit_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kyc_audit_event_type_created
  ON kyc_audit_events(event_type, created_at DESC);

DROP POLICY IF EXISTS "Usuario ve su auditoria KYC" ON kyc_audit_events;
CREATE POLICY "Usuario ve su auditoria KYC"
  ON kyc_audit_events FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admin ve auditoria KYC" ON kyc_audit_events;
CREATE POLICY "Admin ve auditoria KYC"
  ON kyc_audit_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = auth.uid() AND p.is_admin = true
    )
  );

GRANT SELECT ON kyc_submissions TO authenticated;
GRANT SELECT ON kyc_audit_events TO authenticated;

COMMIT;
