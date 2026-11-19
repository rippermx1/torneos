import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import https from 'node:https'
import {parseEnv} from 'node:util'
import {createHash} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {createServerClient} from '@supabase/ssr'
import {validateCloudDevelopment} from './check-cloud-development.mjs'
import {generateTotpCode} from './e2e-totp.mjs'

const pack=JSON.parse(await fs.readFile('artifacts/accounting-cloud/latest-package.json','utf8'))
const env=parseEnv(await fs.readFile(path.join(pack.directory,'.env.vercel-production.local'),'utf8'))
const config=JSON.parse(await fs.readFile('config/cloud-development.json','utf8'))
validateCloudDevelopment(env,config);assert.equal(config.supabaseProjectRef,'jnoyjewsqbooqaiighcs')
const origin=process.argv[2];assert.ok(origin&&new URL(origin).hostname.endsWith('.vercel.app'))
const deployment=JSON.parse(await fs.readFile(path.join(pack.directory,'deployment-raw.json'),'utf8')).deployment
assert.ok(origin===env.APP_URL||origin===deployment.url,'Use only the recorded dev deployment or its canonical domain')
const stage=origin!==env.APP_URL,bypass=stage?(await fs.readFile(path.join(pack.directory,'.protection-bypass.local'),'utf8')).trim():null
let protectionCookie=''
if(stage){
  const link=new URL('/sign-in',origin);link.searchParams.set('_vercel_share',bypass)
  const bootstrap=await fetch(link,{redirect:'manual',signal:AbortSignal.timeout(60000)})
  assert.equal(bootstrap.status,307)
  protectionCookie=bootstrap.headers.getSetCookie().map(c=>c.split(';',1)[0]).find(c=>c.startsWith('_vercel_jwt='))??''
  assert.ok(protectionCookie)
}
const previous=JSON.parse(await fs.readFile('artifacts/accounting/development-real.json','utf8'))
assert.equal(previous.status,'PASS')
const creds=parseEnv(await fs.readFile('.env.accounting-development-test.local','utf8'))
const service=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const verified=async request=>{const {data,error}=await request;assert.equal(error,null);return data}
const baseline=await verified(service.rpc('accounting_workspace',{p_period:previous.period}))
const digest=p=>createHash('sha256').update(JSON.stringify(['entries','lines','documents','bank','audit','closes'].map(k=>p[k]))).digest('hex')
const before=digest(baseline),actors=[],checks=[]
const report={at:new Date().toISOString(),origin,stage,deployment:deployment.id,project:'torneos-dev',supabaseProject:config.supabaseProjectRef,
  documents:'existing synthetic fixtures only',auth:'REAL',mfa:'NOT_RUN',checks}
const check=async(name,fn)=>{await fn();checks.push(name);console.log('PASS '+name)}
async function actor(id){
  const {user}=await verified(service.auth.admin.getUserById(id));const jar=new Map()
  const client=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{
    cookieOptions:{name:`sb-${config.supabaseProjectRef}-auth-token`},
    cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(c=>jar.set(c.name,c.value))}})
  await verified(client.auth.signInWithPassword({email:user.email,password:creds.SUPABASE_E2E_PASSWORD}))
  const result={jar,client};actors.push(result);return result
}
async function call(who,route,body,requestOrigin=env.APP_URL){
  const headers=new Headers({origin:requestOrigin})
  const cookie=[protectionCookie,...(who?[...who.jar].map(([n,v])=>`${n}=${v}`):[])].filter(Boolean).join('; ')
  if(cookie)headers.set('cookie',cookie)
  if(body!==undefined)headers.set('content-type','application/json')
  const response=await fetch(origin+route,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(60000)})
  for(const header of response.headers.getSetCookie()){const pair=header.split(';',1)[0],at=pair.indexOf('=');who?.jar.set(pair.slice(0,at),pair.slice(at+1))}
  const text=await response.text();let json;try{json=JSON.parse(text)}catch{json=null}
  return {status:response.status,json,text,headers:response.headers}
}
const api='/api/admin/accounting',period=previous.period
let admin,player
try{
  admin=await actor(previous.fixtures[0].admin);player=await actor(previous.fixtures[0].player)
  await check('Anonymous, regular user and admin AAL1 cannot read or write accounting',async()=>{
    for(const who of [null,player,admin])for(const body of [undefined,{action:'document',payload:{}}]){
      const r=await call(who,api,body)
      if(who===null){assert.equal(r.status,307);assert.ok(r.headers.get('location').includes('/sign-in?next='))}
      else assert.equal(r.status,403)
      if(who===admin)assert.equal(r.json.mfaRequired,true)
    }
  })
  await check('Existing operator TOTP raises the fresh session to AAL2',async()=>{
    const factors=await verified(admin.client.auth.mfa.listFactors())
    assert.equal(factors.totp.length,1)
    await verified(admin.client.auth.mfa.challengeAndVerify({factorId:factors.totp[0].id,code:generateTotpCode(creds.TOTP_SECRET)}))
    assert.equal((await verified(admin.client.auth.mfa.getAuthenticatorAssuranceLevel())).currentLevel,'aal2');report.mfa='REAL_TOTP'
  })
  await check('Complete JSON ledger, zero balances and controls match the dev fixture',async()=>{
    const r=await call(admin,api+'?period='+period);assert.equal(r.status,200)
    assert.equal(r.json.lines.length,12);assert.equal(r.json.entries.length,6);assert.equal(r.json.documents.length,3)
    assert.equal(r.json.bank_closing_cents,0);assert.equal(r.json.result_cents,0)
    assert.ok(r.json.balances.every(b=>b.closing_cents===0));assert.ok(Object.values(r.json.controls).every(v=>v===0))
    assert.equal(digest(r.json),before);assert.equal(r.headers.get('cache-control'),'private, no-store')
    report.final={entries:6,lines:12,balancesZero:true,controls:r.json.controls}
  })
  await check('Journal and balance CSV exports include the complete period and balanced totals',async()=>{
    const r=await call(admin,'/api/admin/reports/journal.csv?period='+period)
    assert.equal(r.status,200);assert.equal(r.headers.get('x-accounting-line-count'),'12')
    assert.equal(r.headers.get('x-accounting-debits-cents'),r.headers.get('x-accounting-credits-cents'))
    assert.equal(r.text.split('\n').length,13)
    const b=await call(admin,api+'/balances.csv?period='+period);assert.equal(b.status,200)
    assert.equal(b.text.split('\n').length,baseline.balances.length+1)
  })
  await check('Saved reopened close retains its original six lines and immutable digest',async()=>{
    assert.equal(baseline.closes.length,1);assert.ok(baseline.closes[0].reopened_at)
    const r=await call(admin,api+'?close='+baseline.closes[0].id);assert.equal(r.status,200)
    assert.equal(r.json.package.lines.length,6);assert.equal(r.json.close.digest,previous.closedSnapshotDigest)
    assert.equal(r.json.package.bank_closing_cents,90000)
  })
  await check('Canonical origin supports idempotent replay; invalid origin, period and close are rejected',async()=>{
    const doc=baseline.documents.find(d=>d.kind==='contribution');assert.ok(doc.payload)
    const r=await call(admin,api,{action:'document',payload:doc.payload});assert.equal(r.status,200)
    assert.equal(r.json.duplicate,true);assert.equal(r.json.id,doc.id)
    assert.equal((await call(admin,api,{action:'document',payload:doc.payload},'https://untrusted.example')).status,403)
    assert.equal((await call(admin,api+'?period=2026-99')).status,400)
    assert.equal((await call(admin,api,{action:'close',payload:{period,reason:'Publicación sin documentos reales',reviewed:false}})).status,409)
  })
  await check('Authenticated accounting and finance pages render; public login retains dev headers',async()=>{
    const r=await call(admin,'/admin/accounting?period='+period);assert.equal(r.status,200)
    assert.ok(r.text.includes('Contabilidad'));assert.ok(r.text.includes(previous.fixtures[0].prefix))
    assert.ok(!r.text.includes(env.SUPABASE_SECRET_KEY));assert.ok(!r.text.includes('baeylvoipmazcthnwxmz'))
    const finance=await call(admin,'/admin/reports?period='+period);assert.equal(finance.status,200)
    assert.ok(finance.text.includes('Gastos, banco y cierres'));assert.ok(!finance.text.includes('Embudo de Snake'))
    const login=await call(null,'/sign-in');assert.equal(login.status,200)
    // Vercel replaces the protected candidate's header with its own noindex.
    if(stage)assert.ok(login.headers.get('x-robots-tag')?.includes('noindex'))
    else assert.equal(login.headers.get('x-robots-tag'),'noindex, nofollow')
    const chunks=[...new Set([...(`${r.text}${finance.text}${login.text}`).matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1]))]
    for(const chunk of chunks){const r=await call(null,chunk);assert.equal(r.status,200);assert.ok(!r.text.includes(env.SUPABASE_SECRET_KEY));assert.ok(!r.text.includes('baeylvoipmazcthnwxmz'))}
    report.clientChunksChecked=chunks.length
  })
  await check('Published WebGL assets retain all baseline hashes',async()=>{
    const manifest=JSON.parse(await fs.readFile(pack.manifest,'utf8')),assets=manifest.files.filter(f=>f.path.startsWith('public/games/'))
    for(const asset of assets){
      const bytes=await new Promise((resolve,reject)=>{const req=https.get(origin+'/'+asset.path.slice(7),{headers:protectionCookie?{cookie:protectionCookie}:{}},res=>{
        if(res.statusCode!==200){res.resume();reject(new Error(`Asset ${asset.path}: ${res.statusCode}`));return}
        const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve(Buffer.concat(chunks)));res.on('error',reject)
      });req.setTimeout(60000,()=>req.destroy(new Error('Asset timeout')));req.on('error',reject)})
      assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256,asset.path)
    }
    report.unchangedGameAssets=assets.length;report.games=manifest.games
  })
  await check('Publication verification adds no documents, journals, bank moves, audits or closes',async()=>{
    const after=await verified(service.rpc('accounting_workspace',{p_period:period}));assert.equal(digest(after),before)
  })
  report.status='PASS';report.passed=checks.length
}catch(error){report.status='FAIL';report.error=error.message;throw error}
finally{
  for(const who of actors)await who.client.auth.signOut({scope:'local'})
  await fs.writeFile(path.join(pack.directory,stage?'staged-verification.json':'published-verification.json'),JSON.stringify(report,null,2)+'\n')
}
