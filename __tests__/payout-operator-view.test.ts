import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
import { PayoutActions } from '@/components/admin/payout-actions'
import { PayoutCompletionForm } from '@/components/admin/payout-completion-form'

describe('operator instructions reflect persisted payout authorization', () => {
  it('initial claim button identifies responsibility without implying approval', () => {
    const html = renderToStaticMarkup(createElement(PayoutActions, { requestId: 'fixture' }))
    expect(html).toContain('Reclamar como operador responsable')
    expect(html).not.toContain('Autorizar pago')
  })
  it('claimant cannot use the second approval button', () => {
    const html = renderToStaticMarkup(createElement(PayoutActions, { requestId: 'fixture', claimed: true, canApprove: false }))
    expect(html).toContain('Esperando segundo operador'); expect(html).toContain('disabled')
  })
  it.each(['transferring', 'reconciling'])('reloaded %s cannot instruct another transfer', status => {
    const html = renderToStaticMarkup(createElement(PayoutCompletionForm, { requestId: 'fixture', status, canTransfer: true, canReconcile: false }))
    expect(html).toContain('no vuelvas a transferir')
    expect(html).not.toContain('Obtener autorización e iniciar transferencia')
    expect(html).not.toContain('Banco confirma pago')
    expect(html).not.toContain('Cancelar antes de transferir')
  })
  it('independent operator can record bank facts without new transfer permission', () => {
    const html = renderToStaticMarkup(createElement(PayoutCompletionForm, { requestId: 'fixture', status: 'reconciling', canTransfer: false, canReconcile: true }))
    expect(html).toContain('Banco confirma pago'); expect(html).toContain('Banco confirma que no se envió')
    expect(html).not.toContain('Obtener autorización e iniciar transferencia')
  })
})
