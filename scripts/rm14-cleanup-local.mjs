import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { localKeys, sql, report } from './rm13-recovery-lib.mjs';
const k=await localKeys(),f=JSON.parse(await readFile('artifacts/rm14/private/fixtures.json','utf8'));
assert.match(f.prefix,/^rm14-[0-9a-f-]{36}$/);
const admin=createClient(k.API_URL,k.SECRET_KEY,{auth:{persistSession:false}});
for(const a of f.accounts){assert.match(a.id,/^[0-9a-f-]{36}$/);const r=await admin.auth.admin.getUserById(a.id);if(r.error)throw Error('Cannot verify owned fixture');assert.equal(r.data.user.email,a.email);assert.ok(a.email.startsWith(f.prefix+'-'));}
for(const o of f.objects){assert.ok(['kyc-documents','data-responses'].includes(o.bucket));const r=await admin.storage.from(o.bucket).remove([o.path]);if(r.error)throw Error('Owned file cleanup failed');}
const ids=f.accounts.map(a=>`'${a.id}'`).join(',');
await sql(`BEGIN;
DELETE FROM private.data_request_events WHERE actor_id IN (${ids}) OR request_id IN (SELECT id FROM private.data_requests WHERE user_id IN (${ids}));
DELETE FROM private.data_requests WHERE user_id IN (${ids});
DELETE FROM private.data_access_events WHERE actor_id IN (${ids});
DELETE FROM private.support_case_events WHERE actor_id IN (${ids}) OR case_id IN (SELECT id FROM public.disputes WHERE user_id IN (${ids}));
DELETE FROM public.financial_review_events WHERE actor_id IN (${ids});
DELETE FROM public.admin_actions WHERE admin_id IN (${ids});
DELETE FROM public.disputes WHERE user_id IN (${ids});
DELETE FROM public.kyc_audit_events WHERE user_id IN (${ids}) OR actor_id IN (${ids});
DELETE FROM public.kyc_submissions WHERE user_id IN (${ids});
COMMIT;`);
for(const a of f.accounts){const r=await admin.auth.admin.deleteUser(a.id);if(r.error)throw Error('Owned account cleanup failed');}
await report('artifacts/rm14/cleanup-local.json',{status:'PASS',accounts:f.accounts.length,objects:f.objects.length,target:k.API_URL,scope:'Only IDs registered by the owned RM14 rehearsal'});
console.log('OWNED_RM14_FIXTURES_CLEANED');
