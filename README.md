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

Con Docker Desktop abierto y las builds locales disponibles:

```powershell
npm ci
npm run local:up
```

Abre [Torneos](http://127.0.0.1:3081), [correo local](http://127.0.0.1:54324)
o [Supabase Studio](http://127.0.0.1:54323). Web, APIs y ambos juegos comparten
un contenedor de aplicación; Supabase aporta Auth, PostgreSQL, Storage y Cron.
Los pagos utilizan un simulador persistente identificado **sin cargos reales**.
Google está deshabilitado hasta configurar ese proveedor externo.

Las cuentas iniciales son `jugador1.local.e2e@example.com`,
`jugador2.local.e2e@example.com` y `operador.local@example.com`. Su contraseña
generada está en `SUPABASE_E2E_PASSWORD` dentro de `.env.local-stack`, ignorado
por Git. El operador configura MFA desde el flujo habitual. `.env.local` y los
proyectos cloud no se modifican ni se usan en este stack.

```powershell
npm run local:smoke
npm audit
```

Guía completa, persistencia, límites, parada y evidencia:
[docs/AMBIENTE-LOCAL.md](docs/AMBIENTE-LOCAL.md).
El antiguo `docker-compose.yml` DB/PostgREST y `dev:games` son alternativas
anteriores sin autenticación completa; no levantarlos para este recorrido.

Para trabajar con un staging externo configurado por el propietario, se conservan
`npm run dev`, `setup:test-users` y `smoke:local`; requieren `.env.local` y
confirmación explícita de un Supabase no productivo. Estos comandos no cargan
automáticamente `.env.local-stack`.

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
