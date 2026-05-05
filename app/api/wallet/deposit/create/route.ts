export async function POST(): Promise<Response> {
  return Response.json(
    {
      error: 'Mercado Pago está deshabilitado temporalmente. Usa Flow para recargar saldo.',
    },
    { status: 410 }
  )
}
