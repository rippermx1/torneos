# Torneos 2048

Plataforma de torneos competitivos de 2048 con Supabase Auth, billetera interna
y despliegue en Vercel.

## Stack

- Next.js 16 App Router
- Supabase Auth + Postgres
- Mercado Pago
- Vercel

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

```bash
npm run setup:test-users
```

El script deja listos:

- `admin.local.e2e@example.com`
- `jugador1.local.e2e@example.com`
- `jugador2.local.e2e@example.com`

Todos usan la misma contraseña. Por defecto:

```txt
Torneos2048!Local
```

Puedes cambiarla con `SUPABASE_E2E_PASSWORD`.

### 4. Levanta la app

```bash
npm run dev
```

Abre [http://localhost:3001](http://localhost:3001).

Para una validación rápida completa:

```bash
npm run smoke:local
```

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
- recargar saldo con el script de fixtures
- inscribir usuarios al mismo torneo
- iniciar partidas desde `/tournaments/[id]/play`

## Producción

- dominio canónico: [https://www.torneosplay.cl](https://www.torneosplay.cl)
- deploys: Vercel
- checklist: [docs/production.md](/C:/torneos/docs/production.md:1)
