-- ============================================================
-- Watchdog de crons: latidos de cada job programado.
--
-- Los schedulers críticos (process-tournaments, flow-reconcile,
-- reconcile-refunds) corren principalmente en Supabase Cron y conservan
-- GitHub Actions como respaldo independiente.
-- Si mueren, los premios no se pagan y los reembolsos no salen SIN AVISO.
--
-- Cada cron registra su latido aquí; un watchdog horario, respaldado por
-- Vercel cron diario, revisa la frescura y alerta si algo está caído.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS cron_heartbeats (
  job_name    text PRIMARY KEY,
  last_run_at timestamptz NOT NULL DEFAULT now(),
  last_status text NOT NULL DEFAULT 'ok' CHECK (last_status IN ('ok', 'error')),
  detail      text
);

ALTER TABLE cron_heartbeats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cron_heartbeats FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON cron_heartbeats TO service_role;

COMMIT;
