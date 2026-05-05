import { createAdminClient } from '@/lib/supabase/server'
import { getFlowPaymentStatus, type FlowPaymentStatus } from '@/lib/flow/payments'

export interface FlowSettlement {
  status: FlowPaymentStatus
  credited: boolean
}

export async function settleFlowPayment(token: string): Promise<FlowSettlement> {
  const status = await getFlowPaymentStatus(token)
  const admin = createAdminClient()

  if (status.status !== 2) {
    if (status.status === 3 || status.status === 4) {
      await admin.rpc('wallet_mark_flow_attempt_failed', {
        p_commerce_order: status.commerceOrder,
        p_flow_token: token,
        p_flow_status_code: status.status,
        p_raw: status as unknown as Record<string, unknown>,
      })
    }

    return { status, credited: false }
  }

  const amountCents = Math.round(status.amount * 100)
  const { error } = await admin.rpc('wallet_credit_flow_payment', {
    p_commerce_order: status.commerceOrder,
    p_flow_token: token,
    p_flow_order: status.flowOrder,
    p_amount_cents: amountCents,
    p_payment_method: status.paymentData?.media ?? null,
    p_payer_email: status.payer ?? null,
    p_raw: status as unknown as Record<string, unknown>,
  })

  if (error) {
    const message = error.message ?? ''
    if (
      message.includes('duplicate key') ||
      message.includes('idx_wallet_unique_flow_token')
    ) {
      return { status, credited: true }
    }
    throw new Error(error.message)
  }

  return { status, credited: true }
}

export async function readFlowToken(req: Request): Promise<string | null> {
  const url = new URL(req.url)
  const queryToken = url.searchParams.get('token')
  if (queryToken) return queryToken

  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const text = await req.text()
    return new URLSearchParams(text).get('token')
  }

  if (contentType.includes('application/json')) {
    try {
      const body = (await req.json()) as { token?: string }
      return body.token ?? null
    } catch {
      return null
    }
  }

  try {
    const text = await req.text()
    return new URLSearchParams(text).get('token')
  } catch {
    return null
  }
}
