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

La práctica gratuita de 2048 conserva marca personal y últimas cinco partidas
en el navegador, con comparación al terminar y registro local exportable. Las
marcas de práctica no habilitan premios. Alcance, reproducción y comprobaciones
en [docs/STATUS.md](docs/STATUS.md).

El desafío diario gratuito comparte un tablero por fecha de Chile y propone
formar la ficha 128 con reintentos. Los días de juego se observan por separado
en el navegador y en cuentas autenticadas; el reporte administrativo D1/D7 está
en `/admin/reports/2048`. La migración de actividad de cuentas está aplicada en
`torneos-dev`; el desafío y el reporte con MFA se verificaron con dos cuentas QA.
Despliegue, hashes, pruebas y limpieza en
[docs/2048-DAILY-DEVELOPMENT-EVIDENCE.json](docs/2048-DAILY-DEVELOPMENT-EVIDENCE.json).

El reto comunitario gratuito está publicado en desarrollo: 2–15 inscritos,
un intento de cinco minutos y clasificación oficial por servidor, sin premios
ni cambios de rating pagado. Se crea desde `/admin/tournaments/new`; participación
y regreso al siguiente reto se consultan en `/admin/reports/2048-community` con MFA.
Contrato y reproducción en [la guía](docs/2048-COMMUNITY-FREE.md), y comprobación
autenticada, migraciones y limpieza en
[la evidencia de desarrollo](docs/2048-COMMUNITY-DEVELOPMENT-EVIDENCE.json).

La demostración de entrenamiento de 2048 está publicada sólo en desarrollo.
Al terminar una práctica, si existe una alternativa útil, permite una única
continuación desde el estado previo al último movimiento válido. Conserva el
resultado original y muestra la continuación como asistida, sin récord, desafío
diario, retorno ni anuncios reales. Unity `007` no se recompiló. Funcionamiento,
almacenamiento local, pruebas y reversión en [la guía](docs/2048-TRAINING-DEMO.md);
el recorrido con WebGL y cuenta autenticada QA, conservación de progreso y limpieza
quedaron verificados en
[la evidencia](docs/2048-TRAINING-DEVELOPMENT-EVIDENCE.json).

El Paso 5 añade una solicitud explícita para esa continuación, con una aplicación
por práctica y dos por día de Chile en este navegador. Está publicado sólo en
[desarrollo](https://torneos-dev.vercel.app/play), en modo demo sin SDK ni anuncios
reales; conserva el resultado original y la cápsula Unity `007`. Pasaron 373/373
pruebas en 34 archivos, TypeScript, lint y build local/remoto. El recorrido cloud
con Unity real y cuenta QA verificó cancelación, timeout natural, dos aplicaciones,
persistencia del cupo tras recargar y conservación exacta de progreso y retorno.
La práctica sin ayuda y el diario siguieron disponibles; cuenta y perfil QA
eliminados, con el estado de desarrollo restaurado a su línea base.
Límites, almacenamiento y reversión en [la guía](docs/2048-REWARDED-DEMO.md);
resultados y limpieza en
[la evidencia del Paso 5](docs/2048-REWARDED-DEVELOPMENT-EVIDENCE.json).

El Paso 6 incorpora una ficha informativa de torneos con ticket desde la práctica
y los resultados gratuitos de 2048. Precio, premios, participantes y duración
provienen del preset comercial del servidor. La oferta permanece no disponible,
sin inscripción ni cobro; el login existente conserva el regreso a la ficha.
Las consultas se exportan como visitas locales separadas del progreso y retorno,
sin representar ventas ni personas únicas. Contrato y límites en
[la guía](docs/2048-TICKET-OFFER.md), y verificación de la candidata en
[la evidencia del Paso 6](docs/2048-TICKET-OFFER-DEVELOPMENT-EVIDENCE.json).

El Paso 7 añade el [informe del ensayo](https://torneos-dev.vercel.app/admin/reports/2048-trial)
con MFA administrativo. Reutiliza retorno de cuentas y participación comunitaria,
y permite importar en memoria una exportación local para resumir práctica,
entrenamiento demo y consultas de ticket. Las fuentes y denominadores permanecen
separados; la descarga contiene agregados y señala evidencia aún no medida.
Contrato, reproducción y límites en [la guía](docs/2048-TRIAL.md); recorrido
integrado y publicación en [la evidencia](docs/2048-TRIAL-DEVELOPMENT-EVIDENCE.json).

El Paso 8 prepara [convocatoria y primeras sesiones](https://torneos-dev.vercel.app/admin/reports/2048-trial/operations):
borrador de invitación, ocho fichas S01–S08, agenda manual D1/D7 y registro de
tiempo/costos. El archivo se conserva mediante descarga/reapertura explícita;
no hay guardado automático, contactos, unión con cuentas o envío de mensajes.
Observaciones reales declaradas y QA sintética permanecen separadas; preparar
el registro no ejecuta el ensayo. [Guión y uso](docs/2048-FIRST-SESSIONS.md),
[evidencia de desarrollo](docs/2048-FIRST-SESSIONS-DEVELOPMENT-EVIDENCE.json).

Para probar el flujo gratuito sin servicios externos, usa
`node scripts/preview-2048-progress.mjs` con la cápsula Unity publicada local.

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
