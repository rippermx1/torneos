import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { GameBoard } from '@/components/game/game-board'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Práctica — Torneos 2048',
}

export default async function PlayPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Modo práctica</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Partida libre sin torneo. Úsala para practicar antes de inscribirte a un torneo competitivo.
        </p>
      </div>

      <GameBoard />
    </div>
  )
}
