import { randomUUID, randomInt, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, writeFile, rename, readdir } from 'node:fs/promises'
import path from 'node:path'
import { signParams } from '@/lib/flow/client'
import type { FlowPaymentStatus } from '@/lib/flow/payments'
import type { FlowRefundResponse } from '@/lib/flow/refunds'
import { isLocalEnvironment } from './local-environment'

type Payment = FlowPaymentStatus & { token: string; urlConfirmation: string; urlReturn: string }
type Refund = FlowRefundResponse & { refundCommerceOrder: string }
const tokenPattern = /^[a-f0-9-]{36}$/

export function requireLocalFlow() {
  if (!isLocalEnvironment()) throw new Error('Simulador local deshabilitado')
  const provider = new URL(process.env.FLOW_API_BASE ?? '')
  if (provider.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(provider.hostname) ||
      provider.pathname !== '/api/local-flow') throw new Error('Proveedor local inválido')
  if (!process.env.FLOW_API_KEY || !process.env.FLOW_API_SECRET) throw new Error('Faltan claves locales')
}

export function verifyLocalFlowSignature(params: Record<string, string>) {
  requireLocalFlow()
  const signature = params.s ?? ''
  const expected = signParams(params, process.env.FLOW_API_SECRET!)
  return params.apiKey === process.env.FLOW_API_KEY && /^[a-f0-9]{64}$/.test(signature) &&
    timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))
}

function stateFile(kind: 'payment' | 'refund', token: string) {
  requireLocalFlow()
  if (!tokenPattern.test(token)) throw new Error('Token inválido')
  return path.join(process.env.LOCAL_FLOW_DATA_DIR ?? '.local-flow', `${kind}-${token}.json`)
}

async function persist(kind: 'payment' | 'refund', data: Payment | Refund) {
  const file = stateFile(kind, data.token)
  await mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.${randomUUID()}.tmp`
  await writeFile(temporary, JSON.stringify(data), { mode: 0o600 })
  await rename(temporary, file)
}

export async function readLocalPayment(token: string): Promise<Payment> {
  return JSON.parse(await readFile(stateFile('payment', token), 'utf8')) as Payment
}

function localReturn(value: string, callback = false) {
  const url = new URL(value)
  if (url.origin !== new URL(process.env.APP_URL!).origin || url.username || url.password ||
      (callback ? !['/api/webhooks/flow', '/api/webhooks/flow/refund'].includes(url.pathname) :
        !/^\/tournaments\/[a-f0-9-]{36}\/return$/.test(url.pathname))) {
    throw new Error('Destino inválido')
  }
  return url.toString()
}

function amount(value: string) {
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result < 1 || result > 100_000_000) throw new Error('Monto inválido')
  return result
}

export async function handleLocalFlow(endpoint: string, params: Record<string, string>) {
  if (!verifyLocalFlowSignature(params)) return Response.json({ message: 'Firma inválida' }, { status: 403 })
  if (endpoint === 'payment/create') {
    if (params.currency !== 'CLP' || !params.commerceOrder || params.commerceOrder.length > 128) throw new Error('Orden inválida')
    const payment: Payment = {
      token: randomUUID(), flowOrder: randomInt(1, 281_474_976_710_655), commerceOrder: params.commerceOrder,
      requestDate: new Date().toISOString(), status: 1, subject: params.subject.slice(0, 200),
      currency: 'CLP', amount: amount(params.amount), payer: params.email,
      urlConfirmation: localReturn(params.urlConfirmation, true), urlReturn: localReturn(params.urlReturn),
    }
    await persist('payment', payment)
    return Response.json({ token: payment.token, flowOrder: payment.flowOrder, url: `${process.env.APP_URL}/dev/flow/payment` })
  }
  if (endpoint === 'payment/getStatus') return Response.json(await readLocalPayment(params.token))
  if (endpoint === 'refund/create') {
    localReturn(params.urlCallBack, true)
    const files = await readdir(/* turbopackIgnore: true */ process.env.LOCAL_FLOW_DATA_DIR ?? '.local-flow')
    let original: Payment | undefined
    for (const file of files.filter((name) => /^payment-[a-f0-9-]{36}\.json$/.test(name))) {
      const payment = await readLocalPayment(file.slice(8, -5))
      if ((params.flowTrxId && String(payment.flowOrder) === params.flowTrxId) ||
          (params.commerceTrxId && payment.commerceOrder === params.commerceTrxId)) { original = payment; break }
    }
    if (!original || original.status !== 2 || amount(params.amount) > original.amount) throw new Error('Reembolso inválido')
    const refund: Refund = {
      token: randomUUID(), flowRefundOrder: `local-${randomUUID()}`, date: new Date().toISOString(),
      status: 'completed', amount: amount(params.amount), fee: 0, refundCommerceOrder: params.refundCommerceOrder,
    }
    // Reconciliation consumes this final provider state after the application stores its refund.
    await persist('refund', refund)
    return Response.json({ ...refund, status: 'pending' })
  }
  if (endpoint === 'refund/getStatus' || endpoint === 'refund/cancel') {
    const refund = JSON.parse(await readFile(stateFile('refund', params.token), 'utf8')) as Refund
    // A completed refund is terminal; cancellation cannot undo it.
    return Response.json(refund)
  }
  return Response.json({ message: 'Operación no implementada' }, { status: 404 })
}

const paymentLocks = new Map<string, Promise<unknown>>()
export async function confirmLocalPayment(token: string, status: 2 | 3 | 4) {
  // One app container owns this store; serialize terminal transitions for the same checkout.
  const previous = paymentLocks.get(token) ?? Promise.resolve()
  const operation = previous.catch(() => {}).then(() => confirmPayment(token, status))
  paymentLocks.set(token, operation)
  try { return await operation } finally { if (paymentLocks.get(token) === operation) paymentLocks.delete(token) }
}

async function confirmPayment(token: string, status: 2 | 3 | 4) {
  const payment = await readLocalPayment(token)
  if (payment.status !== 1 && payment.status !== status) throw new Error('El pago ya tiene un resultado definitivo')
  payment.status = status
  if (status === 2) payment.paymentData = {
    date: new Date().toISOString(), media: 'Simulador local', amount: payment.amount, currency: 'CLP',
    fee: 0, balance: payment.amount,
  }
  await persist('payment', payment)
  const callback = new URL(payment.urlConfirmation)
  const internal = new URL(callback.pathname, `http://127.0.0.1:${process.env.PORT ?? '3000'}`)
  const response = await fetch(internal, {
    method: 'POST', body: new URLSearchParams({ token }), signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error('La confirmación no terminó; reintenta el mismo pago sin crear otro')
  const destination = new URL(payment.urlReturn)
  destination.searchParams.set('token', token)
  return destination
}
