import type { ReactNode } from 'react'
import Link from 'next/link'
import { cva } from 'class-variance-authority'
import { cn } from '../../lib/cn'

const actionLinkVariants = cva('focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-text', {
  variants: {
    variant: {
      inline: 'text-sm font-semibold underline underline-offset-4',
      block: 'block h-full rounded-ds-lg',
    },
  },
  defaultVariants: { variant: 'inline' },
})

export interface ActionLinkProps {
  href: string
  variant?: 'inline' | 'block'
  className?: string
  children: ReactNode
}

export function ActionLink({ href, variant, className, children }: ActionLinkProps) {
  return <Link href={href} className={cn(actionLinkVariants({ variant }), className)}>{children}</Link>
}
