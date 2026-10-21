import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('next/link', () => ({ default: 'a' }))
import { TermsBanner } from '@/components/terms-banner'
import { CURRENT_TERMS_VERSION } from '@/lib/legal/terms'

it('asks existing accounts to review the same free conditions and privacy without soliciting financial participation', () => {
  const html = renderToStaticMarkup(createElement(TermsBanner))
  expect(html).toContain('Condiciones de 2048 gratuito')
  expect(html).toContain(CURRENT_TERMS_VERSION)
  expect(html).toContain('href="/legal/terminos"')
  expect(html).toContain('href="/legal/privacidad"')
  expect(html).toContain('ticket informativo sin compra disponible')
  expect(html).not.toContain('condiciones de pago y retiro')
  expect(html).not.toContain('Para inscribirte en torneos')
  expect(html).not.toContain('/profile/kyc')
})
