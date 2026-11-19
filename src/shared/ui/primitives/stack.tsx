import type { ReactNode } from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '../../lib/cn'

const stackVariants = cva('flex', {
  variants: {
    direction: { row: 'flex-row', column: 'flex-col' },
    gap: { xs: 'gap-ds-xs', sm: 'gap-ds-sm', md: 'gap-ds-md', lg: 'gap-ds-lg', xl: 'gap-ds-xl' },
    align: { start: 'items-start', center: 'items-center', between: 'items-center justify-between' },
  },
  defaultVariants: { direction: 'column', gap: 'md' },
})

export interface StackProps {
  direction?: 'row' | 'column'
  gap?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  align?: 'start' | 'center' | 'between'
  className?: string
  children: ReactNode
}

export function Stack({ direction, gap, align, className, children }: StackProps) {
  return <div className={cn(stackVariants({ direction, gap, align }), className)}>{children}</div>
}
