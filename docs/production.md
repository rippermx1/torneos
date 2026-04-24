# Produccion

Primer corte para desplegar `C:\torneos` sin depender de `.env.local`.

## Variables de entorno

Usa [`.env.production.example`](/C:/torneos/.env.production.example:1) como plantilla.

Variables publicas que se hornean en `next build`:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Variables solo de runtime del servidor:

- `APP_URL`
- `CLERK_SECRET_KEY`
- `CLERK_WEBHOOK_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MERCADOPAGO_ACCESS_TOKEN`
- `MERCADOPAGO_WEBHOOK_SECRET`
- `CRON_SECRET`

Compatibilidad heredada:

- `MP_API_TOKEN` sigue funcionando como alias de `MERCADOPAGO_ACCESS_TOKEN`
- `MP_SECRET_WEBHOOK` sigue funcionando como alias de `MERCADOPAGO_WEBHOOK_SECRET`
- `NEXT_PUBLIC_APP_URL` sigue funcionando como fallback de `APP_URL`

## Validacion previa

Antes de desplegar, corre:

```bash
npm run check:production-env
```

Ese chequeo falla si detecta:

- claves `pk_test_` o `sk_test_` de Clerk
- `localhost` en `APP_URL` o `NEXT_PUBLIC_SUPABASE_URL`
- token `TEST-` de Mercado Pago
- `CRON_SECRET` faltante o demasiado corto

## Docker

Con `output: "standalone"`, la imagen debe construirse con las variables publicas correctas:

```bash
docker build ^
  --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_REEMPLAZAR ^
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://baeylvoipmazcthnwxmz.supabase.co ^
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=REEMPLAZAR ^
  -t torneos:prod .
```

Y ejecutarse con las variables privadas en runtime:

```bash
docker run --rm -p 3000:3000 ^
  -e APP_URL=https://tu-dominio.com ^
  -e CLERK_SECRET_KEY=sk_live_REEMPLAZAR ^
  -e CLERK_WEBHOOK_SECRET=whsec_REEMPLAZAR ^
  -e SUPABASE_SERVICE_ROLE_KEY=REEMPLAZAR ^
  -e MERCADOPAGO_ACCESS_TOKEN=APP_USR_REEMPLAZAR ^
  -e MERCADOPAGO_WEBHOOK_SECRET=REEMPLAZAR ^
  -e CRON_SECRET=REEMPLAZAR_CON_64_HEX ^
  torneos:prod
```

## Base de datos

La base remota `baeylvoipmazcthnwxmz` ya tiene aplicadas las migraciones `001` a `006`.

Para futuros cambios de schema, evita empujar desde la maquina manualmente. Usa CI/CD con:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`

y despliega con `npx supabase db push`.

## Scheduler en Hobby

El plan Hobby de Vercel no permite un cron `* * * * *`.

Para este repo, el procesamiento de torneos queda resuelto fuera de Vercel con
[.github/workflows/process-tournaments.yml](/C:/torneos/.github/workflows/process-tournaments.yml:1),
que ejecuta el endpoint cada 5 minutos.

Configura en GitHub:

- repository secret `CRON_SECRET`

El workflow apunta por defecto a `https://torneos-theta.vercel.app`. Cuando exista
dominio propio, actualiza [`.github/workflows/process-tournaments.yml`](/C:/torneos/.github/workflows/process-tournaments.yml:1)
con la URL final.
