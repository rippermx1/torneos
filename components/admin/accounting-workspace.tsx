'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { clpToCents, documentPostings, formatAccountingClp as formatCLP, type AccountingPackage, type DocumentKind } from '@/lib/accounting/operations'
import { parseBankCsv } from '@/lib/accounting/bank-import'
import { parseDateTimeLocalToIso } from '@/lib/utils'

const input = 'w-full min-w-0 border rounded-md px-3 py-2 bg-background text-sm'
const button = 'border rounded-md px-3 py-2 text-sm hover:bg-muted disabled:opacity-50'
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm space-y-1"><span>{label}</span>{children}</label>
}
const amount = (f: FormData, key: string) => clpToCents(String(f.get(key) ?? '0'))
const value = (f: FormData, key: string) => String(f.get(key) ?? '').trim()
const at = (f: FormData) => {
  const date = parseDateTimeLocalToIso(value(f, 'date'))
  if (!date) throw new Error('Fecha inválida.')
  return date
}

export function AccountingWorkspace({ pack, period }: { pack: AccountingPackage; period: string }) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [kind, setKind] = useState<DocumentKind>('expense')
  const activeClose = pack.closes.find((c) => !c.reopened_at)
  async function operate(action: string, payload: Record<string, unknown>) {
    setBusy(true); setMessage('')
    try {
      const res = await fetch('/api/admin/accounting', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, payload }) })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error ?? 'No fue posible registrar la operación.')
      setMessage(`Operación registrada${result.journal_entry_id ? ` · asiento ${result.journal_entry_id}` : ''}${result.duplicate ? ' (referencia ya existente)' : ''}.`)
      router.refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Error al registrar.') }
    finally { setBusy(false) }
  }
  function form(handler: (f: FormData) => Promise<void>) {
    return async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      try { await handler(new FormData(e.currentTarget)) } catch (error) { setMessage(error instanceof Error ? error.message : 'Formulario inválido.') }
    }
  }
  const bankEntries = new Map<number, number>()
  for (const line of pack.lines) if (line.account_code === '110100' && !line.is_estimate) bankEntries.set(line.journal_entry_id, (bankEntries.get(line.journal_entry_id) ?? 0) + line.debit_cents - line.credit_cents)
  const estimates = new Map<number, string>()
  for (const line of pack.lines) if (['flow_fee_estimate', 'flow_refund_fee_estimate'].includes(line.event_type)) estimates.set(line.journal_entry_id, line.description)

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end gap-3">
      <form className="flex items-end gap-2" action="/admin/accounting"><Field label="Mes"><input className={input} name="period" type="month" defaultValue={period} required /></Field><button className={button}>Consultar</button></form>
      <a className={button} href={`/api/admin/reports/journal.csv?period=${period}`}>Diario completo CSV</a>
      <a className={button} href={`/api/admin/accounting?period=${period}`}>Paquete de trabajo JSON</a>
      <a className={button} href={`/api/admin/accounting/balances.csv?period=${period}`}>Saldos CSV para contador</a>
    </div>
    <p role="status" aria-live="polite" className="text-sm border rounded-md p-3">{message || (activeClose ? `Mes cerrado · versión ${activeClose.version}. Para corregir, reabre con motivo.` : 'Mes abierto. Las referencias de respaldo deben permitir localizar el documento original.')}</p>
    <section className="grid gap-3 sm:grid-cols-3">
      {[["Resultado del mes", pack.result_cents], ["Banco final acumulado", pack.bank_closing_cents], ["Flow pendiente acumulado", pack.flow_closing_cents]].map(([label, cents]) => <div key={label} className="border rounded-lg p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="text-xl font-semibold">{formatCLP(Number(cents))}</p></div>)}
    </section>
    <p className="text-sm text-muted-foreground">Resultado del libro, con gastos y provisiones pendientes: no equivale a caja ni a F29 presentado. Control: {pack.controls.unmatched_bank} filas de cartola sin enlace, {pack.controls.unmatched_journal} asientos bancarios sin cartola, {pack.controls.pending_credit_notes} N/C pendientes. Provisiones sin reemplazar (suma de saldos por cuenta): {formatCLP(pack.controls.estimates_cents)}.</p>

    <section className="border rounded-xl p-4 space-y-3">
      <h2 className="font-semibold">Registrar documento y asiento</h2>
      <form onSubmit={form(async (f) => {
        const postings = documentPostings(kind, amount(f, 'net'), amount(f, 'iva'), value(f, 'account'), kind === 'other_revenue' ? '110100' : value(f, 'counterpart'))
        const ids = value(f, 'estimates').split(',').map((s) => s.trim()).filter(Boolean).map(Number)
        if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) throw new Error('IDs de estimaciones inválidos.')
        await operate('document', { kind, reference: value(f, 'reference'), counterparty: value(f, 'counterparty'), evidence: value(f, 'evidence'), occurred_at: at(f), tax_verified: f.get('tax_verified') === 'on', postings, estimate_entry_ids: ids })
      })} className="grid gap-3 md:grid-cols-2">
        <Field label="Tipo"><select className={input} value={kind} onChange={(e) => setKind(e.target.value as DocumentKind)}>
          <option value="expense">Gasto / factura de proveedor</option><option value="contribution">Aporte del propietario</option><option value="settlement">Abono de liquidación Flow</option><option value="commission">Factura Flow: reemplazar provisiones</option><option value="supplier_payment">Pago de deuda a proveedor</option><option value="other_revenue">Otro ingreso cobrado (B2B / patrocinio)</option><option value="adjustment">Ajuste con cuentas explícitas</option>
        </select></Field>
        <Field label="Fecha del documento (hora de Chile)"><input name="date" type="datetime-local" className={input} required /></Field>
        <Field label="Proveedor / contraparte (RUT y nombre)"><input name="counterparty" className={input} maxLength={160} required /></Field>
        <Field label="Folio / referencia única"><input name="reference" className={input} maxLength={160} required /></Field>
        <Field label="Neto / importe CLP"><input name="net" inputMode="decimal" className={input} placeholder="10000" required /></Field>
        <Field label="IVA documentado CLP (0 sin crédito fiscal)"><input name="iva" inputMode="decimal" className={input} defaultValue="0" required /></Field>
        {['expense', 'commission', 'adjustment'].includes(kind) && <Field label={kind === 'adjustment' ? 'Cuenta de cargo (Debe)' : 'Cuenta del gasto'}><select name="account" className={input} defaultValue={kind === 'commission' ? '520100' : '530100'}>
          {pack.accounts.filter((a) => kind === 'adjustment' || (kind === 'commission' ? ['520100', '520200'].includes(a.code) : a.code.startsWith('530'))).map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
        </select></Field>}
        {['expense', 'adjustment'].includes(kind) && <Field label="Contrapartida (Haber)"><select name="counterpart" className={input} defaultValue="210400">
          {pack.accounts.filter((a) => kind === 'adjustment' || ['110100', '210400'].includes(a.code)).map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
        </select></Field>}
        <Field label="Respaldo (referencia al archivo/documento original)"><input name="evidence" className={input} minLength={3} maxLength={500} placeholder="Archivo privado / factura / cartola y página" required /></Field>
        {kind === 'commission' && <Field label="IDs de provisiones incluidas en la factura, separados por coma"><input name="estimates" className={input} placeholder="12,15" required /></Field>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="tax_verified" />Documento verificado contra RCV por el responsable</label>
        <p className="text-xs text-muted-foreground">Si el IVA no es recuperable, incorpóralo al importe del gasto y deja IVA en cero. La liquidación y la factura Flow son documentos separados. Ajustes: adjunta motivo y respaldo del contador en la referencia.</p>
        <button disabled={busy || !!activeClose} className={button}>Registrar asiento</button>
      </form>
      {kind === 'commission' && <p className="text-xs">Provisiones del mes: {[...estimates].map(([id, description]) => `${id}: ${description}`).join(' · ') || 'Sin provisiones en este mes. Consulta el diario del mes de origen para otros IDs.'}</p>}
    </section>

    <section className="border rounded-xl p-4 space-y-3"><h2 className="font-semibold">Importar cartola y conciliar</h2>
      <p className="text-sm text-muted-foreground">CSV de hasta 1000 filas: <code>fecha_iso,referencia,monto_clp,respaldo</code>. ISO con zona horaria; abonos positivos, cargos negativos. Las referencias repetidas se conservan si coinciden; una diferencia rechaza el archivo completo.</p>
      <p className="text-xs break-all">Ejemplo: 2026-09-01T12:00:00-04:00,ABONO-001,10000,cartola-septiembre-p1</p>
      <form className="flex flex-wrap gap-3" onSubmit={form(async (f) => { const file = f.get('csv'); if (!(file instanceof File) || file.size > 1_000_000) throw new Error('Seleccione CSV de hasta 1 MB.'); await operate('bank_import', { rows: parseBankCsv(await file.text()) }) })}>
        <input aria-label="Cartola CSV" type="file" name="csv" className="min-w-0 w-full max-w-full sm:w-auto" accept=".csv,text/csv" required /><button className={button} disabled={busy || !!activeClose}>Importar cartola</button>
      </form>
      <div className="overflow-auto"><table className="w-full text-sm"><thead><tr><th className="text-left p-2">Referencia</th><th className="text-right p-2">CLP</th><th className="text-left p-2">Conciliación</th></tr></thead><tbody>
        {pack.bank.map((b) => <tr key={b.id} className="border-t"><td className="p-2">{b.reference}<div className="text-xs text-muted-foreground">{b.evidence}</div></td><td className="p-2 text-right">{formatCLP(b.amount_cents)}</td><td className="p-2">
          {b.journal_entry_id ? <form className="flex gap-2" onSubmit={form(async (f) => operate('unmatch', { bank_id: b.id, reason: value(f, 'reason') }))}><span>Asientos {b.journal_entry_ids.join(', ')}</span><input name="reason" aria-label="Motivo para deshacer" placeholder="Motivo para deshacer" className={input} minLength={10} required /><button className={button} disabled={busy || !!activeClose}>Deshacer</button></form> : <form className="flex gap-2" onSubmit={form(async (f) => operate('match', { bank_id: b.id, journal_entry_ids: [Number(value(f, 'entry')), ...value(f, 'more_entries').split(',').map(s => s.trim()).filter(Boolean).map(Number)] }))}><select aria-label={`Asiento para ${b.reference}`} name="entry" className={input} required defaultValue=""><option value="">Seleccionar asiento</option>{[...bankEntries].filter(([id, cents]) => cents !== 0 && !pack.bank.some((row) => row.journal_entry_ids.includes(id))).map(([id, cents]) => <option key={id} value={id}>Asiento {id} · {formatCLP(cents)}</option>)}</select><input aria-label="Otros asientos para el mismo movimiento" name="more_entries" placeholder="Otros IDs: 2,3 (opcional)" className={input} /><button className={button} disabled={busy || !!activeClose}>Conciliar</button></form>}
        </td></tr>)}
      </tbody></table></div>
    </section>

    <section className="border rounded-xl p-4 space-y-3"><h2 className="font-semibold">Documentos y correcciones</h2>
      {pack.documents.length === 0 && <p className="text-sm text-muted-foreground">Sin documentos manuales en este mes.</p>}
      {pack.documents.map((d) => <div key={d.id} className="border-t pt-3 text-sm space-y-2"><p>{d.kind} · {d.counterparty} · {d.reference} · asiento {d.journal_entry_id}</p><p className="text-xs text-muted-foreground">{d.evidence} · RCV: {d.tax_verified ? 'verificación manual registrada' : 'no verificado'}</p>
        <form className="flex flex-wrap gap-2" onSubmit={form(async (f) => operate('reverse', { journal_entry_id: d.journal_entry_id, occurred_at: at(f), reason: value(f, 'reason') }))}><input aria-label="Fecha de reversa en Chile" name="date" type="datetime-local" className={input + ' max-w-xs'} required /><input aria-label="Motivo de reversa" name="reason" placeholder="Motivo de reversa" minLength={10} className={input + ' max-w-md'} required /><button className={button} disabled={busy}>Registrar reversa</button></form>
      </div>)}
    </section>

    <section className="border rounded-xl p-4 space-y-3"><h2 className="font-semibold">Aprobar cierre mensual</h2>
      <p className="text-sm text-muted-foreground">Requiere meses anteriores cerrados, cartola completa conciliada, estimaciones reemplazadas y N/C registradas. Compara los saldos externos con los saldos del libro. La aprobación manual conserva el paquete, responsable y versión; no presenta impuestos.</p>
      {activeClose ? <form className="flex gap-2" onSubmit={form(async (f) => operate('reopen', { period, reason: value(f, 'reason') }))}><input className={input} aria-label="Motivo de reapertura" name="reason" minLength={10} placeholder="Motivo de reapertura" required /><button className={button} disabled={busy}>Reabrir mes</button></form> : <form className="grid gap-3 sm:grid-cols-2" onSubmit={form(async (f) => operate('close', { period, bank_opening_cents: amount(f, 'opening'), bank_closing_cents: amount(f, 'closing'), flow_closing_cents: amount(f, 'flow'), bank_evidence: value(f, 'bank_evidence'), flow_evidence: value(f, 'flow_evidence'), rcv_evidence: value(f, 'rcv_evidence'), reason: value(f, 'reason'), reviewed: f.get('reviewed') === 'on' }))}>
        <Field label="Banco inicial de cartola CLP"><input name="opening" className={input} required /></Field><Field label="Banco final de cartola CLP"><input name="closing" className={input} required /></Field>
        <Field label="Flow pendiente según liquidación CLP"><input name="flow" className={input} required /></Field><Field label="Referencia cartola completa"><input name="bank_evidence" className={input} required minLength={3} /></Field>
        <Field label="Referencia saldo / liquidación Flow"><input name="flow_evidence" className={input} required minLength={3} /></Field><Field label="Referencia revisión RCV / N/C"><input name="rcv_evidence" className={input} required minLength={3} /></Field>
        <Field label="Notas del responsable / contador"><input name="reason" className={input} required minLength={10} /></Field><label className="flex gap-2 items-center text-sm"><input name="reviewed" type="checkbox" required />Revisé documentos, saldo de premios, pasivos e impuestos del período</label><button className={button} disabled={busy}>Aprobar y congelar</button>
      </form>}
      <div className="space-y-2">{pack.closes.map((c) => <p key={c.id} className="text-sm">Versión {c.version} · {c.reopened_at ? 'reabierta' : 'cerrada'} · {c.created_at} · <a className="underline" href={`/api/admin/accounting?close=${c.id}`}>Descargar paquete aprobado</a><span className="block text-xs text-muted-foreground break-all">Responsable {c.created_by} · huella {c.digest}</span></p>)}</div>
    </section>
    <section className="border rounded-xl p-4 space-y-3"><h2 className="font-semibold">Balance de comprobación acumulado</h2><p className="text-xs text-muted-foreground">Saldos según naturaleza de cada cuenta; incluye provisiones pendientes. Diario del mes: {pack.lines.length} líneas completas.</p><div className="overflow-auto"><table className="w-full text-sm"><thead><tr>{['Cuenta','Inicial CLP','Debe CLP','Haber CLP','Final CLP'].map((h) => <th key={h} className="p-2 text-left">{h}</th>)}</tr></thead><tbody>{pack.balances.map((b) => <tr key={b.code} className="border-t"><td className="p-2">{b.code} {b.name}</td>{[b.opening_cents,b.debit_cents,b.credit_cents,b.closing_cents].map((n,i) => <td className="p-2 whitespace-nowrap" key={i}>{formatCLP(n)}</td>)}</tr>)}</tbody></table></div></section>
    <details className="border rounded-xl p-4"><summary className="cursor-pointer font-semibold">Historial contable (todos los períodos)</summary><div className="mt-3 space-y-2 text-xs">{pack.audit.slice(-100).reverse().map((a) => <p key={a.id}>#{a.id} · {a.action} · {a.created_at} · responsable {a.actor}</p>)}<p className="text-muted-foreground">Últimas 100 operaciones visibles; el paquete JSON conserva la bitácora completa.</p></div></details>
  </div>
}
