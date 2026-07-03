-- ============================================================
-- Divisiones por habilidad ("brackets").
--
-- La causa #1 de fuga en juegos de habilidad es que el novato pierde
-- siempre contra los expertos y se va. Se introduce un rating por jugador
-- (EMA de su score final) y torneos opcionalmente restringidos a una
-- división, para que cada nivel compita entre pares.
--
-- Aditiva: player_ratings arranca vacío (los jugadores sin fila son
-- 'novato' por defecto en la lógica de aplicación) y tournaments.skill_tier
-- es NULL (abierto) para todos los torneos existentes.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS player_ratings (
  profile_id  uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  rating      numeric NOT NULL DEFAULT 0,
  games_rated int NOT NULL DEFAULT 0 CHECK (games_rated >= 0),
  tier        text NOT NULL DEFAULT 'novato' CHECK (tier IN ('novato', 'intermedio', 'pro')),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE player_ratings ENABLE ROW LEVEL SECURITY;

-- El rating/división de un jugador es público (ranking, ficha, perfil).
DROP POLICY IF EXISTS "Cualquiera lee ratings" ON player_ratings;
CREATE POLICY "Cualquiera lee ratings"
  ON player_ratings FOR SELECT
  USING (true);

REVOKE ALL ON player_ratings FROM anon, authenticated;
GRANT SELECT ON player_ratings TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON player_ratings TO service_role;

CREATE INDEX IF NOT EXISTS idx_player_ratings_tier ON player_ratings(tier);

-- División objetivo del torneo. NULL = abierto a todas las divisiones.
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS skill_tier text
    CHECK (skill_tier IS NULL OR skill_tier IN ('novato', 'intermedio', 'pro'));

COMMIT;
