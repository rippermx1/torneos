// Opt-in disposable PostgreSQL proof, never a shared/local-stack/cloud DB.
// PowerShell: $env:COMMUNITY_FREE_PG_BIN='C:/torneos/artifacts/2048-adversarial/postgres-portable/pgsql/bin'
// node node_modules/vitest/vitest.mjs run __tests__/community-free-sql.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFile, execFileSync } from 'node:child_process'
import { readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import { randomUUID } from 'node:crypto'

const pgBin = process.env.COMMUNITY_FREE_PG_BIN
describe.skipIf(!pgBin)('community format in a fresh disposable PostgreSQL cluster', () => {
  const cluster = path.resolve('artifacts/community-free-sql', randomUUID())
  let port = 0, started = false
  const binary = (name: string) => path.join(pgBin!, `${name}${process.platform === 'win32' ? '.exe' : ''}`)
  const env = { ...process.env, PSQLRC: '', PGCLIENTENCODING: 'UTF8', PGCONNECT_TIMEOUT: '5',
    PGOPTIONS: '-c statement_timeout=10000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=15000' }
  const command = (name: string, args: string[], input?: string) => execFileSync(binary(name), args,
    { input, encoding: 'utf8', windowsHide: true, timeout: 25_000, env, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] }).trim()
  // Windows daemon descendants keep spawnSync pipe handles open after pg_ctl exits.
  const daemonCommand = (commandArgs: string[]) => new Promise<void>((resolve, reject) => {
    const child = execFile(binary('pg_ctl'), commandArgs, { windowsHide: true, timeout: 25_000, env }, error => error ? reject(error) : resolve())
    child.stdin?.on('error', () => {})
    child.stdin?.end()
  })
  const args = () => ['-X', '-qAt', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose']
  const sql = (statement: string) => command('psql', args(), statement)
  const rejected = (statement: string, reason: string) => {
    let caught = ''
    try { sql(statement) } catch (error) { caught = String((error as { stderr?: unknown }).stderr) }
    expect(caught).toContain(reason)
  }
  const id = () => randomUUID()
  const normal = id(), paid = id(), late = id(), racing = id(), registering = id(), registrationRace = id(), earlyRegistration = id()
  const config = (tournamentId: string, overrides = '') => `INSERT INTO public.tournaments(id,preset_key,business_rule_version,tournament_type,game_type,prize_model,is_test,entry_fee_cents,prize_1st_cents,prize_2nd_cents,prize_3rd_cents,prize_fund_bps,platform_fee_bps,prize_1st_bps,prize_2nd_bps,prize_3rd_bps,min_players,max_players,max_game_duration_seconds,skill_tier,registration_opens_at,play_window_start,play_window_end,status)
    SELECT '${tournamentId}','community_free_v1',4,'freeroll','2048_score','fixed',false,0,0,0,0,5500,4500,7500,2500,0,2,15,300,NULL,clock_timestamp()-interval '3 days',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '23 hours','live' ${overrides};`
  let historical = '', existingGuard = '', v3 = '', registrationRpc = ''

  beforeAll(async () => {
    mkdirSync(path.dirname(cluster), { recursive: true })
    const socket = net.createServer()
    await new Promise<void>((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve) })
    port = (socket.address() as net.AddressInfo).port
    await new Promise<void>((resolve, reject) => socket.close(error => error ? reject(error) : resolve()))
    command('initdb', ['-D', cluster, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C'])
    started = true
    await daemonCommand(['-D', cluster, '-l', cluster + '.log', '-w', '-t', '20', '-o', `-h 127.0.0.1 -p ${port} -c timezone=UTC -c lc_messages=C`, 'start'])
    sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA private;
      CREATE TABLE public.platform_business_rules(version integer PRIMARY KEY,effective_from timestamptz NOT NULL,vat_bps integer NOT NULL CHECK(vat_bps=1900),prize_budget_bps integer NOT NULL,max_total_prize_cents bigint NOT NULL CHECK(max_total_prize_cents>0),max_first_prize_cents bigint NOT NULL CHECK(max_first_prize_cents>0),rewards_enabled boolean NOT NULL,flow_fee_net_bps integer NOT NULL,flow_refund_fee_net_cents bigint NOT NULL,notes text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),min_paid_entry_fee_cents bigint NOT NULL DEFAULT 0,max_capacity_ratio_bps integer NOT NULL DEFAULT 100000,min_contribution_margin_bps integer NOT NULL DEFAULT 1500,monthly_fixed_cost_target_cents bigint NOT NULL DEFAULT 0);
      CREATE TABLE public.tournaments(id uuid PRIMARY KEY,preset_key text NOT NULL DEFAULT 'legacy_v2',business_rule_version integer NOT NULL DEFAULT 3 REFERENCES public.platform_business_rules(version),tournament_type text NOT NULL,game_type text NOT NULL,prize_model text NOT NULL DEFAULT 'fixed',is_test boolean NOT NULL DEFAULT false,entry_fee_cents bigint NOT NULL,prize_1st_cents bigint NOT NULL,prize_2nd_cents bigint NOT NULL,prize_3rd_cents bigint NOT NULL,prize_fund_bps integer NOT NULL,platform_fee_bps integer NOT NULL,prize_1st_bps integer NOT NULL,prize_2nd_bps integer NOT NULL,prize_3rd_bps integer NOT NULL,min_players integer NOT NULL,max_players integer NOT NULL,max_game_duration_seconds integer NOT NULL,skill_tier text,registration_opens_at timestamptz NOT NULL,play_window_start timestamptz NOT NULL,play_window_end timestamptz NOT NULL,status text NOT NULL,
        CONSTRAINT prizes_positive CHECK(prize_1st_cents>0 AND prize_2nd_cents>=0 AND prize_3rd_cents>=0),
        CONSTRAINT bps_valid CHECK(prize_fund_bps+platform_fee_bps=10000 AND prize_1st_bps+prize_2nd_bps+prize_3rd_bps=10000),
        CONSTRAINT registration_before_play CHECK(registration_opens_at<play_window_start),
        CONSTRAINT play_window_valid CHECK(play_window_end>play_window_start));
      CREATE TABLE public.games(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tournament_id uuid NOT NULL REFERENCES public.tournaments(id),user_id uuid NOT NULL,started_at timestamptz,status text NOT NULL DEFAULT 'active',current_board jsonb,UNIQUE(tournament_id,user_id));
      CREATE TABLE public.registrations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tournament_id uuid NOT NULL REFERENCES public.tournaments(id),user_id uuid NOT NULL,entry_fee_cents bigint,prize_fund_contribution_cents bigint,platform_fee_gross_cents bigint,platform_fee_net_cents bigint,platform_fee_iva_cents bigint,prize_model text,accounting_metadata jsonb,UNIQUE(tournament_id,user_id));
      CREATE FUNCTION private.existing_entry_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN IF NEW.user_id='00000000-0000-4000-8000-000000000000' THEN RAISE EXCEPTION 'EXISTING_ENTRY_GUARD'; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER existing_entry_guard BEFORE INSERT OR UPDATE OF user_id ON public.games FOR EACH ROW EXECUTE FUNCTION private.existing_entry_guard();
      GRANT USAGE ON SCHEMA private TO service_role; GRANT SELECT,INSERT,UPDATE ON public.games TO service_role; GRANT SELECT,INSERT ON public.registrations TO service_role; GRANT SELECT,UPDATE ON public.tournaments TO service_role;`)
    // This V3 source was checked against the currently published dev constraint.
    sql(readFileSync('supabase/migrations/20260805181748_governed_tournament_presets_v3.sql', 'utf8'))
    sql(`INSERT INTO public.tournaments VALUES ('${paid}','commercial_v1',3,'standard','2048_score','fixed',false,500000,2475000,825000,0,5500,4500,7500,2500,0,12,15,600,NULL,now()-interval '2 days',now()-interval '1 hour',now()+interval '23 hours','completed');`)
    historical = sql('SELECT row_to_json(t)::text FROM public.tournaments t ORDER BY id;')
    v3 = sql('SELECT row_to_json(r)::text FROM public.platform_business_rules r WHERE version=3;')
    existingGuard = sql("SELECT pg_get_functiondef('private.existing_entry_guard()'::regprocedure);")
    sql(readFileSync('supabase/migrations/20261016161709_community_free_2048_v4.sql', 'utf8'))
    sql(readFileSync('__tests__/fixtures/community-free-registration-baseline.sql', 'utf8'))
    registrationRpc = sql("SELECT pg_get_functiondef('public.register_for_tournament(uuid,uuid,bigint)'::regprocedure);")
    sql(readFileSync('supabase/migrations/20261016163652_guard_community_free_registration_clock.sql', 'utf8'))
    // A single timestamp expression avoids a microsecond difference in the 24h check.
    for (const tournamentId of [normal, late, racing, registering, registrationRace, earlyRegistration]) sql(config(tournamentId).replaceAll('clock_timestamp()', 'statement_timestamp()'))
  }, 60_000)

  afterAll(async () => {
    if (started) {
      await daemonCommand(['-D', cluster, '-m', 'fast', '-w', '-t', '20', 'stop'])
      expect(() => command('pg_ctl', ['-D', cluster, 'status'])).toThrow()
    }
    // Keep the exact owned disposable cluster/log for inspection; no recursive removal.
  })

  it('preserves historical rows, V3/default and an existing guard; introduces only an invoker guard', () => {
    expect(sql(`SELECT row_to_json(t)::text FROM public.tournaments t WHERE id='${paid}';`)).toBe(historical)
    expect(sql('SELECT row_to_json(r)::text FROM public.platform_business_rules r WHERE version=3;')).toBe(v3)
    expect(sql("SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='tournaments' AND column_name='business_rule_version';")).toBe('3')
    expect(sql("SELECT pg_get_functiondef('private.existing_entry_guard()'::regprocedure);")).toBe(existingGuard)
    expect(JSON.parse(sql("SELECT jsonb_build_object('definer',prosecdef,'config',proconfig,'publicExecute',EXISTS(SELECT 1 FROM aclexplode(proacl) WHERE grantee=0 AND privilege_type='EXECUTE')) FROM pg_proc WHERE oid='private.guard_community_free_game_start()'::regprocedure;")))
      .toEqual({ definer: false, config: ['search_path=""'], publicExecute: false })
  })

  it('rejects free-money/test/tier/version/capacity/time mutations and permits legacy V3 formats', () => {
    for (const patch of ["entry_fee_cents=1", "prize_1st_cents=1", "is_test=true", "skill_tier='novato'", 'business_rule_version=3',
      'min_players=1', 'max_players=16', 'max_game_duration_seconds=301', "tournament_type='standard'", "game_type='other'", "play_window_end=play_window_end+interval '1 second'"])
      rejected(`UPDATE public.tournaments SET ${patch} WHERE id='${normal}';`, '23514')
    rejected(`UPDATE public.tournaments SET business_rule_version=4 WHERE id='${paid}';`, '23514')
    rejected(`UPDATE public.tournaments SET prize_1st_cents=0,prize_2nd_cents=0 WHERE id='${paid}';`, '23514')
    expect(sql(`SELECT min_players||':'||max_players||':'||max_game_duration_seconds FROM public.tournaments WHERE id='${normal}';`)).toBe('2:15:300')
  })

  it('uses the DB clock under service_role, preserves one attempt and rejects clock extension', () => {
    const userId = id()
    const result = sql(`SET ROLE service_role; SELECT extract(epoch FROM clock_timestamp())*1000;
      INSERT INTO public.games(tournament_id,user_id,started_at) VALUES('${normal}','${userId}','2099-01-01') RETURNING extract(epoch FROM started_at)*1000;
      SELECT extract(epoch FROM clock_timestamp())*1000;`).split('\n').map(Number)
    expect(result).toHaveLength(3); expect(result[1]).toBeGreaterThanOrEqual(result[0]); expect(result[1]).toBeLessThanOrEqual(result[2])
    const before = sql(`SELECT started_at FROM public.games WHERE tournament_id='${normal}' AND user_id='${userId}';`)
    rejected(`INSERT INTO public.games(tournament_id,user_id) VALUES('${normal}','${userId}');`, '23505')
    rejected(`UPDATE public.games SET started_at=started_at+interval '1 second' WHERE tournament_id='${normal}';`, 'COMMUNITY_STARTED_AT_IMMUTABLE')
    rejected(`UPDATE public.games SET started_at=NULL WHERE tournament_id='${normal}';`, 'COMMUNITY_STARTED_AT_IMMUTABLE')
    sql(`UPDATE public.tournaments SET status='completed',play_window_start=statement_timestamp()-interval '24 hours 1 second',play_window_end=statement_timestamp()-interval '1 second' WHERE id='${normal}';
      UPDATE public.games SET started_at=started_at,status='completed' WHERE tournament_id='${normal}';`)
    expect(sql(`SELECT started_at FROM public.games WHERE tournament_id='${normal}' AND user_id='${userId}';`)).toBe(before)
  })

  it('rejects a direct late INSERT and retains unrelated/previous entry guard behavior', () => {
    sql(`UPDATE public.tournaments SET play_window_start=statement_timestamp()+interval '299 seconds'-interval '24 hours',play_window_end=statement_timestamp()+interval '299 seconds' WHERE id='${late}';`)
    rejected(`INSERT INTO public.games(tournament_id,user_id,started_at) VALUES('${late}','${id()}',now()-interval '1 day');`, 'COMMUNITY_LAST_START_PASSED')
    expect(sql(`SELECT count(*) FROM public.games WHERE tournament_id='${late}';`)).toBe('0')
    rejected(`INSERT INTO public.games(tournament_id,user_id) VALUES('${racing}','00000000-0000-4000-8000-000000000000');`, 'EXISTING_ENTRY_GUARD')
    const prior = '2000-01-01 00:00:00+00'
    expect(sql(`INSERT INTO public.games(tournament_id,user_id,started_at) VALUES('${paid}','${id()}','${prior}') RETURNING started_at;`)).toBe(prior)
  })

  it('rechecks the cutoff after waiting for the tournament lock, closing the TOCTOU gap', async () => {
    sql(`UPDATE public.tournaments SET play_window_start=statement_timestamp()+interval '300.8 seconds'-interval '24 hours',play_window_end=statement_timestamp()+interval '300.8 seconds' WHERE id='${racing}';`)
    let lockOutput = ''
    let held: () => void = () => {}
    const ready = new Promise<void>(resolve => { held = resolve })
    const locker = new Promise<void>((resolve, reject) => {
      const child = execFile(binary('psql'), args(), { encoding: 'utf8', windowsHide: true, timeout: 10_000, env }, error => error ? reject(error) : resolve())
      child.stdout?.on('data', (chunk: string) => { lockOutput += chunk; if (lockOutput.includes('LOCK_HELD')) held() })
      child.stdin?.on('error', () => {})
      child.stdin?.end(`BEGIN; SELECT id FROM public.tournaments WHERE id='${racing}' FOR UPDATE; SELECT 'LOCK_HELD'; SELECT pg_sleep(1.2); COMMIT;`)
    })
    await Promise.race([ready, locker.then(() => { throw new Error('No lock acknowledgment') })])
    rejected(`INSERT INTO public.games(tournament_id,user_id) VALUES('${racing}','${id()}');`, 'COMMUNITY_LAST_START_PASSED')
    await locker
    expect(sql(`SELECT count(*) FROM public.games WHERE tournament_id='${racing}';`)).toBe('0')
  }, 15_000)

  it('accepts on-time registration, preserves the old RPC/paid behavior and uses only an invoker trigger', () => {
    expect(sql("SELECT pg_get_functiondef('public.register_for_tournament(uuid,uuid,bigint)'::regprocedure);")).toBe(registrationRpc)
    expect(JSON.parse(sql("SELECT jsonb_build_object('definer',prosecdef,'config',proconfig,'publicExecute',EXISTS(SELECT 1 FROM aclexplode(proacl) WHERE grantee=0 AND privilege_type='EXECUTE')) FROM pg_proc WHERE oid='private.guard_community_free_registration_clock()'::regprocedure;")))
      .toEqual({ definer: false, config: ['search_path=""'], publicExecute: false })
    sql(`UPDATE public.tournaments SET status='open',registration_opens_at=statement_timestamp()-interval '1 hour',play_window_start=statement_timestamp()+interval '1 hour',play_window_end=statement_timestamp()+interval '25 hours' WHERE id='${registering}';`)
    const registrationId = sql(`SET ROLE service_role; SELECT public.register_for_tournament('${id()}','${registering}',0);`)
    expect(registrationId).toMatch(/^[a-f0-9-]{36}$/)
    expect(sql(`SELECT count(*) FROM public.registrations WHERE tournament_id='${registering}' AND entry_fee_cents=0;`)).toBe('1')
    // The new guard deliberately adds no timing rules to a historical paid row.
    sql(`SET ROLE service_role; INSERT INTO public.registrations(tournament_id,user_id,entry_fee_cents) VALUES('${paid}','${id()}',500000);`)
    expect(sql(`SELECT count(*) FROM public.registrations WHERE tournament_id='${paid}';`)).toBe('1')
  })

  it('rejects direct community registration before opening and outside scheduled/open status', () => {
    sql(`UPDATE public.tournaments SET status='open',registration_opens_at=statement_timestamp()+interval '10 minutes',play_window_start=statement_timestamp()+interval '1 hour',play_window_end=statement_timestamp()+interval '25 hours' WHERE id='${earlyRegistration}';`)
    rejected(`SET ROLE service_role; INSERT INTO public.registrations(tournament_id,user_id,entry_fee_cents) VALUES('${earlyRegistration}','${id()}',0);`, 'Inscripciones cerradas')
    for (const status of ['live', 'cancelled']) {
      sql(`UPDATE public.tournaments SET status='${status}' WHERE id='${registering}';`)
      rejected(`SET ROLE service_role; INSERT INTO public.registrations(tournament_id,user_id,entry_fee_cents) VALUES('${registering}','${id()}',0);`, 'PT409')
    }
  })

  it('rejects legacy-RPC registration that crosses the start while waiting for its lock', async () => {
    sql(`UPDATE public.tournaments SET status='open',registration_opens_at=statement_timestamp()-interval '1 hour',play_window_start=statement_timestamp()+interval '0.8 seconds',play_window_end=statement_timestamp()+interval '24 hours 0.8 seconds' WHERE id='${registrationRace}';`)
    let lockOutput = ''
    let held: () => void = () => {}
    const ready = new Promise<void>(resolve => { held = resolve })
    const locker = new Promise<void>((resolve, reject) => {
      const child = execFile(binary('psql'), args(), { encoding: 'utf8', windowsHide: true, timeout: 10_000, env }, error => error ? reject(error) : resolve())
      child.stdout?.on('data', (chunk: string) => { lockOutput += chunk; if (lockOutput.includes('LOCK_HELD')) held() })
      child.stdin?.on('error', () => {})
      child.stdin?.end(`BEGIN; SELECT id FROM public.tournaments WHERE id='${registrationRace}' FOR UPDATE; SELECT 'LOCK_HELD'; SELECT pg_sleep(1.2); COMMIT;`)
    })
    await Promise.race([ready, locker.then(() => { throw new Error('No lock acknowledgment') })])
    rejected(`SET ROLE service_role; SELECT public.register_for_tournament('${id()}','${registrationRace}',0);`, 'PT409')
    await locker
    expect(sql(`SELECT count(*) FROM public.registrations WHERE tournament_id='${registrationRace}';`)).toBe('0')
  }, 15_000)
})
