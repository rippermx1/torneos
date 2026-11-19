# TorneosPlay

Plataforma comercial de torneos de **2048**, con clientes Unity WebGL y legado web.
La web conserva la autoridad de cuentas, inscripciones, resultados y pagos.
El cliente competitivo envía direcciones; el servidor calcula tablero y puntuación.

## Stack

- Next.js 16 App Router, React y TypeScript.
- Supabase Auth y PostgreSQL.
- Flow y billetera de premios/reembolsos.
- Unity 6000.3.24f1 para `games/2048/UnityProject`.

## Desarrollo y pruebas

```powershell
npm ci
npm test
npm run build -- --webpack
npm run dev:games
```

La vista aislada abre `/play` en http://127.0.0.1:3080 con credenciales de ejemplo.
Los componentes web legado se conservan; `/play/web` redirige a Unity. `/play/catalog` ofrece exclusivamente 2048.
`npm run games:build:2048` compila y prueba Unity; las cápsulas publicadas son inmutables.

Con Docker Desktop y la configuración local preparada, `npm run local:up` inicia
el stack completo y `npm run local:smoke` comprueba sus flujos. Revisa
[la guía local](docs/AMBIENTE-LOCAL.md) antes de operar datos o servicios.
El contenedor de aplicación ejecuta Next standalone y sirve el WebGL de 2048.

## Continuidad y despliegue

Lee [STATUS](docs/STATUS.md), [contrato Unity](docs/UNITY-GAMES.md) y
[contexto para continuar](docs/CONTEXTO-PARA-CONTINUAR.md).
La limpieza del 2026-11-06 retira los demás juegos y conserva el historial SQL
para no alterar instalaciones existentes. [Alcance y validación](docs/LIMPIEZA-SOLO-2048.md).

Desarrollo cloud: [torneos-dev](https://torneos-dev.vercel.app), separado de producción.
La configuración de empaquetado publica sólo 2048. Producción:
[TorneosPlay](https://www.torneosplay.cl) y [guía de operación](docs/production.md).
Compilación, pruebas automáticas, aceptación humana y despliegue se registran por separado.
