// Opt-in PostgreSQL policy proof in a NEW owned disposable cluster, never a
// shared/local-stack/cloud database. No Storage HTTP call or document upload.
// PowerShell: $env:FREE_2048_KYC_PG_BIN='C:/torneos/artifacts/2048-adversarial/postgres-portable/pgsql/bin'
// node node_modules/vitest/vitest.mjs run __tests__/2048-free-kyc-storage-sql.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFile, execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import { randomUUID } from 'node:crypto'

const pgBin = process.env.FREE_2048_KYC_PG_BIN
const migration = 'supabase/migrations/20261021130028_block_free_release_kyc_storage_capture.sql'

describe.skipIf(!pgBin)('free-release KYC capture in disposable PostgreSQL', () => {
  const cluster = path.resolve('artifacts/free-2048-kyc-storage-sql', randomUUID())
  const owner = '00000000-0000-4000-8000-000000000001'
  const binary = (name: string) => path.join(pgBin!, `${name}${process.platform === 'win32' ? '.exe' : ''}`)
  const env = {
    ...process.env, PSQLRC: '', PGCLIENTENCODING: 'UTF8', PGCONNECT_TIMEOUT: '5',
    PGOPTIONS: '-c statement_timeout=10000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=15000',
  }
  let port = 0, started = false
  let previousPolicies = '', previousAcl = '', previousBuckets = '', previousRows = ''
  const command = (name: string, args: string[], input?: string) => execFileSync(binary(name), args, {
    input, encoding: 'utf8', windowsHide: true, timeout: 25_000, env,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
  }).trim()
  // pg_ctl's Windows daemon descendants retain synchronous pipe handles.
  const daemon = (args: string[]) => new Promise<void>((resolve, reject) => {
    const child = execFile(binary('pg_ctl'), args, { windowsHide: true, timeout: 25_000, env },
      error => error ? reject(error) : resolve())
    child.stdin?.on('error', () => {})
    child.stdin?.end()
  })
  const sql = (statement: string) => command('psql', ['-X', '-qAt', '-h', '127.0.0.1', '-p', String(port),
    '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'], statement)
  // These fixture settings model the existing role/session/account checks;
  // this test does not claim to exercise Supabase Auth or Storage's HTTP layer.
  const as = (role: 'anon' | 'authenticated' | 'service_role', statement: string, live = true) => sql(`
    BEGIN; SET LOCAL ROLE ${role};
    SET LOCAL "request.jwt.claim.sub" = '${owner}';
    SET LOCAL "fixture.session_live" = '${live}';
    SET LOCAL "fixture.account_active" = 'true';
    SET LOCAL "fixture.user_role" = 'true';
    ${statement}
    COMMIT;`)
  const denied = (role: 'anon' | 'authenticated', statement: string, live = true) => {
    let stderr = ''
    try { as(role, statement, live) } catch (error) { stderr = String((error as { stderr?: unknown }).stderr) }
    expect(stderr).toContain('42501')
    expect(stderr).toContain('row-level security')
  }
  const futurePermissive = (work: () => void) => {
    sql(`CREATE POLICY fixture_future_allow ON storage.objects FOR ALL TO anon,authenticated USING (true) WITH CHECK (true);`)
    try { work() } finally { sql('DROP POLICY fixture_future_allow ON storage.objects;') }
  }
  const policies = () => sql(`SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY policyname),'[]'::jsonb)
    FROM pg_policies p WHERE schemaname='storage' AND tablename='objects'
      AND policyname NOT LIKE 'free_2048_kyc_no_client_%';`)
  const rows = () => sql('SELECT jsonb_agg(to_jsonb(o) ORDER BY bucket_id,name) FROM storage.objects o;')

  beforeAll(async () => {
    mkdirSync(path.dirname(cluster), { recursive: true })
    const socket = net.createServer()
    await new Promise<void>((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve) })
    port = (socket.address() as net.AddressInfo).port
    await new Promise<void>((resolve, reject) => socket.close(error => error ? reject(error) : resolve()))
    command('initdb', ['-D', cluster, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C'])
    await daemon(['-D', cluster, '-l', cluster + '.log', '-w', '-t', '20', '-o', `-h 127.0.0.1 -p ${port} -c timezone=UTC -c lc_messages=C`, 'start'])
    started = true
    sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE SCHEMA private; CREATE SCHEMA storage;
      CREATE TYPE public.app_role AS ENUM ('user','admin','owner');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE FUNCTION private.current_user_has_role(public.app_role) RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT $1='user' AND coalesce(current_setting('fixture.user_role',true),'false')::boolean $$;
      CREATE FUNCTION private.current_session_live() RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT coalesce(current_setting('fixture.session_live',true),'false')::boolean $$;
      CREATE FUNCTION private.current_account_active() RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT private.current_session_live() AND coalesce(current_setting('fixture.account_active',true),'false')::boolean $$;
      CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
        SELECT string_to_array($1,'/') $$;
      CREATE TABLE storage.buckets(id text PRIMARY KEY,public boolean NOT NULL,file_size_limit bigint,allowed_mime_types text[]);
      CREATE TABLE storage.objects(bucket_id text NOT NULL REFERENCES storage.buckets(id),name text NOT NULL,owner_id uuid,metadata jsonb NOT NULL DEFAULT '{}',PRIMARY KEY(bucket_id,name));
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA storage,auth,private TO anon,authenticated,service_role;
      GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon,authenticated,service_role;
      INSERT INTO storage.buckets VALUES ('kyc-documents',false,10485760,ARRAY['image/jpeg','image/png','image/webp','application/pdf']),
        ('cash-proofs',false,6291456,ARRAY['application/pdf']),('data-responses',false,4194304,ARRAY['application/json']);
      INSERT INTO storage.objects VALUES ('kyc-documents','${owner}/historical-front.pdf','${owner}','{"fixture":true}'),
        ('cash-proofs','${owner}/historical-other.pdf','${owner}','{"fixture":true}');
      CREATE POLICY "Usuario sube sus documentos KYC" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
        bucket_id='kyc-documents' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text AND private.current_user_has_role('user'::public.app_role));
      CREATE POLICY rm14_storage_live_session ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
        USING (private.current_session_live()) WITH CHECK (private.current_account_active());`)
    // First prove the legacy own-folder path can capture before the migration.
    as('authenticated', `INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES ('kyc-documents','${owner}/before-migration.pdf','${owner}');`)
    expect(as('authenticated', 'SELECT count(*) FROM storage.objects;')).toBe('0')
    previousPolicies = policies()
    previousAcl = sql("SELECT relacl::text FROM pg_class WHERE oid='storage.objects'::regclass;")
    previousBuckets = sql('SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM storage.buckets b;')
    previousRows = rows()
    sql(readFileSync(migration, 'utf8'))
  }, 60_000)

  afterAll(async () => {
    if (started) {
      await daemon(['-D', cluster, '-m', 'fast', '-w', '-t', '20', 'stop'])
      expect(() => command('pg_ctl', ['-D', cluster, 'status'])).toThrow()
    }
    // Retain this owned cluster/log as evidence; no deletion of shared resources.
  })

  it('adds only two restrictive write policies and preserves existing policies, ACLs, buckets and historical rows', () => {
    expect(policies()).toBe(previousPolicies)
    expect(sql("SELECT relacl::text FROM pg_class WHERE oid='storage.objects'::regclass;")).toBe(previousAcl)
    expect(sql('SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM storage.buckets b;')).toBe(previousBuckets)
    expect(rows()).toBe(previousRows)
    const added = JSON.parse(sql(`SELECT jsonb_agg(jsonb_build_object('name',policyname,'mode',permissive,'roles',roles,'command',cmd,'using',qual,'check',with_check) ORDER BY policyname)
      FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'free_2048_kyc_no_client_%';`))
    expect(added).toEqual([
      { name: 'free_2048_kyc_no_client_insert', mode: 'RESTRICTIVE', roles: ['anon', 'authenticated'], command: 'INSERT', using: null, check: "(bucket_id <> 'kyc-documents'::text)" },
      { name: 'free_2048_kyc_no_client_update', mode: 'RESTRICTIVE', roles: ['anon', 'authenticated'], command: 'UPDATE', using: null, check: "(bucket_id <> 'kyc-documents'::text)" },
    ])
  })

  it('rejects the previously allowed authenticated own-folder INSERT and anonymous INSERT', () => {
    for (const role of ['anon', 'authenticated'] as const) {
      denied(role, `INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES ('kyc-documents','${owner}/after-${role}.pdf','${owner}');`)
    }
    expect(rows()).toBe(previousRows)
  })

  it('keeps KYC INSERT denied even after a permissive policy allows both ordinary roles', () => futurePermissive(() => {
    for (const role of ['anon', 'authenticated'] as const) {
      denied(role, `INSERT INTO storage.objects(bucket_id,name) VALUES ('kyc-documents','${owner}/future-${role}.pdf');`)
    }
    expect(rows()).toBe(previousRows)
  }))

  it('rejects ordinary replacements, upserts and moves into KYC despite a permissive UPDATE policy', () => futurePermissive(() => {
    for (const role of ['anon', 'authenticated'] as const) {
      denied(role, `UPDATE storage.objects SET metadata='{"changed":true}' WHERE bucket_id='kyc-documents' AND name='${owner}/historical-front.pdf';`)
      denied(role, `UPDATE storage.objects SET bucket_id='kyc-documents' WHERE bucket_id='cash-proofs' AND name='${owner}/historical-other.pdf';`)
      denied(role, `INSERT INTO storage.objects(bucket_id,name,metadata) VALUES ('kyc-documents','${owner}/historical-front.pdf','{"changed":true}')
        ON CONFLICT(bucket_id,name) DO UPDATE SET metadata=EXCLUDED.metadata;`)
    }
    expect(rows()).toBe(previousRows)
  }))

  it('preserves both deny-by-default behavior and otherwise permitted writes to other buckets', () => {
    denied('authenticated', `INSERT INTO storage.objects(bucket_id,name) VALUES ('cash-proofs','${owner}/not-permitted.pdf');`)
    futurePermissive(() => {
      for (const role of ['anon', 'authenticated'] as const) {
        as(role, `INSERT INTO storage.objects(bucket_id,name) VALUES ('cash-proofs','${owner}/allowed-${role}.pdf');
          UPDATE storage.objects SET metadata='{"updated":true}' WHERE bucket_id='cash-proofs' AND name='${owner}/allowed-${role}.pdf';
          INSERT INTO storage.objects(bucket_id,name,metadata) VALUES ('cash-proofs','${owner}/allowed-${role}.pdf','{"upserted":true}')
            ON CONFLICT(bucket_id,name) DO UPDATE SET metadata=EXCLUDED.metadata;
          UPDATE storage.objects SET bucket_id='data-responses' WHERE bucket_id='cash-proofs' AND name='${owner}/allowed-${role}.pdf';
          DELETE FROM storage.objects WHERE bucket_id='data-responses' AND name='${owner}/allowed-${role}.pdf';`)
      }
    })
    expect(rows()).toBe(previousRows)
  })

  it('does not weaken the existing RM14 live-session restriction on any other bucket', () => futurePermissive(() => {
    denied('authenticated', `INSERT INTO storage.objects(bucket_id,name) VALUES ('cash-proofs','${owner}/revoked.pdf');`, false)
    expect(as('authenticated', 'SELECT count(*) FROM storage.objects;', false)).toBe('0')
    expect(rows()).toBe(previousRows)
  }))

  it('leaves historical visibility unchanged and does not grant ordinary SELECT or DELETE', () => {
    expect(as('authenticated', 'SELECT count(*) FROM storage.objects;')).toBe('0')
    expect(as('anon', 'SELECT count(*) FROM storage.objects;')).toBe('0')
    expect(as('service_role', "SELECT count(*) FROM storage.objects WHERE bucket_id='kyc-documents';")).toBe('2')
    as('authenticated', "DELETE FROM storage.objects WHERE bucket_id='kyc-documents';")
    expect(rows()).toBe(previousRows)
    futurePermissive(() => {
      // A permitted historical SELECT still works; the new policies add no read restriction.
      expect(as('authenticated', "SELECT count(*) FROM storage.objects WHERE bucket_id='kyc-documents';")).toBe('2')
      expect(as('anon', "SELECT count(*) FROM storage.objects WHERE bucket_id='kyc-documents';")).toBe('2')
    })
  })

  it('preserves trusted server privileges without granting them to ordinary clients', () => {
    as('service_role', `INSERT INTO storage.objects(bucket_id,name) VALUES ('kyc-documents','${owner}/trusted-fixture.pdf');
      UPDATE storage.objects SET metadata='{"trusted":true}' WHERE bucket_id='kyc-documents' AND name='${owner}/trusted-fixture.pdf';
      DELETE FROM storage.objects WHERE bucket_id='kyc-documents' AND name='${owner}/trusted-fixture.pdf';`)
    expect(rows()).toBe(previousRows)
    expect(sql("SELECT rolname||':'||rolbypassrls FROM pg_roles WHERE rolname IN ('anon','authenticated') ORDER BY rolname;").split(/\r?\n/))
      .toEqual(['anon:false', 'authenticated:false'])
  })
})
