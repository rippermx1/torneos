// G2048-09.4: explicit local target; never read .env.local or a linked project.
import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const migrations = [
  ['20261004184805', 'guard_2048_seed_visibility', '9bd5e89f8d6ecca3d1b388860554e63566586334afcb1a65cc26913c82c45f7c'],
  ['20261005131216', 'guard_2048_integrity_reviews', 'd03acc197a1a715f82008d221cba3a5bb63a30499fee9d806ae002543b5ae0b4'],
]
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
export function assertLocalTarget(env) {
  assert.equal(env.TORNEOS_LOCAL_MODE, '1', 'Local mode required')
  assert.equal(env.CONFIRM_SUPABASE_PROJECT_REF, 'local', 'Local project required')
  assert.equal(env.APP_URL, 'http://127.0.0.1:3081', 'Only local 3081 is supported')
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:54321', 'Only local Supabase is supported')
}
export async function localEnv() {
  const text = await readFile(new URL('../.env.local-stack', import.meta.url), 'utf8')
  const env = Object.fromEntries(text.split(/\r?\n/).filter(line => /^[A-Z_0-9]+=/.test(line))
    .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]))
  assertLocalTarget(env)
  return env
}
export function docker(args, input, timeout = 15000) {
  const result = spawnSync('docker', args, { input, timeout, encoding: 'utf8', windowsHide: true,
    maxBuffer: 8 * 1024 * 1024 })
  // Do not expose inspect output, SQL records or runtime credentials on failure.
  assert.equal(result.status, 0, `Local Docker operation unavailable (${result.error?.code ?? result.status})`)
  return result.stdout.trim()
}
export const sql = input => docker(['exec', '-i', 'supabase_db_torneos', 'psql', '-X', '-U', 'postgres',
  '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tA'], input)
export function transactionBody(source) {
  // 09.2 contains its own transaction. Both migrations must commit together.
  const body = source.replace(/^BEGIN;\s*$/gmi, '').replace(/^COMMIT;\s*$/gmi, '')
  assert.doesNotMatch(body, /^\s*(BEGIN|COMMIT|ROLLBACK);/mi)
  return body
}
export async function migrationSources() {
  return Promise.all(migrations.map(async ([version, name, expected]) => {
    const file = `supabase/migrations/${version}_${name}.sql`
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8')
    assert.equal(sha256(source), expected, `Reviewed migration changed: ${file}`)
    return { version, name, file, sha256: expected, source }
  }))
}
export function migrationTransaction(sources) {
  return `BEGIN;\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='30s';\n`
    + sources.map(({ version, name, source }) => {
      assert.match(version, /^\d+$/); assert.match(name, /^[a-z0-9_]+$/)
      assert.ok(!source.includes('$g2048_source$'))
      return `${transactionBody(source)}\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements)
        VALUES('${version}','${name}',ARRAY[$g2048_source$${source}$g2048_source$]);`
    }).join('\n') + "\nNOTIFY pgrst,'reload schema';\nCOMMIT;\n"
}
export function dataFingerprint() {
  const tables = JSON.parse(sql(`SELECT coalesce(json_agg(format('%I.%I',schemaname,tablename)
    ORDER BY schemaname,tablename),'[]') FROM pg_tables WHERE schemaname IN ('public','auth');`))
  return Object.fromEntries(tables.map(table => [table, sql(`SELECT count(*)||':'||md5(coalesce(
    string_agg(row_to_json(r)::text,E'\n' ORDER BY row_to_json(r)::text),'')) FROM ${table} r;`)]))
}
export function assertInstalled() {
  const result = JSON.parse(sql(`SELECT json_build_object(
    'seedHidden',NOT has_column_privilege('authenticated','public.games','seed','SELECT')
      AND NOT has_column_privilege('anon','public.games','seed','SELECT'),
    'serviceSeed',has_column_privilege('service_role','public.games','seed','SELECT'),
    'serviceInspect',has_function_privilege('service_role','public.inspect_2048_integrity(uuid)','EXECUTE'),
    'browserInspectDenied',NOT has_function_privilege('authenticated','public.inspect_2048_integrity(uuid)','EXECUTE'),
    'privateSchemaDenied',NOT has_schema_privilege('authenticated','integrity_private','USAGE'),
    'completionGuard',EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='guard_2048_finalization'
      AND tgrelid='public.tournaments'::regclass AND tgenabled='O'),
    'moveBanGuard',position('ACCOUNT_SUSPENDED' IN (SELECT prosrc FROM pg_proc
      WHERE oid='public.record_game_move'::regproc))>0);`))
  for (const [check, passed] of Object.entries(result)) assert.equal(passed, true, `Schema verification failed: ${check}`)
  return result
}
async function main() {
  await localEnv()
  const sources = await migrationSources()
  const report = { task: 'G2048-09.4', at: new Date().toISOString(), mode: process.argv.includes('--apply') ? 'apply' : 'preflight',
    target: 'local 3081 / Supabase 54321', migrations: sources.map(item => ({ version: item.version, name: item.name,
      file: item.file, sha256: item.sha256 })), applied: false }
  try {
    docker(['info', '--format', '{{.ServerVersion}}'], undefined, 5000)
    const applied = JSON.parse(sql("SELECT coalesce(json_agg(version),'[]') FROM supabase_migrations.schema_migrations;"))
    const pending = sources.filter(item => !applied.includes(item.version))
    report.pending = pending.map(item => item.version)
    if (process.argv.includes('--apply')) {
      const before = dataFingerprint()
      if (pending.length) {
        // Save affected definitions and grants before touching the existing schema.
        const definitions = sql(`SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname IN
          ('record_game_move','finalize_tournament') AND pronamespace='public'::regnamespace;
          SELECT json_agg(r) FROM information_schema.column_privileges r WHERE table_schema='public' AND table_name='games';`)
        await mkdir('artifacts/2048-integrity-integration', { recursive: true })
        await writeFile('artifacts/2048-integrity-integration/schema-before.private.sql', definitions)
        report.applied = null // Timeout/transport loss cannot prove a rollback.
        sql(migrationTransaction(pending))
      }
      report.applied = true
      assert.deepEqual(dataFingerprint(), before, 'Existing public/auth rows changed during scoped migration')
      report.installed = assertInstalled()
      report.dataPreserved = true
    }
    report.status = 'PASS'
  } catch {
    report.status = report.applied === true ? 'APPLIED_VERIFICATION_FAILED'
      : report.applied === null ? 'APPLY_OUTCOME_UNCONFIRMED' : 'NOT_COMPLETED'
    report.blocker = 'Local Docker/Supabase unavailable or schema precondition failed; no authenticated integration claimed'
    process.exitCode = 1
  }
  await mkdir('artifacts/2048-integrity-integration', { recursive: true })
  await writeFile('artifacts/2048-integrity-integration/migration-report.json', JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main()
