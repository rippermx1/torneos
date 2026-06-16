-- ============================================================
-- Alinea el default contable de los torneos al 70/30 vigente.
--
-- Por que:
-- - El valor canonico del split fondo de premios / fee de plataforma
--   es 70% / 30% (lib/tournament/finance.ts: DEFAULT_PRIZE_FUND_BPS=7000).
--   El cambio 75%->70% fue deliberado al agregar los modos Challenger/Pro
--   (commit 0272e75), ampliando el margen de plataforma de 25% a 30%.
-- - El default de columna habia quedado en 7500/2500 con comentarios "MVP 75%".
--   createTournament siempre setea el valor explicito, por lo que el default
--   nunca aplicaba en la practica; esto es defensa en profundidad contra un
--   INSERT directo (script/SQL ad hoc) que omita las columnas.
--
-- No cambia datos existentes (solo el DEFAULT y los comentarios).
-- El CHECK prize_fund_bps + platform_fee_bps = 10000 se mantiene satisfecho.
-- ============================================================

BEGIN;

ALTER TABLE public.tournaments
  ALTER COLUMN prize_fund_bps SET DEFAULT 7000,
  ALTER COLUMN platform_fee_bps SET DEFAULT 3000;

COMMENT ON COLUMN public.tournaments.prize_fund_bps IS
  'Porcentaje contable de cada inscripcion reservado como referencia de premios; canonico 70%. La contabilidad efectiva de IVA NO usa este split: reconoce IVA sobre cobros menos premios pagados.';
COMMENT ON COLUMN public.tournaments.platform_fee_bps IS
  'Fee bruto de plataforma de referencia incluido en la inscripcion; canonico 30%. Referencial: el margen real es cobros menos premios pagados (premios fijos no escalan con jugadores).';

COMMIT;
