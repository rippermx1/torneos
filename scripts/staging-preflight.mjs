import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { migrationComparison, sourceHash, sourceInventory } from './release-manifest.mjs'

// Deliberately no Supabase connection, dotenv loading, Flow calls or SQL execution.
// Collect this catalog with a read-only connection/MCP on the explicit target.
export const privateTables = ['financial_holds', 'financial_review_events', 'ops_incidents', 'ops_incident_events', 'ops_notifications', 'cron_heartbeats', 'cash_policy', 'cash_movements', 'cash_reconciliations', 'cash_differences', 'cash_events']
export const guardedTables = ['registrations', 'flow_payment_attempts', 'flow_refund_attempts', 'withdrawal_requests', 'prize_reviews', ...privateTables]
export const functions = [
  ['authorize_competitive_entry', 'uuid, uuid'],
  ['settle_tournament_registration', 'text, text, bigint, bigint, text, text, jsonb'],
  ['queue_tournament_refunds', 'uuid'], ['claim_flow_refund', 'uuid, uuid'],
  ['record_flow_refund_dispatch', 'uuid, uuid, text, text, text'],
  ['record_verified_refund', 'uuid, text, text, bigint, text'],
  ['request_withdrawal', 'uuid, uuid, bigint, text, text, text, text, text'],
  ['review_prize', 'uuid, uuid, text, text, jsonb'],
  ['set_financial_hold', 'uuid, uuid, uuid, boolean, text'],
  ['begin_withdrawal_transfer', 'uuid, uuid'],
  ['reconcile_withdrawal', 'uuid, uuid, text, text, text, text'],
  ['operational_snapshot', ''], ['observe_operations', 'text, text'],
  ['claim_ops_notifications', ''], ['cash_status', ''],
  ['record_cash_movement', 'uuid, uuid, text, bigint, text, timestamp with time zone, text, text'],
  ['capture_cash_reconciliation', 'uuid, uuid, timestamp with time zone, bigint, bigint, bigint, bigint, text, text, text'],
  ['review_cash_reconciliation', 'uuid, uuid, text, text'],
]
export const triggers = [
  ['registrations', 'guard_commercial_registration'], ['games', 'guard_competitive_game_entry'],
  ['tournaments', 'queue_cancelled_tournament_refunds'], ['tournament_results', 'capture_prize_review'],
  ['withdrawal_requests', 'guard_withdrawal_identity'], ['flow_payment_attempts', 'guard_cash_checkout'],
  ['tournaments', 'guard_cash_publication'],
]
const hash = value => createHash('sha256').update(value).digest('hex')
const quoted = names => names.map(name => `'${name}'`).join(',')
export function catalogSql() {
  return `BEGIN READ ONLY;
SELECT jsonb_build_object(
  'schema',1,'observed_at',clock_timestamp(),'postgres',current_setting('server_version'),
  'versions',(SELECT coalesce(jsonb_agg(version ORDER BY version),'[]'::jsonb) FROM supabase_migrations.schema_migrations),
  'tables',(SELECT coalesce(jsonb_agg(jsonb_build_object(
    'name',c.relname,'rls',c.relrowsecurity,
    'browser_write',EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname IN ('anon','authenticated') AND
      (has_table_privilege(r.oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR EXISTS(
        SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege(r.oid,c.oid,a.attnum,'INSERT,UPDATE,REFERENCES')))),
    'browser_read',EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname IN ('anon','authenticated') AND has_any_column_privilege(r.oid,c.oid,'SELECT')),
    'service_read',has_table_privilege('service_role',c.oid,'SELECT')
  ) ORDER BY c.relname),'[]'::jsonb) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relname IN (${quoted(guardedTables)})),
  'functions',(SELECT coalesce(jsonb_agg(jsonb_build_object(
    'name',p.proname,'args',oidvectortypes(p.proargtypes),'argument_names',p.proargnames,
    'definer',p.prosecdef,'settings',p.proconfig,'definition_md5',md5(pg_get_functiondef(p.oid)),
    'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),
    'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
    'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')
  ) ORDER BY p.proname,p.oid),'[]'::jsonb) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN (${quoted(functions.map(([name]) => name))})),
  'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,'enabled',t.tgenabled,'definition_md5',md5(pg_get_triggerdef(t.oid))) ORDER BY c.relname,t.tgname),'[]'::jsonb)
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgname IN (${quoted(triggers.map(([,name]) => name))})),
  'private_buckets',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'public',public) ORDER BY id),'[]'::jsonb) FROM storage.buckets WHERE id IN ('kyc-documents','payout-proofs','cash-proofs')),
  'seed_readable_anon',CASE WHEN to_regclass('public.games') IS NOT NULL THEN has_column_privilege('anon','public.games','seed','SELECT') ELSE NULL END,
  'seed_readable_authenticated',CASE WHEN to_regclass('public.games') IS NOT NULL THEN has_column_privilege('authenticated','public.games','seed','SELECT') ELSE NULL END
) AS inventory;
ROLLBACK;
`
}
export function assessCatalog(inventory, required, now = Date.now()) {
  const issues = []
  const at = Date.parse(inventory?.observed_at ?? '')
  if (inventory?.schema !== 1 || !Number.isFinite(at) || at > now || now - at > 86400000) issues.push('Inventario inválido o con más de 24 horas')
  let migrations = { pending: required, present: [] }
  try { migrations = migrationComparison(required, inventory?.versions) } catch { issues.push('Historial de migraciones inválido') }
  if (migrations.pending.length) issues.push(`Migraciones pendientes: ${migrations.pending.length}`)
  for (const name of guardedTables) {
    const rows = inventory?.tables?.filter(row => row.name === name) ?? []
    const table = rows.length === 1 ? rows[0] : undefined
    if (!table || table.rls !== true || table.browser_write !== false || (privateTables.includes(name) && (table.browser_read !== false || table.service_read !== true))) issues.push(`Tabla ausente o permisos incompatibles: ${name}`)
  }
  for (const [name,args] of functions) {
    const rows = inventory?.functions?.filter(row => row.name === name) ?? []
    const exact = rows.filter(row => row.args === args)
    if (exact.length !== 1 || exact[0].definer !== true || exact[0].service_execute !== true || !exact[0].settings?.includes('search_path=""') || rows.some(row => row.anon_execute !== false || row.authenticated_execute !== false)) issues.push(`RPC ausente, firma o permisos incompatibles: ${name}`)
  }
  for (const [table,name] of triggers) if (!inventory?.triggers?.some(row => row.table === table && row.name === name && row.enabled === 'O')) issues.push(`Trigger ausente/deshabilitado: ${table}.${name}`)
  for (const id of ['kyc-documents','payout-proofs','cash-proofs']) if (inventory?.private_buckets?.filter(bucket => bucket.id === id && bucket.public === false).length !== 1) issues.push(`Bucket ausente/público: ${id}`)
  if (inventory?.seed_readable_anon !== false || inventory?.seed_readable_authenticated !== false) issues.push('Semilla 2048 accesible o permiso no verificado')
  return { status: issues.length ? 'BLOCKED' : 'PASS', issues, migrations, scope: 'selected catalog invariants only; not SQL equivalence, JWT/RLS behavior, Storage object access or migration recovery' }
}
export function validateTarget({ projectRef, productionRef, appUrl }) {
  if (!/^[a-z0-9]{20}$/.test(projectRef ?? '') || !/^[a-z0-9]{20}$/.test(productionRef ?? '') || projectRef === productionRef) throw new Error('Destino staging explícito y distinto del proyecto productivo requerido')
  try {
    const url = new URL(appUrl)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || url.port || !url.hostname.includes('.') || /^\d+\.|\.(?:local|internal|localhost)$/.test(url.hostname)) throw new Error()
    return url.origin
  } catch { throw new Error('Origen staging HTTPS canónico requerido') }
}
export function assessCandidate(manifest, target, currentSource) {
  const origin = validateTarget(target), issues = []
  if (!manifest || manifest.dirty !== false || !/^[a-f0-9]{40}$/.test(manifest.revision ?? '') || !/^[a-f0-9]{64}$/.test(manifest.release_fingerprint ?? '') || manifest.public_build?.environment !== 'staging') issues.push('Manifiesto de candidata limpia staging requerido')
  if (manifest?.public_build?.app_origin_sha256 !== hash(origin) || manifest?.public_build?.values?.NEXT_PUBLIC_SUPABASE_URL?.sha256 !== hash(`https://${target.projectRef}.supabase.co`)) issues.push('Build congelado para otro destino; reconstruir')
  if (!currentSource || JSON.stringify(currentSource) !== JSON.stringify(manifest?.source)) issues.push('Fuentes actuales distintas del artefacto')
  if (!manifest?.source?.length || !manifest?.games?.length || !manifest?.migrations?.length || !manifest?.application?.length || manifest.source_fingerprint !== hash(JSON.stringify({ source: manifest.source, games: manifest.games, migrations: manifest.migrations, public_build: manifest.public_build })) || manifest.release_fingerprint !== hash(JSON.stringify({ source_fingerprint: manifest.source_fingerprint, application: manifest.application }))) issues.push('Manifiesto incompleto o huellas inconsistentes')
  return { status: issues.length ? 'BLOCKED' : 'PASS', issues, scope: 'manifest/source/target comparison only; published deployment identity and exact compiled bytes require release verification' }
}
export function run(args) {
  const value = name => args[args.indexOf(name) + 1]
  if (args.includes('--emit-sql')) {
    const output = value('--emit-sql'); fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output,catalogSql()); return { output, operation: 'SQL_FILE_ONLY' }
  }
  for (const name of ['--inventory','--manifest','--app-url','--project-ref','--production-ref','--output']) if (!args.includes(name) || !value(name) || value(name).startsWith('--')) throw new Error(`Argumento requerido: ${name}`)
  const target = { projectRef: value('--project-ref'), productionRef: value('--production-ref'), appUrl: value('--app-url') }
  validateTarget(target)
  const read = file => JSON.parse(fs.readFileSync(file,'utf8'))
  const inventory = read(value('--inventory')), manifest = read(value('--manifest'))
  if (inventory.project_ref !== target.projectRef) throw new Error('Inventario pertenece a otro proyecto')
  const required = read('config/commercial-release.json').migrations
  const candidate = assessCandidate(manifest, target, sourceInventory())
  if (JSON.stringify(manifest.migrations?.map(item => item.file)) !== JSON.stringify(required) || required.some(file => !manifest.migrations?.some(item => item.file === file && item.sha256 === sourceHash(fs.readFileSync(path.join('supabase/migrations',file)),file)))) {
    candidate.status = 'BLOCKED'; candidate.issues.push('SQL comercial ausente, distinto o alterado en manifiesto')
  }
  const report = { schema: 1, verified_at: new Date().toISOString(), target, inventory_sha256: hash(fs.readFileSync(value('--inventory'))), production_decision: 'NO_GO', checks: {
    catalog: assessCatalog(inventory, required), candidate,
    published_artifact: { status: 'NOT_RUN' }, auth_mfa: { status: 'NOT_RUN' }, private_storage_objects: { status: 'NOT_RUN' },
    flow_payment_refund: { status: 'NOT_RUN', reason: 'Flow productivo requiere protocolo y autorización de prueba con dinero real' }, operator_acceptance: { status: 'NOT_RUN' },
  } }
  const output = value('--output'); fs.mkdirSync(path.dirname(output),{recursive:true}); fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n')
  return report
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { const result = run(process.argv.slice(2)); console.log(JSON.stringify(result,null,2)); if (Object.values(result.checks ?? {}).some(check => check.status !== 'PASS')) process.exitCode = 1 }
  catch { console.error('Preflight rechazado; revisa argumentos, destino y archivos de entrada. No se ejecutó SQL ni se llamó a Flow.'); process.exitCode = 1 }
}
