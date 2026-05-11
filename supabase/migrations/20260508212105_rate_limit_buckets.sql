-- ============================================================
-- A1 hardening: rate limiting distribuido en Postgres.
--
-- Antes: lib/security/rate-limit.ts mantenia un Map<string, Bucket>
-- en memoria del proceso. En Vercel autoscale o multi-region cada
-- instancia tiene su propio mapa, asi que los limites son evadibles
-- distribuyendo trafico entre lambdas/replicas.
--
-- Ahora: tabla compartida + funcion atomica via UPSERT. Una sola
-- fuente de verdad por (key, ventana). Tabla UNLOGGED porque los
-- datos son efimeros y no queremos overhead de WAL.
-- ============================================================

BEGIN;

CREATE UNLOGGED TABLE public.rate_limit_buckets (
  key text PRIMARY KEY,
  count integer NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE INDEX idx_rate_limit_buckets_expires_at
  ON public.rate_limit_buckets (expires_at);

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.rate_limit_buckets
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.rate_limit_buckets
  TO service_role;

-- Consume 1 unidad del bucket. Atomico via UPSERT con WHERE conditional.
-- Limpia oportunisticamente buckets vencidos (~1% de las llamadas).
CREATE OR REPLACE FUNCTION public.rate_limit_consume(
  p_key text,
  p_limit integer,
  p_window_ms integer
) RETURNS jsonb AS $$
DECLARE
  v_now timestamptz := now();
  v_new_expires timestamptz := v_now + make_interval(secs => p_window_ms / 1000.0);
  v_count integer;
  v_expires_at timestamptz;
BEGIN
  IF p_limit <= 0 OR p_window_ms <= 0 THEN
    RAISE EXCEPTION 'rate_limit_consume: limit y window_ms deben ser positivos';
  END IF;

  -- Cleanup oportunista: ~1% de las invocaciones eliminan vencidos.
  -- Suficiente para mantener la tabla pequena sin un cron dedicado.
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limit_buckets
    WHERE expires_at <= v_now;
  END IF;

  INSERT INTO public.rate_limit_buckets AS b (key, count, expires_at)
  VALUES (p_key, 1, v_new_expires)
  ON CONFLICT (key) DO UPDATE
    SET
      count = CASE
        WHEN b.expires_at <= v_now THEN 1
        ELSE b.count + 1
      END,
      expires_at = CASE
        WHEN b.expires_at <= v_now THEN v_new_expires
        ELSE b.expires_at
      END
  RETURNING count, expires_at INTO v_count, v_expires_at;

  RETURN jsonb_build_object(
    'ok', v_count <= p_limit,
    'limit', p_limit,
    'count', v_count,
    'remaining', GREATEST(0, p_limit - v_count),
    'expires_at', v_expires_at,
    'retry_after_seconds', GREATEST(
      1,
      CEIL(EXTRACT(EPOCH FROM (v_expires_at - v_now)))::integer
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.rate_limit_consume(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_consume(text, integer, integer)
  TO service_role;

COMMENT ON FUNCTION public.rate_limit_consume(text, integer, integer) IS
  'Token bucket distribuido. Devuelve {ok, limit, count, remaining, expires_at, retry_after_seconds}.';

COMMIT;
