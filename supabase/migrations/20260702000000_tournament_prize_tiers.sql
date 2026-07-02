-- ============================================================
-- Escalera de premios: "bolsa garantizada escalonada".
--
-- Premios FIJOS y PUBLICADOS antes de inscribir, pero que suben por
-- tramos con la convocatoria confirmada. Cada tramo se garantiza y la
-- plataforma asume el riesgo si el torneo no se llena. Esto mantiene el
-- retorno al jugador en una banda sana (~52-70%) en vez de colapsar
-- cuando el torneo se llena (premio plano actual), protegiendo la
-- retención sin dejar de ser rentable ni cambiar el carácter de
-- competencia de habilidad (no es "% del pozo").
--
-- Esta migración es ADITIVA: crea la tabla y respalda los torneos
-- existentes con un único tramo base (= su premio fijo actual). Ningún
-- código la lee todavía; finalize_tournament se conecta en un paso
-- posterior con fallback a las columnas prize_*_cents.
--
-- Solvencia (invariante): el fondo de cada tramo nunca supera la
-- recaudación bruta a su propio umbral (entry_fee × umbral). El tramo
-- base sigue cubierto por el constraint tournament_prizes_solvent_at_min_players.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS tournament_prize_tiers (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id          uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  -- El tramo aplica cuando registered_count >= min_players_threshold.
  min_players_threshold  int NOT NULL CHECK (min_players_threshold > 0),
  prize_fund_cents       bigint NOT NULL CHECK (prize_fund_cents > 0),
  prize_1st_cents        bigint NOT NULL CHECK (prize_1st_cents > 0),
  prize_2nd_cents        bigint NOT NULL DEFAULT 0 CHECK (prize_2nd_cents >= 0),
  prize_3rd_cents        bigint NOT NULL DEFAULT 0 CHECK (prize_3rd_cents >= 0),
  created_at             timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tournament_id, min_players_threshold),
  CONSTRAINT prize_tier_split_sums CHECK (
    prize_fund_cents = prize_1st_cents + prize_2nd_cents + prize_3rd_cents
  )
);

CREATE INDEX IF NOT EXISTS idx_prize_tiers_tournament
  ON tournament_prize_tiers(tournament_id, min_players_threshold);

-- Solvencia por tramo: el fondo no puede exceder entry_fee × umbral del
-- torneo padre. (Un CHECK no puede referenciar otra tabla, por eso trigger.)
CREATE OR REPLACE FUNCTION check_prize_tier_solvency()
RETURNS trigger AS $$
DECLARE
  v_entry bigint;
  v_min   int;
BEGIN
  SELECT entry_fee_cents, min_players INTO v_entry, v_min
  FROM tournaments WHERE id = NEW.tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Torneo % no existe', NEW.tournament_id;
  END IF;

  IF NEW.min_players_threshold < v_min THEN
    RAISE EXCEPTION 'Umbral de tramo (%) menor al mínimo del torneo (%)',
      NEW.min_players_threshold, v_min;
  END IF;

  IF v_entry > 0 AND NEW.prize_fund_cents > v_entry * NEW.min_players_threshold THEN
    RAISE EXCEPTION 'Tramo insolvente: fondo % > recaudación a umbral (entry % × % jugadores)',
      NEW.prize_fund_cents, v_entry, NEW.min_players_threshold;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_prize_tier_solvency ON tournament_prize_tiers;
CREATE TRIGGER trg_prize_tier_solvency
  BEFORE INSERT OR UPDATE ON tournament_prize_tiers
  FOR EACH ROW EXECUTE FUNCTION check_prize_tier_solvency();

-- Backfill: cada torneo existente recibe su tramo base (= premio fijo actual).
INSERT INTO tournament_prize_tiers
  (tournament_id, min_players_threshold, prize_fund_cents, prize_1st_cents, prize_2nd_cents, prize_3rd_cents)
SELECT
  t.id,
  t.min_players,
  (t.prize_1st_cents + t.prize_2nd_cents + t.prize_3rd_cents),
  t.prize_1st_cents,
  t.prize_2nd_cents,
  t.prize_3rd_cents
FROM tournaments t
WHERE NOT EXISTS (
  SELECT 1 FROM tournament_prize_tiers tp WHERE tp.tournament_id = t.id
);

-- RLS: los premios son públicos (igual que tournaments). Escritura solo service_role.
ALTER TABLE tournament_prize_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cualquiera lee tramos de premio" ON tournament_prize_tiers;
CREATE POLICY "Cualquiera lee tramos de premio"
  ON tournament_prize_tiers FOR SELECT
  USING (true);

REVOKE ALL ON tournament_prize_tiers FROM anon, authenticated;
GRANT SELECT ON tournament_prize_tiers TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON tournament_prize_tiers TO service_role;

COMMIT;
