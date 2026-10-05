import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

export async function verifyFinancialCases({ checked, denied, check, source, service, fixture, payment, settle, sql }) {
  await checked(await source('__tests__/fixtures/financial-operations.sql'))
  const refundSchema = await source('supabase/migrations/20260513100000_flow_refunds.sql')
  await checked(refundSchema.match(/create table if not exists flow_refund_attempts \([\s\S]*?\n\);/)[0])
  await checked("ALTER TABLE flow_refund_attempts ADD COLUMN tax_document_status text DEFAULT 'not_required', ADD COLUMN tax_document_number text; GRANT SELECT,INSERT,UPDATE,DELETE ON flow_refund_attempts TO service_role;")
  const withdrawal = await source('supabase/migrations/20260803162546_payout_evidence_and_cash_ledger.sql')
  await checked(withdrawal.match(/CREATE OR REPLACE FUNCTION public.wallet_withdrawable_balance\([\s\S]*?\n\$\$;/)[0])
  const flow = await source('supabase/migrations/009_flow_payments.sql')
  await checked(flow.match(/create or replace function wallet_withdrawn_in_window\([\s\S]*?\n\$\$;/)[0])
  const hardening = await source('supabase/migrations/20260507000624_harden_public_functions.sql')
  await checked(hardening.match(/ALTER FUNCTION public.wallet_withdrawn_in_window[^;]*;/)[0])
  const ledger = await source('supabase/migrations/20260804223538_accounting_double_entry_ledger.sql')
  for (const name of ['post_flow_refund','on_refund_accounting','after_refund_accounting']) {
    await checked(ledger.match(new RegExp(`CREATE OR REPLACE FUNCTION private\\.${name}\\([\\s\\S]*?\\n\\$\\$;`))[0])
  }
  await checked(`CREATE TRIGGER on_refund_accounting BEFORE UPDATE ON flow_refund_attempts FOR EACH ROW EXECUTE FUNCTION private.on_refund_accounting();
    CREATE TRIGGER after_refund_accounting AFTER UPDATE ON flow_refund_attempts FOR EACH ROW EXECUTE FUNCTION private.after_refund_accounting();`)
  // Legacy transport-error records survive migration and may never be auto-sent.
  const old = await fixture(); await payment(old)
  await checked(`INSERT INTO flow_refund_attempts(tournament_id,user_id,flow_payment_attempt_id,refund_commerce_order,amount_cents,amount_pesos,receiver_email,status)
    SELECT '${old.tournament}','${old.user}',id,'old-response-loss',500000,5000,'fixture@example.test','rejected' FROM flow_payment_attempts WHERE commerce_order='${old.order}';`)
  await checked('GRANT INSERT,UPDATE,DELETE ON flow_refund_attempts,withdrawal_requests TO authenticated; GRANT UPDATE(status) ON flow_refund_attempts,withdrawal_requests TO anon,authenticated;')
  await checked(await source('supabase/migrations/20261005141433_durable_financial_operations.sql'))
  const result = async statement => JSON.parse((await checked(statement)).split('\n').at(-1))
  const refund = async f => (await checked(`SELECT id FROM flow_refund_attempts WHERE flow_payment_attempt_id=(SELECT id FROM flow_payment_attempts WHERE commerce_order='${f.order}');`)).split('\n').at(-1)
  const state = id => checked(`SELECT status FROM flow_refund_attempts WHERE id='${id}';`)
  const claim = (id,nonce) => service(`SELECT claim_flow_refund('${id}','${nonce}');`)
  const attach = (id,nonce,token='provider-token',order='77') => service(`SELECT record_flow_refund_dispatch('${id}','${nonce}','${token}','${order}',NULL);`)
  const verify = (id,status='completed',token='provider-token',amount=5000) => service(`SELECT record_verified_refund('${id}','${token}','77',${amount},'${status}');`)
  await check('financial functions revoke default client execute and pin search_path', async () => {
    const names = "'queue_payment_refund','queue_cancelled_tournament_refunds','queue_tournament_refunds','claim_flow_refund','record_flow_refund_dispatch','record_verified_refund','request_withdrawal','queue_unsupported_flow_payment_refund'"
    assert.equal(await checked(`SELECT count(*) FROM pg_proc WHERE proname IN (${names}) AND (has_function_privilege('authenticated',oid,'EXECUTE') OR has_function_privilege('anon',oid,'EXECUTE') OR NOT ('search_path=""'=ANY(proconfig)));`),'0')
    for (const table of ['withdrawal_requests','flow_refund_attempts']) {
      for (const actor of ['anon','authenticated']) await denied(`SET ROLE ${actor}; UPDATE ${table} SET status='paid';`,'permission denied')
    }
  })
  await check('legacy rejected dispatch stays unknown and cannot be claimed', async () => {
    const id = await refund(old); assert.equal(await state(id),'unknown')
    assert.ok(!(await checked(claim(id,randomUUID()))).includes('commerce_trx_id'))
  })
  for (const prior of ['unknown','expired','rejected','cancelled']) {
    await check(`confirmed late payment recovers from ${prior}`, async () => {
      const f = await fixture(); await payment(f,prior,{code:1})
      const reply = await result(settle(f)); assert.ok(reply.registration_id)
      assert.equal(await checked(`SELECT count(*) FROM registrations WHERE tournament_id='${f.tournament}';`),'1')
    })
  }
  await check('response-loss payment recovers by commerce/order without token', async () => {
    const f = await fixture(); await payment(f,'unknown',{code:1}); await checked(`UPDATE flow_payment_attempts SET flow_token=NULL,flow_order=NULL WHERE commerce_order='${f.order}';`)
    const reply = await result(service(`SELECT settle_tournament_registration('${f.order}',NULL,${f.flow},500000,'fixture','payer@example.test','{}');`))
    assert.ok(reply.registration_id)
  })
  for (const [name,mutation] of [['ban','is_banned=true'],['KYC',"kyc_status='rejected'"],['terms',"terms_version='1.2'"]]) {
    await check(`confirmed payment after ${name} revocation leaves durable refund`, async () => {
      const f = await fixture(); await payment(f,'pending',{code:1}); await checked(`UPDATE profiles SET ${mutation} WHERE id='${f.user}';`)
      const reply = await result(settle(f)); assert.ok(reply.refund_id); assert.equal(await state(reply.refund_id),'queued')
      assert.equal(await checked(`SELECT count(*) FROM registrations WHERE tournament_id='${f.tournament}';`),'0')
      assert.equal((await result(settle(f))).refund_id,reply.refund_id)
    })
  }
  await check('last-slot concurrency enrols once and durably refunds losing payment', async () => {
    const a = await fixture(500000,1), b = await fixture(); b.tournament=a.tournament
    await payment(a,'pending',{code:1}); await payment(b,'pending',{code:1})
    const replies = await Promise.all([result(settle(a)),result(settle(b))])
    assert.equal(replies.filter(r=>r.registration_id).length,1); assert.equal(replies.filter(r=>r.refund_id).length,1)
    assert.equal(await checked(`SELECT count(*) FROM registrations WHERE tournament_id='${a.tournament}';`),'1')
  })
  await check('second expired paid attempt is refunded despite a newer active checkout', async () => {
    const f=await fixture(); await payment(f,'expired',{code:1})
    const next={...f,order:randomUUID(),token:randomUUID(),flow:f.flow+1000}; await payment(next,'pending',{code:1})
    assert.ok((await result(settle(f))).refund_id)
    assert.equal(await checked(`SELECT status FROM flow_payment_attempts WHERE commerce_order='${next.order}';`),'pending')
  })
  const cancellation=await fixture(); await payment(cancellation,'pending',{code:1}); await result(settle(cancellation))
  let cancelledRefund
  await check('cancel transaction creates obligation before worker, without network', async () => {
    await checked(`UPDATE tournaments SET status='cancelled' WHERE id='${cancellation.tournament}';`)
    cancelledRefund=await refund(cancellation); assert.equal(await state(cancelledRefund),'queued')
    await checked(service(`SELECT queue_tournament_refunds('${cancellation.tournament}');`))
    assert.equal(await refund(cancellation),cancelledRefund)
  })
  let nonce=randomUUID()
  await check('concurrent refund claims authorize only one dispatch', async () => {
    const replies=await Promise.all([checked(claim(cancelledRefund,nonce)),checked(claim(cancelledRefund,randomUUID()))])
    assert.equal(replies.filter(r=>r.includes('commerce_trx_id')).length,1)
    nonce=JSON.parse(replies.find(r=>r.includes('commerce_trx_id')).split('\n').at(-1)).dispatch_nonce
  })
  await check('stale worker cannot attach another workers response; no reclaim after crash', async () => {
    assert.ok((await checked(attach(cancelledRefund,randomUUID()))).endsWith('f'))
    assert.equal(await state(cancelledRefund),'dispatching')
    await checked(`UPDATE flow_refund_attempts SET status='unknown' WHERE id='${cancelledRefund}';`)
    assert.ok(!(await checked(claim(cancelledRefund,randomUUID()))).includes('commerce_trx_id'))
    assert.ok((await checked(attach(cancelledRefund,nonce))).endsWith('t'))
  })
  await check('verified refund enforces amount/token and completion cannot regress', async () => {
    await denied(verify(cancelledRefund,'completed','wrong'),'identity or amount mismatch')
    await denied(verify(cancelledRefund,'completed','provider-token',4999),'identity or amount mismatch')
    await checked(verify(cancelledRefund)); await checked(verify(cancelledRefund)); await checked(verify(cancelledRefund,'rejected'))
    assert.equal(await state(cancelledRefund),'completed')
    assert.equal(await checked(`SELECT count(*) FROM accounting_journal_entries WHERE event_type='ticket_refund' AND tournament_id='${cancellation.tournament}';`),'1')
    assert.equal(await checked(`SELECT tax_document_status FROM flow_refund_attempts WHERE id='${cancelledRefund}';`),'required')
  })
  await check('cancellation with missing email retains manual obligation', async () => {
    const f=await fixture(); await payment(f); await checked(`UPDATE tournaments SET status='cancelled' WHERE id='${f.tournament}';`)
    assert.equal(await state(await refund(f)),'manual')
  })
  await check('out of order provider failure cannot discard received payment', async () => {
    await checked(service(`SELECT wallet_mark_flow_attempt_failed('${cancellation.order}','${cancellation.token}',3::smallint,'{}');`))
    assert.equal(await checked(`SELECT flow_status_code FROM flow_payment_attempts WHERE commerce_order='${cancellation.order}';`),'2')
  })
  await check('obligation persistence failure rolls back received transition and is retryable',async()=>{
    const f=await fixture(); await payment(f,'pending',{code:1}); await checked(`UPDATE profiles SET is_banned=true WHERE id='${f.user}';`)
    await checked(`CREATE FUNCTION private.fixture_fail_refund() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id='${f.user}'::uuid THEN RAISE EXCEPTION 'injected obligation failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fixture_fail_refund BEFORE INSERT ON flow_refund_attempts FOR EACH ROW EXECUTE FUNCTION private.fixture_fail_refund();`)
    await denied(settle(f),'injected obligation failure')
    assert.equal(await checked(`SELECT status FROM flow_payment_attempts WHERE commerce_order='${f.order}';`),'pending')
    assert.equal(await checked(`SELECT count(*) FROM accounting_journal_entries WHERE tournament_id='${f.tournament}';`),'0')
    await checked('DROP TRIGGER fixture_fail_refund ON flow_refund_attempts; DROP FUNCTION private.fixture_fail_refund();')
    assert.ok((await result(settle(f))).refund_id)
  })
  await check('unsupported legacy confirmed deposit leaves a manual obligation, no extra wallet credit',async()=>{
    const f=await fixture(); await payment(f,'pending',{code:1})
    await checked(`UPDATE flow_payment_attempts SET intent='wallet_deposit',tournament_id=NULL WHERE commerce_order='${f.order}';`)
    const id=(await checked(service(`SELECT queue_unsupported_flow_payment_refund('${f.order}','${f.token}',${f.flow},500000,'payer@example.test','{}');`))).split('\n').at(-1)
    assert.equal(await state(id),'manual')
    assert.equal(await checked(`SELECT count(*) FROM wallet_transactions WHERE user_id='${f.user}';`),'0')
  })
  const request=(f,id,amount=500000,account='123')=>service(`SELECT request_withdrawal('${id}','${f.user}',${amount},'Banco','${account}','12.345.678-5','Persona Prueba','Persona Prueba');`)
  const funds=async(f,amount=1000000)=>checked(service(`SELECT wallet_insert_transaction('${f.user}','prize_credit',${amount});`))
  await check('withdrawal locks fresh verified name and bank identity',async()=>{
    const f=await fixture(); await funds(f)
    await checked(`UPDATE profiles SET full_name='Changed after route check' WHERE id='${f.user}';`)
    await denied(request(f,randomUUID()),'Titularidad bancaria inconsistente')
    await checked(`UPDATE profiles SET full_name='Persona Prueba',rut='11.111.111-1' WHERE id='${f.user}';`)
    await denied(request(f,randomUUID()),'Titularidad bancaria inconsistente')
    assert.equal(await checked(`SELECT count(*) FROM wallet_transactions WHERE user_id='${f.user}' AND type='withdrawal';`),'0')
  })
  await check('concurrent stable withdrawal retries create one debit and one request',async()=>{
    const f=await fixture(),id=randomUUID(); await funds(f)
    await Promise.all([checked(request(f,id)),checked(request(f,id))])
    assert.equal(await checked(`SELECT count(*) FROM withdrawal_requests WHERE user_id='${f.user}';`),'1')
    assert.equal(await checked(`SELECT count(*) FROM wallet_transactions WHERE user_id='${f.user}' AND type='withdrawal';`),'1')
    await denied(request(f,id,500000,'different'),'Identificador usado con otros datos')
  })
  await check('different concurrent withdrawal IDs cannot double reserve balance',async()=>{
    const f=await fixture(); await funds(f,500000)
    const replies=await Promise.all([sql(request(f,randomUUID())),sql(request(f,randomUUID()))])
    assert.equal(replies.filter(r=>r.code===0).length,1)
    assert.equal(await checked(`SELECT sum(amount_cents) FROM wallet_transactions WHERE user_id='${f.user}';`),'0')
  })
  await check('failure after debit rolls back request and wallet atomically',async()=>{
    const f=await fixture(),id=randomUUID(); await funds(f)
    await checked(`CREATE FUNCTION private.fixture_fail_request() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${id}'::uuid THEN RAISE EXCEPTION 'injected crash after debit'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fixture_fail_request BEFORE INSERT ON withdrawal_requests FOR EACH ROW EXECUTE FUNCTION private.fixture_fail_request();`)
    await denied(request(f,id),'injected crash after debit')
    assert.equal(await checked(`SELECT count(*) FROM wallet_transactions WHERE user_id='${f.user}' AND type='withdrawal';`),'0')
    await checked('DROP TRIGGER fixture_fail_request ON withdrawal_requests; DROP FUNCTION private.fixture_fail_request();')
    await checked(request(f,id))
  })
  await check('withdrawal excludes test prizes and checks KYC after checkout',async()=>{
    const f=await fixture(); await checked(`UPDATE tournaments SET is_test=true WHERE id='${f.tournament}';`)
    await checked(service(`SELECT wallet_insert_transaction('${f.user}','prize_credit',1000000,'tournament','${f.tournament}');`))
    await denied(request(f,randomUUID()),'Saldo no retirable')
    await checked(`UPDATE profiles SET kyc_status='rejected' WHERE id='${f.user}';`)
    await denied(request(f,randomUUID()),'Identidad no habilitada')
  })
  await check('daily and monthly limits remain atomic and wallet history balanced',async()=>{
    const f=await fixture(); await funds(f,250000000)
    await checked(`INSERT INTO wallet_transactions(user_id,type,amount_cents,balance_after_cents,created_at) VALUES ('${f.user}','withdrawal',-50000000,200000000,clock_timestamp()-interval '1 hour');`)
    await denied(request(f,randomUUID()),'Excede el limite')
    await checked(`UPDATE wallet_transactions SET created_at=clock_timestamp()-interval '2 days' WHERE user_id='${f.user}' AND type='withdrawal';
      INSERT INTO wallet_transactions(user_id,type,amount_cents,balance_after_cents,created_at) VALUES ('${f.user}','withdrawal',-150000000,50000000,clock_timestamp()-interval '2 days');`)
    await denied(request(f,randomUUID()),'Excede el limite')
    assert.equal(await checked(`SELECT count(*) FROM (SELECT journal_entry_id FROM accounting_postings GROUP BY journal_entry_id HAVING sum(debit_cents)<>sum(credit_cents)) x;`),'0')
  })
}
