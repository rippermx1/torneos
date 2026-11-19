import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const PALETTE = /\b(?:bg|text|border|ring|from|to)-(?:red|green|blue|yellow|amber|emerald|zinc|gray|slate|neutral|white|black)(?:-\d{2,3})?\b/
const HEX = /#[0-9a-fA-F]{3,8}\b/
const LITERAL_TEXT_PROP = /\b(?:label|title|placeholder|alt|aria-label)="[^"]*\p{L}/u

function tsxFilesUnder(dir: string): string[] {
  return (readdirSync(dir, { recursive: true }) as string[])
    .filter((file) => file.endsWith('.tsx') && !file.split(path.sep).includes('__tests__'))
    .map((file) => path.join(dir, file))
}

describe('UI audit', () => {
  it('src has no fixed palette colors, hex values or literal text props', () => {
    const offenders = tsxFilesUnder('src').flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      return [PALETTE, HEX, LITERAL_TEXT_PROP].filter((re) => re.test(source)).map((re) => `${file}: ${re}`)
    })
    expect(offenders).toEqual([])
  })
  it('the audit detects each forbidden pattern', () => {
    expect(PALETTE.test('className="bg-green-100"')).toBe(true)
    expect(HEX.test("color: '#ff0000'")).toBe(true)
    expect(LITERAL_TEXT_PROP.test('<img alt="Logo" />')).toBe(true)
  })
})
