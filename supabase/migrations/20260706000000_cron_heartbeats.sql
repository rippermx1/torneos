-- ============================================================
-- Watchdog de crons: latidos de cada job programado.
--
-- Los schedulers críticos (process-tournaments, flow-reconcile,
-- reconcile-refunds) corren en GitHub Actions, que puede fallar o
-- deshabilitarse en silencio (auto-disable a los 60 días sin actividad).
-- Si mueren, los premios no se pagan y los reembolsos no salen SIN AVISO.
--
-- Cada cron registra su latido aquí; un watchdog independiente (Vercel
-- cron diario) revisa la frescura y alerta por email si algo está caído.
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
