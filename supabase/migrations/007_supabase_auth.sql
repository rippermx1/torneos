-- ============================================================
-- Migración 007: Alinear schema de usuarios con Supabase Auth
-- - Convertir referencias de usuario text -> uuid sin borrar datos
-- - Restaurar políticas RLS usando auth.uid() como uuid
-- - Crear/backfillear profiles desde auth.users
-- - Instalar trigger on_auth_user_created
-- ============================================================
BEGIN;

-- ── 0. Validar que los IDs actuales se pueden convertir a uuid ─
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id IS NOT NULL AND id !~ '^[0-9a-fA-F-]{36}$') THEN
    RAISE EXCEPTION 'profiles.id contiene valores no convertibles a uuid';
  END IF;

  IF EXISTS (SELECT 1 FROM public.wallet_transactions WHERE user_id IS NOT NULL AND user_id !~ '^[0-9a-fA-F-]{36}$') THEN
    RAISE EXCEPTION 'wallet_transactions.user_id contiene valores no convertibles a uuid';
  END IF;

  IF EXISTS (SELECT 1 FROM public.tournaments WHERE created_by IS NOT NULL AND created_by !~ '^[0-9a-fA-F-]{36}$') THEN
    RAISE EXCEPTION 'tournaments.created_by contiene valores no convertibles a uuid';
  END IF;

  IF EXISTS (SELECT 1 FROM public.registrations WHERE user_id IS NOT NULL AND user_id !~ '^[0-9a-fA-F-]{36}$') THEN
    RAISE EXCEPTION 'registrations.user_id contiene valores no convertibles a uuid';
  END IF;

  IF EXISTS (SELECT 1 FROM public.games WHERE user_id IS NOT NULL AND user_id !~ '^[0-9a-fA-F-]{36}$') THEN
    RAISE EXCEPTION 'games.user_id contiene valores no convertibles a uuid';
  END IF;

  IF EXISTS (SELECT 1 FROM public.tournament_results WHERE user_id IS NOT NULL AND user_id !~ '^[0-9a-fA-F-]{36}$') THEN
    RAISE EXCEPTION 'tournament_results.user_id contiene valores no convertibles a uuid';
  END IF;

  IF EXISTS (SELECT 1 FROM public.withdrawal_requests WHERE user_id IS NOT NULL AND user_id !~ '^[0-9a-fA-F-]{36}$') THEN
    RAISE EXCEPTION 'withdrawal_requests.user_id contiene valores no convertibles a uuid';
  END IF;

  IF EXISTS (SELECT 1 FROM public.withdrawal_requests WHERE reviewed_by IS NOT NULL AND reviewed_by !~ '^[0-9a-fA-F-]{36}$') THEN
    RAISE EXCEPTION 'withdrawal_requests.reviewed_by contiene valores no convertibles a uuid';
  END IF;

  IF EXISTS (SELECT 1 FROM public.disputes WHERE user_id IS NOT NULL AND user_id !~ '^[0-9a-fA-F-]{36}$') THEN
    RAISE EXCEPTION 'disputes.user_id contiene valores no convertibles a uuid';
  END IF;

  IF EXISTS (SELECT 1 FROM public.disputes WHERE resolved_by IS NOT NULL AND resolved_by !~ '^[0-9a-fA-F-]{36}$') THEN
    RAISE EXCEPTION 'disputes.resolved_by contiene valores no convertibles a uuid';
  END IF;
END;
$$;

-- ── 1. Drop políticas RLS ─────────────────────────────────────
DROP POLICY IF EXISTS "Usuario ve su propio perfil"       ON profiles;
DROP POLICY IF EXISTS "Usuario edita su propio perfil"    ON profiles;
DROP POLICY IF EXISTS "Admin ve todos los perfiles"       ON profiles;
DROP POLICY IF EXISTS "Usuario ve sus transacciones"      ON wallet_transactions;
DROP POLICY IF EXISTS "Admin ve todas las transacciones"  ON wallet_transactions;
DROP POLICY IF EXISTS "Usuario ve sus inscripciones"      ON registrations;
DROP POLICY IF EXISTS "Cualquiera ve conteo por torneo"   ON registrations;
DROP POLICY IF EXISTS "Usuario se inscribe"               ON registrations;
DROP POLICY IF EXISTS "Usuario ve sus partidas"           ON games;
DROP POLICY IF EXISTS "Admin ve todas las partidas"       ON games;
DROP POLICY IF EXISTS "Usuario ve sus movimientos"        ON game_moves;
DROP POLICY IF EXISTS "Admin ve todos los movimientos"    ON game_moves;
DROP POLICY IF EXISTS "Solo admin crea torneos"           ON tournaments;
DROP POLICY IF EXISTS "Solo admin actualiza torneos"      ON tournaments;
DROP POLICY IF EXISTS "Usuario ve sus retiros"            ON withdrawal_requests;
DROP POLICY IF EXISTS "Admin ve todos los retiros"        ON withdrawal_requests;
DROP POLICY IF EXISTS "Usuario ve sus disputas"           ON disputes;
DROP POLICY IF EXISTS "Usuario crea disputas"             ON disputes;
DROP POLICY IF EXISTS "Admin ve todas las disputas"       ON disputes;

-- ── 2. Drop FKs ──────────────────────────────────────────────
ALTER TABLE wallet_transactions  DROP CONSTRAINT IF EXISTS wallet_transactions_user_id_fkey;
ALTER TABLE tournaments          DROP CONSTRAINT IF EXISTS tournaments_created_by_fkey;
ALTER TABLE registrations        DROP CONSTRAINT IF EXISTS registrations_user_id_fkey;
ALTER TABLE games                DROP CONSTRAINT IF EXISTS games_user_id_fkey;
ALTER TABLE tournament_results   DROP CONSTRAINT IF EXISTS tournament_results_user_id_fkey;
ALTER TABLE withdrawal_requests  DROP CONSTRAINT IF EXISTS withdrawal_requests_user_id_fkey;
ALTER TABLE withdrawal_requests  DROP CONSTRAINT IF EXISTS withdrawal_requests_reviewed_by_fkey;
ALTER TABLE disputes             DROP CONSTRAINT IF EXISTS disputes_user_id_fkey;
ALTER TABLE disputes             DROP CONSTRAINT IF EXISTS disputes_resolved_by_fkey;

-- ── 3. Cambiar tipos → uuid ───────────────────────────────────
ALTER TABLE profiles             ALTER COLUMN id           TYPE uuid USING id::uuid;
ALTER TABLE wallet_transactions  ALTER COLUMN user_id      TYPE uuid USING user_id::uuid;
ALTER TABLE tournaments          ALTER COLUMN created_by   TYPE uuid USING created_by::uuid;
ALTER TABLE registrations        ALTER COLUMN user_id      TYPE uuid USING user_id::uuid;
ALTER TABLE games                ALTER COLUMN user_id      TYPE uuid USING user_id::uuid;
ALTER TABLE tournament_results   ALTER COLUMN user_id      TYPE uuid USING user_id::uuid;
ALTER TABLE withdrawal_requests  ALTER COLUMN user_id      TYPE uuid USING user_id::uuid;
ALTER TABLE withdrawal_requests  ALTER COLUMN reviewed_by  TYPE uuid USING reviewed_by::uuid;
ALTER TABLE disputes             ALTER COLUMN user_id      TYPE uuid USING user_id::uuid;
ALTER TABLE disputes             ALTER COLUMN resolved_by  TYPE uuid USING resolved_by::uuid;

-- ── 4. Restaurar FKs ─────────────────────────────────────────
ALTER TABLE wallet_transactions  ADD CONSTRAINT wallet_transactions_user_id_fkey        FOREIGN KEY (user_id)      REFERENCES profiles(id);
ALTER TABLE tournaments          ADD CONSTRAINT tournaments_created_by_fkey              FOREIGN KEY (created_by)   REFERENCES profiles(id);
ALTER TABLE registrations        ADD CONSTRAINT registrations_user_id_fkey              FOREIGN KEY (user_id)      REFERENCES profiles(id);
ALTER TABLE games                ADD CONSTRAINT games_user_id_fkey                      FOREIGN KEY (user_id)      REFERENCES profiles(id);
ALTER TABLE tournament_results   ADD CONSTRAINT tournament_results_user_id_fkey         FOREIGN KEY (user_id)      REFERENCES profiles(id);
ALTER TABLE withdrawal_requests  ADD CONSTRAINT withdrawal_requests_user_id_fkey        FOREIGN KEY (user_id)      REFERENCES profiles(id);
ALTER TABLE withdrawal_requests  ADD CONSTRAINT withdrawal_requests_reviewed_by_fkey    FOREIGN KEY (reviewed_by)  REFERENCES profiles(id);
ALTER TABLE disputes             ADD CONSTRAINT disputes_user_id_fkey                   FOREIGN KEY (user_id)      REFERENCES profiles(id);
ALTER TABLE disputes             ADD CONSTRAINT disputes_resolved_by_fkey               FOREIGN KEY (resolved_by)  REFERENCES profiles(id);

-- ── 5. Restaurar políticas RLS (sin ::text cast) ──────────────
CREATE POLICY "Usuario ve su propio perfil"
  ON profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Usuario edita su propio perfil"
  ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admin ve todos los perfiles"
  ON profiles FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

CREATE POLICY "Usuario ve sus transacciones"
  ON wallet_transactions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admin ve todas las transacciones"
  ON wallet_transactions FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

CREATE POLICY "Usuario ve sus inscripciones"
  ON registrations FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Cualquiera ve conteo por torneo"
  ON registrations FOR SELECT USING (true);

CREATE POLICY "Usuario se inscribe"
  ON registrations FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuario ve sus partidas"
  ON games FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admin ve todas las partidas"
  ON games FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

CREATE POLICY "Usuario ve sus movimientos"
  ON game_moves FOR SELECT USING (
    EXISTS (SELECT 1 FROM games g WHERE g.id = game_id AND g.user_id = auth.uid())
  );

CREATE POLICY "Admin ve todos los movimientos"
  ON game_moves FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

CREATE POLICY "Solo admin crea torneos"
  ON tournaments FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

CREATE POLICY "Solo admin actualiza torneos"
  ON tournaments FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

CREATE POLICY "Usuario ve sus retiros"
  ON withdrawal_requests FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admin ve todos los retiros"
  ON withdrawal_requests FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

CREATE POLICY "Usuario ve sus disputas"
  ON disputes FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Usuario crea disputas"
  ON disputes FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admin ve todas las disputas"
  ON disputes FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

-- ── 6. Actualizar función wallet con p_user_id uuid ──────────
CREATE OR REPLACE FUNCTION wallet_insert_transaction(
  p_user_id uuid,
  p_type text,
  p_amount_cents bigint,
  p_reference_type text DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS wallet_transactions AS $$
DECLARE
  v_current_balance bigint;
  v_new_balance bigint;
  v_result wallet_transactions;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text)::bigint);

  SELECT COALESCE(
    (SELECT balance_after_cents FROM wallet_transactions
     WHERE user_id = p_user_id ORDER BY created_at DESC, id DESC LIMIT 1),
    0
  ) INTO v_current_balance;

  v_new_balance := v_current_balance + p_amount_cents;

  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'Saldo insuficiente: saldo_actual=%, delta=%', v_current_balance, p_amount_cents;
  END IF;

  INSERT INTO wallet_transactions (user_id, type, amount_cents, balance_after_cents, reference_type, reference_id, metadata)
  VALUES (p_user_id, p_type, p_amount_cents, v_new_balance, p_reference_type, p_reference_id, p_metadata)
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 7. Actualizar register_for_tournament con uuid ────────────
CREATE OR REPLACE FUNCTION register_for_tournament(
  p_user_id uuid,
  p_tournament_id uuid,
  p_entry_fee_cents bigint
) RETURNS void AS $$
BEGIN
  INSERT INTO registrations (tournament_id, user_id)
  VALUES (p_tournament_id, p_user_id);

  IF p_entry_fee_cents > 0 THEN
    PERFORM wallet_insert_transaction(
      p_user_id,
      'ticket_debit',
      -p_entry_fee_cents,
      'tournament_registration',
      p_tournament_id,
      jsonb_build_object('tournament_id', p_tournament_id)
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 8. Trigger: crear perfil al registrarse en Supabase Auth ──
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username, full_name)
  VALUES (
    NEW.id,
    'user_' || substr(replace(NEW.id::text, '-', ''), 1, 8),
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
      NULLIF(NEW.raw_user_meta_data->>'name', '')
    )
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'auth' AND table_name = 'users'
  ) THEN
    INSERT INTO public.profiles (id, username, full_name)
    SELECT
      u.id,
      'user_' || substr(replace(u.id::text, '-', ''), 1, 8),
      COALESCE(
        NULLIF(u.raw_user_meta_data->>'full_name', ''),
        NULLIF(u.raw_user_meta_data->>'name', '')
      )
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE p.id IS NULL
    ON CONFLICT (id) DO NOTHING;

    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END;
$$;

COMMIT;
