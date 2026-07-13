import type { AdminHealthDashboard } from '@/lib/admin/health'

export type AdminGuidanceKind = 'critical' | 'attention' | 'setup' | 'healthy'

export interface AdminGuidance {
  kind: AdminGuidanceKind
  eyebrow: string
  title: string
  detail: string
  href: string
  actionLabel: string
}

type GuidanceInput = Pick<AdminHealthDashboard, 'issues' | 'metrics'>

export function getAdminGuidance({ issues, metrics }: GuidanceInput): AdminGuidance {
  const criticalIssue = issues.find((issue) => issue.level === 'critical')
  if (criticalIssue) {
    return {
      kind: 'critical',
      eyebrow: 'Haz esto primero',
      title: criticalIssue.title,
      detail: criticalIssue.detail,
      href: criticalIssue.href,
      actionLabel: 'Resolver ahora',
    }
  }

  const attentionIssue = issues[0]
  if (attentionIssue) {
    return {
      kind: 'attention',
      eyebrow: 'Tu prioridad de hoy',
      title: attentionIssue.title,
      detail: attentionIssue.detail,
      href: attentionIssue.href,
      actionLabel: 'Revisar pendiente',
    }
  }

  if (metrics.activeTournaments === 0) {
    return {
      kind: 'setup',
      eyebrow: 'Siguiente paso recomendado',
      title: 'Programa el próximo torneo',
      detail: metrics.playerAccounts === 0
        ? 'El sistema está listo y todavía no hay jugadores. Publicar un torneo es el primer paso para abrir el producto.'
        : 'No hay torneos visibles para los jugadores. Crea o programa uno para mantener el producto activo.',
      href: '/admin/tournaments/new',
      actionLabel: 'Crear torneo',
    }
  }

  if (metrics.playerAccounts === 0) {
    return {
      kind: 'setup',
      eyebrow: 'Siguiente paso recomendado',
      title: 'Monitorea las primeras inscripciones',
      detail: 'Ya existe un torneo disponible, pero aún no hay jugadores registrados. Revisa su ventana y estado desde Torneos.',
      href: '/admin/tournaments',
      actionLabel: 'Ver torneos',
    }
  }

  return {
    kind: 'healthy',
    eyebrow: 'Todo al día',
    title: 'No necesitas intervenir ahora',
    detail: 'No hay alertas ni solicitudes pendientes. Revisa los torneos activos y vuelve a este resumen al iniciar tu próximo turno.',
    href: '/admin/tournaments',
    actionLabel: 'Revisar torneos',
  }
}
