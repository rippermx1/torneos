-- ============================================================
-- Migración 005: Cambiar profiles.id y user_id de uuid → text
-- Necesario porque Clerk usa IDs tipo "user_xxx", no UUID.
-- ============================================================
BEGIN;

-- ── 1. Drop todas las políticas RLS que referencian las columnas ──
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

-- ── 3. Cambiar tipos → text ───────────────────────────────────
ALTER TABLE profiles             ALTER COLUMN id           TYPE text USING id::text;
ALTER TABLE wallet_transactions  ALTER COLUMN user_id      TYPE text USING user_id::text;
ALTER TABLE tournaments          ALTER COLUMN created_by   TYPE text USING created_by::text;
ALTER TABLE registrations        ALTER COLUMN user_id      TYPE text USING user_id::text;
ALTER TABLE games                ALTER COLUMN user_id      TYPE text USING user_id::text;
ALTER TABLE tournament_results   ALTER COLUMN user_id      TYPE text USING user_id::text;
ALTER TABLE withdrawal_requests  ALTER COLUMN user_id      TYPE text USING user_id::text;
ALTER TABLE withdrawal_requests  ALTER COLUMN reviewed_by  TYPE text USING reviewed_by::text;
ALTER TABLE disputes             ALTER COLUMN user_id      TYPE text USING user_id::text;
ALTER TABLE disputes             ALTER COLUMN resolved_by  TYPE text USING resolved_by::text;

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

-- ── 5. Restaurar políticas RLS ────────────────────────────────
CREATE POLICY "Usuario ve su propio perfil"
  ON profiles FOR SELECT USING (auth.uid()::text = id);

CREATE POLICY "Usuario edita su propio perfil"
  ON profiles FOR UPDATE USING (auth.uid()::text = id);

CREATE POLICY "Admin ve todos los perfiles"
  ON profiles FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()::text AND p.is_admin = true)
  );

CREATE POLICY "Usuario ve sus transacciones"
  ON wallet_transactions FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Admin ve todas las transacciones"
  ON wallet_transactions FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()::text AND p.is_admin = true)
  );

CREATE POLICY "Usuario ve sus inscripciones"
  ON registrations FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Cualquiera ve conteo por torneo"
  ON registrations FOR SELECT USING (true);

CREATE POLICY "Usuario se inscribe"
  ON registrations FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Usuario ve sus partidas"
  ON games FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Admin ve todas las partidas"
  ON games FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()::text AND p.is_admin = true)
  );

CREATE POLICY "Usuario ve sus movimientos"
  ON game_moves FOR SELECT USING (
    EXISTS (SELECT 1 FROM games g WHERE g.id = game_id AND g.user_id = auth.uid()::text)
  );

CREATE POLICY "Admin ve todos los movimientos"
  ON game_moves FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()::text AND p.is_admin = true)
  );

CREATE POLICY "Solo admin crea torneos"
  ON tournaments FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()::text AND p.is_admin = true)
  );

CREATE POLICY "Solo admin actualiza torneos"
  ON tournaments FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()::text AND p.is_admin = true)
  );

CREATE POLICY "Usuario ve sus retiros"
  ON withdrawal_requests FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Admin ve todos los retiros"
  ON withdrawal_requests FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()::text AND p.is_admin = true)
  );

CREATE POLICY "Usuario ve sus disputas"
  ON disputes FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Usuario crea disputas"
  ON disputes FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Admin ve todas las disputas"
  ON disputes FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()::text AND p.is_admin = true)
  );

-- ── 6. Actualizar función wallet con p_user_id text ──────────
CREATE OR REPLACE FUNCTION wallet_insert_transaction(
  p_user_id text,
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
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id)::bigint);

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

COMMIT;
