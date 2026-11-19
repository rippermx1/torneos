import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {parseEnv} from 'node:util'
import {randomUUID,randomBytes} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {createServerClient} from '@supabase/ssr'
import {validateCloudDevelopment} from './check-cloud-development.mjs'
import {generateTotpCode} from './e2e-totp.mjs'

const env=parseEnv(await fs.readFile('.env.cloud-development.local','utf8'))
const config=JSON.parse(await fs.readFile('config/cloud-development.json','utf8'))
validateCloudDevelopment(env,config)
assert.equal(config.supabaseProjectRef,'jnoyjewsqbooqaiighcs')
const origin='http://127.0.0.1:3085',url=env.NEXT_PUBLIC_SUPABASE_URL,key=env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const service=createClient(url,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const verified=async request=>{const {data,error}=await request;assert.equal(error,null);return data}
// This particular integration scenario is intended only for an unused dev ledger.
// Immutable synthetic documents remain identifiable, balanced back to zero.
const baseline=await verified(service.rpc('accounting_workspace',{p_period:null}))
assert.equal(baseline.entries.length,0,'Do not seed this scenario into an active ledger')
const resume=process.argv.includes('--resume')
const prior=resume?JSON.parse(await fs.readFile('artifacts/accounting/development-real.json','utf8')):null
const credentials=resume?parseEnv(await fs.readFile('.env.accounting-development-test.local','utf8')):null
if(resume){assert.equal(prior.status,'FAIL');assert.equal(prior.project,config.supabaseProjectRef)
  await fs.copyFile('artifacts/accounting/development-real.json','artifacts/accounting/development-second-attempt.json')}
const run=prior?.run??randomUUID(),suffix=run.slice(0,8),password=credentials?.SUPABASE_E2E_PASSWORD??randomBytes(30).toString('base64url')
const prefix=`PRUEBA-CONTABLE-${suffix}`,period='2026-09',occurred_at='2026-09-15T12:00:00-03:00'
const checks=[],actors=[],report={at:new Date().toISOString(),origin,project:config.supabaseProjectRef,
  auth:'REAL',mfa:'NOT_RUN',postgrest:'REAL',documents:'SYNTHETIC',publicDeployment:false,
  run,period,fixtures:[],checks}
const check=async(name,fn)=>{await fn();checks.push(name);console.log('PASS '+name)}
async function account(label,admin){
  const email=`contabilidad.${suffix}.${label}@example.com`
  const {user}=await verified(resume?service.auth.admin.getUserById(prior.fixtures[0][admin?'admin':'player']):
    service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:'Prueba sintética contable de desarrollo'}}))
  assert.equal(user.email,email)
  actors.push({id:user.id})
  if(!resume){
    await verified(service.from('profiles').update({is_admin:admin}).eq('id',user.id))
    if(admin)await verified(service.from('profile_roles').upsert({profile_id:user.id,role:'admin',granted_by:user.id},{onConflict:'profile_id,role'}))
  }
  const jar=new Map(),client=createServerClient(url,key,{cookieOptions:{name:`sb-${config.supabaseProjectRef}-auth-token`},
    cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(c=>jar.set(c.name,c.value))}})
  await verified(client.auth.signInWithPassword({email,password}))
  Object.assign(actors.at(-1),{client})
  return {id:user.id,email,client,jar}
}
async function call(actor,route,body,customOrigin=origin){
  const headers=new Headers({origin:customOrigin})
  if(actor)headers.set('cookie',[...actor.jar].map(([n,v])=>`${n}=${v}`).join('; '))
  if(body!==undefined)headers.set('content-type','application/json')
  const response=await fetch(origin+route,{method:body===undefined?'GET':'POST',headers,
    body:body===undefined?undefined:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(60000)})
  for(const header of response.headers.getSetCookie()){
    const pair=header.split(';',1)[0],at=pair.indexOf('=');actor?.jar.set(pair.slice(0,at),pair.slice(at+1))
  }
  const text=await response.text();let payload;try{payload=JSON.parse(text)}catch{payload=null}
  return {status:response.status,payload,text,headers:response.headers}
}
const route='/api/admin/accounting',debit=(account_code,amount)=>({account_code,debit_cents:amount,credit_cents:0}),
  credit=(account_code,amount)=>({account_code,debit_cents:0,credit_cents:amount})
let admin,player,factor,aporte,factura,pago,closeId
try{
  admin=await account('admin',true);player=await account('usuario',false)
  report.fixtures.push({admin:admin.id,player:player.id,prefix})
  await check('Anonymous, regular user and real admin AAL1 are denied on reads and writes',async()=>{
    for(const actor of [null,player,admin])for(const body of [undefined,{action:'document',payload:{}}]){
      const r=await call(actor,route,body)
      if(actor===null){assert.equal(r.status,307);assert.ok(r.headers.get('location').startsWith('/sign-in?next='))}
      else assert.ok([401,403].includes(r.status))
      if(actor===admin)assert.equal(r.payload.mfaRequired,true)
    }
  })
  await check('Real TOTP enroll/challenge verifies AAL2 without changing existing accounts',async()=>{
    factor=resume?{id:(await verified(admin.client.auth.mfa.listFactors())).totp[0].id,totp:{secret:credentials.TOTP_SECRET}}:
      await verified(admin.client.auth.mfa.enroll({factorType:'totp',friendlyName:prefix}))
    await verified(admin.client.auth.mfa.challengeAndVerify({factorId:factor.id,code:generateTotpCode(factor.totp.secret)}))
    assert.equal((await verified(admin.client.auth.mfa.getAuthenticatorAssuranceLevel())).currentLevel,'aal2')
    report.mfa='REAL_TOTP'
    await fs.writeFile('.env.accounting-development-test.local',`OPERATOR_EMAIL=${admin.email}\nSUPABASE_E2E_PASSWORD=${password}\nTOTP_SECRET=${factor.totp.secret}\n`,{mode:0o600})
  })
  await check('Real PostgREST refuses browser RPC access, and API validates origin/period',async()=>{
    const session=(await verified(player.client.auth.getSession())).session
    for(const token of [key,session.access_token]){
      const r=await fetch(url+'/rest/v1/rpc/accounting_workspace',{method:'POST',headers:{apikey:key,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({p_period:period})})
      assert.ok([401,403].includes(r.status))
    }
    assert.equal((await call(admin,route,{action:'document',payload:{}},'https://untrusted.example')).status,403)
    assert.equal((await call(admin,route+'?period=2026-99')).status,400)
  })
  const document=(kind,reference,postings)=>({action:'document',payload:{kind,reference:`${prefix}-${reference}`,
    counterparty:'PRUEBA SINTETICA SIN OPERACION REAL',evidence:`${prefix}: escenario automatizado sin respaldo fiscal real`,
    occurred_at,tax_verified:false,postings}})
  await check('Concurrent real HTTP duplicate contributions commit once with exact cents',async()=>{
    const body=document('contribution','APORTE',[debit('110100',100000),credit('310200',100000)])
    const rs=await Promise.all([call(admin,route,body),call(admin,route,body)])
    rs.forEach(r=>assert.equal(r.status,200,JSON.stringify(r.payload)));assert.equal(rs[0].payload.id,rs[1].payload.id)
    aporte=rs[0].payload
    const r=await call(admin,route,{...body,payload:{...body.payload,evidence:'Conflicting fixture'}})
    assert.equal(r.status,409)
  })
  await check('Supplier invoice and payment persist separate entries without repeating expense',async()=>{
    const a=await call(admin,route,document('expense','FACTURA',[debit('530100',10000),credit('210400',10000)]))
    const b=await call(admin,route,document('supplier_payment','PAGO',[debit('210400',10000),credit('110100',10000)]))
    assert.equal(a.status,200);assert.equal(b.status,200);factura=a.payload;pago=b.payload
    const r=await call(admin,route+`?period=${period}`);assert.equal(r.status,200)
    assert.equal(r.payload.documents.length,3);assert.equal(r.payload.bank_closing_cents,90000);assert.equal(r.payload.result_cents,-10000)
    assert.equal(r.payload.balances.find(b=>b.code==='210400').closing_cents,0)
    assert.ok(r.payload.documents.every(d=>d.created_by===admin.id))
  })
  await check('Atomic cartola import, exact bank match and complete CSV/JSON exports',async()=>{
    const bad=await call(admin,route,{action:'bank_import',payload:{rows:[{occurred_at,reference:prefix+'-BAD',amount_cents:100,evidence:prefix},{occurred_at,reference:prefix+'-INVALID',amount_cents:0,evidence:prefix}]}})
    assert.equal(bad.status,409)
    assert.equal((await call(admin,route+`?period=${period}`)).payload.bank.length,0)
    const rows=[{occurred_at,reference:prefix+'-ABONO',amount_cents:100000,evidence:prefix},
      {occurred_at,reference:prefix+'-CARGO',amount_cents:-10000,evidence:prefix}]
    assert.equal((await call(admin,route,{action:'bank_import',payload:{rows}})).status,200)
    const pkg=(await call(admin,route+`?period=${period}`)).payload
    for(const [reference,id] of [[prefix+'-ABONO',aporte.journal_entry_id],[prefix+'-CARGO',pago.journal_entry_id]]){
      const bank=pkg.bank.find(b=>b.reference===reference)
      assert.equal((await call(admin,route,{action:'match',payload:{bank_id:bank.id,journal_entry_ids:[id]}})).status,200)
    }
    const csv=await call(admin,`/api/admin/reports/journal.csv?period=${period}`)
    assert.equal(csv.status,200);assert.equal(csv.headers.get('x-accounting-line-count'),'6')
    assert.equal(csv.headers.get('x-accounting-debits-cents'),csv.headers.get('x-accounting-credits-cents'))
    assert.equal((await call(admin,`/api/admin/accounting/balances.csv?period=${period}`)).status,200)
  })
  await check('Synthetic controlled close freezes its version and blocks backdated writes',async()=>{
    const body={action:'close',payload:{period,reason:prefix+' cierre de escenario sintético',reviewed:true,
      bank_evidence:prefix+' cartola sintética',flow_evidence:prefix+' sin Flow',rcv_evidence:prefix+' sin DTE/RCV real',
      bank_opening_cents:0,bank_closing_cents:90000,flow_closing_cents:0}}
    const r=await call(admin,route,body);assert.equal(r.status,200);closeId=r.payload.id
    assert.equal((await call(admin,route,document('expense','BLOQUEADO',[debit('530100',10),credit('210400',10)]))).status,409)
    assert.equal((await call(admin,route,{...body,payload:{...body.payload,period:'2026-10'}})).status,409)
    const snapshot=await call(admin,route+'?close='+closeId);assert.equal(snapshot.status,200)
    assert.equal(snapshot.payload.package.lines.length,6)
    report.closedSnapshotDigest=snapshot.payload.close.digest
  })
  await check('Reopening preserves snapshot; immutable reversals and grouped match restore zero test balances',async()=>{
    assert.equal((await call(admin,route,{action:'reopen',payload:{period,reason:prefix+' fin de escenario y reversas sintéticas'}})).status,200)
    const ids=[]
    for(const entry of [factura,pago,aporte]){
      const r=await call(admin,route,{action:'reverse',payload:{journal_entry_id:entry.journal_entry_id,occurred_at,reason:prefix+' reversa del escenario sintético'}})
      assert.equal(r.status,200);ids.push(r.payload.journal_entry_id)
    }
    assert.equal((await call(admin,route,{action:'bank_import',payload:{rows:[{occurred_at,reference:prefix+'-REVERSAS',amount_cents:-90000,evidence:prefix+' cartola de reversas sintéticas'}]}})).status,200)
    let pkg=(await call(admin,route+`?period=${period}`)).payload
    const bank=pkg.bank.find(b=>b.reference===prefix+'-REVERSAS')
    assert.equal((await call(admin,route,{action:'match',payload:{bank_id:bank.id,journal_entry_ids:ids.slice(1)}})).status,200)
    pkg=(await call(admin,route+`?period=${period}`)).payload
    assert.equal(pkg.entries.length,6);assert.equal(pkg.bank_closing_cents,0);assert.equal(pkg.result_cents,0)
    assert.ok(pkg.balances.every(b=>b.closing_cents===0));assert.ok(Object.values(pkg.controls).every(v=>v===0))
    assert.ok(pkg.audit.every(a=>a.actor===admin.id))
    const saved=(await call(admin,route+'?close='+closeId)).payload
    assert.equal(saved.package.lines.length,6);assert.equal(saved.close.digest,report.closedSnapshotDigest)
    assert.equal(saved.package.bank_closing_cents,90000)
    const page=await call(admin,`/admin/accounting?period=${period}`);assert.equal(page.status,200)
    assert.ok(page.text.includes('Contabilidad'));assert.ok(page.text.includes(prefix))
    report.final={entries:pkg.entries.length,lines:pkg.lines.length,balancesZero:true,controls:pkg.controls,activeCloses:pkg.closes.filter(c=>!c.reopened_at).length}
  })
  report.status='PASS';report.passed=checks.length
}catch(error){report.status='FAIL';report.error=error.message;throw error}
finally{
  for(const actor of actors)if(actor.client)await actor.client.auth.signOut({scope:'local'})
  await fs.writeFile('artifacts/accounting/development-real.json',JSON.stringify(report,null,2)+'\n')
}
