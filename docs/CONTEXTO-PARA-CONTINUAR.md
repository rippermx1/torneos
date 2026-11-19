# Contexto para continuar — TorneosPlay

## Limpieza vigente — 2026-11-06

El único juego mantenido es **2048**, con Unity y componentes web legado.
Se retiraron los demás proyectos, runtimes, rutas, servidores y herramientas.
El historial SQL se conserva para instalaciones existentes; las referencias
a otros juegos en registros antiguos no representan funcionalidad vigente.
Lee [el alcance y la validación](LIMPIEZA-SOLO-2048.md) antes de integrar en develop.
Los registros siguientes conservan sus fechas y evidencias históricas.


## Continuación 2048 — E30, 2026-10-07

Cloud competitivo/administrativo PASS con fixture propia ya cerrada; no recrear
ni borrar créditos. Xiaomi práctica y GUI normal/ampliada aceptados por propietario.
Dev activo/verificado: `dpl_AYUux1eSdLCDVjuUGWwbkypU4KgX`; rollback al publicado
del 6/10 disponible. Pendientes: activar/verificar realmente Next 3083 para reparar
cápsula en 3090 (revisión automática bloqueó reinicio autorizado; reporte humano
PASS no coincide con HTTP/PID), y 8 avisos de dependencias de desarrollo. Se preparó
script manual con guardas; no ejecutar reinicios si hay jugadores ni tocar Snake.
Leer [E30](2048-GAP-CLOSURE-20261007.md) y su evidencia antes de continuar.

## Continuación 2048 — resultado visible E29, 2026-10-06

3081 activo con imagen4be2a7bc: panel de fin, puntaje y tabla automática autoritativa;
práctica permite otra partida, torneo no reinicia. Leer [E29](2048-END-RESULT-IMPLEMENTATION.md).
270 regresiones/tipos/lint/build y Auth/API/DB/navegador PASS; cápsula007 intacta.
Usar `artifacts/2048-result/candidate.json` como manifest operativo actual. El094
es histórico: conservarlo y no saltar controles de identidad de los verificadores.
Respaldo `torneos-app-g2048-result-backup-1791299679435` detenido y conservado.
PreviewSnake3090/3083 y otros juegos/WIP intactos; allí el 404 de2048 sigue pendiente.
Sin schema/Flow/cloud/pagos. Móvil físico y aceptación humana del panel NOT_RUN.

## Continuación 2048 — cierre simulado aceptado / E28 — 2026-10-05

Leer [cierre](2048-SIMULATED-ACCEPTANCE.md) y [E28](2048-SIMULATED-ACCEPTANCE-EVIDENCE.json).
El propietario acepta simulaciones para terminar los cuatro tickets abiertos:
04.4/06.2/07.2/08.1. Sus padres 04/06/07/08 están terminados en el alcance local
automatizado; los 11 tickets 2048 quedan cerrados. 151 regresiones/7 controles de
sesión/3 de inmutabilidad/10 navegador y seis combinaciones GUI PASS. E27 quedó
consumido: una partida, dos movimientos, timeout natural, score 4. No reejecutar
prepare/simulación contra esa fixture ni afirmar que estuvo en segundo plano real.
Imagen 094 y Unity007 intactos. Voz/observaciones humanas/teléfono no ejecutados;
la solicitud cambió el criterio de cierre, no la clase de evidencia. E27 y estados
anteriores conservados como antecedentes. Producción/dinero real siguen separados.

## Continuación G2048-04.4 — recorrido real omitido / E27 — 2026-10-05

Leer [entrega](2048-BACKGROUND-VALIDATION.md) y [E27](2048-BACKGROUND-EVIDENCE.json).
Propietario confirmó Unity cargado en Chrome; luego pidió «omite» para la prueba
de segundo plano. No iniciada ni cerrada; G2048-04 sigue en progreso. Fixture propia
`82f51723-acf1-4676-8d9a-49906a11e47f` conservada, credenciales privadas en
`artifacts/2048-background/login.private.txt`. Script `verify-2048-background-local.mjs`
permite leer/observar y verificar un cierre ya persistido. No reejecutar `prepare`
para reiniciar la fixture. Monitor propio detenido; 53 regresiones/lint PASS.
No nuevo deploy, migración, cambio Unity ni Flow; imagen 094/E26 continúa activa.

## Continuación G2048-09.4 — cerrado localmente / E26 — 2026-10-05

Leer [cierre](2048-ADMIN-INTEGRATION-CLOSURE.md) y [E26](2048-ADMIN-INTEGRATION-CLOSURE-EVIDENCE.json).
Docker/3081/Supabase recuperados; los bloqueos mencionados más abajo son históricos.
Solo las dos migraciones revisadas 09.2/09.3 aplicadas, datos existentes preservados.
Imagen activa `torneos-app:g2048-094-candidate-1791231240545`, healthy, con host E23;
007/Ted030/Snake006/Factory014 y configuración/redes/volumen preservados. WIP y
previews posteriores de otros juegos conservados. Manifiesto actual:
`artifacts/2048-integrity-integration/candidate.json`; base 101 ahora histórica.
Contenedor anterior `torneos-app-g2048-094-backup-1791231446369` detenido y conservado.
No volver a usar el constructor contra la base 101 sin revisar la nueva base 094;
no adoptar todo el WIP con `local:up`. Dump/configuración previos son privados en
artifacts; no compartirlos. Sin reset adicional, claves nuevas ni MFA de operadores.
12 Auth/MFA HTTP/SQL, 11 GUI, 101 web/9 Node y seis HTTP Unity PASS; fixtures propias
retenidas, torneo live fallido cancelado sin borrar registros y sesión GUI cerrada.
**G2048-09.4 cerrado y G2048-09 terminado localmente**. Sigue 04.4, regreso real de
segundo plano, y 08.1 con Xiaomi físico. 06.2/07.2 conservan personas/lector real.
WEB-16 conserva GitHub y restauración aislada de backups/Storage; recuperar estos
contenedores no demuestra ese ensayo. No cambios cloud/Flow/dinero real/Unity.

## Continuación WEB-16.1 — 2026-10-05

Workflow y runner de commit aislado implementados. `node scripts/validate-source.mjs`
crea una carpeta UUID propia, no adopta WIP/env/bundles y hace npm ci nuevo. Revisión
9410a33: 3.603 web, 15 Node/uno SQL omitido, lint/build/tipos PASS; actionlint PASS.
Lectura local con `source-diagnostics.mjs --local`: Docker y puertos no disponibles.
Leer [entrega/E25](SOURCE-VALIDATION-IMPLEMENTATION.md). No push ni ejecución hosted:
validar en GitHub/Ubuntu al publicar. Sigue pendiente restauración real del stack y
estado del simulador, sin declarar Auth/DB/Flow verificados. Los hashes de migración
solo normalizan CRLF a LF; contenido SQL y hashes canónicos revisados preservados.
Corrida inicial fallida y final PASS en artifacts; ninguna evidencia sobrescrita.

## Continuación WEB-11.1 — 2026-10-05

Catálogo de 2048/Ted y layout común de práctica implementados, preservando `/play`
como entrada a 2048. Torneo seguro conservado en los dos lanzamientos y regreso
por «Explorar juegos». 135 tests/tipos/lint/build Next, cinco HTTP y navegador PASS;
layout móvil de HTML compilado no sustituye un teléfono físico. Leer
[entrega/E24](PUBLIC-GAME-CATALOG-IMPLEMENTATION.md). Preview propio en
`http://127.0.0.1:65162/play/catalog`; no Auth/DB/Flow ni activación de 3081.
La build de prueba tomó sin modificar la página/componente Ted de WIP paralelo y
reprodujo su alias; esas dependencias no se mezclan en el commit del catálogo.
Integrar junto con esa marca al recuperar el ambiente, conservando entradas de
Factory/Snake. WEB-11 padre sigue En progreso; G2048-09.4 conserva su bloqueo Docker.

## Continuación G2048-07.2.1 — 2026-10-05

Incremento de accesibilidad implementado/probado en preview: guía previa al inicio,
descripción única del iframe, carga con progressbar y puntaje atómico. 123 pruebas,
tipos/lint/build Next y teclado con Unity 007 PASS. Leer [entrega/E23](2048-FIRST-MOVE-IMPLEMENTATION.md).
No cierra el lector real ni la comprensión humana de 07.2, tampoco teléfono/3081.
Al integrar 09.4, incluir también `unity-2048.tsx` y su CSS revisados en E23;
el manifiesto acotado los contempla. El bloqueo Docker y recuperación siguen en
la sección 09.4. No modificar credenciales existentes ni adoptar WIP de otros juegos.

## Continuación G2048-09.4 — 2026-10-05

09.4 **En progreso**, no cerrado. Leer [entrega](2048-ADMIN-INTEGRATION-IMPLEMENTATION.md)
y [E22](2048-ADMIN-INTEGRATION-EVIDENCE.json). Nuevos scripts de candidata acotada,
aplicación de 09.2/09.3 y Auth/MFA E2E; 8 tests y lint PASS. Docker falla con
`dockerInference`; usuario confirmó reset sin respaldo. No hay servicio local en
3081/54321/15432 y la existencia de VHDX no confirma recuperación de datos.
Reparar Docker, auditar/reconstruir solo ambiente local aprobado, refrescar claves
si cambiaron, integrar DB/candidata y ejecutar recorrido + GUI reales antes de
cerrar. No adoptar migraciones/contextos de WIP paralelo ni detener 3082/3083.

## Continuación G2048-09.3 — 2026-10-05

**09.3 cerrado como implementación local validada (E21)**. Leer
[2048-INTEGRITY-IMPLEMENTATION.md](2048-INTEGRITY-IMPLEMENTATION.md) y
[evidencia](2048-INTEGRITY-EVIDENCE.json). 3.226 pruebas / 15 archivos, 22 SQL
reales PostgreSQL 17.11, tipos/lint, Next producción y navegador del componente
real con datos sintéticos PASS. Sanción y bitácora atómicas; commit bloquea cuenta
sancionada; review pendiente impide liquidación; identidad KYC comparte un slot.
No se aplicaron migraciones ni se activó imagen web. **Siguiente 09.4**: integrar
permisos de semilla 09.2 + migración `20261005131216_guard_2048_integrity_reviews.sql`
y candidata web conjuntamente en ambiente autorizado. Las RPC nuevas son
obligatorias: sin ellas sanción/finalización no se confirman. Verificar recorrido
MFA real, descarte/sanción, reintento de cierre y resultado persistido.
G2048-09 padre sigue En progreso; el bot con pausas variables y cuentas sin KYC
no se declaran resueltos. Mantener Unity como cápsula, Flow y WIP paralelo.

## Continuación G2048-09.2 — 2026-10-04

**G2048-09.2 cerrado como implementación local validada.** Leer
[2048-ADVERSARIAL-IMPLEMENTATION.md](2048-ADVERSARIAL-IMPLEMENTATION.md)
y evidencia actualizada: 3.180 pruebas / 14 archivos y 25 checks de PostgreSQL
17.11 reales, tipos/lint PASS; concurrentes, deadlines/bloqueos, commits y grants.
Migración de permisos versionada con CLI 2.119.0; candidato auxiliar eliminado.
Cierra lectura de seed en DB de pruebas sin romper servidor/estado propio.

Reproducir: `node scripts/verify-2048-adversarial.mjs --sql --pg-bin artifacts/2048-adversarial/postgres-portable/pgsql/bin`.
Docker sigue sin responder; runner admite PostgreSQL nativo en cluster UUID propio,
loopback y parada en finally (cleanup PASS). No detener clusters/procesos de otro
trabajo. Binarios EDB quedan ignorados en artifacts; procedencia/hash en evidencia.

**G2048-09.3 siguiente**: contramedidas para bot pausado/multicuenta y coherencia
de sanción/resultado. G2048-09 padre sigue En progreso; no prueba juego humano.
Integración operativa separada: aplicar migración/activar candidata solo en ambiente
autorizado y verificar grants/entrada; no afirmar que eso ocurrió aquí.
Siguen informes físicos/humanos 08.1/04.4/06.2/07.2. Backlog base 41: 15/14/12.
WIP paralelo preservado; no hubo merge a main ni modificación operativa.

## Continuación G2048-09.1 — 2026-10-02

Equivalencia de reglas entregada y probada: leer
[2048-RULE-EQUIVALENCE.md](2048-RULE-EQUIVALENCE.md) y su evidencia.
Corpus compartido de 2.936 escenarios y 40 anclas independientes; 2.995
pruebas web y 18 EditMode PASS, más compilación C#, tipos y lint.
No hay diferencias detectadas ni cambios de motor, build/WebGL, DB/Flow o
despliegues. Reproducir con `scripts/verify-2048-rules.ps1`; usar Node 24 y
Editor instalado, no abrir otro Editor sobre 2048 mientras corren los tests.
G2048-09 sigue en progreso: **09.2** revisa desempates/límites y automatización
adversarial/multicuenta. 08.1 requiere informe físico del Xiaomi; 04.4 mantiene
regreso competitivo autenticado. 06.2/07.2 conservan aceptación y accesibilidad.
Backlog base: **41 tickets, 15 terminados, 14 en progreso, 12 pendientes**.
WIP cloud/Factory/Snake y assets privados preservados; no incluirlos en este commit.

## Continuación G2048-08.1 — 2026-10-02

En progreso: [entrega física](2048-DEVICE-IMPLEMENTATION.md) y
[evidencia](2048-DEVICE-EVIDENCE.json). Xiaomi 12 Pro/Android/Chrome indicado
por el propietario, sin resultado físico todavía. La prueba temporal sirve
práctica `007` desde `http://192.168.1.4:3083/play`, mientras 3081 mantiene
la imagen 101 aprobada. No cambiar Auth/DB/Flow/firewall por esta prueba.
49 pruebas y seis hashes HTTP PASS; carga, métricas, score 4 y guardado
verificados en PC. Informes/PID en `artifacts/2048-device/` ignorado; detener
solo el proceso identificado de `scripts/2048-device-probe/server.mjs`.
Esperar acceso LAN e informe del propietario; cerrar fallos reproducidos con
repetición física. 04.4 competitivo, 06.2 humano y 07.2 lector siguen separados.
Backlog base vigente: **41 tickets, 15 terminados, 13 en progreso, 13 pendientes**.
Los apartados siguientes documentan estados anteriores.

## Continuación 2048: Unity adoptado en 3081 — 2026-10-02

G2048-10.1 y A06 terminados/probados localmente. Leer
[2048-UNITY-ENTRY-IMPLEMENTATION.md](2048-UNITY-ENTRY-IMPLEMENTATION.md) y su
[evidencia](2048-UNITY-ENTRY-EVIDENCE.json) antes de retomar. Fuente `078ef86`,
imagen 101 aprobada activa/healthy, cápsula `007`; sin nuevas migraciones/Flow.
`/tournaments/[id]/play` monta Unity; `/tournaments/[id]/play/unity` es alias.
`/play/web` y `/play/unity` redirigen a `/play` con retorno seguro a la ficha.
Servidor conserva acceso, única partida, tiempo, tablero/score y resultados.
Backlog base: **41 tickets: 15 terminados/probados, 12 en progreso, 14 pendientes**.
Sigue **G2048-08.1**, teléfono físico/rendimiento; 04.4 conserva segundo plano real
pendiente y 06.2/07.2 conservan aceptación/lector de pantalla. WIP ajeno y fuentes
Unity preservados; imagen 044 disponible para retorno. Los apartados siguientes
conservan entregas anteriores; sus rutas y cifras no describen el estado actual.

## Dónde continuar

Abrir un chat nuevo dentro del proyecto **torneos**, en la carpeta local existente
`C:/torneos`. Este chat de origen estaba asociado a `C:/play-games`; el cambio de
producto y de carpeta ya está resuelto y no requiere volver a migrar los archivos.

- Rama de la entrega de backlog: `codex/product-backlog-ted-runner` (desde `3f71511`).
- Checkout compartido al cerrar la auditoría: `codex/2048-clean-gameplay`, con WIP de otra tarea.
- Commit de la entrega de juegos: `df6d463`.
- `main` sigue en `6308515`; la migración todavía no está integrada en `main`.
- La auditoría empezó con árbol limpio; aparecieron cambios simultáneos 2048,
  preservados fuera de esta entrega. Revisar el estado actual al retomar.

Usar la copia local actual: contiene proyectos Unity, assets comerciales permitidos
para trabajo local y builds que están ignorados por Git. Un checkout desde `main`
no incluye la migración; un worktree nuevo tampoco recupera automáticamente esos
archivos ignorados. No crear otra copia del juego para retomar este trabajo.

## Decisiones del propietario

**La web pública es el producto comercial; los juegos son las herramientas con las
que los usuarios participan en torneos.** El foco de negocio incluye descubrir un
torneo, entender reglas/coste/premio, inscribirse, jugar y consultar resultados.

Se eligió TorneosPlay como base porque ya tiene cuentas, torneos, inscripciones,
Flow y contabilidad implementados. Se conserva el monolito modular
Next.js/Supabase/Flow y se incorporan clientes Unity por juego. No trasladar a Unity
la plataforma comercial ni volver a implementar pagos por seguir el backlog antiguo.
La presencia de código de una integración no equivale a su validación productiva.

El propietario autorizó trasladar Alien Run desde `C:/play-games` y crear 2048 en
Unity con arte 2D generado con GPT. El origen permanece completo como referencia;
el trabajo nuevo de plataforma y juegos continúa en `C:/torneos`.

## Qué está entregado

| Área | Situación actual |
| --- | --- |
| Plataforma | Se conservan cuentas, dominio comercial y APIs existentes. Esta migración no ejecutó cobros, cambios de DB ni despliegues. |
| 2048 Unity | Proyecto real `games/2048/UnityProject`, Unity 6000.3.24f1, escena jugable, teclado, deslizamiento, controles y arte original generado con IA. Build `unity-2048-002`, 15.818.967 bytes. |
| Ted Runner (antes Alien Run) | Proyecto real `games/alien-run/UnityProject`, fuentes/escena/SDK/metadata preservados. Snapshot `level-030` / `practice-v10`; 4437 archivos transferidos y verificados por SHA256, sin conflictos. |
| `/play` | Práctica gratuita de 2048 Unity. No escribe partidas en DB. |
| `/play/web` | Cliente ligero anterior de 2048, conservado. |
| `/play/ted-runner` | Ted Runner como práctica gratuita; su resultado local no participa en rankings con premios. `/play/alien-run` redirige a esta ruta. |
| `/play/unity` | Redirige a `/play`. |
| `/tournaments/[id]/play/unity` | Cliente Unity competitivo optativo sobre las APIs actuales, con reglas de acceso existentes. E2E autenticado en staging pendiente. |
| `/tournaments/[id]/play` | Cliente competitivo anterior, conservado durante la validación de Unity. |

2048 Unity comunica direcciones. El servidor mantiene tablero y puntuación de la
partida competitiva; el cliente no envía una puntuación que deba aceptarse como
confiable. Ante una petición de resultado incierto se detiene el envío y se recupera
la sesión mediante recarga, sin repetir movimientos a ciegas.

Ted Runner conserva la build de desarrollo del origen, de aproximadamente 116 MB.
Su integración nueva es de práctica: no hay validación competitiva servidor ni
elegibilidad para premios. El modelo comercial actual sigue teniendo datos y
desempates específicos de 2048; incorporar otro juego competitivo requiere abordar
reglas, persistencia e integridad de ese juego.

## Evidencia y límites

La entrega de migración ejecutó:

- Plataforma: 242/242 pruebas en 35 archivos; TypeScript y lint de archivos afectados.
- Unity 2048: 8/8 EditMode, 1/1 PlayMode y compilación WebGL real.
- Compilación Next final con webpack/standalone, exit 0.
- HTTP: hashes de builds, gzip, MIME y encabezados de iframe verificados.
- Navegador: 2048 con movimiento, puntuación, reinicio, deslizamiento en viewport
  móvil y ampliar/volver; Alien Run con carga, handshake, inicio y controles.

No se ejecutó el torneo Unity autenticado completo en staging, la llegada de Alien
Run desde el nuevo host ni una prueba en teléfono físico. La vista móvil fue una
emulación. Ampliar juego usa el viewport mediante CSS; el fullscreen nativo ocultó
el canvas en el navegador integrado y se sustituyó por esa solución verificada.

Estos resultados son evidencia del incremento anterior, no pruebas repetidas por
la creación de este documento. Detalle versionado: `docs/UNITY-MIGRATION-EVIDENCE.json`.
Logs, informes y capturas locales: `artifacts/unity-2048`, `artifacts/http-*.json` y
`artifacts/alien-run-transfer.json`. Las pruebas técnicas no representan aceptación
humana, validación legal ni autorización de publicación.

## Siguiente trabajo candidato

Retomar el enfoque de la **web pública como producto**, con mejoras de cada juego
por separado. El [backlog vigente](BACKLOG.md) reemplaza las opciones de esta
sección histórica: primero **G2048-11** (GUI `005` en el contenedor); **WEB-11**
(catálogo de juegos); **TR-04/TR-05** (recorrido/controles) y **TR-10** (release);
**G2048-04** (duración/recuperación/cierre competitivo). La GUI G2048-05 ya está
comprobada en preview; no duplicar su implementación ni confundirla con aceptación humana.

Opciones históricas de la migración, con validación local posterior en E1 del backlog:

1. Revisar con usuarios el recorrido público implementado en
   `codex/tournament-discovery` y completar su E2E de cuenta/retorno en staging.
   El catálogo/ficha ya muestran disponibilidad, reglas, coste/premio y retorno
   desde práctica, registro, confirmación y onboarding. No duplicar este trabajo.
2. Validar 2048 Unity con cuentas y DB de staging: acceso, inicio, movimientos,
   recuperación de sesión, duración y ranking. Solo después decidir si sustituye
   al cliente competitivo predeterminado. No usar producción para esta prueba.
3. Preparar varios juegos competitivos mediante reglas servidor y datos por juego.
   Mientras esa integración no exista, conservar Alien Run como práctica gratuita.
4. Optimizar la entrega de Alien Run y verificar los dos juegos en dispositivos
   físicos antes de afirmar preparación de esa experiencia para publicación.

Son opciones de continuidad, no nuevos tickets cerrados ni una aprobación para
operar dinero o desplegar. No hace falta terminar una épica para mejorar la web.

## Lectura y operación mínima

Leer `AGENTS.md`, `README.md` y `docs/STATUS.md`; luego este documento y los
contratos relevantes de `docs/UNITY-GAMES.md`. Consultar
`games/2048/README.md` o `games/alien-run/README.md` solo según el cambio elegido.

```powershell
# Ejecutar desde C:/torneos y revisar cambios antes de editar.
git status --short
git branch --show-current

# Vista local de los juegos con configuración aislada de producción.
# Comprobar primero si 127.0.0.1:3080 ya está en uso.
npm run dev:games

# Según el alcance del siguiente incremento:
npm test
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run games:build:2048
```

Vista local: `http://127.0.0.1:3080/play` y
`http://127.0.0.1:3080/play/ted-runner`. Para el ambiente completo usar `npm run local:up`
y `127.0.0.1:3081`; la configuración de `dev:games` sirve para
práctica y entrega WebGL; no demuestra integración de autenticación/Flow/Supabase.
No recompilar Unity ni repetir toda la suite solo para recuperar contexto.

Unity disponible al cerrar: `C:/Program Files/Unity/Hub/Editor/6000.3.24f1-x86_64/Editor/Unity.exe`.
Conservar `.meta`, `Packages` y `ProjectSettings`: los proyectos reales son la
fuente de los juegos. El SDK compartido está en `packages/unity-sdk`; sincronizar
cambios de su consumidor explícitamente, sin sobrescribir a ciegas.

Las builds se publican **localmente** con `scripts/publish-unity.mjs`, usando IDs
inmutables. `scripts/migrate-alien-run.mjs` sirve solo para adoptar un delta
intencional del origen y rechaza conflictos; no es necesario volver a ejecutarlo.

Aplican los límites de `AGENTS.md`: no confiar en puntuaciones del navegador ni
confundir movimientos/semillas/hashes con prueba de participación humana; preservar
trabajo ajeno; no modificar DB, Flow, recursos externos o despliegues por la migración.
No imprimir credenciales de `.env.local`. KayKit/LocalArt permanecen locales e
ignorados: no enviarlos a IA ni repositorios públicos. El arte original de 2048
tiene procedencia en `games/2048/ART-PROVENANCE.json`.

## Mensaje sugerido para el nuevo chat

> Continúa en C:/torneos usando la copia local y la rama actual
> codex/product-backlog-ted-runner. Lee AGENTS.md, README.md, docs/STATUS.md y
> docs/CONTEXTO-PARA-CONTINUAR.md. TorneosPlay es el producto comercial y los juegos
> son herramientas para participar en torneos. Lee docs/BACKLOG.md para el estado
> separado de web, Ted Runner y 2048. Alien Run ahora se llama Ted Runner en la web;
> su build release con la identidad nueva sigue pendiente. La migración local y
> 2048 Unity ya está entregada; retoma el enfoque de negocio de la web pública,
> el recorrido público de catálogo/ficha y retorno desde práctica/cuenta ya está
> implementado localmente. La web y ambos juegos se sirven en el contenedor
> torneos-app-1; las herramientas Unity trabajan solo desde este workspace.
> C:/play-games queda como origen histórico. Supabase local y Mailpit están operativos;
> los pagos son simulados sin cargos reales. Lee docs/AMBIENTE-LOCAL.md y usa
> npm run local:up / npm run local:smoke. El inventario actual no contiene Orbit ni su volumen.
> Lee docs/WORKSPACE-Y-CONTENEDOR.md y la evidencia;
> La GUI 2048 `005` está comprobada en preview 3080; el contenedor 3081 sigue en `002`.
> Continúa con G2048-11 para integrar esa entrega o con WEB-11 como mejora web,
> preservando las fuentes sin commit. No rehacer las animaciones G2048-05.
> Conserva los límites y distingue lo probado de lo pendiente.
