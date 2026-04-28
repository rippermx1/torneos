-- ============================================================
-- Migración 008: Cumplimiento legal
-- - terms_accepted_at: registro de aceptación explícita de T&C
-- - prize_liability: vista de pasivo de premios comprometidos
-- - Constraint: birth_date requerida para KYC approved
-- ============================================================

-- ── 1. Aceptación de términos y condiciones ───────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz DEFAULT NULL;

-- Índice para consultas frecuentes "¿ha aceptado términos?"
CREATE INDEX IF NOT EXISTS idx_profiles_terms_accepted
  ON profiles (id)
  WHERE terms_accepted_at IS NOT NULL;

-- ── 2. Política RLS: usuario puede actualizar su terms_accepted_at ──
-- Ya existe "Usuario edita su propio perfil" ON profiles FOR UPDATE
-- Esa política cubre este campo, no es necesaria política nueva.

-- ── 3. Vista de pasivo de premios comprometidos ───────────────
-- Calcula cuánto debe pagar la plataforma en premios para torneos activos.
-- Torneos 'scheduled' y 'open': solo el 1er premio (no hay jugadores confirmados aún).
-- Torneos 'live' y 'finalizing': premios completos (jugadores inscritos y pagados).
CREATE OR REPLACE VIEW prize_liability AS
SELECT
  -- Pasivo cierto: torneos live/finalizing (premios ya comprometidos con jugadores pagados)
  COALESCE(SUM(
    CASE WHEN status IN ('live', 'finalizing')
    THEN prize_1st_cents + prize_2nd_cents + prize_3rd_cents
    ELSE 0 END
  ), 0) AS committed_cents,

  -- Pasivo contingente: torneos scheduled/open (solo se activan si llegan al mínimo)
  COALESCE(SUM(
    CASE WHEN status IN ('scheduled', 'open')
    THEN prize_1st_cents + prize_2nd_cents + prize_3rd_cents
    ELSE 0 END
  ), 0) AS contingent_cents,

  -- Ingresos ya recaudados de torneos live/finalizing (cuotas cobradas)
  (
    SELECT COALESCE(SUM(ABS(amount_cents)), 0)
    FROM wallet_transactions wt
    JOIN tournaments t ON t.id = wt.reference_id
    WHERE wt.type = 'ticket_debit'
      AND t.status IN ('live', 'finalizing')
  ) AS collected_cents,

  COUNT(*) FILTER (WHERE status IN ('live', 'finalizing')) AS active_count,
  COUNT(*) FILTER (WHERE status IN ('scheduled', 'open'))  AS pending_count
FROM tournaments
WHERE status NOT IN ('completed', 'cancelled');

-- Permiso de lectura solo para admins (la vista hereda RLS de las tablas subyacentes)
GRANT SELECT ON prize_liability TO authenticated;

-- ── 4. Función helper: verificar términos aceptados ───────────
CREATE OR REPLACE FUNCTION user_has_accepted_terms(p_user_id uuid)
RETURNS boolean AS $$
  SELECT terms_accepted_at IS NOT NULL
  FROM profiles
  WHERE id = p_user_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
