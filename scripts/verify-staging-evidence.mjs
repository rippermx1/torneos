import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { sourceInventory, sourceHash } from './release-manifest.mjs'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
export function verifyStagingEvidence(manifest, evidence, now = Date.now()) {
  const required = ['migration_compatibility', 'grants', 'auth_mfa', 'private_storage', 'flow_https_callback', 'registration_game', 'refund_recovery', 'prize_withdrawal', 'operator_backup']
  const issues = []
  if (manifest.public_build?.staging_phase === 'preflight') issues.push('Preflight no constituye aceptación del ensayo financiero')
  if (manifest.public_build?.staging_phase === 'configuration') issues.push('Configuration no constituye aceptación del ensayo financiero')
  if (!manifest.application?.length || manifest.release_fingerprint !== sha(JSON.stringify({ source_fingerprint: manifest.source_fingerprint, application: manifest.application })) || evidence?.release_fingerprint !== manifest.release_fingerprint) issues.push('Artefacto compilado distinto o ausente en evidencia staging')
  if (manifest.source_fingerprint !== sha(JSON.stringify({ source: manifest.source, games: manifest.games, migrations: manifest.migrations, public_build: manifest.public_build }))) issues.push('Inventario de candidata alterado o incompleto')
  if (!evidence || evidence.source_fingerprint !== manifest.source_fingerprint || evidence.revision !== manifest.revision || manifest.dirty) issues.push('Staging no corresponde a la revisión limpia y fuentes de la candidata')
  if (!evidence?.deployment_id || !evidence?.artifact_id || !/^https:\/\//.test(evidence?.app_url ?? '')) issues.push('Identidad del despliegue y artefacto HTTPS requerida')
  try {
    const url = new URL(evidence?.app_url)
    const expected = manifest.public_build?.app_origin_sha256
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || sha(evidence.app_url) !== expected || manifest.public_build.environment !== 'staging') throw new Error('Invalid destination')
  } catch { issues.push('Origen de staging distinto del congelado en candidata') }
  const at = Date.parse(evidence?.verified_at ?? '')
  if (!Number.isFinite(at) || at > now || now - at > 24 * 60 * 60 * 1000) issues.push('Evidencia staging reciente requerida')
  for (const name of required) if (evidence?.checks?.[name]?.status !== 'PASS' || !evidence?.checks?.[name]?.artifact_sha256?.match(/^[a-f0-9]{64}$/)) issues.push(`Staging incompleto: ${name}`)
  return { ok: issues.length === 0, issues, scope: 'evidence binding only; real E2E executions and artifacts must be independently reviewed', production_decision: 'NO_GO' }
}
export function verifyEvidenceFiles(evidence, directory) {
  const issues = [], base = fs.realpathSync(directory)
  for (const [name, check] of Object.entries(evidence.checks ?? {})) {
    try {
      if (typeof check.artifact !== 'string' || path.isAbsolute(check.artifact)) throw new Error('Invalid path')
      const target = fs.realpathSync(path.resolve(base, check.artifact))
      if (!target.startsWith(base + path.sep) || !fs.statSync(target).isFile() || sha(fs.readFileSync(target)) !== check.artifact_sha256) throw new Error('Invalid evidence hash')
    } catch { issues.push(`Archivo de evidencia ausente/alterado: ${name}`) }
  }
  return issues
}
if (process.argv[1]?.endsWith('verify-staging-evidence.mjs')) {
  const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), evidence = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'))
  const result = verifyStagingEvidence(manifest, evidence)
  const required = JSON.parse(fs.readFileSync('config/commercial-release.json', 'utf8')).migrations
  if (JSON.stringify(manifest.migrations?.map(item => item.file)) !== JSON.stringify(required)) result.issues.push('Inventario de migraciones comerciales incompleto')
  const games = JSON.parse(fs.readFileSync('lib/game/runtime-builds.json', 'utf8'))
  if (manifest.games?.length !== Object.keys(games).length || Object.entries(games).some(([game, build]) => !manifest.games?.some(item => item.game === game && item.build === build && item.files?.length))) result.issues.push('Inventario WebGL distinto o incompleto')
  if (manifest.revision !== execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() || JSON.stringify(manifest.source) !== JSON.stringify(sourceInventory())) result.issues.push('La candidata no coincide con las fuentes actuales')
  for (const migration of manifest.migrations ?? []) {
    if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(migration.file) || sourceHash(fs.readFileSync(path.join('supabase/migrations', migration.file)), migration.file) !== migration.sha256) result.issues.push('Migración alterada')
  }
  result.issues.push(...verifyEvidenceFiles(evidence, path.dirname(path.resolve(process.argv[3]))))
  result.ok = result.issues.length === 0
  console.log(JSON.stringify(result)); if (!result.ok) process.exitCode = 1
}
