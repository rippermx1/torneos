// Explicit local QA transport. Importing this module never opens a listener or performs I/O.
// Serves the existing DEV deployment; it never installs an app flag or fabricates gameplay.
import http from 'node:http'
import https from 'node:https'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import {parseEnv} from 'node:util'
import {createServerClient} from '@supabase/ssr'
import {validateCloudDevelopment} from './check-cloud-development.mjs'
import {validateDailyDevelopment} from './verify-2048-daily-development.mjs'
import {validateAuthenticatedFixture,assertOwnedAuthenticatedUser} from './verify-2048-authenticated-development.mjs'

const upstreamOrigin='https://torneos-dev.vercel.app'
const project='jnoyjewsqbooqaiighcs'
const build='/games/2048/unity-2048-007/'
const phasePattern=/^[A-Za-z][A-Za-z0-9_-]{0,63}$/
const modes=['normal','error','timeout','slow']
export function qa2048Hosts(runId,port){
  assert.match(runId,/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i)
  assert.ok(Number.isSafeInteger(port)&&port>=1024&&port<=65535)
  return Object.fromEntries(['A','B'].map(label=>[label,`qa2048-${label.toLowerCase()}-${runId.replaceAll('-','').slice(0,12)}.localhost:${port}`]))
}
export function validateQa2048Request({host,origin,site,method,url},hosts){
  const label=Object.keys(hosts).find(key=>hosts[key]===host)
  if(!label)throw Error('QA_HOST_REJECTED')
  if(origin&&origin!==`http://${host}`||site==='cross-site')throw Error('QA_ORIGIN_REJECTED')
  const parsed=new URL(url,`http://${host}`)
  if(parsed.origin!==`http://${host}`||parsed.username||parsed.password)throw Error('QA_TARGET_REJECTED')
  const pathname=parsed.pathname
  const getAllowed=['/','/play','/play/2048/ticket','/sign-in','/favicon.ico','/api/2048/daily'].includes(pathname)
    ||pathname.startsWith('/_next/static/')||pathname.startsWith(build)||pathname.startsWith('/fonts/')
  if(method==='POST'){
    if(pathname!=='/api/2048/activity'||origin!==`http://${host}`||site!=='same-origin')throw Error('QA_WRITE_REJECTED')
  }else if(!['GET','HEAD'].includes(method)||!getAllowed)throw Error('QA_ROUTE_REJECTED')
  return {label,pathname,search:parsed.search}
}
export function parseQa2048Activity(bytes){
  assert.ok(Buffer.isBuffer(bytes)&&bytes.length<=256)
  const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))
  assert.ok(data&&typeof data==='object'&&!Array.isArray(data)&&Object.keys(data).length===1&&['practice','daily'].includes(data.mode))
  return data.mode
}
export function qa2048ResponseHeaders(input,host){
  const output={...input,'cache-control':'private, no-store'}
  // Compression stays byte-for-byte intact; this proxy never changes HTML or scripts.
  delete output.etag
  if(output.location){
    const target=new URL(output.location,upstreamOrigin)
    assert.equal(target.origin,upstreamOrigin)
    output.location=`http://${host}${target.pathname}${target.search}${target.hash}`
  }
  if(output['set-cookie']){
    const values=Array.isArray(output['set-cookie'])?output['set-cookie']:[output['set-cookie']]
    // Only the project's host-local authentication cookies may cross this QA boundary.
    output['set-cookie']=values.filter(value=>value.startsWith(`sb-${project}-auth-token`))
      .map(value=>value.replace(/;\s*Domain=[^;]*/ig,'').replace(/;\s*Secure\b/ig,''))
  }
  if(typeof output['content-security-policy']==='string'){
    // The only transport exception is HTTPS upgrading on this loopback-only HTTP harness.
    output['content-security-policy']=output['content-security-policy'].split(';').map(x=>x.trim())
      .filter(x=>x&&x!=='upgrade-insecure-requests').join('; ')
  }
  return output
}
function cookies(raw){
  return String(raw??'').split(';').flatMap(pair=>{
    const i=pair.indexOf('=');if(i<1)return[]
    const name=pair.slice(0,i).trim(),value=pair.slice(i+1).trim()
    return name===`sb-${project}-auth-token`||new RegExp(`^sb-${project}-auth-token\\.\\d+$`).test(name)?[{name,value}]:[]
  })
}
export async function startAuthenticatedQaProxy({developmentRoot,fixtureFile,port=3099}){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
  const filename=await fs.realpath(fixtureFile),stat=await fs.lstat(fixtureFile)
  assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<128*1024)
  const base=await fs.realpath(path.join(root,'artifacts/2048-authenticated-development'))
  assert.ok(filename.startsWith(base+path.sep)&&path.basename(filename)==='fixture.private.json')
  const fixture=validateAuthenticatedFixture(JSON.parse(await fs.readFile(filename,'utf8')))
  assert.equal(path.basename(path.dirname(filename)),fixture.runId)
  const directory=path.dirname(filename)
  const env=parseEnv((await fs.readFile(path.join(developmentRoot,'.env.cloud-development.local'),'utf8')).replace(/^\uFEFF/,''))
  const config=JSON.parse(await fs.readFile(path.join(developmentRoot,'config/cloud-development.json'),'utf8'))
  validateDailyDevelopment(env,config);validateCloudDevelopment(env,config)
  const hosts=qa2048Hosts(fixture.runId,port)
  const controlPath=path.join(directory,'proxy-control.json'),tracePath=path.join(directory,'activity-trace.jsonl')
  try{await fs.writeFile(controlPath,JSON.stringify({A:{phase:'A_initial',mode:'normal'},B:{phase:'B_initial',mode:'normal'}})+'\n',{flag:'wx'})}
  catch(error){if(error.code!=='EEXIST')throw error}
  let sequence=0
  const restrictedFetch=(input,init={})=>{
    const target=new URL(typeof input==='string'||input instanceof URL?input:input.url)
    assert.equal(target.origin,`https://${project}.supabase.co`)
    return fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(15000)})
  }
  const trace=event=>fs.appendFile(tracePath,JSON.stringify({sequence:++sequence,at:new Date().toISOString(),...event})+'\n',{mode:0o600})
  const server=http.createServer(async(req,res)=>{
    let target,phase='unclassified',mode
    try{
      target=validateQa2048Request({host:req.headers.host,origin:req.headers.origin,site:req.headers['sec-fetch-site'],method:req.method,url:req.url},hosts)
      const control=JSON.parse(await fs.readFile(controlPath,'utf8'))[target.label]
      assert.ok(control&&phasePattern.test(control.phase)&&modes.includes(control.mode));phase=control.phase
      if(req.method==='POST'){
        const chunks=[];let size=0
        for await(const chunk of req){size+=chunk.length;assert.ok(size<=256);chunks.push(chunk)}
        mode=parseQa2048Activity(Buffer.concat(chunks))
        const jar=cookies(req.headers.cookie)
        const client=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          {global:{fetch:restrictedFetch},auth:{autoRefreshToken:false},cookieOptions:{name:`sb-${project}-auth-token`},
            cookies:{getAll:()=>jar,setAll:()=>{throw Error('QA_REAUTHENTICATION_REQUIRED')}}})
        const {data,error}=await client.auth.getUser();assert.ok(!error&&data.user)
        const account=fixture.accounts.find(a=>a.label===target.label)
        assertOwnedAuthenticatedUser(data.user,fixture,account)
        await trace({actor:target.label,phase,kind:'activity-request',mode})
        req.qaBody=Buffer.concat(chunks)
      }
      if(control.mode==='timeout'&&target.pathname===build+'index.html'){
        res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});res.end('<!doctype html><title>Local QA transport without WebGL reply</title>');return
      }
      if(control.mode==='error'&&target.pathname.startsWith(build+'Build/')){
        res.writeHead(503,{'content-type':'text/plain','cache-control':'no-store'});res.end('Controlled local QA asset failure');return
      }
      if(control.mode==='slow'&&target.pathname.startsWith(build))await new Promise(resolve=>setTimeout(resolve,1000))
      const headers={...req.headers,host:'torneos-dev.vercel.app','x-forwarded-host':'torneos-dev.vercel.app','x-forwarded-proto':'https','accept-encoding':'identity'}
      delete headers.authorization;delete headers.forwarded;delete headers['x-forwarded-for'];delete headers['x-real-ip']
      headers.cookie=cookies(req.headers.cookie).map(c=>`${c.name}=${c.value}`).join('; ')
      if(req.headers.origin)headers.origin=upstreamOrigin
      if(req.qaBody)headers['content-length']=String(req.qaBody.length)
      const upstream=https.request(upstreamOrigin+target.pathname+target.search,{method:req.method,headers,timeout:30000},response=>{
        try{res.writeHead(response.statusCode,qa2048ResponseHeaders(response.headers,req.headers.host))}
        catch{response.destroy();res.writeHead(502,{'cache-control':'no-store'});res.end('QA_REDIRECT_REJECTED');return}
        response.pipe(res)
        if(req.method==='POST')response.on('end',()=>void trace({actor:target.label,phase,kind:'activity-response',mode,status:response.statusCode}))
      })
      upstream.on('timeout',()=>upstream.destroy())
      upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502,{'cache-control':'no-store'});res.end('QA_UPSTREAM_UNAVAILABLE');if(req.method==='POST')void trace({actor:target.label,phase,kind:'activity-response',mode,status:502})})
      if(req.qaBody)upstream.end(req.qaBody);else upstream.end()
    }catch{
      if(req.method==='POST')await trace({actor:target?.label??'unclassified',phase,kind:'activity-rejected',mode:mode??null})
      if(!res.headersSent)res.writeHead(403,{'cache-control':'no-store'});res.end('QA_REQUEST_REJECTED')
    }
  })
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)})
  const report={status:'QA_TRANSPORT_READY',bind:'127.0.0.1',upstream:upstreamOrigin,urls:Object.fromEntries(Object.entries(hosts).map(([label,host])=>[label,`http://${host}/sign-in?next=%2Fplay`])),
    controlPath,tracePath,limits:'Only owned QA users may submit real activity; no other app mutation is forwarded; no tokens or bodies logged.'}
  await fs.writeFile(path.join(directory,'proxy-delivery.json'),JSON.stringify(report,null,2)+'\n')
  return {server,report}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.includes('--help'))console.log('Explicit DEV QA transport: --fixture <owned fixture.private.json> [--development-root C:/torneos] [--port 3099]. No app, schema or deployment changes.')
  else{
    const options={developmentRoot:'C:/torneos'}
    for(let i=2;i<process.argv.length;i+=2){const key={'--fixture':'fixtureFile','--development-root':'developmentRoot','--port':'port'}[process.argv[i]];assert.ok(key&&process.argv[i+1]);options[key]=key==='port'?Number(process.argv[i+1]):process.argv[i+1]}
    startAuthenticatedQaProxy(options).then(({server,report})=>{console.log(JSON.stringify(report));process.on('SIGINT',()=>server.close());process.on('SIGTERM',()=>server.close())})
      .catch(()=>{console.error('QA proxy refused configuration or transport; no raw credentials emitted.');process.exitCode=1})
  }
}
