import { createAdminClient } from '@/lib/supabase/server'
import { requireAdminMfaForApi } from '@/lib/supabase/admin-mfa'
import { CashInputError, parseCashCLP } from '@/lib/cash/model'
import { storeCashProof } from '@/lib/cash/proof-storage'

const uuid = (value: string) => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)
export async function POST(req: Request) {
  const auth = await requireAdminMfaForApi()
  if (!auth.ok) return auth.response
  const form = await req.formData().catch(() => null)
  if (!form) return Response.json({ error: 'Formulario inválido' }, { status: 400 })
  const text = (name: string) => typeof form.get(name) === 'string' ? String(form.get(name)).trim() : ''
  const note = text('note'), id = text('id'), action = text('action')
  if (note.length < 10 || note.length > 2000 || !uuid(id)) return Response.json({ error: 'Identificador y justificación de 10 a 2000 caracteres requeridos' }, { status: 400 })
  const admin = createAdminClient(), p_actor = auth.access.userId, p_note = note, p_id = id
  const money = (key: string) => parseCashCLP(form.get(key))
  const date = (key: string) => { const value = text(key); if (!/^\d{4}-\d{2}-\d{2}T.+(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new CashInputError('Fecha con zona horaria requerida'); return new Date(value).toISOString() }
  let result
  try {
    switch (action) {
      case 'policy': {
        if (!['true', 'false'].includes(text('paused'))) throw new CashInputError('Selecciona el estado de los cobros')
        result = await admin.rpc('set_cash_policy', { p_actor, p_note, p_paused: text('paused') === 'true', p_max_exposure: money('max'), p_additional_reserve: money('reserve') }); break
      }
      case 'record': {
        const kind = text('kind'), amount = money('amount'), occurred = date('date'), reference = text('reference')
        if (!['funding', 'flow_settlement', 'tax_payment', 'operating_expense', 'chargeback'].includes(kind) || amount <= 0 || reference.length < 3 || reference.length > 120) throw new CashInputError('Movimiento inválido')
        const proof = await storeCashProof(admin, id, form.get('proof'))
        result = await admin.rpc('record_cash_movement', { p_id, p_actor, p_note, p_kind: kind, p_amount: amount, p_reference: reference, p_occurred_at: occurred, p_proof: proof }); break
      }
      case 'flow_fees': result = await admin.rpc('correct_flow_fee_difference', { p_id, p_actor, p_note }); break
      case 'reject': result = await admin.rpc('reject_cash_movement', { p_id, p_actor, p_note }); break
      case 'approve': result = await admin.rpc('approve_cash_movement', { p_id, p_actor, p_note }); break
      case 'capture': {
        const observed = date('date'), bank = money('bank'), held = money('held'), flow = money('flow'), flowHeld = money('flowHeld')
        if (held > bank || flowHeld > flow) throw new CashInputError('Retención mayor al saldo total')
        const bankProof = await storeCashProof(admin, id, form.get('proof')), flowProof = await storeCashProof(admin, id, form.get('flowProof'))
        result = await admin.rpc('capture_cash_reconciliation', { p_id, p_actor, p_note, p_observed_at: observed, p_bank: bank, p_bank_held: held, p_flow: flow, p_flow_held: flowHeld, p_bank_proof: bankProof, p_flow_proof: flowProof }); break
      }
      case 'review': {
        if (!['approved', 'rejected'].includes(text('decision'))) throw new CashInputError('Decisión inválida')
        result = await admin.rpc('review_cash_reconciliation', { p_id, p_actor, p_note, p_decision: text('decision') }); break
      }
      case 'difference': {
        const replacement = text('replacement'), assignee = text('assignee')
        if (replacement ? !uuid(replacement) : !uuid(assignee)) throw new CashInputError('Responsable o nuevo corte aprobado requerido')
        result = await admin.rpc('manage_cash_difference', { p_id, p_actor, p_note, p_assignee: replacement ? null : assignee, p_due_at: replacement ? null : date('due'), p_replacement: replacement || null }); break
      }
      default: return Response.json({ error: 'Acción inválida' }, { status: 400 })
    }
  } catch (error) {
    // Uploaded objects are retained even if the database response is lost.
    return Response.json({ error: error instanceof CashInputError ? error.message : 'Resultado incierto: consulta el historial y reintenta con el mismo identificador y evidencia.' }, { status: error instanceof CashInputError ? 400 : 503 })
  }
  if (result.error) {
    const status = /^PT(400|403|404|409|422|423)$/.test(result.error.code) ? Number(result.error.code.slice(2)) : result.error.code === '23505' ? 409 : 503
    return Response.json({ error: status === 503 ? 'Resultado incierto: consulta el historial y reintenta con el mismo identificador y evidencia.' : result.error.message }, { status })
  }
  return Response.json({ ok: true, id })
}
