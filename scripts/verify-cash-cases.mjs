import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

export async function verifyCashCases({ checked, denied, check, source, service, fixture, payment, settle, sql }) {
  const last=async text=>(await checked(text)).split('\n').at(-1)
  // A provider URL issued before the cash gate must remain reconcilable afterwards.
  const preexisting=await fixture();await payment(preexisting,'pending')
  await checked(await source('__tests__/fixtures/cash-reconciliation.sql'))
  const a=await fixture(),b=await fixture(),u=await fixture(),blocked=await fixture()
  await checked(await source('supabase/migrations/20261005175927_cash_reconciliation_and_reserve.sql'))
  await checked(`INSERT INTO profile_roles VALUES('${a.user}','owner'),('${b.user}','admin');`)
  const status=async()=>JSON.parse(await last(service('SELECT cash_status();')))
  const note='Cartola y origen de fondos revisados'
  const proof=async id=>{const path=`${id}/${'a'.repeat(64)}.pdf`;await checked(`INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('cash-proofs','${path}','{"size":100}');`);return path}
  const policy=(paused=false,max=1000000000000,reserve=1000000)=>service(`SELECT set_cash_policy('${a.user}',${paused},${max},${reserve},'${note}');`)
  const movement=async(kind='funding',amount=100000000000)=>{
    const id=randomUUID(),path=await proof(id),at=await last('SELECT now()-interval \'1 minute\';')
    const statement=service(`SELECT record_cash_movement('${id}','${a.user}','${kind}',${amount},'BANK-${id}','${at}','${path}','${note}');`)
    await checked(statement);return {id,path,statement}
  }
  const approve=m=>service(`SELECT approve_cash_movement('${m.id}','${b.user}','${note}');`)
  const capture=async(bankHeld=0,bankDelta=0)=>{
    const s=await status(),id=randomUUID(),path=await proof(id),at=await last("SELECT now();")
    const statement=service(`SELECT capture_cash_reconciliation('${id}','${a.user}','${at}',${s.bank_book_cents+bankDelta},${bankHeld},${s.flow_book_cents},0,'${path}','${path}','${note}');`)
    await checked(statement);return {id,path,statement}
  }
  const review=(r,actor=b.user,decision='approved')=>service(`SELECT review_cash_reconciliation('${r.id}','${actor}','${decision}','${note}');`)
  const observe=service("SELECT observe_operations('primary@example.test','backup@example.test');")
  await check('RM10 cash RPCs and tables deny clients/direct service mutation with empty paths',async()=>{
    for(const table of ['cash_policy','cash_movements','cash_reconciliations','cash_differences','cash_events'])for(const role of ['anon','authenticated','service_role']) {
      await denied(`SET ROLE ${role}; DELETE FROM ${table};`,'permission denied')
      if(role!=='service_role')await denied(`SET ROLE ${role}; SELECT * FROM ${table};`,'permission denied')
    }
    assert.equal(await last("SELECT count(*) FROM pg_proc WHERE proname IN ('cash_status','set_cash_policy','record_cash_movement','approve_cash_movement','capture_cash_reconciliation','review_cash_reconciliation','manage_cash_difference','read_cash_proof','correct_flow_fee_difference','reject_cash_movement') AND (has_function_privilege('authenticated',oid,'EXECUTE') OR has_function_privilege('anon',oid,'EXECUTE') OR NOT ('search_path=\"\"'=ANY(proconfig)));"),'0')
    await denied(service('SELECT private.cash_components();'),'permission denied')
  })
  await check('default policy rejects paid attempts while practice and prior callbacks remain usable',async()=>{
    assert.equal((await status()).admissions_allowed,false);const f=blocked
    await denied(service(`INSERT INTO flow_payment_attempts(user_id,tournament_id,commerce_order,net_amount_cents,charged_amount_cents) VALUES('${f.user}','${f.tournament}','blocked-${randomUUID()}',500000,500000);`),'Cobros temporalmente pausados')
    await checked(`UPDATE tournaments SET is_test=true WHERE id='${f.tournament}';`);await payment(f,'pending')
    await checked(settle(preexisting))
  })
  await check('only owner can set limits; null and fractional policy fail closed',async()=>{
    await denied(service(`SELECT set_cash_policy('${b.user}',false,1000000000000,0,'${note}');`),'propietario')
    await denied(service(`SELECT set_cash_policy('${a.user}',false,NULL,0,'${note}');`),'inválida')
    await denied(service(`SELECT set_cash_policy('${a.user}',false,101,0,'${note}');`),'inválida')
    await checked(policy())
  })
  await check('cash movements require uploaded evidence and a second current operator',async()=>{
    const id=randomUUID();await denied(service(`SELECT record_cash_movement('${id}','${a.user}','funding',1000000,'BANK-missing',now(),'${id}/${'b'.repeat(64)}.pdf','${note}');`),'Evidencia privada')
    const m=await movement();await denied(service(`SELECT approve_cash_movement('${m.id}','${a.user}','${note}');`),'independiente')
    const before=await status();await checked(approve(m));await checked(approve(m));await checked(m.statement)
    const after=await status();assert.equal(after.bank_book_cents-before.bank_book_cents,100000000000)
    assert.equal(await last(`SELECT count(*) FROM accounting_journal_entries WHERE event_key='cash.movement:${m.id}';`),'1')
    await denied(service(`SELECT record_cash_movement('${m.id}','${a.user}','funding',2000000,'BANK-${m.id}',now(),'${m.path}','${note}');`),'otros datos')
    const other=randomUUID(),path=await proof(other)
    await denied(service(`SELECT record_cash_movement('${other}','${a.user}','funding',1000000,'BANK-${m.id}',now(),'${path}','${note}');`),'duplicate key')
  })
  // Reverse the RM09 synthetic 98765-cent test entry, which is deliberately not whole CLP.
  await checked("SELECT private.post_accounting_entry('cash-fixture-reverse','fixture','fixture',gen_random_uuid(),NULL,NULL,now(),'Reverse fractional RM09 test', '[{\"account_code\":\"210200\",\"debit_cents\":98765,\"credit_cents\":0},{\"account_code\":\"110100\",\"debit_cents\":0,\"credit_cents\":98765}]');")
  await check('reserve excludes promotion tickets and reports integrity separately',async()=>{
    const before=await status()
    await checked(`INSERT INTO wallet_transactions(user_id,type,amount_cents,reference_type,reference_id) VALUES('${u.user}','tournament_credit',500000,'tournament','${u.tournament}'),('${u.user}','ticket_debit',-500000,'tournament','${u.tournament}');`)
    assert.equal((await status()).wallet_cents,before.wallet_cents);assert.equal((await status()).negative_wallets,before.negative_wallets)
  })
  await check('fractional estimated Flow fees remain a difference until evidenced independent correction',async()=>{
    const current=await status(),id=randomUUID(),path=await proof(id),flow=Math.ceil(current.flow_book_cents/100)*100;
    await checked(service(`SELECT capture_cash_reconciliation('${id}','${a.user}',now(),${current.bank_book_cents},0,${flow},0,'${path}','${path}','Cartola Flow comprobada con comisiones reales');`))
    const difference=await last(`SELECT id FROM cash_differences WHERE reconciliation_id='${id}' AND source='flow';`)
    if(difference){
      await denied(service(`SELECT correct_flow_fee_difference('${difference}','${a.user}','Comisiones reales comprobadas');`),'Otro operador')
      await checked(service(`SELECT correct_flow_fee_difference('${difference}','${b.user}','Comisiones reales comprobadas');`));await checked(service(`SELECT correct_flow_fee_difference('${difference}','${b.user}','Comisiones reales comprobadas');`))
      assert.equal((await status()).flow_book_cents,flow)
      const fresh=await capture();await checked(review(fresh))
      await checked(service(`SELECT manage_cash_difference('${difference}','${b.user}',NULL,NULL,'${fresh.id}','Diferencia de comisión corregida con cartola');`))
    }
  })
  let approved
  await check('clean cut requires another operator, immutable snapshot and evidence; replay is safe',async()=>{
    const s=await status();assert.equal(s.integrity_failures,0);assert.equal(s.negative_wallets,0)
    const r=await capture();await checked(r.statement);await denied(review(r,a.user),'independiente')
    await checked(review(r));await checked(review(r));approved=r
    const after=await status();assert.equal(after.admissions_allowed,true);assert.equal(after.available_bank_cents,after.bank_book_cents)
    await checked(service(`SELECT read_cash_proof('${b.user}','${r.path}');`))
    assert.equal(await last(`SELECT count(*) FROM cash_events WHERE target_id='${r.id}' AND action='proof.read';`),'1')
  })
  await check('pending checkout amount reserves coverage; concurrent requests cannot overbook',async()=>{
    const f=await fixture(),g=await fixture();await checked(`UPDATE tournaments SET prize_1st_cents=0 WHERE id IN ('${f.tournament}','${g.tournament}');`)
    const current=await status();await checked(policy(false,Math.ceil(current.exposure_cents/100)*100+500000,1000000))
    const attempt=f=>service(`INSERT INTO flow_payment_attempts(user_id,tournament_id,commerce_order,net_amount_cents,charged_amount_cents) VALUES('${f.user}','${f.tournament}','${f.order}',500000,500000);`)
    const replies=await Promise.all([sql(attempt(f)),sql(attempt(g))]);assert.equal(replies.filter(r=>r.code===0).length,1)
    assert.ok(replies.find(r=>r.code!==0).err.includes('Cobros temporalmente pausados'));await checked(policy())
  })
  await check('Flow balance and held bank money cannot substitute required bank coverage',async()=>{
    const current=await status();const r=await capture(current.bank_book_cents);await checked(review(r))
    const after=await status();assert.equal(after.available_bank_cents,0);assert.ok(after.flow_book_cents>0);assert.equal(after.admissions_allowed,false)
    await checked(observe);assert.equal(await last("SELECT count(*) FROM ops_incidents WHERE condition_key='cash-deficit' AND resolved_at IS NULL;"),'1')
    const restored=await capture();await checked(review(restored));approved=restored;await checked(observe)
    assert.equal(await last("SELECT count(*) FROM ops_incidents WHERE condition_key='cash-deficit' AND resolved_at IS NULL;"),'0')
  })
  await check('differences carry owner and deadline, block admission and require a later clean reviewed cut',async()=>{
    const r=await capture(0,10000);await denied(review(r),'diferencias')
    const d=JSON.parse(await last(`SELECT row_to_json(d) FROM cash_differences d WHERE reconciliation_id='${r.id}';`))
    assert.equal(d.difference_cents,10000);assert.equal(d.assigned_to,a.user);assert.ok(Date.parse(d.due_at)>Date.now())
    await checked(service(`SELECT manage_cash_difference('${d.id}','${b.user}','${b.user}',now()+interval '2 days',NULL,'Banco contactado y seguimiento asignado');`))
    await denied(service(`SELECT manage_cash_difference('${d.id}','${b.user}',NULL,NULL,'${approved.id}','${note}');`),'nueva conciliación')
    assert.equal((await status()).admissions_allowed,false);await checked(observe)
    assert.equal(await last("SELECT count(*) FROM ops_incidents WHERE condition_key='cash-differences' AND resolved_at IS NULL;"),'1')
    const replacement=await capture();await checked(review(replacement))
    await denied(service(`SELECT manage_cash_difference('${d.id}','${a.user}',NULL,NULL,'${replacement.id}','${note}');`),'independiente')
    await checked(service(`SELECT manage_cash_difference('${d.id}','${b.user}',NULL,NULL,'${replacement.id}','Se compararon cartolas y se corrigió saldo informado');`))
    assert.equal((await status()).open_differences,0);await checked(observe)
    assert.equal(await last("SELECT count(*) FROM ops_incidents WHERE condition_key='cash-differences' AND resolved_at IS NULL;"),'0')
    approved=replacement
  })
  await check('book changes after capture require a new cut; late-dated movements adjust current cash',async()=>{
    const r=await capture(),before=await status(),m=await movement('operating_expense',10000);await checked(approve(m))
    assert.equal((await status()).available_bank_cents,before.available_bank_cents-10000)
    await denied(review(r),'desactualizado');const fresh=await capture();await checked(review(fresh));approved=fresh
  })
  await check('expired daily cut pauses intake and opens operational alert',async()=>{
    await checked(`UPDATE cash_reconciliations SET observed_at=now()-interval '25 hours' WHERE status='approved';`)
    assert.equal((await status()).admissions_allowed,false);await checked(observe)
    assert.equal(await last("SELECT count(*) FROM ops_incidents WHERE condition_key='cash-stale' AND resolved_at IS NULL;"),'1')
    const fresh=await capture();await checked(review(fresh));approved=fresh;await checked(observe)
    assert.equal(await last("SELECT count(*) FROM ops_incidents WHERE condition_key='cash-stale' AND resolved_at IS NULL;"),'0')
  })
  await check('fresh operator revocation and audit failure roll back cash posting atomically',async()=>{
    const m=await movement('funding',10000),before=await status()
    await checked(`DELETE FROM profile_roles WHERE profile_id='${b.user}' AND role='admin';`);await denied(approve(m),'Operador');await checked(`INSERT INTO profile_roles VALUES('${b.user}','admin');`)
    await checked("CREATE FUNCTION private.fail_cash_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected cash audit failure'; END; $$; CREATE TRIGGER fail_cash_event BEFORE INSERT ON cash_events FOR EACH ROW EXECUTE FUNCTION private.fail_cash_event();")
    await denied(approve(m),'injected cash audit failure');assert.equal((await status()).bank_book_cents,before.bank_book_cents)
    assert.equal(await last(`SELECT count(*) FROM accounting_journal_entries WHERE event_key='cash.movement:${m.id}';`),'0')
    await checked('DROP TRIGGER fail_cash_event ON cash_events; DROP FUNCTION private.fail_cash_event();');await checked(approve(m))
  })
  await check('source read failure cannot grant coverage or resolve active cash incidents',async()=>{
    await checked('ALTER TABLE flow_payment_attempts RENAME TO cash_fixture_unavailable;');await denied(service('SELECT cash_status();'),'flow_payment_attempts');await denied(observe,'flow_payment_attempts')
    await checked('ALTER TABLE cash_fixture_unavailable RENAME TO flow_payment_attempts;')
  })
  await check('publication and prize increases require funded reserve; practice remains exempt',async()=>{
    const before=await status();await checked(policy(false,Math.ceil(before.exposure_cents/100)*100,1000000))
    const id=randomUUID();await denied(`INSERT INTO tournaments(id,status,is_test,entry_fee_cents,max_players,prize_1st_cents) VALUES('${id}','open',false,500000,15,1000000);`,'Publicación pagada pausada')
    await denied(`INSERT INTO tournaments(id,status,is_test,entry_fee_cents,max_players,prize_1st_cents) VALUES('${randomUUID()}','open',false,0,15,1000000);`,'Publicación pagada pausada')
    await checked(`INSERT INTO tournaments(id,status,is_test,entry_fee_cents,max_players,prize_1st_cents) VALUES('${id}','open',true,0,15,1000000);`)
    await checked(policy());const f=await fixture(),current=await status();await checked(policy(false,Math.ceil(current.exposure_cents/100)*100,1000000))
    await denied(`UPDATE tournaments SET prize_1st_cents=2000000 WHERE id='${f.tournament}';`,'Publicación pagada pausada');await checked(policy())
  })
  await check('award review, wallet credit and withdrawal reservation do not count the same debt twice',async()=>{
    const f=await fixture();await payment(f,'pending',{code:1});await checked(settle(f))
    await checked(`UPDATE tournaments SET status='live',play_window_start=now()-interval '1 minute' WHERE id='${f.tournament}';`)
    await checked(service(`INSERT INTO games(tournament_id,user_id,status,final_score,move_count) VALUES('${f.tournament}','${f.user}','completed',1000,10);`))
    await checked(`UPDATE tournaments SET status='finalizing' WHERE id='${f.tournament}';`)
    const promised=await status();await checked(service(`SELECT finalize_tournament('${f.tournament}');`));const retained=await status();assert.equal(retained.exposure_cents,promised.exposure_cents)
    const reviewId=await last(`SELECT id FROM prize_reviews WHERE user_id='${f.user}' AND tournament_id='${f.tournament}';`)
    await checked(service(`SELECT review_prize('${reviewId}','${a.user}','approved','Partida e identidad verificadas','{"games":[],"flags":[]}');`));const credited=await status();assert.equal(credited.exposure_cents,retained.exposure_cents)
    assert.equal(credited.wallet_cents-retained.wallet_cents,1000000);assert.equal(retained.uncredited_prizes_cents-credited.uncredited_prizes_cents,1000000)
    const id=randomUUID();await checked(service(`SELECT request_withdrawal('${id}','${f.user}',500000,'Banco','123','12.345.678-5','Persona Prueba','Persona Prueba');`))
    const reserved=await status();assert.equal(reserved.exposure_cents,credited.exposure_cents);assert.equal(reserved.reserved_withdrawals_cents-credited.reserved_withdrawals_cents,500000)
    await checked(service(`SELECT claim_withdrawal('${id}','${a.user}'); SELECT approve_withdrawal('${id}','${b.user}','Importe y banco verificados'); SELECT begin_withdrawal_transfer('${id}','${a.user}');`))
    assert.equal((await status()).exposure_cents,reserved.exposure_cents)
    await checked(service(`SELECT complete_withdrawal('${id}','${a.user}','BANK-RM10-PAYOUT','${id}/proof.pdf','Salida bancaria verificada');`));const paid=await status()
    assert.equal(paid.exposure_cents,reserved.exposure_cents-500000);assert.equal(paid.available_bank_cents,reserved.available_bank_cents-500000)
  })
  await check('incorrect pending movement can be rejected independently without deleting evidence or posting cash',async()=>{
    const m=await movement('funding',10000),before=await status()
    await denied(service(`SELECT reject_cash_movement('${m.id}','${a.user}','Datos incorrectos en comprobante');`),'independiente')
    await checked(service(`SELECT reject_cash_movement('${m.id}','${b.user}','Datos incorrectos en comprobante');`));await checked(service(`SELECT reject_cash_movement('${m.id}','${b.user}','Datos incorrectos en comprobante');`))
    await denied(approve(m),'rechazado');assert.equal((await status()).bank_book_cents,before.bank_book_cents)
    assert.equal(await last(`SELECT count(*) FROM storage.objects WHERE name='${m.path}';`),'1')
  })
  await check('a negative Flow book blocks admission even when bank funds increased',async()=>{
    const before=await status(),amount=Math.ceil(before.flow_book_cents/100)*100+100,m=await movement('flow_settlement',amount)
    await checked(approve(m));const invalid=await status();assert.ok(invalid.flow_book_cents<0);assert.equal(invalid.admissions_allowed,false);assert.ok(invalid.blocking_reasons.includes('Subledger o contabilidad inconsistente'))
    await checked(`SELECT private.post_accounting_entry('cash-fixture-reverse-flow','fixture','fixture','${m.id}',NULL,NULL,now(),'Reverse disposable over-settlement test', '[{"account_code":"110200","debit_cents":${amount},"credit_cents":0},{"account_code":"110100","debit_cents":0,"credit_cents":${amount}}]');`)
    assert.equal((await status()).flow_book_cents,before.flow_book_cents)
  })
  await check('all cash entries remain balanced and canonical event keys unique',async()=>{
    assert.equal(await last('SELECT count(*) FROM (SELECT journal_entry_id FROM accounting_postings GROUP BY journal_entry_id HAVING sum(debit_cents)<>sum(credit_cents)) x;'),'0')
    assert.equal(await last('SELECT count(*)-count(DISTINCT event_key) FROM accounting_journal_entries;'),'0')
  })
}
