// ───────────────────────────────────────────────────────────────
// LEGACY: Depósitos a wallet vía Flow han sido eliminados (Ruta 1).
//
// La wallet ya no acepta cargas. Cada inscripción a torneo es un
// cobro Flow individual via /api/tournaments/[id]/checkout/flow/create.
// La wallet sólo retiene premios retirables.
//
// Mantenemos el endpoint para que clientes antiguos reciban un 410
// Gone explícito en lugar de un 404 confuso.
// ───────────────────────────────────────────────────────────────
export async function POST(): Promise<Response> {
  return Response.json(
    {
      error: 'Los depósitos a wallet ya no están disponibles. Inscríbete directamente en el torneo desde su página.',
      code: 'WALLET_DEPOSIT_DEPRECATED',
    },
    { status: 410 }
  )
}
