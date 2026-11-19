// Derive from the G2048-11.1 frozen context, preserving simultaneous game WIP.
import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {execFileSync,spawn} from 'node:child_process'
import assert from 'node:assert/strict'
const dir='artifacts/2048-competitive/',source='artifacts/2048-integration/context',context=path.resolve(dir,'context')
const inspect=JSON.parse(execFileSync('docker',['inspect','torneos-app-1'],{encoding:'utf8',windowsHide:true}))[0]
assert.equal(inspect.State.Health.Status,'healthy');assert.ok(/^torneos-app:g2048-(007|044-candidate)-/.test(inspect.Config.Image))
assert.equal((await fs.readFile(source+'/lib/game/runtime-builds.json','utf8')).includes('unity-2048-007'),true)
await fs.cp(source,context,{recursive:true})
const patches={}
for(const route of ['start','move']){
 const file=`app/api/tournaments/[id]/game/${route}/route.ts`,bytes=await fs.readFile(file)
 await fs.writeFile(path.join(context,file),bytes);patches[file]=createHash('sha256').update(bytes).digest('hex')
}
let dockerfile=await fs.readFile(path.join(context,'Dockerfile'),'utf8')
dockerfile=dockerfile.replace(/^FROM .+ AS operative/m,'FROM '+inspect.Config.Image+' AS operative')
await fs.writeFile(path.join(context,'Dockerfile'),dockerfile)
const image='torneos-app:g2048-044-candidate-'+Date.now(),env=Object.fromEntries(inspect.Config.Env.map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]))
const registry=JSON.parse(await fs.readFile(path.join(context,'lib/game/runtime-builds.json'),'utf8'))
const args=['build','--tag',image]
for(const key of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','NEXT_PUBLIC_SUPABASE_ANON_KEY','NEXT_PUBLIC_GOOGLE_AUTH_ENABLED'])if(env[key])args.push('--build-arg',key+'='+env[key])
args.push(context)
const log=await fs.open(dir+'candidate-build.log','w'),child=spawn('docker',args,{windowsHide:true,stdio:['ignore',log.fd,log.fd]})
const code=await new Promise(resolve=>child.on('exit',resolve));await log.close();assert.equal(code,0,'Candidate build failed; inspect ignored build log')
const imageId=execFileSync('docker',['image','inspect',image,'--format','{{.Id}}'],{encoding:'utf8',windowsHide:true}).trim()
const result={task:'G2048-04.4',image,imageId,baseline:inspect.Image,context,patches,at:new Date().toISOString(),deployedTo3081:false,dbMigrationApplied:false}
await fs.writeFile(dir+'candidate.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result))
