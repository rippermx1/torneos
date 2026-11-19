import { describe, expect, it } from 'vitest'
import { assessAudit } from '../scripts/release-audit.mjs'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { verifyStagingEvidence, verifyEvidenceFiles } from '../scripts/verify-staging-evidence.mjs'
import { migrationComparison, sourceHash } from '../scripts/release-manifest.mjs'
describe('release decisions retain evidence boundaries', () => {
  it('binds identical text checkouts across CRLF/LF without hiding source changes', () => {
    expect(sourceHash(Buffer.from('first\r\nsecond\r\n'), 'app/page.tsx')).toBe(sourceHash(Buffer.from('first\nsecond\n'), 'app/page.tsx'))
    expect(sourceHash(Buffer.from('first\r\nchanged\r\n'), 'migration.sql')).not.toBe(sourceHash(Buffer.from('first\nsecond\n'), 'migration.sql'))
  })
  it('never normalizes binary source files', () => {
    expect(sourceHash(Buffer.from('A\r\nB'), 'public/icon.png')).not.toBe(sourceHash(Buffer.from('A\nB'), 'public/icon.png'))
  })
  const policy = { review_before: '2026-11-05', packages: ['braces'], advisory: 'https://github.com/advisories/allowed', versions: { 'node_modules/braces': '3.0.3' } }
  const report = { metadata: { vulnerabilities: { total: 1 } }, vulnerabilities: { braces: { severity: 'high', nodes: ['node_modules/braces'], via: [{ url: policy.advisory }] } } }
  const lock = { packages: { 'node_modules/braces': { dev: true, version: '3.0.3' } } }
  it('accepts only reviewed dev package/version/advisory before deadline', () => expect(assessAudit(report, policy, lock, new Date('2026-10-05')).ok).toBe(true))
  it.each(['production', 'changed-version', 'new-advisory', 'expired', 'incomplete'])('rejects %s exposure', change => {
    const altered = structuredClone(report), deps = structuredClone(lock)
    if (change === 'production') deps.packages['node_modules/braces'].dev = false
    if (change === 'changed-version') deps.packages['node_modules/braces'].version = '3.0.4'
    if (change === 'new-advisory') altered.vulnerabilities.braces.via[0].url = 'https://github.com/advisories/other'
    if (change === 'incomplete') delete (altered as { metadata?: unknown }).metadata
    expect(assessAudit(altered, policy, deps, new Date(change === 'expired' ? '2026-11-06' : '2026-10-05')).ok).toBe(false)
  })
  it('compares selected migrations without certifying deployed grants or applying unselected game SQL', () => {
    const result = migrationComparison(['20261005175927_cash.sql', '20261005160247_ops.sql'], ['20261005160247'])
    expect(result.pending).toEqual(['20261005175927_cash.sql']); expect(result.present).toEqual(['20261005160247_ops.sql']); expect(result.warning).toContain('does not prove SQL hashes/grants')
  })
  it('accepts the real legacy history without crediting it as candidate migrations', () => {
    const result = migrationComparison(['20261005175927_cash.sql'], ['001', '009', '20261005160247'])
    expect(result.pending).toEqual(['20261005175927_cash.sql'])
    expect(result.present).toEqual([])
  })
  it.each([['20261005160247', '20261005160247'], ['latest'], [false]].map(value => ({ value })))('rejects ambiguous destination inventory $value', ({ value }) => expect(() => migrationComparison([], value)).toThrow())
})

const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const stageFixture = () => {
  const inputs = { source: [], games: [{ game: '2048', build: 'unit-only', files: [] }], migrations: [], public_build: { environment: 'staging', app_origin_sha256: digest('https://staging.example.org'), values: { NEXT_PUBLIC_SITE_URL: { sha256: digest('https://staging.example.org') } } } }
  const manifest = { ...inputs, dirty: false, revision: 'a'.repeat(40), source_fingerprint: digest(JSON.stringify(inputs)) }
  const application = [{ file: '.next/BUILD_ID', sha256: digest('unit-build') }]
  const candidate = { ...manifest, application, release_fingerprint: digest(JSON.stringify({ source_fingerprint: manifest.source_fingerprint, application })) }
  const checks = Object.fromEntries(['migration_compatibility', 'grants', 'auth_mfa', 'private_storage', 'flow_https_callback', 'registration_game', 'refund_recovery', 'prize_withdrawal', 'operator_backup'].map(name => [name, { status: 'PASS', artifact_sha256: digest('unit-only'), artifact: 'proof.txt' }]))
  return { manifest: candidate, evidence: { release_fingerprint: candidate.release_fingerprint, source_fingerprint: manifest.source_fingerprint, revision: manifest.revision, deployment_id: 'unit-only', artifact_id: 'unit-only', app_url: 'https://staging.example.org', verified_at: '2026-10-05T12:00:00Z', checks } }
}
describe('staging evidence is bound to exact inputs without fabricating E2E', () => {
  it.each(['preflight', 'configuration'])('never accepts blocked provider phase %s as a completed financial rehearsal', phase => {
    const { manifest, evidence } = stageFixture()
    Object.assign(manifest.public_build, { staging_phase: phase })
    expect(verifyStagingEvidence(manifest, evidence, Date.parse('2026-10-05T13:00:00Z')).issues).toContain(`${phase === 'preflight' ? 'Preflight' : 'Configuration'} no constituye aceptación del ensayo financiero`)
  })
  it('reports only binding scope even with a complete synthetic fixture', () => {
    const { manifest, evidence } = stageFixture()
    const result = verifyStagingEvidence(manifest, evidence, Date.parse('2026-10-05T13:00:00Z'))
    expect(result.ok).toBe(true); expect(result.scope).toContain('binding only'); expect(result.production_decision).toBe('NO_GO')
  })
  it.each(['revision', 'dirty', 'game', 'public', 'missing-check', 'compiled-artifact', 'old', 'future'])('rejects %s staging drift', change => {
    const { manifest, evidence } = stageFixture()
    if (change === 'revision') evidence.revision = 'b'.repeat(40)
    if (change === 'dirty') manifest.dirty = true
    if (change === 'game') manifest.games[0].build = 'changed'
    if (change === 'public') manifest.public_build.environment = 'production'
    if (change === 'missing-check') delete evidence.checks.grants
    if (change === 'compiled-artifact') manifest.application[0].sha256 = digest('changed')
    if (change === 'old') evidence.verified_at = '2026-10-03T12:00:00Z'
    if (change === 'future') evidence.verified_at = '2026-10-06T12:00:00Z'
    expect(verifyStagingEvidence(manifest, evidence, Date.parse('2026-10-05T13:00:00Z')).ok).toBe(false)
  })
  it('checks actual evidence bytes and rejects alteration and directory escape', () => {
    fs.mkdirSync(path.resolve('artifacts'), { recursive: true })
    const directory = fs.mkdtempSync(path.resolve('artifacts', 'rm11-test-'))
    const file = path.join(directory, 'proof.txt')
    const { evidence } = stageFixture()
    try {
      fs.writeFileSync(file, 'unit-only')
      expect(verifyEvidenceFiles(evidence, directory)).toEqual([])
      fs.writeFileSync(file, 'altered')
      expect(verifyEvidenceFiles(evidence, directory).length).toBe(9)
      evidence.checks.grants.artifact = '../../package.json'
      expect(verifyEvidenceFiles(evidence, directory)).toContain('Archivo de evidencia ausente/alterado: grants')
    } finally { fs.unlinkSync(file); fs.rmdirSync(directory) }
  })
})
