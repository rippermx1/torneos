# TorneosPlay

Plataforma de torneos competitivos de 2048 con Supabase Auth, Flow, billetera
interna de premios/reembolsos y despliegue en Vercel.

## Stack

- Next.js 16 App Router
- Supabase Auth + Postgres
- Flow
- Vercel

## Workspace y contenedor de aplicación

El trabajo activo de plataforma, 2048 y Alien Run continúa en `C:/torneos`.
`C:/play-games` se conserva como respaldo histórico. `compose.app.yaml` ejecuta
un contenedor de Torneos para la web, APIs y ambos WebGL, separado de Orbit.
Configuración, auditoría del origen y evidencia en
[docs/WORKSPACE-Y-CONTENEDOR.md](docs/WORKSPACE-Y-CONTENEDOR.md).
Alien Run permanece como práctica gratuita; su empaquetado no habilita premios.

## Desarrollo local

### 1. Instala dependencias

```bash
npm ci
```

### 2. Configura el entorno

La app necesita un proyecto Supabase real para probar:

- registro con email/password
- inicio de sesión
- OAuth con Google
- rutas protegidas por sesión

El `docker-compose.yml` del repo solo ofrece Postgres + PostgREST para desarrollo
de base de datos. No incluye Supabase Auth ni providers OAuth.

Usa `.env.local` con:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` o `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY` o `SUPABASE_SERVICE_ROLE_KEY`
- `APP_URL=http://localhost:3001`

### 3. Prepara usuarios de prueba

Usa un proyecto Supabase separado de producción y define explícitamente el
proyecto y la contraseña de las cuentas sintéticas:

Añade a `.env.local`:

```dotenv
CONFIRM_SUPABASE_PROJECT_REF=tu_project_ref
SUPABASE_E2E_PASSWORD=una_clave_de_pruebas_unica
```

Luego ejecuta:

```bash
npm run setup:test-users
```

El script deja listos:

- `admin.local.e2e@example.com`
- `jugador1.local.e2e@example.com`
- `jugador2.local.e2e@example.com`

Todos usan la contraseña definida en `SUPABASE_E2E_PASSWORD`. El script no
incluye una contraseña predeterminada y se niega a ejecutarse contra el
proyecto productivo conocido.

### 4. Levanta la app

```bash
npm run dev
```

Abre [http://localhost:3001](http://localhost:3001).

Para una validación rápida completa:

```bash
npm run smoke:local
```

Los smoke tests y simuladores aplican la misma confirmación de proyecto y solo
aceptan un Supabase no productivo.

## Pruebas manuales recomendadas

### Auth

- crear cuenta en `/sign-up`
- confirmar email con `/auth/confirm`
- iniciar sesión en `/sign-in`
- restablecer contraseña en `/sign-in/forgot`

### Admin

- iniciar sesión con el usuario admin
- crear torneo en `/admin/tournaments/new`
- revisar listado en `/admin/tournaments`

### Simulación de torneo

- iniciar sesión con 2 o más jugadores
- inscribir usuarios al mismo torneo con checkout directo o fixtures
- inscribir usuarios al mismo torneo
- iniciar partidas desde `/tournaments/[id]/play`

## Producción

- dominio canónico: [https://www.torneosplay.cl](https://www.torneosplay.cl)
- deploys: Vercel
- scheduler principal: Supabase Cron; GitHub Actions y Vercel como respaldo
- checklist: [docs/production.md](/C:/torneos/docs/production.md:1)

## Juegos Unity (traslado desde C:/play-games)

TorneosPlay es la base de la plataforma y los juegos son clientes separados:
`games/alien-run/UnityProject` y `games/2048/UnityProject`, Unity 6000.3.24f1.
2048 tiene arte 2D original generado con GPT y conserva el motor competitivo servidor.

```powershell
npm run games:build:2048
npm run dev:games
```

Vista local sin credenciales productivas: [juegos](http://127.0.0.1:3080/play),
[Alien Run](http://127.0.0.1:3080/play/alien-run). No ejecuta cobros ni despliegues.
Estado y límites: `docs/STATUS.md`; arquitectura: `docs/UNITY-GAMES.md`.

Para retomar en un chat del proyecto **torneos**, usa la carpeta local actual y lee
[el contexto de continuidad](docs/CONTEXTO-PARA-CONTINUAR.md). Incluye la rama que
contiene la migración, las decisiones del propietario y los pendientes verificados.
