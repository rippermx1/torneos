-- ============================================================
-- Bitácora de acciones administrativas.
--
-- Por qué:
-- - AML/compliance chileno requiere traza auditable de quién
--   aprobó/rechazó retiros, KYC, baneos, finalizaciones de
--   torneo y resoluciones de disputa.
-- - El recurso afectado (withdrawal_request, profile, dispute,
--   tournament) sólo guarda el último estado; este log preserva
--   el historial completo con autor y carga útil.
--
-- Diseño:
-- - admin_id es UUID porque profiles.id es UUID (post-migración 007).
-- - target_id queda como text para tolerar referencias mixtas
--   (uuid de tournaments, uuid de withdrawal_requests, uuid de
--    profiles, etc.) sin romper integridad referencial al borrar
--   el target.
-- - payload jsonb permite snapshots libres ('reason', 'before',
--   'after', etc.) sin migración por cada acción nueva.
-- - Best-effort: si el INSERT falla, el handler logueará el error
--   pero no abortará la acción del admin (la traza nunca debe
--   bloquear una resolución legítima).
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_actions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     uuid NOT NULL REFERENCES profiles(id),
  action       text NOT NULL,
  target_type  text NOT NULL,
  target_id    text,
  summary      text,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_admin_actions_admin_created
  ON admin_actions (admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_actions_target
  ON admin_actions (target_type, target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_actions_action_created
  ON admin_actions (action, created_at DESC);

-- Solo admins pueden leer la bitácora.
DROP POLICY IF EXISTS "Admin lee admin_actions" ON admin_actions;
CREATE POLICY "Admin lee admin_actions"
  ON admin_actions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.is_admin = true
    )
  );

-- Nadie escribe vía cliente; sólo service_role (handlers server-side)
-- y la función record_admin_action.
REVOKE INSERT, UPDATE, DELETE ON admin_actions FROM PUBLIC, anon, authenticated;

-- ── Función helper para registrar acciones ──────────────────
CREATE OR REPLACE FUNCTION record_admin_action(
  p_admin_id    uuid,
  p_action      text,
  p_target_type text,
  p_target_id   text,
  p_summary     text DEFAULT NULL,
  p_payload     jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO admin_actions (admin_id, action, target_type, target_id, summary, payload)
  VALUES (p_admin_id, p_action, p_target_type, p_target_id, p_summary, COALESCE(p_payload, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION record_admin_action(uuid, text, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_admin_action(uuid, text, text, text, text, jsonb)
  TO service_role;
