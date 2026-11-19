import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const eslint = new ESLint({ cwd: process.cwd() })
async function rules(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.map((m) => m.ruleId)
}

// The first lintText loads the whole ESLint config; under a parallel suite that exceeds 5 s.
describe('architecture rules', { timeout: 30_000 }, () => {
  it('shared cannot import a business layer', async () => {
    expect(await rules("import { a } from '@entities/challenge'\nexport const b = a\n", 'src/shared/lib/sample.ts')).toContain('no-restricted-imports')
  })
  it('a slice cannot import a slice of its own layer', async () => {
    expect(await rules("import { a } from '@entities/organization'\nexport const b = a\n", 'src/entities/challenge/domain/sample.ts')).toContain('no-restricted-imports')
  })
  it('upper layers use only the public API of lower slices', async () => {
    expect(await rules("import { a } from '@entities/challenge/domain/availability'\nexport const b = a\n", 'src/features/join/model/sample.ts')).toContain('no-restricted-imports')
    expect(await rules("import { a } from '@entities/challenge'\nexport const b = a\n", 'src/features/join/model/sample.ts')).not.toContain('no-restricted-imports')
  })
  it('domain code stays framework-free', async () => {
    for (const source of ["import { useState } from 'react'", "import { createClient } from '@supabase/supabase-js'", "import { repo } from '../infrastructure/repo'"]) {
      expect(await rules(`${source}\nexport const x = 0\n`, 'src/entities/challenge/domain/sample.ts')).toContain('no-restricted-imports')
    }
  })
  it('flags magic numbers outside config segments', async () => {
    // no-magic-numbers never reports a const declaration; the literal must sit in an expression.
    expect(await rules('export const pages = (n: number) => n * 240\n', 'src/features/play/model/sample.ts')).toContain('no-magic-numbers')
    expect(await rules('export const pages = (n: number) => n * 240\n', 'src/features/play/config/sample.ts')).not.toContain('no-magic-numbers')
  })
  it('flags literal text in JSX', async () => {
    expect(await rules('export const A = () => <p>Hola</p>\n', 'src/widgets/x/ui/sample.tsx')).toContain('react/jsx-no-literals')
  })
})
