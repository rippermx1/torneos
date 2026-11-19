import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'

// Overlay only accounting onto the unchanged source package of the published dev version.
const root=process.cwd(),base=JSON.parse(await fs.readFile('artifacts/cloud-development/latest-package.json','utf8'))
const prior=JSON.parse(await fs.readFile(base.manifest,'utf8'))
assert.equal(prior.sourceHead,'e7be6991d1cb4e32b3107a1c39186d1db5b2cb7c')
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const directory=path.join(root,'artifacts/accounting-cloud',new Date().toISOString().replaceAll(':','-'))
const candidate=path.join(directory,'package')
await fs.mkdir(candidate,{recursive:true})
for(const file of prior.files){
  const bytes=await fs.readFile(path.join(base.packageDirectory,file.path))
  assert.equal(hash(bytes),file.sha256,`Published baseline drift: ${file.path}`)
  const dest=path.join(candidate,file.path);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,bytes)
}
// The original packager generated these after its manifest; they are part of the live baseline.
const generatedConfig=['vercel.json','.vercelignore']
for(const file of generatedConfig)await fs.copyFile(path.join(base.packageDirectory,file),path.join(candidate,file))
const vercel=JSON.parse(await fs.readFile(path.join(candidate,'vercel.json'),'utf8'))
assert.equal(vercel.buildCommand,'node scripts/check-cloud-development.mjs && next build')
assert.deepEqual(vercel.crons,[])
assert.ok(vercel.headers.some(rule=>rule.headers.some(h=>h.key==='X-Robots-Tag'&&h.value==='noindex, nofollow')))
const overlay=[
  'app/(admin)/admin/accounting/page.tsx','app/api/admin/accounting/route.ts',
  'app/api/admin/accounting/balances.csv/route.ts','app/api/admin/reports/journal.csv/route.ts',
  'app/api/admin/refunds/[id]/credit-note/route.ts','app/(admin)/admin/refunds/page.tsx',
  'components/admin/accounting-workspace.tsx','components/admin/refund-credit-note-form.tsx',
  'components/admin/admin-sidebar.tsx','lib/accounting/ledger.ts','lib/accounting/model-a-report.ts',
  'lib/accounting/operations.ts','lib/accounting/bank-import.ts',
]
for(const file of overlay){const dest=path.join(candidate,file);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.copyFile(path.join(root,file),dest)}
const reports='app/(admin)/admin/reports/page.tsx'
await fs.copyFile(path.join(root,reports),path.join(candidate,reports));overlay.push(reports)
// Extend baseline DB types with accounting contracts only, without newer game RPCs.
const types='types/database.ts';let database=await fs.readFile(path.join(candidate,types),'utf8')
assert.ok(!database.includes('accounting_workspace:'))
database=database.replace('  tax_document_notes: string | null',`  tax_document_notes: string | null
  tax_document_evidence?: string | null
  tax_document_verified_by?: string | null
  tax_document_verified_at?: string | null`)
database=database.replace('    Functions: {',`    Functions: {
      accounting_workspace: {
        Args: { p_period: string | null } & DbRecord
        Returns: Record<string, unknown>
      }
      accounting_operate: {
        Args: { p_action: string; p_payload: Record<string, unknown>; p_actor: string } & DbRecord
        Returns: Record<string, unknown>
      }`)
await fs.writeFile(path.join(candidate,types),database);overlay.push(types)
const project={projectId:'prj_QHiZYuYkztFToMGmwhPsyOx9nVdG',orgId:'team_PE6bjY2Mkofe3t853KkiDKlM',projectName:'torneos-dev'}
await fs.mkdir(path.join(candidate,'.vercel'),{recursive:true})
await fs.writeFile(path.join(candidate,'.vercel/project.json'),JSON.stringify(project,null,2)+'\n')
const paths=new Set([...prior.files.map(f=>f.path),...overlay,...generatedConfig])
const files=[]
for(const file of [...paths].sort()){
  assert.ok(!file.startsWith('.env')&&!/KayKit|LocalArt|UnityProject/.test(file))
  const bytes=await fs.readFile(path.join(candidate,file));files.push({path:file,bytes:bytes.length,sha256:hash(bytes)})
}
const changes=files.filter(f=>prior.files.find(p=>p.path===f.path)?.sha256!==f.sha256).map(f=>f.path)
assert.ok(changes.every(f=>overlay.includes(f)||generatedConfig.includes(f)))
assert.ok(files.filter(f=>f.path.startsWith('public/games/')).every(f=>prior.files.find(p=>p.path===f.path)?.sha256===f.sha256))
const manifest={createdAt:new Date().toISOString(),packageDirectory:candidate,
  baselineDeployment:'dpl_3VxaPf5t4yAGb2TRX28GjgJpJXFH',baselineManifest:base.manifest,
  sourceHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),includesWorkingChanges:true,
  project,scope:'accounting-only overlay on published development source',games:prior.games,
  changes:changes.filter(f=>overlay.includes(f)),preservedGeneratedConfig:generatedConfig,files}
await fs.writeFile(path.join(directory,'package-manifest.json'),JSON.stringify(manifest,null,2)+'\n')
await fs.writeFile('artifacts/accounting-cloud/latest-package.json',JSON.stringify({directory,packageDirectory:candidate,manifest:path.join(directory,'package-manifest.json')},null,2)+'\n')
console.log(JSON.stringify({packageDirectory:candidate,files:files.length,changes,games:manifest.games}))
