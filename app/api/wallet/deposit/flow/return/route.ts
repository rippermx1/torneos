import { readFlowToken, settleFlowPayment } from '@/lib/flow/settlement'

export async function POST(req: Request): Promise<Response> {
  return handleFlowReturn(req)
}

export async function GET(req: Request): Promise<Response> {
  return handleFlowReturn(req)
}

async function handleFlowReturn(req: Request): Promise<Response> {
  const redirectUrl = new URL('/wallet', req.url)
  const token = await readFlowToken(req)

  if (!token) {
    redirectUrl.searchParams.set('deposit', 'failure')
    return Response.redirect(redirectUrl, 303)
  }

  try {
    const { status } = await settleFlowPayment(token)
    redirectUrl.searchParams.set('deposit', mapFlowStatusToDepositStatus(status.status))
  } catch (err) {
    console.error('Error procesando retorno Flow:', err)
    redirectUrl.searchParams.set('deposit', 'flow_return')
  }

  return Response.redirect(redirectUrl, 303)
}

function mapFlowStatusToDepositStatus(status: number) {
  if (status === 2) return 'success'
  if (status === 3 || status === 4) return 'failure'
  return 'pending'
}
