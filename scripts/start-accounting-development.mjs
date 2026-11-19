import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import {parseEnv} from 'node:util'
import {spawn} from 'node:child_process'
import {validateCloudDevelopment} from './check-cloud-development.mjs'

const config=JSON.parse(fs.readFileSync('config/cloud-development.json','utf8'))
// Prevent Next's automatic .env.local loading from adding production credentials.
const env={...process.env}
for(const file of ['.env','.env.local','.env.production','.env.production.local']) {
  if(fs.existsSync(file))for(const key of Object.keys(parseEnv(fs.readFileSync(file,'utf8'))))env[key]=''
}
for(const key of Object.keys(env))if(/^(SUPABASE_|NEXT_PUBLIC_SUPABASE_|FLOW_|MP_|RESEND_|TORNEOS_|APP_URL$|NEXT_PUBLIC_(APP|SITE)_URL$)/.test(key))env[key]=''
Object.assign(env,parseEnv(fs.readFileSync('.env.cloud-development.local','utf8')))
validateCloudDevelopment(env,config)
const origin='http://127.0.0.1:3085',dist='artifacts/accounting/next-development-real'
Object.assign(env,{APP_URL:origin,NEXT_PUBLIC_APP_URL:origin,NEXT_PUBLIC_SITE_URL:origin,
  NEXT_BUILD_DIR:dist,TORNEOS_LOCAL_MODE:'0',HOSTNAME:'127.0.0.1',PORT:'3085'})
const build=process.argv.includes('--build')
if(!build&&!process.argv.includes('--start'))throw Error('Use --build or --start')
fs.mkdirSync('artifacts/accounting',{recursive:true})
if(!build){
  const stamp=JSON.parse(fs.readFileSync(dist+'/accounting-development-config.json','utf8'))
  if(stamp.supabase!==env.NEXT_PUBLIC_SUPABASE_URL||stamp.origin!==origin)throw Error('Build development configuration first')
  const probe=net.createServer()
  await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(3085,'127.0.0.1',resolve)})
  await new Promise(resolve=>probe.close(resolve))
  const standalone=path.resolve(dist,'standalone')
  fs.cpSync(path.resolve(dist,'static'),path.join(standalone,dist,'static'),{recursive:true})
  for(const name of fs.readdirSync('public'))if(name!=='games')fs.cpSync(path.resolve('public',name),path.join(standalone,'public',name),{recursive:true})
}
console.log(`Accounting ${build?'build':'preview'} · ${origin} · Supabase ${config.supabaseProjectRef}`)
const standalone=path.resolve(dist,'standalone')
const child=spawn(process.execPath,build?['node_modules/next/dist/bin/next','build','--webpack']:
  [path.join(standalone,'server.js')],{cwd:build?process.cwd():standalone,env,windowsHide:true,stdio:'inherit'})
process.on('SIGINT',()=>child.kill());process.on('SIGTERM',()=>child.kill())
child.once('exit',code=>{
  if(build&&code===0)fs.writeFileSync(path.join(dist,'accounting-development-config.json'),JSON.stringify({
    createdAt:new Date().toISOString(),supabase:env.NEXT_PUBLIC_SUPABASE_URL,origin,
    environment:'cloud-development',flow:'disabled',publicDeployment:false},null,2)+'\n')
  process.exit(code??1)
})
