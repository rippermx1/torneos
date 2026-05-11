import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { createClient } from '@/lib/supabase/server'

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const isSignedIn = !!user

  return (
    <>
      <Navbar initialIsSignedIn={isSignedIn} initialHasUserRole={isSignedIn} />
      <main className="flex-1">{children}</main>
      <Footer isSignedIn={isSignedIn} />
    </>
  )
}
