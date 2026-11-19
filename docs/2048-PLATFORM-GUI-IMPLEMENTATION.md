# G2048-06.1 — plataforma accesible alrededor de la cápsula

**Actualización 2026-10-05 / E28:** G2048-06.2 queda terminado bajo el
[criterio visual automatizado/simulado aceptado](2048-SIMULATED-ACCEPTANCE.md).
GUI real normal/ampliada en escritorio/vertical/horizontal, fusiones, tablero y
resultado competitivo PASS. No se afirma aceptación humana de legibilidad.

Fecha: 2026-10-01. Rama: `codex/2048-clean-gameplay`. Base: `850a42e`.

## Resultado

La plataforma conserva inicio, nueva partida de práctica, recuperación, reloj,
avisos, resultado/ranking y salida al ampliar 2048. Todos son HTML del host web;
Unity mantiene tablero, puntaje confirmado y efectos. No se trasladó la
orquestación del torneo a Unity ni se modificaron APIs, DB, Flow o fuentes Unity.

El modo ampliado aplica una cuadrícula al contenedor completo, con controles
arriba, cápsula en el espacio disponible y estado debajo. Conserva el mismo
iframe y sesión al cambiar de vista. El tamaño mantiene la proporción 4:5 y
se adapta al alto disponible, incluyendo márgenes seguros del dispositivo.
El botón de nueva partida sigue limitado a práctica.

La sesión web expone `can_recover`: distingue un estado desconocido de una
petición normal en curso. Recuperación aparece después de errores de movimiento,
consulta de tiempo o lectura de una partida existente; se oculta durante la
consulta y después de confirmar el estado o terminar. No reenvía movimientos.

Se incorporan al host los ajustes de GUI preparados previamente: inicio de
práctica explícito, mensaje de inicio, puntaje accesible sin duplicación visual,
preferencia de movimiento reducido y montaje del puente antes de cargar el iframe.
El protocolo descarta `game.restart`; el reinicio lo decide la plataforma.
Los proyectos, recursos, registros de builds y cambios de otros juegos se conservan.

## Evidencia

- 80/80 pruebas dirigidas, siete archivos: GUI, recuperación, sesión, reloj y
  eventos del host. Incluyen 14 nuevas comprobaciones de vistas y cuatro de la
  disponibilidad de recuperación. `artifacts/2048-platform-gui/targeted-tests.json`.
- Las mismas 80/80 pruebas pasan sobre fuentes extraídas del índice Git,
  excluyendo los cambios no incorporados de builds y otros juegos.
  `artifacts/2048-platform-gui/index-tests.json`.
- TypeScript y lint de los archivos afectados: PASS. Compilación Next 16.3.8
  webpack optimizada: exit 0, 60 páginas estáticas. Salida aislada
  `.next/2048-platform-gui-061`; URLs y claves de Supabase/Flow sustituidas por
  placeholders locales durante la compilación. No se ejecutó el contenedor ni
  una mutación de datos. `artifacts/2048-platform-gui/build.log`.
- Preview Next/Unity real en `http://127.0.0.1:3080/play`, build local `005`:
  ampliar antes de empezar, iniciar desde el modo ampliado, jugar con teclado,
  puntaje 4, cambiar tamaño y reiniciar desde la plataforma a puntaje 0.
- Escritorio 1280×720: tablero completo dentro del viewport y estado visible,
  sin desplazar para jugar. Móvil emulado 390×844 y horizontal 844×390: controles
  fuera del tablero, salida visible y sin desbordamiento horizontal.
- 48 verificaciones de layout en navegador: ocho estados × normal/ampliado ×
  tres tamaños. Inicio, actividad, recuperación, timeout, sin movimientos,
  abandono, carga y error de carga. Sin solapamientos ni desbordamiento;
  todas las vistas ampliadas conservan cápsula y acciones dentro del viewport.
  `artifacts/2048-platform-gui/competitive-layout-browser.json`.
- Estos últimos estados son fixtures del JSX y CSS reales, con hooks de estado
  suministrados y sin cápsula ejecutándose. Validan disposición y visibilidad;
  no prueban autenticación, DB, acciones de torneo ni persistencia.
- Capturas y medidas de práctica en `artifacts/2048-platform-gui/`. Revisión
  visual técnica del agente; no equivale a aceptación humana.

Los fixtures de layout y su servidor temporal se conservan solo como artefactos
locales ignorados. No se añadió una ruta de fixture a la aplicación.

## Límites y continuación

G2048-06.1 corrige la visibilidad de A03. Escape desde el iframe, gestión completa
del foco y lectura semántica de las casillas siguen en **G2048-07.1**.
El layout normal horizontal permite desplazar la página; el modo ampliado ajusta
el tablero al alto para jugar sin recorte.

La build `005` y el host actual se comprobaron en preview. El contenedor 3081
no se reconstruyó y sigue pendiente de **G2048-11.1**. No se afirma adopción de
Unity como entrada competitiva habitual, E2E autenticado actualizado, teléfono
físico ni aceptación humana. Esos alcances permanecen en 04.4, 06.2/07.2/08.1 y
10.1. Los estados y conteos de los tickets principales no cambian.
