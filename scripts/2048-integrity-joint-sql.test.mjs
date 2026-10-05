// Exercise the actual integration transaction on disposable native PostgreSQL.
// No Docker, Supabase Auth, linked project or operating database is substituted.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import net from 'node:net'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { migrationSources, migrationTransaction } from './2048-integrity-local.mjs'

const bin = path.resolve(process.env.G2048_PG_BIN ?? 'artifacts/2048-adversarial/postgres-portable/pgsql/bin')
const suffix = process.platform === 'win32' ? '.exe' : ''
let available = true
try { await fs.access(path.join(bin, `postgres${suffix}`)) } catch { available = false }
test('joint integration transaction in real disposable PostgreSQL', { skip: !available }, async t => {
  const dir = path.resolve('artifacts/2048-integrity-integration', `joint-pg-${randomUUID()}`)
  await fs.mkdir(path.dirname(dir), { recursive: true })
  const run = (program, args, input) => spawnSync(path.join(bin, program + suffix), args,
    { input, windowsHide: true, timeout: 40000, encoding: 'utf8',
      // Postmaster must not retain the launcher's captured pipe handles on Windows.
      ...(program === 'pg_ctl' ? { stdio: 'ignore' } : {}) })
  const listener = net.createServer()
  await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve) })
  const port = listener.address().port
  await new Promise(resolve => listener.close(resolve))
  let started = false
  try {
    assert.equal(run('initdb', ['-D', dir, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C']).status, 0)
    assert.equal(run('pg_ctl', ['-D', dir, '-l', `${dir}.log`, '-w', '-t', '30', '-o', `-h 127.0.0.1 -p ${port} -c lc_messages=C`, 'start']).status, 0)
    started = true
    const sql = input => run('psql', ['-X', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres',
      '-v', 'ON_ERROR_STOP=1', '-tA'], input)
    const ok = input => { const result = sql(input); assert.equal(result.status, 0, result.stderr); return result.stdout.trim() }
    ok(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA supabase_migrations;
      CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[]);
      CREATE TABLE profiles(id uuid PRIMARY KEY,is_admin boolean DEFAULT false,is_banned boolean DEFAULT false,kyc_status text DEFAULT 'pending',rut text);
      CREATE TABLE tournaments(id uuid PRIMARY KEY,status text DEFAULT 'live',game_type text DEFAULT '2048_score',
        play_window_start timestamptz DEFAULT now()-interval '1 hour',play_window_end timestamptz DEFAULT now()+interval '1 hour',max_game_duration_seconds int DEFAULT 600);
      CREATE TABLE games(id uuid PRIMARY KEY,tournament_id uuid REFERENCES tournaments,user_id uuid REFERENCES profiles,seed text DEFAULT 'private-seed',status text DEFAULT 'active',
        final_score bigint DEFAULT 0,highest_tile int DEFAULT 2,move_count int DEFAULT 0,current_board jsonb,started_at timestamptz DEFAULT now(),ended_at timestamptz,end_reason text);
      CREATE TABLE game_moves(game_id uuid REFERENCES games,move_number int,direction text,board_before jsonb,board_after jsonb,
        score_gained int,spawned_tile jsonb,client_timestamp bigint,server_timestamp timestamptz DEFAULT now(),UNIQUE(game_id,move_number));
      GRANT SELECT ON games TO PUBLIC,anon,authenticated,service_role;
      GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO service_role;
      INSERT INTO profiles(id) VALUES('11111111-1111-4111-8111-111111111111');
      INSERT INTO tournaments(id) VALUES('22222222-2222-4222-8222-222222222222');
      INSERT INTO games(id,tournament_id,user_id) VALUES('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111');`)
    const sources = await migrationSources()
    const snapshot = () => ok(`SELECT row_to_json(p)::text FROM profiles p; SELECT row_to_json(t)::text FROM tournaments t; SELECT row_to_json(g)::text FROM games g;`)
    const before = snapshot()
    await t.test('failure in second migration rolls back first grants and both ledger versions', () => {
      const failure = sql(migrationTransaction([sources[0], { ...sources[1], source: sources[1].source + '\nSELECT 1/0;' }]))
      assert.notEqual(failure.status, 0)
      assert.equal(ok("SELECT has_column_privilege('authenticated','games','seed','SELECT');"), 't')
      assert.equal(ok('SELECT count(*) FROM supabase_migrations.schema_migrations;'), '0')
      assert.equal(ok("SELECT to_regnamespace('integrity_private') IS NULL;"), 't')
      assert.equal(snapshot(), before)
    })
    await t.test('successful joint application preserves existing rows and registers exactly two versions', () => {
      ok(migrationTransaction(sources)); assert.equal(snapshot(), before)
      assert.equal(ok('SELECT count(*) FROM supabase_migrations.schema_migrations;'), '2')
    })
    await t.test('browser seed access removed while safe state and service seed access remain', () => {
      assert.equal(ok("SELECT has_column_privilege('authenticated','games','seed','SELECT');"), 'f')
      assert.equal(ok("SELECT has_column_privilege('anon','games','seed','SELECT');"), 'f')
      assert.equal(ok("SELECT has_column_privilege('authenticated','games','current_board','SELECT');"), 't')
      assert.equal(ok("SELECT has_column_privilege('service_role','games','seed','SELECT');"), 't')
    })
    await t.test('review RPCs and completion guard installed with service-only permissions', () => {
      for (const signature of ['inspect_2048_integrity(uuid)', 'resolve_2048_integrity(uuid,text,uuid,text)',
        'set_2048_account_sanction(uuid,boolean,text,uuid)']) {
        assert.equal(ok(`SELECT has_function_privilege('authenticated','${signature}','EXECUTE');`), 'f')
        assert.equal(ok(`SELECT has_function_privilege('service_role','${signature}','EXECUTE');`), 't')
      }
      assert.equal(ok("SELECT count(*) FROM pg_trigger WHERE tgname='guard_2048_finalization' AND tgenabled='O';"), '1')
      assert.equal(ok("SELECT has_schema_privilege('authenticated','integrity_private','USAGE');"), 'f')
    })
  } finally {
    if (started) assert.equal(run('pg_ctl', ['-D', dir, '-m', 'fast', '-w', 'stop']).status, 0, 'Own isolated cluster failed to stop')
  }
})
