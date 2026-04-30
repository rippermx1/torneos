# Produccion

Primer corte para desplegar `C:\torneos` sin depender de `.env.local`.

## Variables de entorno

Usa [`.env.production.example`](/C:/torneos/.env.production.example:1) como plantilla.

Variables publicas que se hornean en `next build`:

- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`

Variables solo de runtime del servidor:

- `APP_URL`
- `SUPABASE_SECRET_KEY`
- `MERCADOPAGO_ACCESS_TOKEN`
- `MERCADOPAGO_WEBHOOK_SECRET`
- `FLOW_API_KEY`
- `FLOW_API_SECRET`
- `FLOW_API_BASE`
- `CRON_SECRET`

Compatibilidad heredada:

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` sigue funcionando como fallback del browser key
- `SUPABASE_SERVICE_ROLE_KEY` sigue funcionando como fallback del server key
- `MP_API_TOKEN` sigue funcionando como alias de `MERCADOPAGO_ACCESS_TOKEN`
- `MP_SECRET_WEBHOOK` sigue funcionando como alias de `MERCADOPAGO_WEBHOOK_SECRET`
- `NEXT_PUBLIC_APP_URL` sigue funcionando como fallback de `APP_URL`

## Validacion previa

Antes de desplegar, corre:

```bash
npm run check:production-env
```

Ese chequeo falla si detecta:

- `localhost` en `APP_URL` o `NEXT_PUBLIC_SUPABASE_URL`
- token `TEST-` de Mercado Pago
- `CRON_SECRET` faltante o demasiado corto

## Flow

En sandbox:

```bash
FLOW_API_BASE=https://sandbox.flow.cl/api
```

El endpoint de confirmacion que debe recibir Flow es:

```text
https://www.torneosplay.cl/api/webhooks/flow
```

`createFlowPayment` envia por pago:

- `urlConfirmation`: `${APP_URL}/api/webhooks/flow`
- `urlReturn`: `${APP_URL}/wallet?deposit=flow_return`

Antes de promover a produccion real, cambia:

```bash
FLOW_API_BASE=https://www.flow.cl/api
```

y rota `FLOW_API_KEY`/`FLOW_API_SECRET` a credenciales productivas.

## Cron Flow

El repo define en [`vercel.json`](/C:/torneos/vercel.json:1) la reconciliacion
de pagos Flow cada 10 minutos:

```json
{
  "crons": [
    {
      "path": "/api/cron/flow-reconcile",
      "schedule": "*/10 * * * *"
    }
  ]
}
```

Ese intervalo requiere Vercel Pro o superior. En Hobby, cambia la expresion a
una frecuencia permitida por el plan, por ejemplo `0 * * * *` o diario segun el
limite vigente.

## Docker

Con `output: "standalone"`, la imagen debe construirse con las variables publicas correctas:

```bash
docker build ^
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://baeylvoipmazcthnwxmz.supabase.co ^
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REEMPLAZAR ^
  -t torneos:prod .
```

Y ejecutarse con las variables privadas en runtime:

```bash
docker run --rm -p 3000:3000 ^
  -e APP_URL=https://www.torneosplay.cl ^
  -e SUPABASE_SECRET_KEY=sb_secret_REEMPLAZAR ^
  -e MERCADOPAGO_ACCESS_TOKEN=APP_USR_REEMPLAZAR ^
  -e MERCADOPAGO_WEBHOOK_SECRET=REEMPLAZAR ^
  -e FLOW_API_KEY=REEMPLAZAR ^
  -e FLOW_API_SECRET=REEMPLAZAR ^
  -e FLOW_API_BASE=https://sandbox.flow.cl/api ^
  -e CRON_SECRET=REEMPLAZAR_CON_64_HEX ^
  torneos:prod
```

## Base de datos

La base remota `baeylvoipmazcthnwxmz` ya tiene aplicadas las migraciones `001` a `009`
y `20260428134528`.

Para futuros cambios de schema, evita empujar desde la maquina manualmente. Usa CI/CD con:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`

y despliega con `npx supabase db push`.

## Desarrollo local

El `docker-compose.yml` del repo solo levanta Postgres + PostgREST para DB local.
No incluye Supabase Auth ni OAuth, por lo que para probar registro, login y Google
desde `localhost` el frontend debe apuntar al proyecto cloud de Supabase.

Para preparar usuarios de prueba reutilizables:

```bash
npm run setup:test-users
```

Ese script crea o actualiza tres usuarios confirmados, deja uno como admin y
recarga saldo para pruebas de torneos.

## Scheduler en Hobby

El plan Hobby de Vercel no permite un cron `* * * * *`.

Para este repo, el procesamiento de torneos queda resuelto fuera de Vercel con
[.github/workflows/process-tournaments.yml](/C:/torneos/.github/workflows/process-tournaments.yml:1),
que ejecuta el endpoint cada 5 minutos.

Configura en GitHub:

- repository secret `CRON_SECRET`

El workflow apunta a `https://www.torneosplay.cl`.
