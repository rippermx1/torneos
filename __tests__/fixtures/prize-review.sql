-- Extends financial fixture only, all objects disposable.
ALTER TABLE public.tournaments ADD COLUMN prize_1st_cents bigint DEFAULT 1000000,
 ADD COLUMN prize_2nd_cents bigint DEFAULT 0, ADD COLUMN prize_3rd_cents bigint DEFAULT 0, ADD COLUMN business_rule_version int DEFAULT 1;
ALTER TABLE public.withdrawal_requests ADD COLUMN admin_notes text, ADD COLUMN reviewed_by uuid REFERENCES profiles(id), ADD COLUMN reviewed_at timestamptz,
 ADD COLUMN paid_by uuid REFERENCES profiles(id), ADD COLUMN paid_at timestamptz, ADD COLUMN bank_transfer_reference text,
 ADD COLUMN proof_storage_path text, ADD COLUMN receipt_number text UNIQUE, ADD COLUMN payment_notes text;
CREATE TABLE public.tournament_results(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tournament_id uuid REFERENCES tournaments(id),
 user_id uuid REFERENCES profiles(id),rank int,final_score bigint,prize_awarded_cents bigint,created_at timestamptz DEFAULT now(),UNIQUE(tournament_id,user_id));
CREATE TABLE public.disputes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES profiles(id),tournament_id uuid REFERENCES tournaments(id),
 type text,status text DEFAULT 'open',description text,admin_notes text,resolved_by uuid REFERENCES profiles(id),resolved_at timestamptz,created_at timestamptz DEFAULT now());
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
CREATE POLICY dispute_owner_insert ON public.disputes FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid());
GRANT INSERT ON public.disputes TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.disputes,public.tournament_results TO service_role;
