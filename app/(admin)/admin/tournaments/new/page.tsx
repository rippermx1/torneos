import { requireAdminMfa } from '@/lib/supabase/admin-mfa'
import { createGovernedTournament } from '@/lib/tournament/create-tournament'
import { formatDateTimeLocalInput, parseDateTimeLocalToIso } from '@/lib/utils'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { SkillTier } from '@/types/database'
import { TournamentPresetForm } from '@/components/admin/tournament-preset-form'

async function createTournament(formData: FormData) {
  'use server'
  const { userId } = await requireAdminMfa()
  const rawTier = formData.get('skill_tier')
  const skillTier: SkillTier | null = rawTier === 'novato' || rawTier === 'intermedio' || rawTier === 'pro' ? rawTier : null
  const { tournamentId } = await createGovernedTournament({ name: String(formData.get('name') ?? ''),
    description: String(formData.get('description') ?? ''), presetKey: String(formData.get('preset_key') ?? ''), skillTier,
    registrationOpensAt: parseDateTimeLocalToIso(String(formData.get('registration_opens_at') ?? '')),
    playWindowStart: parseDateTimeLocalToIso(String(formData.get('play_window_start') ?? '')),
    playWindowEnd: parseDateTimeLocalToIso(String(formData.get('play_window_end') ?? '')) }, userId)
  redirect(`/tournaments/${tournamentId}`)
}

export default function NewTournamentPage() {
  const registrationOpens = new Date()
  registrationOpens.setMinutes(registrationOpens.getMinutes() + 5, 0, 0)
  const start = new Date(registrationOpens)
  start.setHours(start.getHours() + 1)
  const end = new Date(start)
  end.setHours(end.getHours() + 24)

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/tournaments" className="text-sm text-muted-foreground hover:text-foreground">
          ← Torneos
        </Link>
        <h1 className="text-2xl font-bold">Crear torneo</h1>
      </div>
      <TournamentPresetForm
        action={createTournament}
        registrationOpensAt={formatDateTimeLocalInput(registrationOpens)}
        playWindowStart={formatDateTimeLocalInput(start)}
        playWindowEnd={formatDateTimeLocalInput(end)}
      />
    </div>
  )
}
