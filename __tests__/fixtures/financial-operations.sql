-- Extends the native contract fixture. Disposable PostgreSQL only, no Auth API.
CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
ALTER TABLE public.profiles ADD COLUMN full_name text DEFAULT 'Persona Prueba', ADD COLUMN rut text DEFAULT '12.345.678-5';
ALTER TABLE public.tournaments ADD COLUMN is_test boolean DEFAULT false;
ALTER TABLE public.tournaments ADD COLUMN name text DEFAULT 'Fixture';
ALTER TABLE public.flow_payment_attempts ADD CONSTRAINT flow_payment_attempts_status_check
  CHECK (status IN ('pending','paid','credited','rejected','cancelled','expired'));
-- Existing baseline tests intentionally left unsettled attempts; they belong to
-- the old source contract and are removed only from this disposable test fixture.
DELETE FROM public.flow_payment_attempts WHERE status <> 'paid';
CREATE UNIQUE INDEX idx_flow_attempts_one_active_tournament_checkout ON public.flow_payment_attempts(user_id,tournament_id)
  WHERE intent = 'tournament_registration' AND tournament_id IS NOT NULL AND status IN ('pending','paid');
CREATE TABLE public.wallet_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES profiles(id),
  type text,amount_cents bigint,balance_after_cents bigint,reference_type text,reference_id uuid,metadata jsonb,created_at timestamptz DEFAULT now());
CREATE TABLE public.withdrawal_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES profiles(id),
  amount_cents bigint CHECK(amount_cents>0),status text DEFAULT 'pending' CHECK(status IN ('pending','approved','paid','rejected')),
  bank_name text NOT NULL,bank_account text NOT NULL,account_rut text NOT NULL,account_holder text NOT NULL,
  wallet_transaction_id uuid REFERENCES wallet_transactions(id),created_at timestamptz DEFAULT now());
CREATE UNIQUE INDEX idx_withdrawals_one_open_per_user ON public.withdrawal_requests(user_id) WHERE status IN ('pending','approved');
CREATE UNIQUE INDEX idx_withdrawals_wallet_transaction ON public.withdrawal_requests(wallet_transaction_id);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.wallet_transactions,public.withdrawal_requests TO service_role;
