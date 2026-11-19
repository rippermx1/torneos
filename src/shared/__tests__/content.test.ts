import { describe, expect, it } from 'vitest'
import { interpolate, MissingContentValueError, mergeContent, getContent } from '@shared/content'

describe('content', () => {
  it('interpolates named values, repeated and numeric', () => {
    expect(interpolate('{a} y {a}: {n}', { a: 'x', n: 3 })).toBe('x y x: 3')
  })
  it('refuses to render a template with a missing value', () => {
    expect(() => interpolate('Desde: {date}', {})).toThrow(MissingContentValueError)
  })
  it('merges only known text leaves without mutating the base', () => {
    const base = { title: 'A', nested: { cta: 'B' } }
    const merged = mergeContent(base, { title: 'Z', nested: { cta: 7, extra: 'no' }, unknown: 'no' })
    expect(merged).toEqual({ title: 'Z', nested: { cta: 'B' } })
    expect(base.title).toBe('A')
  })
  it('loads typed content and applies overrides', () => {
    expect(getContent('common').appName).toBe('TorneosPlay')
    expect(getContent('common', { appName: 'Marca' }).appName).toBe('Marca')
  })
})
