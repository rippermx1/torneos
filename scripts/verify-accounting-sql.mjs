// Actual SQL on isolated PostgreSQL/PGlite. No remote DB, Flow, Auth or deployment.
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
const root = path.resolve(import.meta.dirname, '..')
const runtime = process.env.ACCOUNTING_PGLITE_PATH ?? 'artifacts/accounting/sql-runtime/node_modules/@electric-sql/pglite/dist/index.js'
const { PGlite } = await import(pathToFileURL(path.resolve(root, runtime)))
const db = new PGlite(), checks = [], hashes = {}
const exec = (sql) => db.exec(sql)
const one = async (sql, args) => (await db.query(sql, args)).rows[0]
const actor = randomUUID()
const operate = async (action, payload) => (await one('select public.accounting_operate($1,$2::jsonb,$3::uuid) result', [action, JSON.stringify(payload), actor])).result
const workspace = async (period = '2026-09') => (await one('select public.accounting_workspace($1) result', [period])).result
const post = (account_code,debit_cents=0,credit_cents=0) => ({account_code,debit_cents,credit_cents})
const doc = (kind,reference,postings,extra={}) => ({kind,reference,counterparty:'Fixture RUT',evidence:'private/document-'+reference,occurred_at:'2026-09-15T12:00:00-03:00',tax_verified:false,postings,estimate_entry_ids:[],...extra})
try {
  await exec(`create schema auth; create table auth.users(id uuid primary key);
    create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public,auth to anon,authenticated,service_role;
    create table public.profile_roles(profile_id uuid,role text);
    create table public.tournaments(id uuid primary key,status text,is_test boolean default false,entry_fee_cents bigint default 0,prize_fund_bps int,platform_fee_bps int,prize_1st_cents bigint default 0,prize_2nd_cents bigint default 0,prize_3rd_cents bigint default 0);
    create table public.tournament_prize_tiers(prize_1st_cents bigint,prize_fund_cents bigint);
    create table public.tournament_results(tournament_id uuid,prize_awarded_cents bigint);
    create table public.flow_payment_attempts(id uuid primary key,intent text,status text,flow_status_code int,payment_method text,charged_amount_cents bigint,commerce_order text,flow_order bigint,tournament_id uuid,user_id uuid,settled_at timestamptz,created_at timestamptz default now());
    create table public.flow_refund_attempts(id uuid primary key,status text,flow_payment_attempt_id uuid,tournament_id uuid,user_id uuid,amount_cents bigint,settled_at timestamptz,created_at timestamptz default now());
    create table public.withdrawal_requests(id uuid primary key,status text,paid_at timestamptz,user_id uuid,amount_cents bigint,receipt_number text,bank_transfer_reference text,proof_storage_path text);`)
  const migrations = ['20260804223538_accounting_double_entry_ledger.sql','20260804231035_account_for_pre_completion_refunds.sql','20261005181131_accounting_operations_and_controlled_close.sql']
  for (const file of migrations) { const sql = await readFile(path.join(root,'supabase/migrations',file),'utf8'); hashes[file]=createHash('sha256').update(sql).digest('hex'); await exec(sql) }
  await db.query('insert into auth.users values($1)',[actor]); await db.query("insert into public.profile_roles values($1,'owner')",[actor])
  await exec('set role service_role')
  const contribution = doc('contribution','aporte-001',[post('110100',100000),post('310200',0,100000)])
  const added = await operate('document',contribution)
  assert.equal((await operate('document',contribution)).duplicate,true)
  await assert.rejects(operate('document',{...contribution,evidence:'another'}),/otro contenido/)
  await assert.rejects(operate('document',doc('expense','bad',[post('530100',900),post('210400',0,1000)])),/Asiento invalido/)
  await assert.rejects(operate('document',doc('expense','vat',[post('530100',10000),post('110300',1900),post('210400',0,11900)])),/RCV/)
  const expense = await operate('document',doc('expense','hosting',[post('530100',10000),post('110300',1900),post('210400',0,11900)],{tax_verified:true}))
  await exec('begin')
  await operate('document',doc('supplier_payment','pago-hosting',[post('210400',11900),post('110100',0,11900)]))
  let paymentPack=await workspace(); assert.equal(paymentPack.bank_closing_cents,88100); assert.equal(paymentPack.balances.find(b=>b.code==='210400').closing_cents,0); assert.equal(paymentPack.result_cents,-10000)
  await operate('document',doc('other_revenue','patrocinio-001',[post('110100',119000),post('410300',0,100000),post('210100',0,19000)]))
  assert.equal((await workspace()).result_cents,90000)
  await exec('rollback')
  checks.push('supplier invoice creates debt, payment clears debt without repeating expense; other revenue includes full IVA; isolated scenario rolled back')
  checks.push('atomic balanced documents, exact integers, verified VAT, duplicate replay and conflicting duplicate rejection')
  const row={occurred_at:contribution.occurred_at,reference:'bank-001',amount_cents:100000,evidence:'cartola-p1'}
  await operate('bank_import',{rows:[row]}); await operate('bank_import',{rows:[row]})
  await assert.rejects(operate('bank_import',{rows:[{...row,reference:'must-rollback'},{...row,amount_cents:99}]}),/diferencia/)
  assert.equal((await workspace()).bank.length,1)
  const bank=(await workspace()).bank[0]
  await assert.rejects(operate('match',{bank_id:bank.id,journal_entry_id:expense.journal_entry_id}),/Banco|Importe/)
  await operate('match',{bank_id:bank.id,journal_entry_id:added.journal_entry_id})
  let pack=await workspace(); assert.equal(pack.controls.unmatched_bank,0); assert.equal(pack.controls.unmatched_journal,0)
  assert.equal(pack.result_cents,-10000); assert.equal(pack.bank_closing_cents,100000)
  checks.push('atomic cartola import, idempotent duplicate, matching rejects wrong amount; bank balance and company loss without sales')

  await exec('reset role')
  const tournament=randomUUID(),attempt=randomUUID()
  await db.query("insert into public.tournaments(id,status,entry_fee_cents) values($1,'open',500000)",[tournament])
  await db.query("insert into public.flow_payment_attempts(id,intent,status,flow_status_code,payment_method,charged_amount_cents,tournament_id,settled_at) values($1,'tournament_registration','paid',2,'card',500000,$2,'2026-09-30T12:00:00Z')",[attempt,tournament])
  await db.query("update public.tournaments set status='completed' where id=$1",[tournament])
  // Automatic completion uses now(): current October income, September collection.
  await exec('set role service_role')
  pack=await workspace(); assert.equal(pack.lines.some((l)=>l.account_code==='410100'),false)
  const october=await workspace('2026-10'); assert.equal(october.lines.filter((l)=>l.account_code==='410100').reduce((n,l)=>n+l.credit_cents,0),420168)
  const estimate=pack.lines.find((l)=>l.event_type==='flow_fee_estimate').journal_entry_id
  const invoice=doc('commission','Flow-001',[post('520100',16000),post('110300',3040),post('110200',0,19040)],{tax_verified:true,estimate_entry_ids:[estimate]})
  await assert.rejects(operate('document',{...invoice,estimate_entry_ids:[99999]}),/inexistentes/)
  const invoiceAdded=await operate('document',invoice)
  assert.equal((await workspace()).controls.estimates_cents,0)
  await assert.rejects(operate('document',{...invoice,reference:'Flow-002'}),/ya reemplazada/)
  const settlement=await operate('document',doc('settlement','liq-001',[post('110100',480960),post('110200',0,480960)]))
  checks.push('real payment and completion triggers: IVA/cash separate from earned income; exact invoice replaces estimated fee once with immutable reversal')

  const approval={period:'2026-09',reason:'Revisión sintética completa por contador',reviewed:true,bank_evidence:'cartola-full',flow_evidence:'Flow-full',rcv_evidence:'RCV-full',bank_opening_cents:0,bank_closing_cents:580960,flow_closing_cents:0}
  await assert.rejects(operate('close',approval),/bloqueado/)
  await operate('bank_import',{rows:[{...row,reference:'bank-002',amount_cents:480960}]})
  const bank2=(await workspace()).bank.find((b)=>b.reference==='bank-002')
  await operate('match',{bank_id:bank2.id,journal_entry_ids:[settlement.journal_entry_id]})
  await assert.rejects(operate('close',{...approval,bank_closing_cents:1}),/Saldos externos/)
  const close=await operate('close',approval)
  const frozen=await operate('closed_package',{id:close.id})
  assert.equal(frozen.package.bank_closing_cents,580960)
  await assert.rejects(operate('document',doc('expense','closed-expense',[post('530100',100),post('210400',0,100)])),/cerrado/)
  await assert.rejects(operate('bank_import',{rows:[{...row,reference:'closed-bank'}]}),/cerrado/)
  await assert.rejects(operate('unmatch',{bank_id:bank.id,reason:'No puede modificar cerrado'}),/cerrado/)
  await operate('reopen',{period:'2026-09',reason:'Corregir factura con respaldo nuevo'})
  await operate('reverse',{journal_entry_id:expense.journal_entry_id,occurred_at:'2026-09-16T12:00:00-03:00',reason:'Reversar factura proveedor incorrecta'})
  const close2=await operate('close',approval); assert.equal(close2.version,2)
  assert.deepEqual((await operate('closed_package',{id:close.id})).package,frozen.package)
  checks.push('closed package immutable across reopened correction and version2; closed backdating/import/unmatch blocked; balance difference blocks approval')
  const october2=await workspace('2026-10'); assert.equal(october2.bank_opening_cents,580960)
  const octoberClose=await operate('close',{...approval,period:'2026-10',bank_opening_cents:580960}) .catch(()=>null)
  // Current month is intentionally not closable.
  assert.equal(octoberClose,null)
  checks.push('opening/closing cumulative balances; current-month close rejected')
  await operate('reopen',{period:'2026-09',reason:'Ensayo de correcciones con conciliación agrupada'})
  const reversed=await operate('reverse',{journal_entry_id:added.journal_entry_id,occurred_at:'2026-09-16T12:00:00-03:00',reason:'Corregir referencia de aporte sin mover efectivo'})
  const replacement=await operate('document',{...contribution,reference:'aporte-002'})
  await operate('unmatch',{bank_id:bank.id,reason:'Agrupar asiento original, reversa y documento correcto'})
  await operate('match',{bank_id:bank.id,journal_entry_ids:[added.journal_entry_id,reversed.journal_entry_id,replacement.journal_entry_id]})
  assert.equal((await workspace()).controls.unmatched_journal,0)
  await operate('reverse',{journal_entry_id:invoiceAdded.journal_entry_id,occurred_at:'2026-09-16T12:00:00-03:00',reason:'Reemplazar factura Flow incorrectamente referenciada'})
  const restored=(await workspace()).lines.find(l=>l.description==='Provisión restaurada al reversar factura Flow')
  assert.ok((await workspace()).controls.estimates_cents>0)
  await operate('document',{...invoice,reference:'Flow-003',estimate_entry_ids:[restored.journal_entry_id]})
  assert.equal((await workspace()).controls.estimates_cents,0)
  checks.push('grouped bank matching handles original + reversal + corrected document; reversing Flow invoice restores provisions until a new verified invoice')
  await exec('reset role')
  const testTournament=randomUUID(),testAttempt=randomUUID(),simAttempt=randomUUID(),simRefund=randomUUID(),realRefund=randomUUID()
  await db.query("insert into public.tournaments(id,status,is_test) values($1,'open',true)",[testTournament])
  for(const [id,method,tid] of [[testAttempt,'card',testTournament],[simAttempt,'simulation',tournament]]) await db.query("insert into public.flow_payment_attempts(id,intent,status,flow_status_code,payment_method,charged_amount_cents,tournament_id,settled_at) values($1,'tournament_registration','paid',2,$2,500000,$3,'2026-10-01T12:00:00Z')",[id,method,tid])
  let linesBefore=(await workspace('2026-10')).lines.length
  await db.query("insert into public.flow_refund_attempts(id,status,flow_payment_attempt_id,tournament_id,amount_cents,settled_at,tax_document_status,tax_document_number,tax_document_issued_at) values($1,'completed',$2,$3,500000,'2026-10-02T12:00:00Z','issued','SIM-001','2026-10-02T12:00:00Z')",[simRefund,simAttempt,tournament])
  assert.equal((await workspace('2026-10')).lines.length,linesBefore)
  assert.equal((await one('select count(*)::int n from public.accounting_journal_entries where source_id=$1',[testAttempt])).n,0)
  await db.query("insert into public.flow_refund_attempts(id,status,flow_payment_attempt_id,tournament_id,amount_cents,settled_at) values($1,'completed',$2,$3,500000,'2026-10-02T12:00:00Z')",[realRefund,attempt,tournament])
  await exec('set role service_role')
  assert.equal((await workspace('2026-10')).controls.pending_credit_notes,1)
  const nc={id:realRefund,number:'NC-001',issued_at:'2026-10-03T12:00:00Z',evidence:'RCV-octubre-NC-001',verified:true}
  await assert.rejects(operate('credit_note',{...nc,verified:false}),/verificación/)
  await operate('credit_note',nc)
  assert.equal((await workspace('2026-10')).controls.pending_credit_notes,0)
  await assert.rejects(operate('credit_note',nc),/ya verificada/)
  await exec('reset role')
  const legacyAttempt=randomUUID(),legacyRefund=randomUUID()
  await db.query("insert into public.flow_payment_attempts(id,intent,status,flow_status_code,payment_method,charged_amount_cents,tournament_id,settled_at) values($1,'tournament_registration','paid',2,'card',100000,$2,'2026-10-01T12:00:00Z')",[legacyAttempt,tournament])
  await db.query("insert into public.flow_refund_attempts(id,status,flow_payment_attempt_id,tournament_id,amount_cents,settled_at,tax_document_status,tax_document_number,tax_document_issued_at) values($1,'completed',$2,$3,100000,'2026-10-02T12:00:00Z','issued','LEGACY-NC','2026-10-03T12:00:00Z')",[legacyRefund,legacyAttempt,tournament])
  await exec('set role service_role')
  const legacyNc={...nc,id:legacyRefund,number:'LEGACY-NC'}
  await assert.rejects(operate('credit_note',{...legacyNc,number:'CHANGED'}),/conserva su folio/)
  await operate('credit_note',{...legacyNc,issued_at:'2026-10-03T15:00:00Z'})
  const legacyTax=(await workspace('2026-10')).lines.find(l=>l.event_type==='refund_credit_note'&&l.source_id===legacyRefund)
  assert.equal(new Date(legacyTax.occurred_at).toISOString(),'2026-10-03T12:00:00.000Z')
  checks.push('SQL filters real practice payments and simulated refunds/credit notes; real N/C requires trace and manual verification, verified once')
  // More than the former 300-line limit, checked against the actual SQL JSON.
  for(let i=0;i<160;i++) await operate('document',doc('expense','bulk-'+i,[post('530100',100),post('210400',0,100)],{occurred_at:'2026-10-04T12:00:00-03:00'}))
  const full=await workspace('2026-10'); assert.ok(full.lines.length>300)
  assert.equal(full.lines.reduce((n,l)=>n+l.debit_cents-l.credit_cents,0),0)
  checks.push('actual SQL full JSON journal exceeds 300 lines, complete and balanced')
  await assert.rejects(operate('document',doc('contribution','bad-shape',[post('110100',100),post('410100',0,100)])),/incompatibles/)
  await assert.rejects(operate('document',doc('expense','fractional',[post('530100',1.2),post('210400',0,1.2)])),/monto inválido/)
  await assert.rejects(operate('bank_import',{rows:[{...row,reference:'fractional-bank',amount_cents:1.2}]}),/centavos enteros/)
  for(const role of ['anon','authenticated']) {
    await exec('reset role'); await exec('set role '+role)
    await assert.rejects(workspace(),/permission denied/); await assert.rejects(operate('document',contribution),/permission denied/)
    await assert.rejects(db.query('select * from public.accounting_documents'),/permission denied/)
  }
  await exec('reset role')
  assert.equal((await one("select count(*)::int n from pg_class where relnamespace='public'::regnamespace and relname like 'accounting_%' and relkind='r' and not relrowsecurity")).n,0)
  assert.equal((await one("select has_table_privilege('service_role','public.accounting_documents','INSERT') value")).value,false)
  assert.equal((await one("select prosecdef from pg_proc where oid='public.accounting_operate(text,jsonb,uuid)'::regprocedure")).prosecdef,false)
  await assert.rejects(db.query("update public.accounting_journal_entries set description='tamper'"),/inmutable/)
  await assert.rejects(db.query("update public.accounting_period_closes set snapshot='{}'::jsonb"),/inmutable/)
  const report={at:new Date().toISOString(),status:'PASS',scope:'isolated real SQL in PGlite, simplified Auth and operational fixture schema; remote Supabase and browser MFA NOT_RUN',checks:[...checks,'browser roles denied; service-only invoker API; immutable journal'],hashes}
  await mkdir(path.join(root,'artifacts/accounting'),{recursive:true}); await writeFile(path.join(root,'artifacts/accounting/ui-fixture.json'),JSON.stringify(await workspace(),null,2)+'\n')
  await mkdir(path.join(root,'artifacts/accounting'),{recursive:true}); await writeFile(path.join(root,'artifacts/accounting/sql-evidence.json'),JSON.stringify(report,null,2)+'\n'); console.log(JSON.stringify(report,null,2))
} finally { await db.close() }
