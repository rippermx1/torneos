-- ============================================================
-- Ciclo de vida de torneos
-- Ejecutar después de 001_schema.sql y 002_register_tournament_fn.sql
-- ============================================================

-- ── FINALIZAR TORNEO ────────────────────────────────────────
-- Marca juegos con timeout, calcula rankings, acredita premios y cierra el torneo.
-- Idempotente: puede re-ejecutarse sin duplicar premios (borra y recrea tournament_results).
-- El torneo DEBE estar en estado 'finalizing' antes de llamar esta función.

create or replace function finalize_tournament(p_tournament_id uuid)
returns jsonb as $$
declare
  v_tournament    tournaments%rowtype;
  v_game          record;
  v_rank          int := 0;
  v_prize         bigint;
  v_timed_out_cnt int;
  v_results_cnt   int := 0;
begin
  -- Lock para evitar ejecuciones concurrentes del cron
  select * into v_tournament
  from tournaments
  where id = p_tournament_id
  for update;

  if not found then
    raise exception 'Torneo no encontrado: %', p_tournament_id;
  end if;

  if v_tournament.status != 'finalizing' then
    raise exception 'El torneo % no está en estado finalizing (estado actual: %)',
      p_tournament_id, v_tournament.status;
  end if;

  -- 1. Marcar juegos activos como completados por timeout
  update games
  set
    status     = 'completed',
    end_reason = 'timeout',
    ended_at   = now()
  where
    tournament_id = p_tournament_id
    and status    = 'active';

  get diagnostics v_timed_out_cnt = row_count;

  -- 2. Limpiar resultados previos (idempotencia)
  delete from tournament_results where tournament_id = p_tournament_id;

  -- 3. Calcular rankings e insertar resultados
  --    Criterios: score DESC, tile más alto DESC, menos movimientos ASC
  for v_game in (
    select user_id, final_score, highest_tile, move_count
    from   games
    where  tournament_id = p_tournament_id
      and  status        = 'completed'
    order by
      final_score  desc,
      highest_tile desc,
      move_count   asc
  ) loop
    v_rank := v_rank + 1;

    v_prize := case v_rank
      when 1 then v_tournament.prize_1st_cents
      when 2 then v_tournament.prize_2nd_cents
      when 3 then v_tournament.prize_3rd_cents
      else 0
    end;

    insert into tournament_results
      (tournament_id, user_id, rank, final_score, prize_awarded_cents)
    values
      (p_tournament_id, v_game.user_id, v_rank, v_game.final_score, v_prize);

    -- Acreditar premio si corresponde
    if v_prize > 0 then
      perform wallet_insert_transaction(
        v_game.user_id,
        'prize_credit',
        v_prize,
        'tournament',
        p_tournament_id,
        jsonb_build_object('rank', v_rank, 'final_score', v_game.final_score)
      );
    end if;

    v_results_cnt := v_results_cnt + 1;
  end loop;

  -- 4. Marcar torneo como completado
  update tournaments
  set status = 'completed'
  where id = p_tournament_id;

  return jsonb_build_object(
    'timed_out_games', v_timed_out_cnt,
    'ranked_players',  v_results_cnt,
    'prizes_awarded',  least(v_results_cnt, 3)
  );
end;
$$ language plpgsql security definer;


-- ── CANCELAR TORNEO ─────────────────────────────────────────
-- Cancela el torneo y reembolsa la cuota de inscripción a todos los participantes.
-- Solo ejecutar si min_players no fue alcanzado al llegar play_window_start.

create or replace function cancel_tournament(p_tournament_id uuid)
returns jsonb as $$
declare
  v_tournament  tournaments%rowtype;
  v_reg         record;
  v_refund_cnt  int := 0;
begin
  select * into v_tournament
  from tournaments
  where id = p_tournament_id
  for update;

  if not found then
    raise exception 'Torneo no encontrado: %', p_tournament_id;
  end if;

  if v_tournament.status not in ('scheduled', 'open') then
    raise exception 'No se puede cancelar torneo en estado: %', v_tournament.status;
  end if;

  -- Reembolsar cuota a cada inscrito
  if v_tournament.entry_fee_cents > 0 then
    for v_reg in (
      select user_id from registrations where tournament_id = p_tournament_id
    ) loop
      perform wallet_insert_transaction(
        v_reg.user_id,
        'refund',
        v_tournament.entry_fee_cents,
        'tournament',
        p_tournament_id,
        jsonb_build_object('reason', 'tournament_cancelled_min_players_not_reached')
      );
      v_refund_cnt := v_refund_cnt + 1;
    end loop;
  end if;

  update tournaments set status = 'cancelled' where id = p_tournament_id;

  return jsonb_build_object(
    'refunds_issued', v_refund_cnt,
    'entry_fee_cents', v_tournament.entry_fee_cents
  );
end;
$$ language plpgsql security definer;
