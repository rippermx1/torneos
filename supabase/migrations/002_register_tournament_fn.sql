-- Función atómica para inscribirse a un torneo con débito de cuota.
-- Si la inscripción falla (duplicada u otro error), el débito se revierte automáticamente.
-- Si entry_fee_cents = 0 (torneo gratuito / freeroll), se omite el débito.

create or replace function register_for_tournament(
  p_user_id text,
  p_tournament_id uuid,
  p_entry_fee_cents bigint
) returns void as $$
begin
  -- Débito de cuota solo si el torneo no es gratuito
  if p_entry_fee_cents > 0 then
    perform wallet_insert_transaction(
      p_user_id,
      'ticket_debit',
      -p_entry_fee_cents,
      'tournament',
      p_tournament_id,
      jsonb_build_object('reason', 'entry_fee')
    );
  end if;

  -- Insertar inscripción. Si ya existe, lanza excepción por constraint unique
  -- y revierte automáticamente el débito anterior.
  insert into registrations (tournament_id, user_id)
  values (p_tournament_id, p_user_id);
end;
$$ language plpgsql security definer;
