// Real local GoTrue/PostgREST/Storage and HTTP checks. Never targets cloud/prod.
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { randomUUID, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { localKeys, sql, report } from './rm13-recovery-lib.mjs';
import { generateTotpCode } from './e2e-totp.mjs';

const base = 'http://127.0.0.1:23431', keys = await localKeys();
const admin = createClient(keys.API_URL, keys.SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const password = `Aa9!${randomBytes(24).toString('hex')}`, checks = [], accounts = [], objects = [];
const prefix = `rm14-${randomUUID()}`;
const digest = async () => sql("select md5(coalesce((select string_agg(to_jsonb(t)::text,'|' order by id) from public.wallet_transactions t),'')||coalesce((select string_agg(to_jsonb(t)::text,'|' order by id) from public.accounting_postings t),''));");
const before = await digest();
async function checked(promise) { const r = await promise; if (r.error) throw new Error(`Supabase rejected operation: ${r.error.code ?? r.error.status ?? 'unknown'}`); return r.data; }
async function check(name, action) { await action(); checks.push({ name, status: 'PASS' }); console.log(`PASS ${name}`); }
async function login(account) {
  const jar = new Map();
  const client = createServerClient(keys.API_URL, keys.PUBLISHABLE_KEY, { cookieOptions: { name: 'sb-127-auth-token' }, cookies: { getAll: () => [...jar].map(([name,value]) => ({ name,value })), setAll: rows => rows.forEach(r => jar.set(r.name,r.value)) } });
  await checked(client.auth.signInWithPassword({ email: account.email, password: account.password ?? password }));
  return { client, jar, cookie: () => [...jar].map(([k,v]) => `${k}=${v}`).join('; ') };
}
async function request(path, session, body, method = 'POST') {
  return fetch(base + path, { method, redirect: 'manual', headers: { origin: base, ...(session ? { cookie: session.cookie() } : {}), ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) }, ...(method === 'GET' ? {} : { body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }), signal: AbortSignal.timeout(60_000) });
}
async function expected(path, session, body, status, method) {
  const r = await request(path, session, body, method);
  assert.equal(r.status, status, `${path}: expected ${status}, got ${r.status}`); return r;
}
try {
  for (let i=0;i<3;i++) {
    const email = `${prefix}-${i}@example.test`;
    const data = await checked(admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username: `rm14_${randomUUID().slice(0,8)}` } }));
    accounts.push({ id: data.user.id, email });
  }
  const [owner, outsider, operator] = accounts;
  await sql(`insert into public.profile_roles(profile_id,role) values('${operator.id}','admin') on conflict do nothing;`);
  await report('artifacts/rm14/private/fixtures.json', { accounts, password, prefix, objects });
  let user = await login(owner), other = await login(outsider), op = await login(operator);
  const factor = await checked(op.client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'RM14 synthetic operator' }));
  await checked(op.client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: generateTotpCode(factor.totp.secret) }));
  const front = `${owner.id}/${prefix}.pdf`;
  await checked(admin.storage.from('kyc-documents').upload(front, Buffer.from('%PDF-1.4\nRM14 synthetic document, no identity data\n%%EOF'), { contentType: 'application/pdf' }));
  objects.push({ bucket: 'kyc-documents', path: front });
  const kyc = await checked(admin.from('kyc_submissions').insert({ user_id: owner.id, full_name: 'Persona Sintética', rut: '12.345.678-5', birth_date: '1990-01-01', phone: '+56911111111', city: 'Prueba', document_type: 'other', document_number: 'SYNTHETIC', document_front_path: front, bank_account_holder: 'Persona Sintética', bank_account_rut: '12.345.678-5' }).select('id').single());
  await check('owner and operator must use audited KYC endpoints; direct Storage denied', async () => {
    assert.ok((await user.client.storage.from('kyc-documents').download(front)).error);
    assert.ok((await op.client.storage.from('kyc-documents').download(front)).error);
    await expected(`/api/account/kyc/${kyc.id}/document?side=front`,other,null,404,'GET');
    const r=await expected(`/api/account/kyc/${kyc.id}/document?side=front`,user,null,303,'GET'); assert.match(r.headers.get('cache-control'),/no-store/);
    assert.equal((await fetch(r.headers.get('location'))).status,200);
    await expected(`/api/admin/kyc/${kyc.id}/document?side=front`,op,null,303,'GET');
    assert.equal(await sql(`select count(*) from private.data_access_events where target_id='${kyc.id}';`),'2');
  });
  const unaal = await login(operator);
  await check('operator with AAL1 cannot read private documents', () => expected(`/api/admin/kyc/${kyc.id}/document?side=front`,unaal,null,403,'GET'));
  await check('password login alone cannot change password via recovery API', () => expected('/api/account/password',user,{password:'New-password-123!'},403));
  let caseId;
  await check('support receives reference and routes an incident into operational checks', async () => {
    const r=await expected('/api/support/dispute',user,{type:'technical',kind:'incident',description:'Incidente sintético de RM14 para verificar atención.'},200); caseId=(await r.json()).disputeId; assert.match(caseId,/^[0-9a-f-]{36}$/);
    const snap=await checked(admin.rpc('operational_snapshot')); assert.equal(snap.queues.length,9); assert.equal(snap.checks.length,6); assert.ok(snap.checks.find(c=>c.key==='support-critical').count>0);
    assert.equal(await sql(`select count(*) from private.support_case_events where case_id='${caseId}';`),'1');
  });
  await check('browser cannot bypass support audit via direct insert', async () => {
    assert.ok((await user.client.from('disputes').insert({user_id:owner.id,type:'other',description:'Intento directo que debe ser rechazado'})).error);
  });
  await check('legacy server support inserts preserve compatibility and transactional audit', async () => {
    const r=await checked(admin.from('disputes').insert({user_id:owner.id,type:'other',description:'Consulta sintética desde el endpoint previo de desarrollo'}).select('id').single());
    assert.equal(await sql(`select count(*) from private.support_case_events where case_id='${r.id}' and action='opened';`),'1');
  });
  await check('MFA operator acknowledges and resolves; owner sees the response', async () => {
    await expected(`/api/admin/disputes/${caseId}/acknowledge`,op,{},200);
    await expected(`/api/admin/disputes/${caseId}/acknowledge`,op,{},200);
    assert.equal(await sql(`select count(*) from private.support_case_events where case_id='${caseId}' and action='acknowledged';`),'1');
    await expected(`/api/admin/disputes/${caseId}/resolve`,op,{resolution:'resolved',notes:'Caso sintético revisado y resuelto por el operador.'},200);
    const own=await checked(user.client.from('disputes').select('status,admin_notes').eq('id',caseId).single()); assert.equal(own.status,'resolved'); assert.match(own.admin_notes,/sintético/);
  });
  let accessId,eraseId;
  await check('privacy requests are scoped, traced, and deduplicated', async () => {
    const r=await expected('/api/account/data-requests',user,{kind:'access',description:'Solicito mis datos personales completos de prueba.'},200);accessId=(await r.json()).requestId;
    await expected('/api/account/data-requests',user,{kind:'access',description:'Solicitud duplicada de datos personales de prueba.'},409);
    const erased=await expected('/api/account/data-requests',user,{kind:'erasure',description:'Solicito revisar eliminación de mis datos de prueba.'},200);eraseId=(await erased.json()).requestId;
    assert.ok((await other.client.rpc('list_data_requests',{p_actor:owner.id,p_owner_only:true})).error);
    assert.ok((await other.client.schema('private').from('data_requests').select('*')).error);
  });
  await check('erasure cannot be certified or delete financial obligations without retention policy', async () => {
    const form=new FormData();form.set('status','completed');form.set('reason','Intento de eliminación sin evidencia legal aprobada');
    await expected(`/api/admin/privacy/${eraseId}`,op,form,423);
    form.set('status','blocked');form.set('reason','Pendiente de revisión legal de retención, archivos y copias');await expected(`/api/admin/privacy/${eraseId}`,op,form,200);
    assert.equal(await digest(),before);
  });
  await check('access completion requires a private reviewed file; ownership and audit enforced', async () => {
    const form=new FormData();form.set('status','completed');form.set('reason','Respuesta completa sintética revisada para el titular');
    await expected(`/api/admin/privacy/${accessId}`,op,form,400);
    form.set('response',new File([JSON.stringify({synthetic:true,scope:'Ensayo RM14'})],'response.json',{type:'application/json'}));await expected(`/api/admin/privacy/${accessId}`,op,form,200);
    const path=await sql(`select response_storage_path from private.data_requests where id='${accessId}';`);objects.push({bucket:'data-responses',path});
    assert.ok((await user.client.storage.from('data-responses').download(path)).error);
    await expected(`/api/account/data-requests/${accessId}/response`,other,null,404,'GET');
    const r=await expected(`/api/account/data-requests/${accessId}/response`,user,null,303,'GET');const body=await (await fetch(r.headers.get('location'))).json();assert.equal(body.synthetic,true);
  });
  await check('suspended account keeps history and support but cannot start practice or write profile', async () => {
    await sql(`update public.profiles set is_banned=true where id='${owner.id}';`);
    await expected('/api/game/practice/start',user,{},403);
    const r=await expected('/api/account/export',user,null,200,'GET');assert.equal((await r.json()).profile.id,owner.id);
    await expected('/api/support/dispute',user,{type:'other',kind:'consultation',description:'Solicito revisión de la suspensión de mi cuenta sintética.'},200);
    await user.client.from('profiles').update({username:'rm14_banned_changed'}).eq('id',owner.id);
    const unchanged=await checked(admin.from('profiles').select('username').eq('id',owner.id).single());assert.notEqual(unchanged.username,'rm14_banned_changed');
    await sql(`update public.profiles set is_banned=false where id='${owner.id}';`);
  });
  await check('revoke all sessions rejects old signed JWT in app and direct Data API', async () => {
    const second=await login(owner);const oldCookie=user.cookie(),oldToken=(await user.client.auth.getSession()).data.session.access_token;
    await expected('/api/account/sessions/revoke',user,{},200);
    await expected('/api/account/export',{cookie:()=>oldCookie},null,401,'GET');await expected('/api/account/export',second,null,401,'GET');
    const stale=createClient(keys.API_URL,keys.PUBLISHABLE_KEY,{global:{headers:{Authorization:`Bearer ${oldToken}`}},auth:{persistSession:false}});
    const data=await checked(stale.from('profiles').select('id').eq('id',owner.id));assert.equal(data.length,0);
    assert.equal(await sql(`select count(*) from auth.sessions where user_id='${owner.id}';`),'0');
  });
  await check('recovery confirms once, changes password, revokes other sessions and rejects replay', async () => {
    const otherSession=await login(owner), link=await checked(admin.auth.admin.generateLink({type:'recovery',email:owner.email}));
    const url=`/auth/confirm?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=recovery&next=https://evil.test`;
    const confirmed=await expected(url,null,null,307,'GET');assert.equal(new URL(confirmed.headers.get('location')).pathname,'/sign-in/reset');
    const jar=new Map();for(const value of confirmed.headers.getSetCookie()){const pair=value.split(';')[0],i=pair.indexOf('=');jar.set(pair.slice(0,i),pair.slice(i+1));}
    const recovered={cookie:()=>[...jar].map(([k,v])=>`${k}=${v}`).join('; ')};
    const nextPassword=`Aa9!${randomBytes(24).toString('hex')}`;
    await expected('/api/account/password',recovered,{password:nextPassword},200);
    await expected('/api/account/export',otherSession,null,401,'GET');await expected('/api/account/export',recovered,null,401,'GET');
    const replay=await expected(url,null,null,307,'GET');assert.equal(new URL(replay.headers.get('location')).searchParams.get('error'),'auth_confirm');
    const normal=createClient(keys.API_URL,keys.PUBLISHABLE_KEY,{auth:{persistSession:false}});assert.ok((await normal.auth.signInWithPassword({email:owner.email,password})).error);await checked(normal.auth.signInWithPassword({email:owner.email,password:nextPassword}));
    owner.password=nextPassword;
  });
  await check('expired Auth session is rejected even with valid JWT', async () => {
    user=await login(owner);const claims=(await user.client.auth.getClaims()).data.claims;
    await sql(`update auth.sessions set not_after=now()-interval '1 second' where id='${claims.session_id}';`);await expected('/api/account/export',user,null,401,'GET');
  });
  await check('invalid and expired email token cannot confirm', async () => {
    const r=await expected('/auth/confirm?token_hash=invalid&type=recovery',null,null,307,'GET');assert.equal(new URL(r.headers.get('location')).searchParams.get('error'),'auth_confirm');
    const expired=await checked(admin.auth.admin.generateLink({type:'recovery',email:owner.email}));
    await sql(`update auth.users set recovery_sent_at=now()-interval '2 days' where id='${owner.id}';`);
    const old=await expected(`/auth/confirm?token_hash=${expired.properties.hashed_token}&type=recovery`,null,null,307,'GET');assert.equal(new URL(old.headers.get('location')).searchParams.get('error'),'auth_confirm');
  });
  await check('unverified email cannot sign in; confirmation is single use', async () => {
    const email=`${prefix}-3@example.test`;
    const signup=await checked(admin.auth.admin.generateLink({type:'signup',email,password}));accounts.push({id:signup.user.id,email});
    const client=createClient(keys.API_URL,keys.PUBLISHABLE_KEY,{auth:{persistSession:false}});assert.ok((await client.auth.signInWithPassword({email,password})).error);
    const path=`/auth/confirm?token_hash=${signup.properties.hashed_token}&type=signup&next=/support`;
    const r=await expected(path,null,null,307,'GET');assert.equal(new URL(r.headers.get('location')).pathname,'/support');
    await checked(client.auth.signInWithPassword({email,password}));
    const replay=await expected(path,null,null,307,'GET');assert.equal(new URL(replay.headers.get('location')).searchParams.get('error'),'auth_confirm');
  });
  await check('cross origin session revocation is rejected before session mutation', async () => {
    const r=await fetch(base+'/api/account/sessions/revoke',{method:'POST',headers:{origin:'https://evil.test',cookie:other.cookie()}});assert.equal(r.status,403);
  });
  await check('financial digests and paused cash preserved', async () => { assert.equal(await digest(),before);assert.equal(await sql('select paused from public.cash_policy;'),'t'); });
  await report('artifacts/rm14/private/fixtures.json',{accounts,password,prefix,objects,operatorMfa:{id:factor.id,secret:factor.totp.secret}});
  await report('artifacts/rm14/local-rehearsal.json',{scope:'Isolated local clone of develop; real Auth/PostgREST/Storage; synthetic accounts only',target:keys.API_URL,checks,financialDigest:{before,after:await digest()},leakedPasswordProtection:'DEFERRED_BY_USER',productionDecision:'NO_GO'});
  console.log(JSON.stringify({status:'PASS',checks:checks.length}));
} catch(error) {
  await report('artifacts/rm14/private/fixtures.json',{accounts,password,prefix,objects});
  await report('artifacts/rm14/local-rehearsal.json',{scope:'isolated local clone',checks,status:'FAIL',failure:error.message});
  console.error(error.message);process.exitCode=1;
}
