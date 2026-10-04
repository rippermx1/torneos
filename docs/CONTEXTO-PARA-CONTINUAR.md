# Contexto para continuar — TorneosPlay

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

Fecha: 2026-10-01. Este documento resume decisiones y entrega local; al retomar,
verifica Git, procesos y configuración antes de asumir que siguen iguales.

Continuidad actual: usar **C:/torneos** en `codex/operational-local-environment`,
desde `8790a37`. `npm run local:up` arranca el stack operativo con Supabase local,
Mailpit y pagos simulados elegidos por el propietario. Leer `AMBIENTE-LOCAL.md` y
`LOCAL-ENVIRONMENT-EVIDENCE.json`: 315 pruebas, Auth/MFA/torneo/ranking E2E local,
Unity autenticado con recuperación, pago/reembolso, persistencia y audit npm cero.
`.env.local-stack` contiene las claves/cuentas locales y no se versiona; el operador
es `operador.local@example.com`. Google permanece deshabilitado hasta configurar
el proveedor. No hay cargos reales ni despliegue. El inventario final no contiene
Orbit ni su volumen; esta entrega no eliminó ninguno. `main` aún está en `6308515`.

Historia del contenedor previo: usar **C:/torneos** en `codex/torneos-container-workspace`,
desde `8bc1312`. El contenedor independiente de Torneos sirve la web y ambos juegos
en `127.0.0.1:3081`, con entorno local de placeholders. Las herramientas de Alien Run
ya no escriben ni leen en el origen; su catálogo local está trasladado. El origen,
WIP y datos de Orbit se conservan. Consultar `WORKSPACE-Y-CONTENEDOR.md` y
`CONTAINER-WORKSPACE-EVIDENCE.json`. Las ramas descritas abajo son historia previa.

Continuidad posterior: el incremento de web pública se implementó en
`codex/tournament-discovery`, creada desde `db49046` y con la migración completa
en su historial. Consultar `SIGUIENTE-INCREMENTO-WEB.md`, `STATUS.md` y
`WEB-DISCOVERY-EVIDENCE.json` para la entrega y pruebas actuales. Los apartados
de migración siguientes conservan el contexto original. Continuar desde esta
rama local; `main` todavía no contiene estos incrementos.

## Dónde continuar

Abrir un chat nuevo dentro del proyecto **torneos**, en la carpeta local existente
`C:/torneos`. Este chat de origen estaba asociado a `C:/play-games`; el cambio de
producto y de carpeta ya está resuelto y no requiere volver a migrar los archivos.

- Rama de trabajo actual: `codex/operational-local-environment` (desde `8790a37`).
- Commit de la entrega de juegos: `df6d463`.
- `main` sigue en `6308515`; la migración todavía no está integrada en `main`.
- El árbol estaba limpio antes de añadir este documento.

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
| Alien Run | Proyecto real `games/alien-run/UnityProject`, fuentes/escena/SDK/metadata preservados. Snapshot `level-030` / `practice-v10`; 4437 archivos transferidos y verificados por SHA256, sin conflictos. |
| `/play` | Práctica gratuita de 2048 Unity. No escribe partidas en DB. |
| `/play/web` | Cliente ligero anterior de 2048, conservado. |
| `/play/alien-run` | Alien Run como práctica gratuita; su resultado local no participa en rankings con premios. |
| `/play/unity` | Redirige a `/play`. |
| `/tournaments/[id]/play/unity` | Cliente Unity competitivo optativo sobre las APIs actuales, con reglas de acceso existentes. E2E autenticado en staging pendiente. |
| `/tournaments/[id]/play` | Cliente competitivo anterior, conservado durante la validación de Unity. |

2048 Unity comunica direcciones. El servidor mantiene tablero y puntuación de la
partida competitiva; el cliente no envía una puntuación que deba aceptarse como
confiable. Ante una petición de resultado incierto se detiene el envío y se recupera
la sesión mediante recarga, sin repetir movimientos a ciegas.

Alien Run conserva la build de desarrollo del origen, de aproximadamente 116 MB.
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

Retomar el enfoque de la **web pública como producto**. Revisar primero lo que ya
existe y el backlog disponible, evitando duplicar capacidades de TorneosPlay.

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
`http://127.0.0.1:3080/play/alien-run`. La configuración de `dev:games` sirve para
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
> codex/operational-local-environment. Lee AGENTS.md, README.md, docs/STATUS.md y
> docs/CONTEXTO-PARA-CONTINUAR.md. TorneosPlay es el producto comercial y los juegos
> son herramientas para participar en torneos. La migración local de Alien Run y
> 2048 Unity ya está entregada; retoma el enfoque de negocio de la web pública,
> el recorrido público de catálogo/ficha y retorno desde práctica/cuenta ya está
> implementado localmente. La web y ambos juegos se sirven en el contenedor
> torneos-app-1; las herramientas Unity trabajan solo desde este workspace.
> C:/play-games queda como origen histórico. Supabase local y Mailpit están operativos;
> los pagos son simulados sin cargos reales. Lee docs/AMBIENTE-LOCAL.md y usa
> npm run local:up / npm run local:smoke. El inventario actual no contiene Orbit ni su volumen.
> Lee docs/WORKSPACE-Y-CONTENEDOR.md y la evidencia;
> continúa con la validación autenticada en staging o un incremento útil posterior
> sin duplicar funciones. Conserva los límites y distingue lo probado de lo pendiente.
