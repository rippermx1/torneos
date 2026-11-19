import type { ReactNode } from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '../../lib/cn'

const textVariants = cva('', {
  variants: {
    variant: {
      display: 'text-3xl font-bold',
      title: 'text-lg font-semibold leading-tight break-words',
      body: 'text-sm',
      caption: 'text-xs',
    },
    tone: {
      default: 'text-ds-text',
      muted: 'text-ds-text-muted',
      brand: 'text-ds-brand',
    },
  },
  defaultVariants: { variant: 'body', tone: 'default' },
})

export interface TextProps {
  as?: 'p' | 'span' | 'h1' | 'h2' | 'h3'
  variant?: 'display' | 'title' | 'body' | 'caption'
  tone?: 'default' | 'muted' | 'brand'
  className?: string
  children: ReactNode
}

export function Text({ as: Element = 'p', variant, tone, className, children }: TextProps) {
  return <Element className={cn(textVariants({ variant, tone }), className)}>{children}</Element>
}
