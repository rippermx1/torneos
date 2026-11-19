import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { clpToCents, documentPostings, formatAccountingClp, validAccountingPeriod } from '@/lib/accounting/operations'
import { parseBankCsv } from '@/lib/accounting/bank-import'
import { buildLedgerSnapshot, journalLinesToCsv, type JournalLine } from '@/lib/accounting/ledger'
import { buildModeloAAccountingReport, calculateJournalContribution } from '@/lib/accounting/model-a-report'

const line = (period: string, account_code: string, debit_cents = 0, credit_cents = 0) => ({period,account_code,debit_cents,credit_cents,is_estimate:false,journal_entry_id:1,posting_id:1,description:'fixture'}) as JournalLine
describe('vertical contable', () => {
  it('convierte CLP decimal exactamente y rechaza redondeo implícito', () => {
    expect(clpToCents('202,19')).toBe(20219); expect(clpToCents('-1.01')).toBe(-101)
    for (const input of ['1.009', '1e3', '1.000.000', '', 'Infinity', '900719925474099']) expect(() => clpToCents(input)).toThrow()
    expect(validAccountingPeriod('2026-13')).toBe(false)
    expect(formatAccountingClp(580960)).toContain('5.809,60')
  })
  it('registra gasto contra deuda, pago sin repetir gasto y abono Flow separado de factura', () => {
    expect(documentPostings('expense',10000,1900,'530100','210400')).toEqual([{account_code:'530100',debit_cents:10000,credit_cents:0},{account_code:'110300',debit_cents:1900,credit_cents:0},{account_code:'210400',debit_cents:0,credit_cents:11900}])
    expect(documentPostings('supplier_payment',11900,0,'','').map(p=>p.account_code)).toEqual(['210400','110100'])
    expect(() => documentPostings('settlement',10000,1900,'','')).toThrow()
  })
  it('importa cartola con comillas y cargo negativo, rechaza referencias duplicadas y filas rotas', () => {
    const header='fecha_iso,referencia,monto_clp,respaldo\n'
    const row='2026-09-01T12:00:00-04:00,B1,-100.12,"cartola, página 1"'
    expect(parseBankCsv(header+row)[0]).toMatchObject({amount_cents:-10012,evidence:'cartola, página 1',occurred_at:'2026-09-01T16:00:00.000Z'})
    expect(()=>parseBankCsv(header+row+'\n'+row)).toThrow(/duplicada/)
    expect(()=>parseBankCsv(header+'bad,x,10,y')).toThrow(/fecha/)
    expect(()=>parseBankCsv(header+'"open')).toThrow(/cerrar/)
  })
  it('exporta todas las líneas del snapshot y verifica los mismos totales; neutraliza fórmulas de texto', async () => {
    const lines=Array.from({length:500},(_,i)=>({...line('2026-09', i%2?'310200':'110100',i%2?0:100,i%2?100:0), posting_id:i+1}))
    lines[0].description='=HYPERLINK("evil")'
    const rpc=vi.fn().mockResolvedValue({data:{lines,accounts:[{code:'110100',normal_balance:'debit',category:'asset'},{code:'310200',normal_balance:'credit',category:'equity'}]},error:null})
    const ledger=await buildLedgerSnapshot({rpc} as unknown as SupabaseClient<Database>,'2026-09')
    expect(ledger.journalLines).toHaveLength(500); expect(ledger.confirmedDebitsCents).toBe(25000); expect(ledger.balanced).toBe(true)
    expect(journalLinesToCsv(ledger.journalLines).split('\n')).toHaveLength(501)
    expect(journalLinesToCsv(ledger.journalLines)).toContain("'=HYPERLINK")
    expect(rpc).toHaveBeenCalledWith('accounting_workspace',{p_period:'2026-09'})
  })
  it('reconoce noviembre aunque cobre octubre; la devolución pre-servicio sólo reduce diferido', () => {
    const summary=calculateJournalContribution([line('2026-10','110200',500000),line('2026-10','210300',0,420168),line('2026-10','210300',100000),line('2026-10','520100',15950),line('2026-11','210300',320168),line('2026-11','410100',0,320168),line('2026-11','510100',200000)])
    expect(summary.get('2026-10')).toEqual({revenueCents:0,contributionCents:-15950})
    expect(summary.get('2026-11')).toEqual({revenueCents:320168,contributionCents:120168})
  })
  it('el reporte completo genera el mes del servicio y conserva IVA/cobro en su propio mes', async () => {
    const attempt={id:'paid',user_id:'u',tournament_id:'t',payment_method:'card',created_at:'2026-10-31T18:00:00Z',settled_at:'2026-10-31T18:00:00Z',status:'paid',flow_status_code:2,intent:'tournament_registration',charged_amount_cents:500000,net_amount_cents:480000,user_fee_cents:20000}
    const from=(name: string)=>{ const q={select:()=>q,order:()=>q,range:async()=>({data:name==='flow_payment_attempts'?[attempt]:[],error:null}),maybeSingle:async()=>({data:{},error:null})}; return q }
    const lines=[line('2026-10','210300',0,420168),line('2026-11','210300',420168),line('2026-11','410100',0,420168)]
    const rpc=async()=>({data:{lines,accounts:[{code:'210300',normal_balance:'credit'},{code:'410100',normal_balance:'credit'}]},error:null})
    const report=await buildModeloAAccountingReport({from,rpc} as unknown as SupabaseClient<Database>)
    expect(report.rows.find(r=>r.period==='2026-10')).toMatchObject({f29GrossSalesCents:500000,netSalesAfterRefundsCents:0,accruedContributionCents:0})
    expect(report.rows.find(r=>r.period==='2026-11')).toMatchObject({f29GrossSalesCents:0,netSalesAfterRefundsCents:420168,accruedContributionCents:420168})
  })
  it('suma IVA redondeado por documento, no vuelve a redondear el total mensual', async () => {
    const attempts=[1,2].map(id=>({id:String(id),payment_method:'card',created_at:'2026-10-01T12:00:00Z',status:'paid',flow_status_code:2,intent:'tournament_registration',charged_amount_cents:100000,net_amount_cents:100000,user_fee_cents:0}))
    const from=(name:string)=>{const q={select:()=>q,order:()=>q,range:async()=>({data:name==='flow_payment_attempts'?attempts:[],error:null}),maybeSingle:async()=>({data:{},error:null})};return q}
    const rpc=async()=>({data:{lines:[],accounts:[]},error:null})
    const report=await buildModeloAAccountingReport({from,rpc} as unknown as SupabaseClient<Database>)
    expect(report.rows[0].f29IvaDebitCents).toBe(31932)
    expect(report.rows[0].f29NetSalesCents+report.rows[0].f29IvaDebitCents).toBe(200000)
  })
  it('excluye devoluciones simuladas y torneos de prueba del reporte y sus alertas', async () => {
    const tables: Record<string,unknown[]> = {
      flow_payment_attempts:[{id:'sim',payment_method:'simulation',created_at:'2026-10-01',status:'cancelled',flow_status_code:2,intent:'tournament_registration',charged_amount_cents:500000}],
      flow_refund_attempts:[{id:'refund',flow_payment_attempt_id:'sim',created_at:'2026-10-02',status:'completed',amount_cents:500000,tax_document_status:'required'}],
      tournaments:[{id:'test',is_test:true}],registrations:[],wallet_transactions:[],withdrawal_requests:[],
    }
    const from=(name: string)=>{ const q={select:()=>q,order:()=>q,range:async()=>({data:tables[name]??[],error:null}),maybeSingle:async()=>({data:{},error:null})}; return q }
    const rpc=async()=>({data:{lines:[],accounts:[]},error:null})
    const report=await buildModeloAAccountingReport({from,rpc} as unknown as SupabaseClient<Database>)
    expect(report.rows).toEqual([]); expect(report.reconciliation.completedRefundMissingCreditNote.count).toBe(0)
  })
})
