export async function POST(): Promise<Response> {
  return Response.json(
    {
      error: 'Las recargas a wallet ya no están disponibles. Inscríbete directamente en el torneo desde su página.',
      code: 'WALLET_DEPOSIT_DEPRECATED',
    },
    { status: 410 }
  )
}
