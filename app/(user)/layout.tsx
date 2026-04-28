import { Navbar } from '@/components/navbar'
import { TermsBanner } from '@/components/terms-banner'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export default async function UserLayout({ children }: { children: React.ReactNode }) {
  // Verificar si el usuario autenticado ha aceptado los T&C
  // Si no está autenticado, no se muestra el banner (las rutas protegidas
  // ya redirigen a /sign-in desde su propio middleware o server component)
  let showTermsBanner = false
  try {
    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (user) {
      const supabase = createAdminClient()
      const { data: profile } = await supabase
        .from('profiles')
        .select('terms_accepted_at')
        .eq('id', user.id)
        .single()
      showTermsBanner = !profile?.terms_accepted_at
    }
  } catch {
    // No interrumpir el render si falla la consulta de términos
  }

  return (
    <>
      <Navbar />
      <main className={`flex-1 max-w-5xl mx-auto px-4 py-10 w-full ${showTermsBanner ? 'pb-32' : ''}`}>
        {children}
      </main>
      {showTermsBanner && <TermsBanner />}
    </>
  )
}
