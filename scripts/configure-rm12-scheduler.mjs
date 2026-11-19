import { requireNonProductionProject } from './supabase-safety.mjs'

export const RM12_JOBS = [
  ['process-tournaments', '*/5 * * * *'],
  ['flow-reconcile', '*/10 * * * *'],
  ['reconcile-refunds', '*/10 * * * *'],
  ['watchdog', '*/5 * * * *'],
]

// No plaintext secrets. Apply on the explicit dev project after verifying the deployed alias.
export function buildRm12SchedulerSql(env) {
  const ref = requireNonProductionProject(env.NEXT_PUBLIC_SUPABASE_URL, 'Scheduler RM-12', env)
  if (ref !== 'jnoyjewsqbooqaiighcs' || env.APP_URL !== 'https://rm12-torneos-dev.vercel.app') throw new Error('Destino RM-12 incorrecto')
  return `BEGIN;
DO $vault$
DECLARE source_secret text; secret_id uuid;
BEGIN
  SELECT decrypted_secret INTO source_secret FROM vault.decrypted_secrets WHERE name='torneos_cron_secret';
  IF source_secret IS NULL OR length(source_secret)<32 THEN RAISE EXCEPTION 'Falta el secreto cron dev'; END IF;
  SELECT id INTO secret_id FROM vault.secrets WHERE name='rm12_cron_secret';
  IF secret_id IS NULL THEN PERFORM vault.create_secret(source_secret,'rm12_cron_secret');
  ELSE PERFORM vault.update_secret(secret_id,source_secret); END IF;
  SELECT id INTO secret_id FROM vault.secrets WHERE name='rm12_app_url';
  IF secret_id IS NULL THEN PERFORM vault.create_secret('https://rm12-torneos-dev.vercel.app','rm12_app_url');
  ELSE PERFORM vault.update_secret(secret_id,'https://rm12-torneos-dev.vercel.app'); END IF;
END; $vault$;
${RM12_JOBS.map(([job, schedule]) => `SELECT cron.schedule('rm12-${job}','${schedule}', $$SELECT private.invoke_rm12_cron('/api/cron/${job}');$$);`).join('\n')}
SELECT cron.schedule('rm12-capture-http','* * * * *',$$SELECT private.capture_rm12_cron_responses();$$);
COMMIT;
SELECT jobname,schedule,active FROM cron.job WHERE jobname LIKE 'rm12-%' ORDER BY jobname;`
}
