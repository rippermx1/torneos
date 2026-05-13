import { flowPost, flowGet } from '@/lib/flow/client'

// ───────────────────────────────────────────────────────────────
// Helpers para reembolsos Flow.
// Spec: /refund/create, /refund/getStatus, /refund/cancel
//
// Flow acredita el monto al email del receptor via su cuenta Flow
// o banco registrado. El proceso es asíncrono: Flow notifica el
// resultado final al urlCallBack.
// ───────────────────────────────────────────────────────────────

export interface CreateFlowRefundParams {
  /** Identificador único del reembolso en el comercio. */
  refundCommerceOrder: string
  /** Email del receptor del reembolso. */
  receiverEmail: string
  /** Monto en pesos CLP enteros. */
  amountPesos: number
  /** URL donde Flow notifica el resultado del reembolso. */
  urlCallBack: string
  /** commerce_order del cobro original (referencia opcional). */
  commerceTrxId?: string
  /** flow_order del cobro original (referencia opcional). */
  flowTrxId?: number
}

export interface FlowRefundResponse {
  token: string
  flowRefundOrder: string
  date: string
  status: string
  amount: number
  fee: number
}

export async function createFlowRefund(
  params: CreateFlowRefundParams
): Promise<FlowRefundResponse> {
  return flowPost<FlowRefundResponse>('/refund/create', {
    refundCommerceOrder: params.refundCommerceOrder,
    receiverEmail: params.receiverEmail,
    amount: params.amountPesos,
    urlCallBack: params.urlCallBack,
    commerceTrxId: params.commerceTrxId,
    flowTrxId: params.flowTrxId,
  })
}

export async function getFlowRefundStatus(token: string): Promise<FlowRefundResponse> {
  return flowGet<FlowRefundResponse>('/refund/getStatus', { token })
}

export async function cancelFlowRefund(token: string): Promise<FlowRefundResponse> {
  return flowPost<FlowRefundResponse>('/refund/cancel', { token })
}
