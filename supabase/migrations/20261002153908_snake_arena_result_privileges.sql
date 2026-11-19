-- Normal service clients can only read the sealed roster/results. Writes run in
-- the existing transactional SECURITY DEFINER functions, owned by the migrator.
revoke all on public.snake_entries,public.snake_results from service_role;
grant select on public.snake_entries,public.snake_results to service_role;
revoke update,delete,truncate on public.snake_tournaments from service_role;
