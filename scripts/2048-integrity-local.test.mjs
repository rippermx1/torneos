import test from 'node:test'
import assert from 'node:assert/strict'
import { assertLocalTarget, migrationSources, migrationTransaction, transactionBody } from './2048-integrity-local.mjs'

const local = { TORNEOS_LOCAL_MODE: '1', CONFIRM_SUPABASE_PROJECT_REF: 'local', APP_URL: 'http://127.0.0.1:3081',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' }
test('rejects cloud, preview, alternate ports and missing local markers before any operation', () => {
  assert.doesNotThrow(() => assertLocalTarget(local))
  for (const [key, value] of [['TORNEOS_LOCAL_MODE', '0'], ['CONFIRM_SUPABASE_PROJECT_REF', 'remote'],
    ['APP_URL', 'http://127.0.0.1:3083'], ['NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co'],
    ['NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:59999']]) {
    assert.throws(() => assertLocalTarget({ ...local, [key]: value }))
  }
})
test('two reviewed migration files have unchanged evidence hashes and one outer commit', async () => {
  const sources = await migrationSources()
  assert.equal(sources.length, 2)
  const statement = migrationTransaction(sources)
  // Source copies in the ledger are dollar-quoted data, not executable commits.
  const executable = statement.replace(/\$g2048_source\$[\s\S]*?\$g2048_source\$/g, "'source'")
  assert.equal([...executable.matchAll(/^BEGIN;/gm)].length, 1)
  assert.equal([...executable.matchAll(/^COMMIT;/gm)].length, 1)
  assert.ok(executable.includes("NOTIFY pgrst,'reload schema'"))
  assert.equal([...executable.matchAll(/INSERT INTO supabase_migrations.schema_migrations/g)].length, 2)
})
test('transaction extraction preserves PL/pgSQL BEGIN blocks but rejects unexpected commits', () => {
  const source = 'BEGIN;\nCREATE FUNCTION f() AS $$\nBEGIN\nRETURN 1;\nEND $$;\nCOMMIT;\n'
  assert.ok(transactionBody(source).includes('BEGIN\nRETURN'))
  assert.throws(() => transactionBody('DO $$ BEGIN; SELECT 1; END $$;\n COMMIT;'))
})
