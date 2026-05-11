-- ============================================================
-- C6 hardening: defensa de ultimo nivel contra insolvencia
-- de torneos pagados.
--
-- Si entry_fee_cents > 0, la suma de premios publicados nunca
-- debe exceder el ingreso bruto al minimo de jugadores
-- (entry_fee_cents * min_players). Esto garantiza que la
-- plataforma siempre pueda pagar los premios incluso al peor
-- escenario (cuando exactamente min_players se inscriben y
-- nadie mas).
--
-- Para freerolls (entry_fee_cents = 0) el premio es un costo
-- de marketing aceptado y la restriccion no aplica.
--
-- Esta defensa cubre cualquier path que cree torneos:
--  - Server action de admin (ya derivaba premios desde
--    min_players, pero un cambio futuro podria romper la
--    invariante).
--  - INSERT/UPDATE directo via service_role (scripts, SQL ad
--    hoc, paneles externos): aqui es donde la garantia es real.
-- ============================================================

BEGIN;

-- Sanity: ningun torneo existente debe violar la nueva regla.
-- Si esto falla, hay datos inconsistentes y el equipo debe
-- corregirlos antes de aplicar la migracion.
DO $$
DECLARE
  v_offenders int;
BEGIN
  SELECT COUNT(*) INTO v_offenders
  FROM public.tournaments
  WHERE entry_fee_cents > 0
    AND (prize_1st_cents + prize_2nd_cents + prize_3rd_cents)
        > entry_fee_cents * min_players;

  IF v_offenders > 0 THEN
    RAISE EXCEPTION
      'Hay % torneos con premios publicados > recaudacion minima. Corregir antes de migrar.',
      v_offenders;
  END IF;
END $$;

ALTER TABLE public.tournaments
  ADD CONSTRAINT tournament_prizes_solvent_at_min_players
  CHECK (
    entry_fee_cents = 0
    OR (prize_1st_cents + prize_2nd_cents + prize_3rd_cents)
       <= entry_fee_cents * min_players
  );

COMMENT ON CONSTRAINT tournament_prizes_solvent_at_min_players ON public.tournaments IS
  'Garantiza que para torneos pagados los premios fijos publicados nunca exceden la recaudacion bruta al minimo de jugadores. Defensa contra insolvencia operativa.';

COMMIT;
