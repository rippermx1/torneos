import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

export async function verifyPrizeReviewCases({ checked, denied, check, source, service, fixture, payment, settle, sql }) {
  await checked(await source('__tests__/fixtures/prize-review.sql'))
  // Historical real credit must be quarantined, without deleting its liability.
  const legacy=await fixture()
  await checked(`UPDATE tournaments SET status='completed' WHERE id='${legacy.tournament}';
    INSERT INTO tournament_results(tournament_id,user_id,rank,final_score,prize_awarded_cents) VALUES('${legacy.tournament}','${legacy.user}',1,1000,1000000);`)
  await checked(service(`SELECT wallet_insert_transaction('${legacy.user}','prize_credit',1000000,'tournament','${legacy.tournament}');`))
  const priorOperator=await fixture(),priorPayout=randomUUID()
  await checked(`INSERT INTO profile_roles VALUES('${priorOperator.user}','admin');`)
  await checked(service(`SELECT request_withdrawal('${priorPayout}','${legacy.user}',500000,'Banco','123','12.345.678-5','Persona Prueba','Persona Prueba');`))
  await checked(`UPDATE withdrawal_requests SET status='approved',reviewed_by='${priorOperator.user}',reviewed_at=now(),admin_notes='Verificación anterior documentada' WHERE id='${priorPayout}';`)
  // Reproduce Supabase defaults: service_role receives table grants at creation.
  await checked('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;')
  await checked(await source('supabase/migrations/20261005145934_prize_review_and_payout_holds.sql'))
  const journal = await source('supabase/migrations/20260804223538_accounting_double_entry_ledger.sql')
  const refundAware = await source('supabase/migrations/20260804231035_account_for_pre_completion_refunds.sql')
  for (const name of ['post_tournament_completion','post_prize_payout','on_tournament_completion_accounting','on_prize_payout_accounting']) {
    const text = name === 'post_tournament_completion' ? refundAware : journal
    await checked(text.match(new RegExp(`CREATE OR REPLACE FUNCTION private\\.${name}\\([\\s\\S]*?\\n\\$\\$;`))[0])
  }
  await checked(`CREATE TRIGGER tournament_completion_accounting AFTER UPDATE ON tournaments FOR EACH ROW EXECUTE FUNCTION private.on_tournament_completion_accounting();
    CREATE TRIGGER prize_payout_accounting AFTER UPDATE ON withdrawal_requests FOR EACH ROW EXECUTE FUNCTION private.on_prize_payout_accounting();`)
  const actor=async()=>{ const f=await fixture(); await checked(`INSERT INTO profile_roles VALUES('${f.user}','admin');`);return f.user }
  const a=await actor(),b=await actor()
  const last=async s=>(await checked(s)).split('\n').at(-1)
  const request=(f,id)=>service(`SELECT request_withdrawal('${id}','${f.user}',500000,'Banco','123','12.345.678-5','Persona Prueba','Persona Prueba');`)
  const reviewId=f=>last(`SELECT id FROM prize_reviews WHERE user_id='${f.user}' AND tournament_id='${f.tournament}';`)
  const decide=async(f,decision='approved',who=a)=>service(`SELECT review_prize('${await reviewId(f)}','${who}','${decision}','Revisión manual documentada','{"games":[],"flags":[]}');`)
  const prize=async(test=false)=>{
    const f=await fixture();await payment(f,'pending',{code:1});await checked(settle(f))
    await checked(`UPDATE tournaments SET status='live',is_test=${test},play_window_start=clock_timestamp()-interval '1 minute' WHERE id='${f.tournament}';`)
    await checked(service(`INSERT INTO games(tournament_id,user_id,status,final_score,move_count) VALUES('${f.tournament}','${f.user}','completed',1000,10);`))
    await checked(`UPDATE tournaments SET status='finalizing' WHERE id='${f.tournament}';`)
    await checked(service(`SELECT finalize_tournament('${f.tournament}');`));return f
  }
  const fund=async()=>{const f=await prize();await checked(await decide(f));return f}
  const claim=(id,who=a)=>service(`SELECT claim_withdrawal('${id}','${who}');`)
  const approve=(id,who=b)=>service(`SELECT approve_withdrawal('${id}','${who}','Importe y cuenta bancaria verificados');`)
  const begin=(id,who=a)=>service(`SELECT begin_withdrawal_transfer('${id}','${who}');`)
  const complete=(id,ref='BANK-UNIQUE',who=a)=>service(`SELECT complete_withdrawal('${id}','${who}','${ref}','${id}/proof.pdf','Salida bancaria confirmada');`)
  const payout=async()=>{const f=await fund(),id=randomUUID();await checked(request(f,id));await checked(claim(id));await checked(approve(id));return {f,id}}
  const state=id=>last(`SELECT status FROM withdrawal_requests WHERE id='${id}';`)
  const reconcile=(id,outcome,who=b,ref='BANK-RECONCILED')=>service(`SELECT reconcile_withdrawal('${id}','${who}','${outcome}','${ref}','${id}/bank.pdf','Banco y cartola revisados manualmente');`)
  await check('RM08 RPCs private helpers and tables have explicit grants and pinned paths',async()=>{
    const names="'review_prize','set_financial_hold','claim_withdrawal','begin_withdrawal_transfer','reconcile_withdrawal','approve_withdrawal','reject_withdrawal','complete_withdrawal','request_withdrawal','wallet_insert_transaction','wallet_withdrawable_balance'"
    assert.equal(await last(`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname IN (${names}) AND (has_function_privilege('authenticated',p.oid,'EXECUTE') OR has_function_privilege('anon',p.oid,'EXECUTE') OR NOT ('search_path=""'=ANY(proconfig)));`),'0')
    assert.equal(await last(`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND proname IN ('wallet_insert_transaction_rm07','request_withdrawal_rm07','assert_financial_clearance','assert_review_operator') AND has_function_privilege('service_role',p.oid,'EXECUTE');`),'0')
    for(const table of ['prize_reviews','financial_holds','financial_review_events'])for(const role of ['authenticated','anon','service_role'])await denied(`SET ROLE ${role}; DELETE FROM ${table};`,'permission denied')
  })
  await check('historical award retained without deleting original credit',async()=>{
    assert.equal(await last(service(`SELECT wallet_withdrawable_balance('${legacy.user}');`)),'0')
    assert.equal(await last(`SELECT count(*) FROM wallet_transactions WHERE user_id='${legacy.user}' AND type='prize_credit';`),'1')
    assert.equal(await state(priorPayout),'pending')
    assert.equal(await last(`SELECT count(*) FROM financial_review_events WHERE target_id='${priorPayout}' AND action='payout.migration_review' AND actor_id='${priorOperator.user}' AND details->>'previous_reviewed_at' IS NOT NULL;`),'1')
    await checked(await decide(legacy));await checked(await decide(legacy))
    assert.equal(await last(`SELECT count(*) FROM wallet_transactions WHERE user_id='${legacy.user}' AND type='prize_credit';`),'1')
  })
  await check('finalization retains ALL real awards and cannot bypass review RPC',async()=>{
    const f=await prize();assert.equal(await last(`SELECT status FROM prize_reviews WHERE user_id='${f.user}';`),'pending')
    assert.equal(await last(`SELECT count(*) FROM wallet_transactions WHERE user_id='${f.user}';`),'0')
    await denied(request(f,randomUUID()),'premios pendientes')
    await denied(service(`SELECT wallet_insert_transaction('${f.user}','prize_credit',1000000,'tournament','${f.tournament}');`),'sin revisión')
    await denied(service(`SELECT wallet_insert_transaction('${f.user}','prize_credit',1000000);`),'sin revisión')
  })
  await check('test awards retain mock behavior and remain unwithdrawable',async()=>{
    const f=await prize(true);assert.equal(await last(`SELECT count(*) FROM prize_reviews WHERE user_id='${f.user}';`),'0')
    assert.equal(await last(service(`SELECT wallet_withdrawable_balance('${f.user}');`)),'0')
    await denied(request(f,randomUUID()),'Saldo no retirable')
  })
  await check('concurrent approvals release one credit; rehold and reapprove never double award',async()=>{
    const f=await prize();await Promise.all([checked(await decide(f)),checked(await decide(f,'approved',b))])
    assert.equal(await last(`SELECT count(*) FROM wallet_transactions WHERE user_id='${f.user}';`),'1')
    await checked(await decide(f,'held'));assert.equal(await last(service(`SELECT wallet_withdrawable_balance('${f.user}');`)),'0')
    await checked(await decide(f));assert.equal(await last(`SELECT sum(amount_cents) FROM wallet_transactions WHERE user_id='${f.user}';`),'1000000')
  })
  await check('review cannot approve without evidence or with invalid operator',async()=>{
    const f=await prize(),id=await reviewId(f)
    await denied(service(`SELECT review_prize('${id}','${a}','approved','Revisado manualmente','{}');`),'Evidencia')
    await denied(await decide(f,'approved',f.user),'Operador')
    await checked(`UPDATE profiles SET is_banned=true WHERE id='${a}';`);await denied(await decide(f),'Operador')
    await checked(`UPDATE profiles SET is_banned=false WHERE id='${a}';`)
  })
  await check('manual hold blocks requests approvals begins and completion; release requires new prize review',async()=>{
    const {f,id}=await payout(),hold=randomUUID()
    await checked(service(`SELECT set_financial_hold('${hold}','${f.user}','${a}',false,'Investigación operativa pendiente');`))
    await denied(begin(id),'retención o disputa')
    await denied(request(f,id),'retención o disputa')
    await denied(await decide(f),'retención o disputa')
    await checked(service(`SELECT set_financial_hold('${hold}','${f.user}','${b}',true,'Caso revisado y resuelto con evidencia');`))
    await denied(begin(id),'premios pendientes')
    await checked(await decide(f));await checked(begin(id));await checked(complete(id,'BANK-HOLD'))
  })
  for(const [title,change] of [['ban','is_banned=true'],['KYC',"kyc_status='rejected'"],['name',"full_name='Otra Persona'"],['RUT',"rut='11.111.111-1'"]]){
    await check(`fresh ${title} changes retain approved prize and block transfer completion`,async()=>{
      const {f,id}=await payout();await checked(begin(id));await checked(`UPDATE profiles SET ${change} WHERE id='${f.user}';`)
      assert.equal(await last(`SELECT status FROM prize_reviews WHERE user_id='${f.user}';`),'held')
      await denied(complete(id,`BANK-${title}`),'Pago retenido')
      await denied(service(`SELECT reject_withdrawal('${id}','${b}','No devolver mientras exista incertidumbre');`),'conciliar')
      await checked(reconcile(id,'unknown'));assert.equal(await state(id),'reconciling')
    })
  }
  await check('two simultaneous operators claim once; claimant cannot self approve',async()=>{
    const f=await fund(),id=randomUUID();await checked(request(f,id))
    const replies=await Promise.all([sql(claim(id,a)),sql(claim(id,b))]);assert.equal(replies.filter(r=>r.code===0).length,1)
    const winner=await last(`SELECT claimed_by FROM withdrawal_requests WHERE id='${id}';`)
    await denied(approve(id,winner),'Segundo operador')
    await checked(approve(id,winner===a?b:a))
  })
  await check('lost begin response cannot authorize a second bank attempt or rejection',async()=>{
    const {id}=await payout();await checked(begin(id)) // intentionally discard authorization
    await denied(begin(id),'No iniciar ni repetir');await denied(service(`SELECT reject_withdrawal('${id}','${b}','Respuesta bancaria incierta');`),'conciliar')
    await checked(reconcile(id,'unknown'));await denied(begin(id),'No iniciar ni repetir')
    await denied(reconcile(id,'not_sent',a),'Segundo operador')
    await checked(reconcile(id,'not_sent'));assert.equal(await state(id),'rejected')
    assert.equal(await last(`SELECT count(*) FROM wallet_transactions WHERE reference_id='${id}' AND type='refund';`),'1')
    await denied(reconcile(id,'not_sent'),'no pendiente')
  })
  await check('complete retries return same receipt; duplicate normalized bank reference cannot pay another request',async()=>{
    const first=await payout();await checked(begin(first.id));const receipt=await last(complete(first.id,'BANK-123'))
    assert.equal(await last(complete(first.id,' bank-123 ')),receipt)
    assert.equal(await last(`SELECT count(*) FROM financial_review_events WHERE target_id='${first.id}' AND action='payout.paid';`),'1')
    const second=await payout();await checked(begin(second.id));await denied(complete(second.id,' bank-123 '),'withdrawals_unique_bank_reference')
    assert.equal(await state(second.id),'transferring')
  })
  await check('reconciliation records already-paid bank fact after account ban without new authorization',async()=>{
    const {f,id}=await payout();await checked(begin(id));await checked(`UPDATE profiles SET is_banned=true WHERE id='${f.user}';`)
    await checked(reconcile(id,'paid',b,'BANK-RECON-BANNED'));assert.equal(await state(id),'paid')
    await denied(request(f,randomUUID()),'Pago retenido')
  })
  await check('resolved tournament dispute does not automatically reapprove prizes; unrelated claimant cannot freeze tournament',async()=>{
    const f=await fund(),other=await fixture(),dispute=randomUUID()
    await denied(`SET ROLE authenticated; SET "request.jwt.claim.sub"='${other.user}'; INSERT INTO disputes(user_id,tournament_id,type,description) VALUES('${other.user}','${f.tournament}','tournament_result','Resultado discutido sin inscripción');`,'torneo ajeno')
    await checked(`SET ROLE authenticated; SET "request.jwt.claim.sub"='${f.user}'; INSERT INTO disputes(id,user_id,tournament_id,type,description) VALUES('${dispute}','${f.user}','${f.tournament}','tournament_result','Resultado discutido por participante');`)
    await denied(request(f,randomUUID()),'retención o disputa')
    await checked(service(`SELECT resolve_financial_dispute('${dispute}','${b}','resolved','Resultado revisado con evidencia');`))
    await denied(request(f,randomUUID()),'premios pendientes');await checked(await decide(f));await checked(request(f,randomUUID()))
  })
  await check('audit persistence failure rolls back prize release and credit',async()=>{
    const f=await prize(),id=await reviewId(f)
    await checked(`CREATE FUNCTION private.fixture_fail_review_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.target_id='${id}'::uuid THEN RAISE EXCEPTION 'injected audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fixture_fail_review_audit BEFORE INSERT ON financial_review_events FOR EACH ROW EXECUTE FUNCTION private.fixture_fail_review_audit();`)
    await denied(await decide(f),'injected audit failure')
    assert.equal(await last(`SELECT status FROM prize_reviews WHERE id='${id}';`),'pending')
    assert.equal(await last(`SELECT count(*) FROM wallet_transactions WHERE user_id='${f.user}';`),'0')
    await checked('DROP TRIGGER fixture_fail_review_audit ON financial_review_events; DROP FUNCTION private.fixture_fail_review_audit();')
  })
  await check('fresh profile revocation wins concurrent transfer authorization under lock',async()=>{
    const {f,id}=await payout(),tag=`review-lock-${randomUUID()}`
    const blocker=sql(`SET application_name='${tag}'; BEGIN; UPDATE profiles SET is_banned=true WHERE id='${f.user}'; SELECT pg_sleep(1.5); COMMIT;`)
    let locked=false
    for(let i=0;i<30&&!locked;i++) { locked=await last(`SELECT count(*) FROM pg_stat_activity WHERE application_name='${tag}' AND wait_event='PgSleep';`)==='1'; if(!locked)await new Promise(r=>setTimeout(r,25)) }
    assert.ok(locked);await denied(begin(id),'Pago retenido');assert.equal((await blocker).code,0);assert.equal(await state(id),'approved')
  })
  await check('owner can read prize state but no internal notes, signals or other winners',async()=>{
    const f=await prize(),other=await fixture()
    assert.equal(await last(`SET ROLE authenticated; SET "request.jwt.claim.sub"='${f.user}'; SELECT count(id) FROM prize_reviews WHERE user_id='${f.user}';`),'1')
    assert.equal(await last(`SET ROLE authenticated; SET "request.jwt.claim.sub"='${other.user}'; SELECT count(id) FROM prize_reviews WHERE user_id='${f.user}';`),'0')
    await denied(`SET ROLE authenticated; SET "request.jwt.claim.sub"='${f.user}'; SELECT evidence FROM prize_reviews;`,'permission denied')
  })
  await check('journal retains full prize liability before credit and books paid cash once',async()=>{
    const f=await prize()
    assert.equal(await last(`SELECT sum(p.credit_cents-p.debit_cents) FROM accounting_postings p JOIN accounting_journal_entries e ON e.id=p.journal_entry_id WHERE e.tournament_id='${f.tournament}' AND p.account_code='210200';`),'1000000')
    assert.equal(await last(`SELECT count(*) FROM wallet_transactions WHERE user_id='${f.user}';`),'0')
    await checked(await decide(f));const id=randomUUID();await checked(request(f,id));await checked(claim(id));await checked(approve(id));await checked(begin(id));await checked(complete(id,'BANK-JOURNAL'));await checked(complete(id,'BANK-JOURNAL'))
    assert.equal(await last(`SELECT count(*) FROM accounting_journal_entries WHERE source_id='${id}' AND event_type='prize_payout';`),'1')
    assert.equal(await last(`SELECT count(*) FROM (SELECT journal_entry_id FROM accounting_postings GROUP BY journal_entry_id HAVING sum(debit_cents)<>sum(credit_cents)) x;`),'0')
  })
  await check('withdrawal amount/destination immutable; role revocation blocks already-approved transfer',async()=>{
    const {f,id}=await payout()
    await denied(service(`UPDATE withdrawal_requests SET amount_cents=600000 WHERE id='${id}';`),'permission denied')
    await denied(`UPDATE withdrawal_requests SET amount_cents=600000 WHERE id='${id}';`,'inmutables')
    await checked(`DELETE FROM profile_roles WHERE profile_id='${b}' AND role='admin';`)
    await denied(begin(id),'Operador');await checked(`INSERT INTO profile_roles VALUES('${b}','admin');`)
    await checked(`DELETE FROM profile_roles WHERE profile_id='${f.user}' AND role='user';`);await denied(begin(id),'Pago retenido')
  })
}
