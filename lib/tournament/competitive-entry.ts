import type { createAdminClient } from '@/lib/supabase/server'

export function competitiveEntryErrorResponse(error: { code?: string } | null): Response | null {
  if (error?.code === 'PT402') {
    return Response.json({ error: 'No se pudo confirmar el pago de tu inscripción.',
      code: 'ENTRY_PAYMENT_REQUIRED', paymentRequired: true }, { status: 402 })
  }
  if (error?.code === 'PT403') {
    return Response.json({ error: 'Tu inscripción o elegibilidad ya no permiten competir.',
      code: 'ENTRY_INELIGIBLE' }, { status: 403 })
  }
  return null
}

// Require affirmative DB authorization. Browser registration rows and stale
// sessions cannot attest payment, current eligibility or registration ownership.
export async function requireCompetitiveEntry(
  supabase: ReturnType<typeof createAdminClient>, userId: string, tournamentId: string,
): Promise<Response | null> {
  try {
    const { data, error } = await supabase.rpc('authorize_competitive_entry', {
      p_user_id: userId, p_tournament_id: tournamentId,
    })
    if (!error && data === true) return null
    const denial = competitiveEntryErrorResponse(error)
    if (denial) return denial
  } catch {
    // Network failure or missing migration never authorizes a mutation.
  }
  return Response.json({ error: 'No se pudo comprobar la autorización de tu inscripción.',
    code: 'ENTRY_AUTHORIZATION_UNAVAILABLE' }, { status: 503 })
}
