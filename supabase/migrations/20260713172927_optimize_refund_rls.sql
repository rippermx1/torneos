-- Evita reevaluar auth.uid() por cada fila al listar reembolsos.

begin;

drop policy if exists "Usuario ve sus reembolsos"
  on public.flow_refund_attempts;

create policy "Usuario ve sus reembolsos"
  on public.flow_refund_attempts
  for select
  to authenticated
  using (user_id = (select auth.uid()));

commit;
