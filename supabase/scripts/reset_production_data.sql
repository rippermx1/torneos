-- ============================================================
-- TorneosPlay — Reset de datos de producción
--
-- OBJETIVO: Borrar toda la data de usuario/torneo/pago/storage,
-- dejando el schema, funciones, políticas RLS y configuración intactos.
--
-- CUÁNDO USAR: Una sola vez, antes del lanzamiento público.
--
-- CÓMO EJECUTAR:
--   Supabase Dashboard → SQL Editor → New query → Pegar y Run
--   (El editor ya corre con service_role, que puede tocar auth.* y storage.*)
--
-- TIEMPO ESTIMADO: < 5 segundos sobre una DB vacía de prueba.
-- ============================================================


-- ── PASO 1: Storage (documentos KYC) ────────────────────────
-- Borra los objetos del bucket kyc-documents.
-- Nota: esto elimina los registros de metadata. Los archivos físicos
-- en S3 también se limpian automáticamente vía Supabase Storage.

DELETE FROM storage.objects WHERE bucket_id = 'kyc-documents';


-- ── PASO 2: Tablas de aplicación ────────────────────────────
-- TRUNCATE con CASCADE maneja el orden de FK automáticamente.

TRUNCATE TABLE
  admin_actions,
  flow_refund_attempts,
  flow_payment_attempts,
  disputes,
  withdrawal_requests,
  tournament_results,
  game_moves,
  games,
  registrations,
  wallet_transactions,
  tournaments,
  profile_roles,
  profiles,
  rate_limit_buckets
CASCADE;


-- ── PASO 3: Usuarios de Supabase Auth ────────────────────────
-- Elimina todos los usuarios, sesiones, identidades y tokens.
-- Supabase cascadea automáticamente a auth.identities,
-- auth.sessions, auth.refresh_tokens, etc.

DELETE FROM auth.users;


-- ── VERIFICACIÓN (ejecutar justo después) ────────────────────
-- Debería devolver 0 en todas las filas.

SELECT 'profiles'              AS tabla, COUNT(*) AS filas FROM profiles
UNION ALL SELECT 'profile_roles',         COUNT(*) FROM profile_roles
UNION ALL SELECT 'wallet_transactions',   COUNT(*) FROM wallet_transactions
UNION ALL SELECT 'tournaments',           COUNT(*) FROM tournaments
UNION ALL SELECT 'registrations',         COUNT(*) FROM registrations
UNION ALL SELECT 'games',                 COUNT(*) FROM games
UNION ALL SELECT 'game_moves',            COUNT(*) FROM game_moves
UNION ALL SELECT 'tournament_results',    COUNT(*) FROM tournament_results
UNION ALL SELECT 'withdrawal_requests',   COUNT(*) FROM withdrawal_requests
UNION ALL SELECT 'disputes',              COUNT(*) FROM disputes
UNION ALL SELECT 'flow_payment_attempts', COUNT(*) FROM flow_payment_attempts
UNION ALL SELECT 'flow_refund_attempts',  COUNT(*) FROM flow_refund_attempts
UNION ALL SELECT 'admin_actions',         COUNT(*) FROM admin_actions
UNION ALL SELECT 'storage.objects (kyc)', COUNT(*) FROM storage.objects WHERE bucket_id = 'kyc-documents'
UNION ALL SELECT 'auth.users',            COUNT(*) FROM auth.users;
