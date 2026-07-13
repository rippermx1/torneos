import { describe, expect, it } from 'vitest'
import { getAdminGuidance } from '@/lib/admin/guidance'
import type { AdminHealthDashboard } from '@/lib/admin/health'

type GuidanceInput = Pick<AdminHealthDashboard, 'issues' | 'metrics'>

function dashboard(overrides: Partial<GuidanceInput> = {}): GuidanceInput {
  return {
    issues: [],
    metrics: {
      playerAccounts: 3,
      registrationsLast7Days: 2,
      activeTournaments: 1,
    },
    ...overrides,
  }
}

describe('getAdminGuidance', () => {
  it('prioriza una alerta crítica por encima de cualquier otra tarea', () => {
    const result = getAdminGuidance(dashboard({
      issues: [
        { level: 'attention', title: 'Revisar KYC', detail: 'Hay una identidad pendiente.', href: '/admin/users' },
        { level: 'critical', title: 'Reembolso fallido', detail: 'Flow rechazó la devolución.', href: '/admin/refunds' },
      ],
    }))

    expect(result).toMatchObject({ kind: 'critical', title: 'Reembolso fallido', href: '/admin/refunds' })
  })

  it('muestra primero una tarea humana cuando no hay alertas críticas', () => {
    const result = getAdminGuidance(dashboard({
      issues: [
        { level: 'attention', title: 'Revisar KYC', detail: 'Hay una identidad pendiente.', href: '/admin/users' },
      ],
    }))

    expect(result).toMatchObject({ kind: 'attention', href: '/admin/users' })
  })

  it('guía a crear el primer torneo si el sistema está vacío', () => {
    const result = getAdminGuidance(dashboard({
      metrics: {
        playerAccounts: 0,
        registrationsLast7Days: 0,
        activeTournaments: 0,
      },
    }))

    expect(result).toMatchObject({ kind: 'setup', href: '/admin/tournaments/new' })
  })

  it('confirma que no hace falta intervenir cuando todo está activo y al día', () => {
    expect(getAdminGuidance(dashboard())).toMatchObject({ kind: 'healthy' })
  })
})
