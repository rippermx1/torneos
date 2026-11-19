import fs from 'node:fs'
import { createHash } from 'node:crypto'
export function assessAudit(report, policy, lock, now = new Date()) {
  const issues = [], exceptions = []
  if (report.error || !report.metadata?.vulnerabilities || !report.vulnerabilities) issues.push('Auditoría incompleta o proveedor sin respuesta')
  if (report.metadata?.vulnerabilities?.total !== Object.keys(report.vulnerabilities ?? {}).length) issues.push('Inventario de auditoría inconsistente')
  const allowed = (name, seen = new Set()) => {
    if (seen.has(name)) return false
    const trail = new Set(seen); trail.add(name)
    const v = report.vulnerabilities[name]
    return v && v.severity === 'high' && policy.packages.includes(name) && now < new Date(`${policy.review_before}T00:00:00Z`) &&
      Array.isArray(v.nodes) && v.nodes.length > 0 && v.nodes.every(node => lock.packages[node]?.dev === true && policy.versions[node] === lock.packages[node]?.version) &&
      Array.isArray(v.via) && v.via.length > 0 && v.via.every(item => typeof item === 'string' ? allowed(item, trail) : item?.url === policy.advisory)
  }
  for (const [name, item] of Object.entries(report.vulnerabilities ?? {})) {
    if (allowed(name)) exceptions.push(name)
    else if (['moderate', 'high', 'critical'].includes(item.severity)) issues.push(`Dependencia sin excepción válida: ${name}`)
  }
  return { ok: issues.length === 0, issues, exceptions, review_before: policy.review_before }
}
if (process.argv[1]?.endsWith('release-audit.mjs')) {
  const file = process.argv[2], output = process.argv[3]
  if (!file || !output) throw new Error('Use release-audit.mjs <npm-audit.json> <result.json>')
  const raw = fs.readFileSync(file), report = JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, ''))
  const result = assessAudit(report, JSON.parse(fs.readFileSync('config/dependency-audit-policy.json', 'utf8')), JSON.parse(fs.readFileSync('package-lock.json', 'utf8')))
  fs.writeFileSync(output, JSON.stringify({ ...result, audit_sha256: createHash('sha256').update(raw).digest('hex') }, null, 2) + '\n')
  console.log(JSON.stringify(result)); if (!result.ok) process.exitCode = 1
}
