// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Badge, Text, KeyValueGrid, ActionLink } from '@shared/ui'

afterEach(cleanup)

describe('design system primitives', () => {
  it('maps badge tones to semantic tokens', () => {
    render(<Badge tone="success">{'ok'}</Badge>)
    expect(screen.getByText('ok').className).toContain('bg-ds-success-surface')
  })
  it('renders text with the requested element', () => {
    render(<Text as="h2" variant="title">{'Título'}</Text>)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Título')
  })
  it('renders key/value pairs as a description list', () => {
    render(<KeyValueGrid items={[{ id: 'fee', label: 'Inscripción', value: 'Gratis' }]} />)
    expect(screen.getByText('Inscripción').tagName).toBe('DT')
    expect(screen.getByText('Gratis').tagName).toBe('DD')
  })
  it('links to the given href', () => {
    render(<ActionLink href="/t/1">{'Ver'}</ActionLink>)
    expect(screen.getByRole('link').getAttribute('href')).toBe('/t/1')
  })
})
