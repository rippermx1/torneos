import type { ReactNode } from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '../../lib/cn'

const cardVariants = cva('flex flex-col gap-ds-lg rounded-ds-lg border border-ds-border bg-ds-surface p-ds-xl', {
  variants: {
    interactive: {
      true: 'transition-colors hover:border-ds-text/40 hover:bg-ds-surface-muted/20',
      false: '',
    },
  },
  defaultVariants: { interactive: false },
})

export interface CardProps {
  as?: 'article' | 'div'
  interactive?: boolean
  className?: string
  children: ReactNode
}

export function Card({ as: Element = 'div', interactive, className, children }: CardProps) {
  return <Element className={cn(cardVariants({ interactive }), className)}>{children}</Element>
}
