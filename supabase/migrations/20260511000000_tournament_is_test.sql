-- Permite marcar torneos como prueba/smoke-test para excluirlos de vistas públicas.
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
