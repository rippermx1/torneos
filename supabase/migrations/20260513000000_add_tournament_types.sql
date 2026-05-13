-- Agrega tipos de torneo 'challenger' y 'pro' al CHECK constraint.
alter table tournaments drop constraint if exists tournaments_tournament_type_check;
alter table tournaments
  add constraint tournaments_tournament_type_check
  check (tournament_type in ('standard', 'express', 'elite', 'freeroll', 'challenger', 'pro'));
