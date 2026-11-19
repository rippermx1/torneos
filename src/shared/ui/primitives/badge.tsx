import type { ReactNode } from 'react'
import { cva } from 'class-variance-authority'

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand'

const badgeVariants = cva('inline-block rounded-full px-2.5 py-1 text-xs font-medium', {
  variants: {
    tone: {
      neutral: 'bg-ds-surface-muted text-ds-text-muted',
      success: 'bg-ds-success-surface text-ds-success-text',
      warning: 'bg-ds-warning-surface text-ds-warning-text',
      danger: 'bg-ds-danger-surface text-ds-danger-text',
      info: 'bg-ds-info-surface text-ds-info-text',
      brand: 'bg-ds-brand text-ds-brand-contrast',
    },
  },
})

export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return <span className={badgeVariants({ tone })}>{children}</span>
}
