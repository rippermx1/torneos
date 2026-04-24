-- ============================================================
-- Torneos 2048 — Schema completo
-- NOTA: profiles.id es text (no uuid) para compatibilidad con Clerk
-- ============================================================

-- ── PROFILES ────────────────────────────────────────────────
create table profiles (
  id text primary key,          -- Clerk user ID, ej: "user_abc123"
  username text unique not null,
  full_name text,
  rut text unique,
  birth_date date,
  phone text,
  city text,
  kyc_status text not null default 'pending'
    check (kyc_status in ('pending','approved','rejected')),
  kyc_verified_at timestamptz,
  is_admin boolean not null default false,
  is_banned boolean not null default false,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Usuario ve su propio perfil"
  on profiles for select
  using (auth.uid()::text = id);

create policy "Usuario edita su propio perfil"
  on profiles for update
  using (auth.uid()::text = id);

create policy "Admin ve todos los perfiles"
  on profiles for select
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()::text and p.is_admin = true
    )
  );

-- ── WALLET TRANSACTIONS ──────────────────────────────────────
create table wallet_transactions (
  id uuid default gen_random_uuid() primary key,
  user_id text references profiles(id) not null,
  type text not null check (type in (
    'deposit','withdrawal','ticket_debit','prize_credit','refund','adjustment'
  )),
  amount_cents bigint not null,
  balance_after_cents bigint not null,
  reference_type text,
  reference_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table wallet_transactions enable row level security;

create index idx_wallet_user_created on wallet_transactions(user_id, created_at desc);
create unique index idx_wallet_unique_mp_payment
  on wallet_transactions ((metadata->>'mp_payment_id'))
  where metadata ? 'mp_payment_id';

create policy "Usuario ve sus transacciones"
  on wallet_transactions for select
  using (auth.uid()::text = user_id);

create policy "Admin ve todas las transacciones"
  on wallet_transactions for select
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()::text and p.is_admin = true
    )
  );

-- Función atómica para insertar transacciones (evita race conditions)
create or replace function wallet_insert_transaction(
  p_user_id text,
  p_type text,
  p_amount_cents bigint,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns wallet_transactions as $$
declare
  v_current_balance bigint;
  v_new_balance bigint;
  v_result wallet_transactions;
begin
  -- Serializa todas las mutaciones de una misma billetera.
  perform pg_advisory_xact_lock(hashtext(p_user_id)::bigint);

  select coalesce(
    (select balance_after_cents
     from wallet_transactions
     where user_id = p_user_id
     order by created_at desc, id desc
     limit 1),
    0
  ) into v_current_balance;

  v_new_balance := v_current_balance + p_amount_cents;

  if v_new_balance < 0 then
    raise exception 'Saldo insuficiente: saldo_actual=%, delta=%',
      v_current_balance, p_amount_cents;
  end if;

  insert into wallet_transactions (
    user_id, type, amount_cents, balance_after_cents,
    reference_type, reference_id, metadata
  ) values (
    p_user_id, p_type, p_amount_cents, v_new_balance,
    p_reference_type, p_reference_id, p_metadata
  ) returning * into v_result;

  return v_result;
end;
$$ language plpgsql security definer;

-- ── TOURNAMENTS ──────────────────────────────────────────────
create table tournaments (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  game_type text not null default '2048_score',
  tournament_type text not null default 'standard'
    check (tournament_type in ('standard','express','elite','freeroll')),
  entry_fee_cents bigint not null,
  prize_1st_cents bigint not null,
  prize_2nd_cents bigint not null default 0,
  prize_3rd_cents bigint not null default 0,
  min_players int not null default 2,
  max_players int not null default 100,
  registration_opens_at timestamptz not null,
  play_window_start timestamptz not null,
  play_window_end timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled','open','live','finalizing','completed','cancelled')),
  max_game_duration_seconds int not null default 600,
  created_by text references profiles(id),
  created_at timestamptz not null default now(),

  constraint play_window_valid check (play_window_end > play_window_start),
  constraint registration_before_play check (registration_opens_at <= play_window_start),
  constraint prizes_positive check (
    prize_1st_cents > 0 and prize_2nd_cents >= 0 and prize_3rd_cents >= 0
  )
);

alter table tournaments enable row level security;

create index idx_tournaments_status_window on tournaments(status, play_window_start);

create policy "Cualquiera lee torneos"
  on tournaments for select
  using (true);

create policy "Solo admin crea torneos"
  on tournaments for insert
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()::text and p.is_admin = true
    )
  );

create policy "Solo admin actualiza torneos"
  on tournaments for update
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()::text and p.is_admin = true
    )
  );

-- ── REGISTRATIONS ────────────────────────────────────────────
create table registrations (
  id uuid default gen_random_uuid() primary key,
  tournament_id uuid references tournaments(id) not null,
  user_id text references profiles(id) not null,
  registered_at timestamptz not null default now(),
  unique(tournament_id, user_id)
);

alter table registrations enable row level security;

create policy "Usuario ve sus inscripciones"
  on registrations for select
  using (auth.uid()::text = user_id);

create policy "Cualquiera ve conteo por torneo"
  on registrations for select
  using (true);

create policy "Usuario se inscribe"
  on registrations for insert
  with check (auth.uid()::text = user_id);

-- ── GAMES ───────────────────────────────────────────────────
create table games (
  id uuid default gen_random_uuid() primary key,
  tournament_id uuid references tournaments(id) not null,
  user_id text references profiles(id) not null,
  seed text not null,
  status text not null default 'not_started'
    check (status in ('not_started','active','completed','abandoned','invalid')),
  final_score bigint not null default 0,
  highest_tile int not null default 0,
  move_count int not null default 0,
  current_board jsonb,
  started_at timestamptz,
  ended_at timestamptz,
  end_reason text check (end_reason in ('no_moves','timeout','self_ended','invalid')),
  unique(tournament_id, user_id)
);

alter table games enable row level security;

create index idx_games_tournament_score
  on games(tournament_id, final_score desc, highest_tile desc, move_count asc);

create policy "Usuario ve sus partidas"
  on games for select
  using (auth.uid()::text = user_id);

create policy "Admin ve todas las partidas"
  on games for select
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()::text and p.is_admin = true
    )
  );

-- ── GAME MOVES ───────────────────────────────────────────────
create table game_moves (
  id uuid default gen_random_uuid() primary key,
  game_id uuid references games(id) not null,
  move_number int not null,
  direction text not null check (direction in ('up','down','left','right')),
  board_before jsonb not null,
  board_after jsonb not null,
  score_gained int not null,
  spawned_tile jsonb,
  client_timestamp bigint not null,
  server_timestamp timestamptz not null default now(),
  unique(game_id, move_number)
);

alter table game_moves enable row level security;

create index idx_moves_game on game_moves(game_id, move_number);

create policy "Usuario ve sus movimientos"
  on game_moves for select
  using (
    exists (
      select 1 from games g
      where g.id = game_id and g.user_id = auth.uid()::text
    )
  );

create policy "Admin ve todos los movimientos"
  on game_moves for select
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()::text and p.is_admin = true
    )
  );

-- ── TOURNAMENT RESULTS ───────────────────────────────────────
create table tournament_results (
  id uuid default gen_random_uuid() primary key,
  tournament_id uuid references tournaments(id) not null,
  user_id text references profiles(id) not null,
  rank int not null,
  final_score bigint not null,
  prize_awarded_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  unique(tournament_id, user_id),
  unique(tournament_id, rank)
);

alter table tournament_results enable row level security;

create policy "Cualquiera ve resultados"
  on tournament_results for select
  using (true);
