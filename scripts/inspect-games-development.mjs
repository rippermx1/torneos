import fs from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'
import { validateCloudDevelopment } from './check-cloud-development.mjs'

const root = process.cwd()
const config = JSON.parse(fs.readFileSync('config/cloud-development.json', 'utf8'))
const pack = JSON.parse(fs.readFileSync('artifacts/games-development/latest-package.json', 'utf8'))
const resources = JSON.parse(fs.readFileSync('artifacts/cloud-development/resources.json', 'utf8'))
const auth = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA, 'com.vercel.cli/Data/auth.json'), 'utf8'))
async function get(endpoint) {
  const response = await fetch(`https://api.vercel.com${endpoint}${endpoint.includes('?') ? '&' : '?'}teamId=${config.vercelTeamId}`, { headers: { Authorization: `Bearer ${auth.token}` }, signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error(`Vercel read ${response.status}`)
  return response.json()
}
const project = await get(`/v9/projects/${config.name}`)
if (project.id !== resources.vercelProjectId || project.name !== config.name || project.accountId !== config.vercelTeamId || config.protectedVercelProjectIds.includes(project.id)) throw new Error('Proyecto dev no coincide')
const env = parseEnv(fs.readFileSync('.env.cloud-development.local', 'utf8'))
validateCloudDevelopment(env, config)
const alias = await get('/v4/aliases/torneos-dev.vercel.app')
if (alias.projectId !== project.id || !alias.deployment?.id) throw new Error('Alias dev no coincide')
const deployment = await get(`/v13/deployments/${alias.deployment.id}`)
if (deployment.projectId !== project.id) throw new Error('Deployment del alias no pertenece a dev')
const baseline = { checkedAt: new Date().toISOString(), projectId: project.id, projectName: project.name, teamId: project.accountId, deploymentId: deployment.id, url: deployment.url, alias: alias.alias, framework: project.framework, protectedProductionProjectId: config.protectedVercelProjectIds[0] }
fs.writeFileSync(path.join(pack.directory, 'baseline.json'), JSON.stringify(baseline, null, 2) + '\n')
fs.mkdirSync(path.join(pack.packageDirectory, '.vercel'), { recursive: true })
fs.writeFileSync(path.join(pack.packageDirectory, '.vercel/project.json'), JSON.stringify({ projectId: project.id, orgId: config.vercelTeamId, projectName: config.name }, null, 2) + '\n')
console.log(JSON.stringify({ ...baseline, packageDirectory: path.relative(root, pack.packageDirectory), localEnvironment: 'VALID' }))
