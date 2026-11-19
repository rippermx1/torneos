import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {parseEnv} from 'node:util'
import {spawn} from 'node:child_process'
import {createHash} from 'node:crypto'
import {validateCloudDevelopment} from './check-cloud-development.mjs'

const root=process.cwd(),pack=JSON.parse(await fs.readFile('artifacts/accounting-cloud/latest-package.json','utf8'))
const vars=parseEnv(await fs.readFile(path.join(pack.directory,'.env.vercel-production.local'),'utf8'))
const config=JSON.parse(await fs.readFile('config/cloud-development.json','utf8'))
validateCloudDevelopment(vars,config)
assert.equal(config.supabaseProjectRef,'jnoyjewsqbooqaiighcs')
const env={...process.env,...vars,NEXT_TELEMETRY_DISABLED:'1'}
for(const key of ['NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SERVER_URL','TORNEOS_LOCAL_MODE'])if(!(key in vars))env[key]=''
if(!vars.NEXT_BUILD_DIR)delete env.NEXT_BUILD_DIR
const run=async args=>{
  const child=spawn(process.execPath,args,{cwd:pack.packageDirectory,env,stdio:['ignore','pipe','pipe']})
  let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{output+=b;process.stdout.write(b)})
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve)})
  assert.equal(code,0,`Failed: ${args[0]}`)
  return output
}
const tests=['accounting-api','accounting-effective','accounting-ledger','accounting-operations','accounting-payout-ledger','tournament-finance','fixed-prize','datetime-local'].map(n=>`__tests__/${n}.test.ts`)
const savedConfig=await fs.readFile(path.join(pack.packageDirectory,'vitest.config.mts'))
await fs.mkdir(path.join(pack.packageDirectory,'__tests__'),{recursive:true})
for(const file of [...tests,'vitest.config.mts'])await fs.copyFile(path.join(root,file),path.join(pack.packageDirectory,file))
try{
  const vitest=await run(['node_modules/vitest/vitest.mjs','run',...tests])
  const lint=await run(['node_modules/eslint/bin/eslint.js',...(JSON.parse(await fs.readFile(pack.manifest,'utf8')).changes.filter(p=>/\.tsx?$/.test(p)))])
  const build=await run(['node_modules/next/dist/bin/next','build'])
  const types=await run(['node_modules/typescript/bin/tsc','--noEmit','--incremental','false'])
  const manifest=JSON.parse(await fs.readFile(pack.manifest,'utf8'))
  if(!manifest.files.some(f=>f.path==='next-env.d.ts')){
    const bytes=await fs.readFile(path.join(pack.packageDirectory,'next-env.d.ts'))
    manifest.files.push({path:'next-env.d.ts',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')})
    manifest.generatedFiles=['next-env.d.ts']
    await fs.writeFile(pack.manifest,JSON.stringify(manifest,null,2)+'\n')
  }
  await fs.writeFile(path.join(pack.directory,'validation.json'),JSON.stringify({at:new Date().toISOString(),status:'PASS',project:'torneos-dev',vitest,lint,build,types},null,2)+'\n')
}finally{
  // Validation fixtures do not enter the upload or candidate source manifest.
  for(const file of tests)await fs.unlink(path.join(pack.packageDirectory,file))
  await fs.writeFile(path.join(pack.packageDirectory,'vitest.config.mts'),savedConfig)
  await fs.rmdir(path.join(pack.packageDirectory,'__tests__'))
}
