import { Navbar } from '@/components/navbar'
import { TermsBanner } from '@/components/terms-banner'
import { createAdminClient } from '@/lib/supabase/server'
import { requireUserRole } from '@/lib/supabase/auth'

export default async function UserLayout({ children }: { children: React.ReactNode }) {
  const access = await requireUserRole()

  // Verificar si el usuario autenticado ha aceptado los T&C
  let showTermsBanner = false
  try {
    const supabase = createAdminClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('terms_accepted_at')
      .eq('id', access.userId)
      .single()
    showTermsBanner = !profile?.terms_accepted_at
  } catch {
    // No interrumpir el render si falla la consulta de términos
  }

  return (
    <>
      <Navbar initialIsSignedIn initialHasUserRole />
      <main className={`flex-1 max-w-5xl mx-auto px-4 py-10 w-full ${showTermsBanner ? 'pb-32' : ''}`}>
        {children}
      </main>
      {showTermsBanner && <TermsBanner />}
    </>
  )
}
