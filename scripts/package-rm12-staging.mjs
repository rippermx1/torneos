import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const destination = path.join(root, 'artifacts/staging/packages', new Date().toISOString().replace(/[:.]/g, '-'))
fs.mkdirSync(destination, { recursive: true })
const files = []
function copy(relative) {
  if (/(^|[\\/])(?:\.env[^\\/]*|node_modules|LocalArt|KayKit[^\\/]*|\.git|Library)(?:[\\/]|$)/i.test(relative)) throw new Error('Unpublishable path')
  const absolute=path.join(root,relative), stat=fs.lstatSync(absolute)
  if(stat.isSymbolicLink()) throw new Error('Symlink forbidden')
  if(stat.isDirectory()) { for(const name of fs.readdirSync(absolute).sort())copy(path.join(relative,name));return }
  const bytes=fs.readFileSync(absolute),target=path.join(destination,relative)
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes)
  files.push({path:relative.replaceAll('\\','/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')})
}
for(const relative of ['app','components','lib','types','config','package.json','package-lock.json','next.config.ts','instrumentation.ts','proxy.ts','tsconfig.json','postcss.config.mjs','scripts/prepare-release.mjs','scripts/start-release.mjs'])copy(relative)
for(const name of fs.readdirSync(path.join(root,'public')))if(name!=='games')copy(path.join('public',name))
const games=JSON.parse(fs.readFileSync(path.join(root,'config/staging-published-games.json'),'utf8'))
if(JSON.stringify(games)!==JSON.stringify({'2048':'unity-2048-007'}))throw new Error('Only the approved 2048 build may be uploaded')
copy('public/games/2048/unity-2048-007')
fs.writeFileSync(path.join(destination,'vercel.json'),JSON.stringify({framework:'nextjs',installCommand:'npm ci',buildCommand:'npm run build -- --webpack',crons:[],headers:[{source:'/(.*)',headers:[{key:'X-Robots-Tag',value:'noindex, nofollow'}]}]},null,2)+'\n')
fs.writeFileSync(path.join(destination,'.vercelignore'),'.env*\n.next\nnode_modules\n.git\n*.tsbuildinfo\n')
fs.mkdirSync(path.join(destination,'.vercel'))
fs.writeFileSync(path.join(destination,'.vercel/project.json'),JSON.stringify({projectId:'prj_QHiZYuYkztFToMGmwhPsyOx9nVdG',orgId:'team_PE6bjY2Mkofe3t853KkiDKlM',projectName:'torneos-dev'})+'\n')
const report={created_at:new Date().toISOString(),package_directory:destination,revision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),dirty:Boolean(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim()),project:'prj_QHiZYuYkztFToMGmwhPsyOx9nVdG',app_url:'https://rm12-torneos-dev.vercel.app',games,excluded_assets:['alien-run licensed artwork','Factory Empire shared WIP'],files}
if(report.dirty)throw new Error('Commit the candidate before packaging')
fs.writeFileSync(path.join(root,'artifacts/staging/package.json'),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({package_directory:destination,files:files.length,bytes:files.reduce((sum,file)=>sum+file.bytes,0),games}))
