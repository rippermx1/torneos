-- Minimal native PostgreSQL contract fixture; not a production migration.
CREATE SCHEMA private;
CREATE SCHEMA auth;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE TYPE public.app_role AS ENUM ('user', 'admin', 'owner');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE public.profiles(id uuid PRIMARY KEY, is_banned boolean NOT NULL DEFAULT false,
  birth_date date, terms_accepted_at timestamptz, terms_version text, kyc_status text);
CREATE TABLE public.profile_roles(profile_id uuid REFERENCES profiles(id), role app_role,
  PRIMARY KEY(profile_id,role));
CREATE FUNCTION private.current_user_has_role(p_role app_role) RETURNS boolean LANGUAGE sql STABLE
  SECURITY DEFINER SET search_path = '' AS $$ SELECT EXISTS(SELECT 1 FROM public.profile_roles
    WHERE profile_id = auth.uid() AND role = p_role) $$;
CREATE TABLE public.tournaments(id uuid PRIMARY KEY, status text, entry_fee_cents bigint NOT NULL,
  max_players int NOT NULL, registration_opens_at timestamptz, play_window_start timestamptz,
  play_window_end timestamptz, max_game_duration_seconds int DEFAULT 600,
  prize_model text DEFAULT 'fixed', prize_fund_bps int DEFAULT 5500, platform_fee_bps int DEFAULT 4500);
CREATE TABLE public.registrations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid REFERENCES tournaments(id), user_id uuid REFERENCES profiles(id), entry_fee_cents bigint,
  prize_fund_contribution_cents bigint, platform_fee_gross_cents bigint, platform_fee_net_cents bigint,
  platform_fee_iva_cents bigint, prize_model text, accounting_metadata jsonb DEFAULT '{}',
  registered_at timestamptz DEFAULT now(), UNIQUE(tournament_id,user_id));
CREATE TABLE public.flow_payment_attempts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid, tournament_id uuid, intent text DEFAULT 'tournament_registration', commerce_order text UNIQUE,
  net_amount_cents bigint, charged_amount_cents bigint, status text DEFAULT 'pending',
  flow_token text, flow_order bigint, flow_status_code int, payment_method text, payer_email text,
  raw_response jsonb, settled_at timestamptz, created_at timestamptz DEFAULT now());
CREATE TABLE public.accounting_journal_entries(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_key text UNIQUE,event_type text,source_table text,source_id uuid,tournament_id uuid,user_id uuid,
  occurred_at timestamptz,period text,description text,is_estimate boolean,metadata jsonb);
CREATE TABLE public.accounting_postings(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  journal_entry_id bigint REFERENCES accounting_journal_entries(id),account_code text,debit_cents bigint,credit_cents bigint);
CREATE TABLE public.games(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tournament_id uuid REFERENCES tournaments(id),
  user_id uuid REFERENCES profiles(id), status text DEFAULT 'active', seed text DEFAULT 'private-seed',
  final_score bigint DEFAULT 0, highest_tile int DEFAULT 2, move_count int DEFAULT 0,
  current_board jsonb DEFAULT '[[2,2,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]',
  started_at timestamptz DEFAULT now(), ended_at timestamptz, end_reason text, UNIQUE(tournament_id,user_id));
CREATE TABLE public.game_moves(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), game_id uuid REFERENCES games(id),
  move_number int, direction text, board_before jsonb, board_after jsonb, score_gained int,
  spawned_tile jsonb, client_timestamp bigint, server_timestamp timestamptz DEFAULT now(), UNIQUE(game_id,move_number));
CREATE FUNCTION public.register_with_credit(uuid,uuid,bigint) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
GRANT USAGE ON SCHEMA public,private,auth TO anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO service_role;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_moves ENABLE ROW LEVEL SECURITY;
-- Actual owner/role policies and the actual unsafe grants are loaded by the runner.
