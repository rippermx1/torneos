import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { Personal2048ProgressView, Practice2048ResultProgress } from '@/components/game/2048-personal-progress'
import type { Practice2048Snapshot } from '../practice-2048-experience'

const progress: Practice2048Snapshot = { version: 1, rulesVersion: '2048-practice-v1', storageStatus: 'ready',
  bestScore: 1024, bestTile: 128, history: [], bestBefore: 64, currentPracticeId: null }
it('shows an honest result when storage is unavailable and another tab has a higher mark', () => {
  const html = renderToStaticMarkup(createElement(Practice2048ResultProgress, { progress: { ...progress, storageStatus: 'unavailable' }, score: 500 }))
  expect(html).toContain('no se pudo guardar')
  expect(html).not.toContain('Guardado en este navegador')
  expect(html).not.toContain('Nueva marca personal')
  expect(html).not.toContain('Igualaste')
  expect(html).toContain('528 puntos')
})
it('distinguishes the current practice from a saved practice with unknown closure', () => {
  const html = renderToStaticMarkup(createElement(Personal2048ProgressView, { onExport: () => {}, progress: { ...progress,
    currentPracticeId: 'current', history: [
      { practiceId: 'old', startedAt: 1000, updatedAt: 1001, score: 64, highestTile: 16, moves: 10, rulesVersion: progress.rulesVersion, assisted: false, status: 'active' },
      { practiceId: 'current', startedAt: 2000, updatedAt: 2001, score: 128, highestTile: 32, moves: 20, rulesVersion: progress.rulesVersion, assisted: false, status: 'active' },
    ] } }))
  expect(html).toContain('Sin cierre registrado')
  expect(html).toContain('En curso')
  expect(html).toContain('no identifica personas')
})
