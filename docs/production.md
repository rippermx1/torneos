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
- `FLOW_API_KEY`
- `FLOW_API_SECRET`
- `FLOW_API_BASE`
- `CRON_SECRET`
- `RESEND_API_KEY`

`ALERT_EMAIL` es opcional. Si no está definido, las alertas operativas se
envían al primer `owner` o `admin` con email disponible.

Compatibilidad heredada:

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` sigue funcionando como fallback del browser key
- `SUPABASE_SERVICE_ROLE_KEY` sigue funcionando como fallback del server key
- `NEXT_PUBLIC_APP_URL` sigue funcionando como fallback de `APP_URL`

## Validacion previa

Antes de desplegar, corre:

```bash
npm run check:production-env
```

Ese chequeo falla si detecta:

- `localhost` en `APP_URL` o `NEXT_PUBLIC_SUPABASE_URL`
- `FLOW_API_BASE` apuntando a sandbox
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
- `urlReturn`: `${APP_URL}/tournaments/{id}/return`

Antes de promover a produccion real, cambia:

```bash
FLOW_API_BASE=https://www.flow.cl/api
```

y rota `FLOW_API_KEY`/`FLOW_API_SECRET` a credenciales productivas.

## Procesos programados

Supabase Cron es el programador principal:

- ciclo de torneos: cada 5 minutos
- conciliación Flow: cada 10 minutos
- conciliación de reembolsos: cada 10 minutos
- watchdog de latidos: cada hora

La migración crea `pg_cron`, `pg_net` y la función privada que despacha las
llamadas. La URL pública y `CRON_SECRET` no se guardan en el repositorio: el
configurador los cifra en Supabase Vault.

Después de aplicar las migraciones, configura o rota el scheduler con una
confirmación explícita del proyecto:

```powershell
$env:CONFIRM_SUPABASE_PROJECT_REF='baeylvoipmazcthnwxmz'
npm run configure:scheduler
```

Los workflows de GitHub Actions permanecen activos como respaldo y usan horas
desfasadas. Vercel conserva tareas diarias de respaldo y watchdog. Los
endpoints son idempotentes y reportan HTTP 500/503 si el procesamiento falla,
de modo que un resultado con errores no aparezca como exitoso.

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
  -e FLOW_API_KEY=REEMPLAZAR ^
  -e FLOW_API_SECRET=REEMPLAZAR ^
  -e FLOW_API_BASE=https://sandbox.flow.cl/api ^
  -e CRON_SECRET=REEMPLAZAR_CON_64_HEX ^
  torneos:prod
```

## Base de datos

Durante la etapa pre-lanzamiento se usa un solo ambiente cloud. Todo cambio de
schema debe quedar expresado como migración versionada y aplicarse con el
proyecto vinculado verificado. Los scripts que crean datos, simulan o borran se
niegan a operar contra producción; las tareas operativas no destructivas exigen
`CONFIRM_SUPABASE_PROJECT_REF`.

Cuando el producto esté completo se separarán ambientes y automatización de
deploy. Hasta entonces no se crean fixtures ni usuarios sintéticos en la base
actual.

## Desarrollo local

El `docker-compose.yml` del repo solo levanta Postgres + PostgREST para DB local.
No incluye Supabase Auth ni OAuth. Para probar registro, login y Google desde
`localhost`, el frontend debe apuntar a un proyecto cloud de Supabase separado
de producción.

Para preparar usuarios de prueba reutilizables:

Configura el proyecto de pruebas en `.env.local`:

```dotenv
CONFIRM_SUPABASE_PROJECT_REF=tu_project_ref_de_pruebas
SUPABASE_E2E_PASSWORD=una_clave_de_pruebas_unica
```

Luego ejecuta:

```bash
npm run setup:test-users
```

Ese script crea o actualiza tres usuarios confirmados y deja uno como admin
para pruebas de torneos. Se bloquea si detecta el proyecto productivo conocido.

## Respaldo en GitHub y Vercel

GitHub necesita el repository secret `CRON_SECRET` y apunta al dominio
canónico `https://www.torneosplay.cl`. No es la fuente principal de cadencia:
sus ejecuciones programadas pueden comenzar tarde. Vercel mantiene los dos
crons diarios permitidos por el plan actual.
