// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { getContent } from '@shared/content'
import { ChallengeCard, toChallengeCardViewModel } from '../index'
import { challenge, opens } from './fixtures'

afterEach(cleanup)

describe('ChallengeCard', () => {
  it('renders the view model without adding text of its own', () => {
    const viewModel = toChallengeCardViewModel({ challenge, now: opens, content: getContent('challenge-card'), href: '/tournaments/x' })
    render(<ChallengeCard viewModel={viewModel} />)
    expect(screen.getByRole('link').getAttribute('href')).toBe('/tournaments/x')
    expect(screen.getByText('Inscripciones abiertas')).toBeTruthy()
    expect(screen.getByRole('heading').textContent).toBe(challenge.name)
    const rendered = screen.getByRole('link').textContent ?? ''
    const fromViewModel = [viewModel.gameLabel, viewModel.availability.label, viewModel.title,
      ...viewModel.facts.flatMap((fact) => [fact.label, fact.value]), ...viewModel.schedule,
      viewModel.capacity, viewModel.minimum, viewModel.cta].join('')
    expect(rendered).toBe(fromViewModel)
  })
})
