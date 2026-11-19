# G2048-11.1 — host y cápsula incorporados en 3081

Fecha: 2026-10-02. **Terminado y probado localmente**. Cierra A05 de la
[auditoría](2048-CROSS-AUDIT.md). El siguiente incremento es **G2048-04.4**,
el recorrido competitivo autenticado completo.

`http://127.0.0.1:3081/play` sirve el host con navegación accesible y la build
inmutable `unity-2048-007`. Inicio/reinicio pertenecen a la plataforma; Unity
representa tablero, puntaje y movimientos confirmados. Fuentes, arte GPT,
Inter/TMP, importadores `.meta`, animaciones y navegación quedaron en **`afb1fbd`**,
rama `codex/2048-clean-gameplay`. No se hizo merge a `main`.

## Paquete local y preservación

Imagen activa: `torneos-app:g2048-007-20261002191810`; imagen anterior conservada:
`torneos-app:g2048-before-20261002191810` (`005`). `torneos-app:local` apunta ahora
al paquete validado. El inventario operativo es `007 / level-030 / snake-arena-006 /
factory-empire-014`. Los archivos publicados de las cuatro cápsulas coinciden
byte a byte con sus snapshots locales; también se conserva la URL anterior `005`.

El checkout contiene cambios simultáneos de otros frentes. El contexto de Docker
se congeló en `artifacts/2048-integration/context`, sin proyectos Unity, recursos
privados, secretos ni dependencias locales. Se conserva byte a byte el servidor
Snake y su arranque desde la imagen anterior. El registro derivado fija Snake
`006`; el registro compartido mantiene su candidata `009`. En el contexto se
excluye la nueva GUI de misiones y se oculta el selector de cosméticos que depende
del renderizador `009`; sus fuentes originales quedan intactas en el workspace.
Los cambios de infraestructura/otros juegos no forman parte del commit 2048.

Se reemplazó únicamente `app`, con `--no-deps --no-build --wait`. Volumen Flow,
redes, configuración crítica y los nueve contenedores restantes se preservaron.
La comparación de 50 tablas inmediatamente después del reemplazo confirma las
27 tablas públicas sin cambios y las identidades/MFA intactas. Al finalizar las
pruebas, 26 tablas públicas siguen iguales; `cron_heartbeats` registra la ejecución
normal de los tres trabajos programados existentes a las 19:40 UTC. La sesión
existente continuó autenticada: Auth renovó
un token, actualizando cuatro tablas internas; no se afirma igualdad de esas
tablas. Este incremento no ejecutó migraciones, reseed/reset, limpieza de Docker
ni operaciones Flow; los trabajos programados existentes siguieron funcionando.

## Verificación ejecutada

- **533/533 pruebas web**, 62 archivos; lint del alcance y TypeScript/build Docker
  PASS (Next 16.3.8, 65 páginas). La cápsula conserva la compilación verificada de
  07.1: 14 EditMode y 4 PlayMode. No se recompiló Unity en este incremento.
- **34 comprobaciones HTTP**: host `007`, seis archivos 2048, hashes, MIME,
  gzip/WASM, framing, revalidación 304, rutas de juegos/torneos y protección admin.
- Navegador en **3081**: carga inicial y recarga con inicio explícito, flechas con
  fusión `0 → 4`, WASD, reinicio `4 → 0`, tablero semántico de 16 celdas,
  Tab hacia controles, Escape/foco de retorno, modo ampliado y partida conservada.
  Pantallas 1280×720, 390×844 con arrastre y 844×390 sin desbordamiento horizontal.
- Ted Runner `level-030` carga e inicia práctica. Snake `006` carga; su servidor
  acepta entrada anónima e input `seq=1`, devuelve snapshot con `ack=1` y queda
  con cero conexiones/salas al terminar. La práctica autenticada no está habilitada:
  falta `SNAKE_PRACTICE_SECRET`. Factory `014` carga, pero su API de referencia
  devuelve 503 en producción local. Ambas restricciones se reprodujeron también
  con handlers de la imagen anterior, aislada sin red; no se habilitaron como
  parte de esta entrega. No se recertifica aquí el gameplay completo de esos juegos.

Inventario, hashes, resultados, límites y capturas:
[2048-INTEGRATION-EVIDENCE.json](2048-INTEGRATION-EVIDENCE.json).

## Repetir comprobación y retorno

```powershell
node scripts/verify-2048-integration.mjs http://127.0.0.1:3081 artifacts/2048-integration/operative-builds.json
docker compose --env-file .env.local-stack -f compose.app.yaml -f compose.local.yaml -f artifacts/2048-integration/compose.candidate.json build app
```

El segundo comando recompila el contexto congelado, conservado localmente con
su manifiesto SHA256. No usar `local:up/setup/smoke` para este incremento: incluyen
operaciones de preparación de datos ajenas a su alcance. Antes de cualquier
reemplazo, comprobar ausencia de jugadores y torneos Snake activos/programados.

Retorno concreto, sin reconstrucción ni preparación de datos:

```powershell
docker compose --env-file .env.local-stack -f compose.app.yaml -f compose.local.yaml -f artifacts/2048-integration/compose.rollback.json up -d --no-deps --no-build --wait app
docker image tag torneos-app:g2048-before-20261002191810 torneos-app:local
```

No se ejecutó el retorno porque la candidata pasó las comprobaciones. Se conserva
su imagen y configuración; el cambio de app supone una breve interrupción local.
El paquete desplegado y los contextos están fuera de Git; las fuentes/build ID y
sus hashes sí quedan versionados. Los WIP compartidos deben conciliarse antes de
pretender una reconstrucción limpia de toda la plataforma desde este commit.

## Pendiente

**04.4**: torneo autenticado, deadline, recuperación/red/dos pestañas y ranking.
**06.2/07.2/08.1**: aceptación humana, lector de pantalla y teléfono físico.
**10.1**: adopción habitual de Unity desde la ficha del torneo. No se cerraron por
la incorporación local; tampoco hay despliegue externo ni activación monetaria.
