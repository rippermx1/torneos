import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const mocks = vi.hoisted(() => ({ single: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({ from: () => ({
  select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mocks.single }) }) }),
}) }) }))
import TournamentReturnPage from '@/app/(public)/tournaments/[id]/return/page'

describe('tournament payment return', () => {
  it.each(['paid', 'credited', 'pending', 'rejected'])('reflects authoritative attempt status %s', async (status) => {
    mocks.single.mockResolvedValue({ data: { status, charged_amount_cents: 500000 } })
    const result = await TournamentReturnPage({ params: Promise.resolve({ id: 'test-tournament' }), searchParams: Promise.resolve({ token: 'test-token' }) })
    const html = renderToStaticMarkup(result)
    expect(html.includes('¡Inscripción confirmada!')).toBe(status === 'paid' || status === 'credited')
    expect(html.includes('Pago no completado')).toBe(status === 'rejected')
  })
})
