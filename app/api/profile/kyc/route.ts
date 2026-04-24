import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(req: Request): Promise<Response> {
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })
  const userId = user.id

  let body: {
    full_name?: string
    rut?: string
    birth_date?: string
    phone?: string
    city?: string
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { full_name, rut, birth_date, phone, city } = body

  if (!rut?.trim())        return Response.json({ error: 'RUT obligatorio' }, { status: 400 })
  if (!full_name?.trim())  return Response.json({ error: 'Nombre obligatorio' }, { status: 400 })
  if (!birth_date)         return Response.json({ error: 'Fecha de nacimiento obligatoria' }, { status: 400 })
  if (!phone?.trim())      return Response.json({ error: 'Teléfono obligatorio' }, { status: 400 })
  if (!city?.trim())       return Response.json({ error: 'Ciudad obligatoria' }, { status: 400 })

  // Validar mayoría de edad (18 años)
  const birth = new Date(birth_date)
  const cutoff = new Date()
  cutoff.setFullYear(cutoff.getFullYear() - 18)
  if (birth > cutoff) {
    return Response.json({ error: 'Debes ser mayor de 18 años para participar.' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: full_name.trim(),
      rut: rut.trim(),
      birth_date,
      phone: phone.trim(),
      city: city.trim(),
      // Solo pasar a pending si no estaba approved (no revertir una aprobación ya dada)
      kyc_status: 'pending',
      kyc_verified_at: null,
    })
    .eq('id', userId)
    .neq('kyc_status', 'approved') // guard: no degradar un approved

  if (error) {
    return Response.json({ error: `Error guardando datos: ${error.message}` }, { status: 500 })
  }

  return Response.json({ ok: true })
}
