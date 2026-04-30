import { flowGet, flowPost } from '@/lib/flow/client'

// ───────────────────────────────────────────────────────────────
// Helpers de alto nivel para pagos Flow.
// Spec: payment/create, payment/getStatus
//
// Flow trabaja en pesos enteros (no centavos) cuando la moneda es CLP.
// La conversión cents -> pesos vive aquí para que el resto del código
// no tenga que pensarlo.
// ───────────────────────────────────────────────────────────────

export interface CreateFlowPaymentParams {
  commerceOrder: string
  subject: string
  /** Monto total en pesos CLP enteros. */
  amount: number
  email: string
  urlConfirmation: string
  urlReturn: string
  /** Datos opcionales que Flow nos devolverá en getStatus. */
  optional?: Record<string, string>
  /** Segundos hasta que la orden expira. */
  timeout?: number
  /** Identificador de medio de pago Flow. 9 = todos los medios. */
  paymentMethod?: number
  currency?: 'CLP' | 'UF'
}

export interface CreateFlowPaymentResponse {
  url: string
  token: string
  flowOrder: number
}

export async function createFlowPayment(
  params: CreateFlowPaymentParams
): Promise<CreateFlowPaymentResponse> {
  return flowPost<CreateFlowPaymentResponse>('/payment/create', {
    commerceOrder: params.commerceOrder,
    subject: params.subject,
    currency: params.currency ?? 'CLP',
    amount: params.amount,
    email: params.email,
    paymentMethod: params.paymentMethod ?? 9,
    urlConfirmation: params.urlConfirmation,
    urlReturn: params.urlReturn,
    optional: params.optional ? JSON.stringify(params.optional) : undefined,
    timeout: params.timeout,
  })
}

/**
 * Estados de pago en Flow:
 * 1 = pendiente, 2 = pagado, 3 = rechazado, 4 = anulado.
 */
export type FlowPaymentStatusCode = 1 | 2 | 3 | 4

export interface FlowPaymentStatus {
  flowOrder: number
  commerceOrder: string
  requestDate: string
  status: FlowPaymentStatusCode
  subject: string
  currency: string
  amount: number
  payer: string
  paymentData?: {
    date?: string
    media?: string
    conversionDate?: string
    conversionRate?: number
    amount?: number
    currency?: string
    fee?: number
    balance?: number
    transferDate?: string
  }
  optional?: string | Record<string, string>
  pending_info?: {
    media?: string
    date?: string
  }
  merchantId?: string
}

export async function getFlowPaymentStatus(token: string): Promise<FlowPaymentStatus> {
  return flowGet<FlowPaymentStatus>('/payment/getStatus', { token })
}

/**
 * Construye la URL de redirección al checkout Flow concatenando el
 * url + "?token=" + token tal como indica la spec.
 */
export function buildFlowCheckoutUrl(response: CreateFlowPaymentResponse): string {
  return `${response.url}?token=${response.token}`
}
