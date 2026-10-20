import {describe, expect, it} from 'vitest'
import {readFactory3dEvent} from '../factory-3d'
const build = 'factory-empire-3d-001'
const ready = {channel: 'torneos.factory-empire', version: 2, build, type: 'ready', payload: ''}
describe('Factory 3D persistent practice bridge', () => {
  it('accepts correlated readiness and save/error status', () => {
    expect(readFactory3dEvent(ready, build)).toEqual({type: 'ready', payload: ''})
    expect(readFactory3dEvent({...ready, type: 'saved', payload: '123'}, build)?.type).toBe('saved')
    expect(readFactory3dEvent({...ready, type: 'error', payload: 'Cuota excedida'}, build)?.payload).toBe('Cuota excedida')
  })
  it.each([{version: 1}, {build: 'factory-empire-014'}, {channel: 'another'}, {type: 'submitScore'}, {payload: {}}, {payload: 'x'.repeat(2049)}])('rejects incompatible or oversized messages: %j', patch => {
    expect(readFactory3dEvent({...ready, ...patch}, build)).toBeNull()
  })
  it('rejects missing data', () => {expect(readFactory3dEvent(null, build)).toBeNull()})
})
