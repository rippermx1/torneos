# Estado — TorneosPlay

## Limpieza vigente — 2026-11-06

El único juego mantenido es **2048**, con Unity y componentes web legado.
Se retiraron los demás proyectos, runtimes, rutas, servidores y herramientas.
El historial SQL se conserva para instalaciones existentes; las referencias
a otros juegos en registros antiguos no representan funcionalidad vigente.
Lee [el alcance y la validación](LIMPIEZA-SOLO-2048.md) antes de integrar en develop.
Los registros siguientes conservan sus fechas y evidencias históricas.


## RM-14: cuentas, datos y atención — 2026-10-07

Candidata `aaa39d4` READY en el alias RM de torneos-dev; migración y nueve
contratos de catálogo verificados sólo en Supabase develop. Recuperación por
correo, sesiones revocadas/expiradas, suspensión con históricos y soporte,
documentos auditados y respuestas privadas implementados. Consulta/disputa/
incidente con referencia, acuse, resolución y escalamiento RM-09. 3.853 pruebas
/86 archivos, tipos/lint/build cloud, 18 ensayos locales, 36 checks HTTPS nuevos
y 17 de operación PASS; formulario y estado comprobados en navegador local.
Fixtures retiradas; seis cuentas originales, ledger y diez jobs conservados.
Dominio compartido de juegos intacto; integración de su candidata pendiente.
Protección de contraseñas filtradas omitida por instrucción del propietario.
**RM-14 IN_PROGRESS; NO_GO**: retención/borrado definitivo, aceptación legal y
titular/suplente reales pendientes. Caja pausada y proveedores bloqueados.
[Informe](RM14-CUENTAS-DATOS-Y-ATENCION.md),
[evidencia](RM14-CUENTAS-DATOS-Y-ATENCION-EVIDENCE.json).


## RM-13: recuperación y carga — 2026-10-07

Candidata `e2174d8` READY en el alias RM del proyecto torneos-dev. Migración de
equidad aplicada sólo a Supabase dev; dominio y diez jobs compartidos conservados.
Copia real restaurada con 92 proyecciones iguales; Auth/MFA sintético y bytes
privados recuperados. Ensayo financiero: base vaciada/restaurada, 96 tablas,
61 obligaciones y 15 resultados, ledger intacto y dispatch incierto no reenviado.
Backlog de 61 pagos/devoluciones, 58 torneos vencidos, caída simulada de 25 h y
reinicios PASS. Carga de 15 jugadores medida, sin SLO aprobado por decisión del
propietario. 3.838 pruebas/84 archivos, tipos/lint/build cloud y 55 checks HTTPS
PASS. Caja pausada y proveedores bloqueados; cero operaciones financieras dev.
**RM-13 IN_PROGRESS; NO_GO**: faltan RPO/custodia fuera de máquina, RTO cloud,
MFA/OAuth/configuración del operador y conciliación externa real. Continúa RM-14.
[Informe y alcance](RM13-RECUPERACION-Y-CARGA.md),
[evidencia](RM13-RECUPERACION-Y-CARGA-EVIDENCE.json).

## 2048: gaps de producto — E30, 2026-10-07

Recorrido competitivo/administrativo autenticado cloud PASS, Xiaomi físico
reportado PASS y GUI normal/ampliada aceptada por el propietario. Cuatro entradas
transitivas del lockfile corregidas: auditoría de ejecución 0; auditoría completa
conserva 8 avisos altos de herramientas de desarrollo. Build/TypeScript y 270
regresiones PASS. Publicado/verificado en torneos-dev: 22 checks de candidata y
22 tras activar `dpl_AYUux1eSdLCDVjuUGWwbkypU4KgX`, Unity 007 conservado.
Preview 3090 sigue abierto: assets preparados, reinicio automático rechazado y
reporte manual PASS aún contradicho por HTTP 404/PID anterior. No cerrar ese gap.
[Entrega y límites](2048-GAP-CLOSURE-20261007.md) · [E30](2048-GAP-CLOSURE-20261007-EVIDENCE.json).

## RM-12: Google y validación operativa develop — 2026-10-06

Candidata `823063c` publicada en el alias RM-12 dentro de torneos-dev.
Identidad/Flow desde Vercel productivo; Resend desde fuente local autorizada porque
el secreto Vercel no se puede leer. Supabase dev conservado; proveedores bloqueados,
caja pausada. Google: sesión/perfil verificados y retorno al alias confirmado por
el propietario. MFA TOTP/AAL2, paneles y lectura privada de caja/KYC PASS con
fixtures retiradas; aceptación de titular/suplente pendiente. 3.816 pruebas y
build/tipos/lint PASS. Scheduler sin heartbeats recientes y callbacks Flow con
protección Vercel siguen abiertos; correos omitidos a petición del propietario.
Recuperación completa, conciliación/reserva y ciclo monetario pendientes.
**RM-12 IN_PROGRESS; NO_GO.** [Informe](RM12-VALIDACION-DEVELOP.md) y
[evidencia](RM12-VALIDACION-DEVELOP-EVIDENCE.json).

## RM-12: scheduler y callbacks en develop — 2026-10-07

Candidata `e5e1c78` READY en el alias RM-12, Supabase dev. Cinco jobs propios,
respuestas HTTP persistidas y éxitos recientes de los cuatro procesadores;
watchdog cada cinco minutos. Excepción de protección sólo en el alias del ensayo:
callbacks externos llegan y rechazan entradas inválidas. 3.834 pruebas, tipos,
lint, build y 50 comprobaciones HTTPS PASS. Monitor Windows independiente
programado y verificado; cloud continuo y recepción humana de avisos pendientes.
Proveedores bloqueados; monitor conserva 503 con procesamiento sano y operación
financiera sin aceptar. Dominio/jobs/Vault compartidos conservados. Cero cobros,
devoluciones/retiros; caja pausada. **NO_GO; RM-12 IN_PROGRESS**. Sigue RM-13.
[Entrega y evidencia](RM12-SCHEDULER-Y-CALLBACKS-DEVELOP.md).

## 2048: fin visible y tabla automática — E29, 2026-10-06

Activo en 3081: práctica agotada muestra fin/puntaje/Nueva partida; torneo cerrado
por servidor bloquea Unity y carga automáticamente su tabla, provisional u oficial.
Consulta fallida permite reintentar conservando el resultado. Cápsula007 intacta.
270 pruebas/16 archivos, tipos, lint, build, navegador y ranking Auth/PostgreSQL PASS.
Partida cerrada E27 preservada después de recuperar y actualizar resultados.
Imagen4be2a7bc, respaldo local conservado. Sin migraciones/Flow/despliegue público.
Teléfono físico NOT_RUN; el 404 de cápsula2048 en previewSnake3090 sigue pendiente.
[Entrega](2048-END-RESULT-IMPLEMENTATION.md) · [E29](2048-END-RESULT-EVIDENCE.json).

## 2048 — cuatro tickets cerrados con simulación aceptada / E28 — 2026-10-05

Por instrucción explícita del propietario se sustituyen los criterios humanos/
físicos de 04.4/06.2/07.2/08.1 por validación automatizada/simulada. 151 regresiones,
siete controles de sesión con Auth/API/DB reales, tres de resultado inmutable,
diez de navegador, seis combinaciones de GUI y seis archivos HTTP PASS; 120
muestras de métricas PC. Deadline natural, resultado competitivo 4 coherente en
GUI/ranking provisional, sin nueva imagen ni cambios Unity/esquema/Flow. G2048-04/06/
07/08 terminados en ese alcance; **2048: 11 terminados, 0 en progreso, 0 pendientes**.
No se afirma teléfono físico, segundo plano real, lector real ni comprensión humana.
[Cierre y alcance](2048-SIMULATED-ACCEPTANCE.md) · [E28](2048-SIMULATED-ACCEPTANCE-EVIDENCE.json).
Los estados de 2048 que siguen son antecedentes anteriores al cambio de criterio.

## Dinero real RM-12 — despliegue de pruebas en dev — 2026-10-05

Seis migraciones ensayadas y aplicadas sólo en Supabase dev; catálogo, grants,
semilla y Auth real PASS. Candidata `9548aed` publicada en el proyecto torneos-dev:
https://rm12-torneos-dev.vercel.app, con proveedores bloqueados y caja pausada.
3.811 pruebas/81 archivos, tipos/lint/build remoto, 287 archivos publicados,
práctica WebGL real y denegación de objetos privados PASS. El dominio compartido
sigue con otro despliegue; se preservó su actualización concurrente.
MFA AAL2, correos operativos, recuperación completa y ciclo financiero pendientes.
Definir monto/pagador antes de cobro. **RM-12 IN_PROGRESS; NO_GO vigente.**
Implementación en checkout aislado `codex/real-money-access`; esta actualización
documental no integra ni sobrescribe código de otros incrementos en el checkout principal.
[Despliegue](RM12-DESPLIEGUE-DEV.md),
[evidencia](RM12-DESPLIEGUE-DEV-EVIDENCE.json).

## 2048 G2048-04.4 — prueba real omitida / E27 — 2026-10-05

Fixture local identificada en 3081 preparada, sin reloj ni tablero alterados.
El propietario confirmó Unity cargado en Chrome y luego respondió «omite» al
recorrido de segundo plano. Cero partidas/movimientos; monitor propio detenido y
fixture conservada. 53 regresiones y lint PASS. El navegador integrado permanece
visible y no sustituye esa aceptación; **04.4 y G2048-04 siguen en progreso**.
[Entrega](2048-BACKGROUND-VALIDATION.md) · [E27](2048-BACKGROUND-EVIDENCE.json).

## 2048 G2048-09.4 — cerrado localmente — 2026-10-05

Docker recuperado al apartar su directorio de sockets obsoletos, sin nuevo reset
ni eliminación de VHDX. Supabase y la imagen aceptada conservaban datos/configuración;
inventario previo: 74 perfiles, 22 partidas/resultados. Dos migraciones revisadas
09.2/09.3 aplicadas con fingerprints public/auth conservados y siete guards PASS.
Candidata 094 compilada y healthy en 3081; configuración, redes, volumen y otros
diez contenedores preservados. Imagen anterior detenida y conservada para retorno.
101 web/9 Node, 12 controles Auth/MFA HTTP/SQL, 11 observaciones GUI y seis archivos
Unity HTTP/hash/gzip/framing PASS. Descarte y sanción persistidos; ranking GUI 192,
un resultado y un crédito sintético. Host E23 también integrado; cápsula 007 intacta.
**09.4 y G2048-09 terminados en su alcance local probado**. Continúan 04.4/06.2/07.2/08.1,
límites de bots variables/multicuenta sin identidad y preparación de producción.
No cloud/Flow/dinero real ni aceptación humana/física. El bloqueo E22 de abajo es
histórico. [Cierre](2048-ADMIN-INTEGRATION-CLOSURE.md) · [E26](2048-ADMIN-INTEGRATION-CLOSURE-EVIDENCE.json).

## CONT-11 — pre-cierre sin movimientos reales — 2026-10-05

El propietario confirma sin movimientos reales. Expediente preparado para septiembre
propuesto, con saldos externos desconocidos y aprobación pendiente. Lectura dev
confirma seis asientos de ensayo/reversa, doce líneas y cuentas en cero; esos datos
no acreditan la contabilidad real de la empresa. **CONT-11 En progreso**: faltan
período confirmado, respaldos externos y revisión del contador. No hubo escrituras
contables ni cierre aprobado. [Expediente](CONTABILIDAD-PRIMER-CIERRE.md).

## WEB-16.1 — validación de fuentes y diagnóstico — 2026-10-05

Workflow push/PR/manual con copia de commit aislada, npm ci, tests, lint, build y
tipos; informes JSON sin credenciales ni logs completos. **9410a33 PASS**: 3.603
tests web /64 archivos, 15 Node y uno SQL omitido sin runtime; cuatro lotes lint,
Next producción y tipos. actionlint 1.7.12 PASS. Corregido guard de hash LF/CRLF
sin alterar migraciones. Diagnóstico local: Docker/3081/Supabase sin respuesta.
**WEB-16 En progreso**: GitHub/Ubuntu y restauración/incidente real pendientes.
[Entrega](SOURCE-VALIDATION-IMPLEMENTATION.md) · [E25](SOURCE-VALIDATION-EVIDENCE.json).

## CONT-01–09 — registro contable y cierre — 2026-10-05

Implementación local: diario completo, devengo desde journal, gastos/aportes,
facturas/liquidaciones Flow, cartola y matching, saldos acumulados, N/C verificadas
y cierre bloqueado/versionado con reapertura y bitácora. Nueva ruta
`/admin/accounting`. Migración aplicada en Supabase `torneos-dev`; web standalone
local activa en 3085. 27 pruebas/8 archivos, build Next/TypeScript y lint PASS;
ocho controles con Auth/MFA AAL2/PostgREST reales y documentos sintéticos PASS.
Reversas conservadas con todas las cuentas en cero y cierre anterior reabierto.
**CONT-10 probado en desarrollo; sigue CONT-11**: documentos y primer cierre real
con revisión del contador. Publicación Vercel dev y aceptación humana pendientes.
[Backlog](CONTABILIDAD-BACKLOG.md) · [Entrega](CONTABILIDAD-IMPLEMENTACION.md).

## WEB-11.1 — catálogo de juegos — 2026-10-05

`/play/catalog` presenta controles/modalidad de 2048 y Ted Runner; navegación
común conserva el torneo elegido y descarta destinos inválidos. Ted solo práctica,
sin lanzamiento cloud cuando no está disponible. 135 pruebas /12 archivos,
tipos/lint, Next producción, cinco HTTP y recorrido de ambas cápsulas PASS.
Layout 390×844 revisado con HTML/CSS reales; no teléfono físico ni Auth.
**WEB-11 En progreso**: integrar en ambiente operativo y revisión móvil/humana.
[Entrega](PUBLIC-GAME-CATALOG-IMPLEMENTATION.md) · [E24](PUBLIC-GAME-CATALOG-EVIDENCE.json).

## 2048 G2048-07.2.1 — 2026-10-05

Guía «Cómo jugar» disponible antes del inicio y al ampliar; descripción del iframe
con IDs únicos, progreso de carga consultable y anuncios de puntaje atómicos.
123 regresiones /11 archivos, tipos/lint y build Next aislado PASS. Práctica con
Unity 007 real: flechas, fusión a 4, Tab/Enter, tabla de 16 casillas y Escape con
partida conservada. **07.2 padre En progreso**: lector real, persona nueva y
teléfono pendientes. Host operativo aún sin activar por Docker; 09.4 permanece
pendiente. [Entrega](2048-FIRST-MOVE-IMPLEMENTATION.md) · [E23](2048-FIRST-MOVE-EVIDENCE.json).

## 2048 G2048-09.4 — 2026-10-05

**En progreso; Auth/MFA e integración operativa NOT_RUN.** Scripts para candidata
acotada, aplicación conjunta 09.2/09.3 y recorrido administrativo real preparados.
8 tests Node (incluyen 4 escenarios SQL PostgreSQL 17.11 aislado) y lint PASS;
rollback conjunto, filas conservadas y permisos verificados. Docker falla al
iniciar inferencia; el usuario confirmó reset sin respaldo. 3081/Supabase local
no disponibles. No se aplicaron migraciones ni se activó candidata.
[Entrega y continuación](2048-ADMIN-INTEGRATION-IMPLEMENTATION.md) ·
[E22](2048-ADMIN-INTEGRATION-EVIDENCE.json).

## 2048 G2048-09.3 — 2026-10-05

**Terminado y probado localmente (E21)**: revisión de cadencia regular antes de
liquidar, participación por identidad verificada y sanción atómica de cuenta,
partidas sin liquidar y bitácora. Panel administrativo con decisiones motivadas
y MFA de rutas; resultado ya liquidado preservado y señalado para incidencia.
3.226 pruebas web / 15 archivos, 22 checks PostgreSQL 17.11 reales, tipos/lint,
Next 16.3.8 producción (58 páginas) y navegador con componente real/datos
sintéticos PASS. Sin aplicación de migración ni activación web operativa.
**G2048-09 padre En progreso; siguiente 09.4**: integrar 09.2/09.3 y comprobar
recorrido administrativo autenticado. Bot con pausas variables y multicuenta sin
identidad verificada siguen como límites explícitos.
[Entrega](2048-INTEGRITY-IMPLEMENTATION.md) · [E21](2048-INTEGRITY-EVIDENCE.json).

## 2048: revisión adversarial y límites — 2026-10-04

**G2048-09.2 terminado y probado localmente**: 3.180 pruebas web / 14 archivos,
25 verificaciones SQL reales, tipos/lint PASS. Desempates/cuotas, solicitudes,
reloj, RNG anticipado y detector corregidos. Migración versionada
`20261004184805_guard_2048_seed_visibility.sql` bloquea semilla/SELECT * del
navegador y conserva estado propio/acceso servidor; aplicada y comprobada en
PostgreSQL 17.11 portable aislado, con concurrencia real y cleanup PASS.
La compilación Next anterior sigue válida: sin nuevas modificaciones web runtime.

Cierre de implementación local: **sin aplicación/activación operativa**; esa
integración conserva su verificación de grants/entrada autenticada pendiente.
**G2048-09 padre En progreso; sigue G2048-09.3** para automatización pausada,
multicuenta y coherencia de sanciones. Continúan 08.1/04.4/06.2/07.2.
[Entrega](2048-ADVERSARIAL-IMPLEMENTATION.md) y
[evidencia](2048-ADVERSARIAL-EVIDENCE.json).
Backlog base conservado: 15 terminados, 14 en progreso, 12 pendientes.

## 2048: equivalencia de reglas automatizada — 2026-10-02

**G2048-09.1 terminado y probado localmente**: 2.936 escenarios compartidos
entre el motor TS real y `PracticeBoard` C#, con 40 anclas independientes.
Deslizamiento, fusiones, puntaje, aparición y detección terminal coinciden;
2.995 pruebas web, 18 EditMode, compilación C#, tipos y lint pasados.
Sin diferencias que requieran cambiar runtime, GUI, build `007` o servidor.
RNG offline/competitivo conservan secuencias distintas. **G2048-09 en progreso**:
sigue 09.2, desempates/límites y evidencia adversarial de bots/multicuenta.
08.1/04.4/06.2/07.2 mantienen sus verificaciones físicas/humanas pendientes.
Backlog base: 15 terminados, 14 en progreso, 12 pendientes (41 tickets).
[Entrega y reproducción](2048-RULE-EQUIVALENCE.md).

## Ambiente cloud de desarrollo — 2026-10-02

Desplegado y `READY` en `https://torneos-dev.vercel.app`, proyecto Vercel separado
`torneos-dev`, con Supabase nuevo `jnoyjewsqbooqaiighcs` y 59 migraciones aplicadas.
2048 `007` y Factory Empire 3D `009` disponibles. 603 pruebas web, 11 controles de
configuración/runtime, lint, compilación Next/TypeScript local y Vercel PASS.
22 comprobaciones HTTP/hash/gzip/MIME y cuatro endpoints cron autorizados PASS;
login de jugador observado en navegador. Unity 2048 carga/inicia/mueve; Factory
Empire carga y extrae ferrita 0→33. Sin modificaciones a recursos productivos.
Flow sin credenciales, Resend/Google deshabilitados; Ted Runner y salas Snake
excluidos del deploy por sus límites actuales. No acredita aceptación humana ni
torneo competitivo E2E. [Guía](AMBIENTE-CLOUD-DESARROLLO.md) y
[evidencia](CLOUD-DEVELOPMENT-EVIDENCE.json).

## 2048: prueba física preparada — 2026-10-02

**G2048-08.1 en progreso**. Xiaomi 12 Pro/Android/Chrome indicado por el
propietario; versiones y resultado físico pendientes. Medición HTTP de `007`
en 3081: seis archivos/hash/gzip correctos, 17.562.585 bytes publicados.
Servidor temporal de práctica en `http://192.168.1.4:3083/play` con registro
de carga/FPS/memoria, punteros, orientación y visibilidad. Panel/guardado y
partida con score 4 comprobados en navegador PC; 49 pruebas de límites/reloj
pasadas y lint. Sin nueva build Unity, cambios DB/Flow/firewall ni activación
de imagen. 3081 conserva la versión aprobada. Backlog base: 15 terminados,
13 en progreso, 13 pendientes. Falta probar tacto, fluidez y suspensión reales;
la práctica física no cierra el regreso competitivo autenticado de 04.4.
[Entrega y recorrido](2048-DEVICE-IMPLEMENTATION.md).

## 2048: Unity como único cliente jugable — 2026-10-02

**G2048-10.1 terminada y probada localmente; A06 cerrado**. Imagen aprobada
`g2048-101-candidate-1790975961824` activa/healthy en 3081 con autorización explícita
del propietario. La entrada habitual monta Unity `007`; alias conservan contexto
sin otra partida ni alternativa ligera visible. Plataforma mantiene Auth/registro,
inicio, tiempo, puntuación y ranking. Resultado/ranking 16 y GUI ampliada comprobados
en navegador sobre 3081; 14/14 checks HTTP operativos, además de 195 pruebas web,
14 checks candidata, lint y Next/TypeScript/Docker previos. Configuración, redes,
volúmenes y otros diez contenedores preservados; función SQL, migraciones y
partida/resultado propios sin cambios. Imagen 044 conservada para retorno.
Sin nuevas migraciones ni operaciones Flow. Siguiente: **G2048-08.1**, rendimiento,
gesto táctil y retorno tras suspensión en teléfono físico; 04.4/06.2/07.2 mantienen sus verificaciones
pendientes. [Entrega/evidencia E17](2048-UNITY-ENTRY-IMPLEMENTATION.md).

## 2048 competitivo: recorrido local corregido — 2026-10-02

**G2048-04.4 en progreso**: Auth/inscripción, Unity `007`, direcciones/score servidor,
recarga, dos pestañas y recuperación por botón, timeout/no_moves y rankings reales
comprobados. Corregidos dos defectos: inicio concurrente 200/500 → 200/200/mismo ID;
movimiento pendiente posterior al cierre ya no altera score 16 ni ranking oficial.
RPC `record_game_move` y host corregido activos/healthy en 3081 con autorización
explícita del propietario; única migración local `20261002202731`, sin DB push,
Flow externo ni migraciones Snake ajenas. Imagen `g2048-044-candidate-1790973340774`,
alias local actualizado, retorno `g2048-007-20261002191810` conservado.
240/240 pruebas web (57 rutas), 13/13 comprobaciones SQL desechables, build Next/
TypeScript/lint y 4/4 carreras integradas PASS; 4/4 casos nuevos contra 3081 PASS.
Variables, redes, volúmenes y contenedores restantes preservados. Fuente `4953fb0`.
**Resta regreso real desde segundo plano**: ambas pestañas automatizadas declaran
visible y Chrome no conectado; pruebas de contrato/desfase no demuestran suspensión
real. Staging, móvil físico, lector de pantalla y aceptación humana separados.
[Entrega, fixtures, imágenes y evidencia](2048-COMPETITIVE-IMPLEMENTATION.md).

## Incorporación 2048 a 3081 — 2026-10-02

**G2048-11.1 terminado y probado localmente**: host y cápsula `unity-2048-007`
activos juntos en 3081. Fuentes/arte/Inter/TMP/animaciones/navegación en `afb1fbd`,
rama `codex/2048-clean-gameplay`; WIP de otros frentes preservado, sin merge a main.
533/533 pruebas web (62 archivos), Docker/TypeScript/lint, 34 checks HTTP/hashes y
navegador: carga/recarga, inicio explícito, flechas/WASD/arrastre, reinicio, Tab/Escape
y vista ampliada en escritorio/móvil/paisaje emulados. [Entrega E15](2048-INTEGRATION-IMPLEMENTATION.md).

Inventario operativo `007 / level-030 / snake-arena-006 / factory-empire-014`.
Imagen anterior conservada para retorno; servidor Snake, configuración, volúmenes
y servicios de datos sin reemplazo. Datos comerciales iguales antes/después; la
sesión existente continúa autenticada y Auth renovó un token. Se preservan los
límites previos de práctica autenticada Snake y del entorno de referencia Factory.
Los trabajos cron existentes siguen activos. Sin migraciones/reseed/reset,
operaciones Flow iniciadas por este incremento ni despliegue externo.

Siguiente: **G2048-04.4**, E2E competitivo autenticado sobre esta versión.
Revisión humana/lector de pantalla/teléfono físico y adopción habitual siguen
pendientes. Backlog base: web **7/5/5**, Ted **2/4/7**, 2048 **5/3/3**;
total **41**: **14 terminados/probados, 12 en progreso y 15 pendientes**.
Los apartados siguientes describen entregas anteriores, no el estado operativo actual.

## Incremento 2048: navegación y accesibilidad — 2026-10-02

G2048-07.1 implementa Escape desde la cápsula, Tab/Shift+Tab entre juego y host,
foco de retorno, aislamiento de la vista ampliada, tabla semántica de 16 celdas
y contraste nominal de texto. La carga no toma el foco automáticamente; la
plataforma mantiene las acciones de partida y torneo. Candidata local `007`,
conservando `005` y la intermedia `006`. Detalle/evidencia en
[2048-ACCESSIBILITY-IMPLEMENTATION.md](2048-ACCESSIBILITY-IMPLEMENTATION.md).
Siguiente: **G2048-11.1**, versionar fuentes/recursos compartidos e incorporar
host y candidata juntos a 3081. El contenedor consultado en esta entrega devuelve
200 para `005` y 404 para `007`: el 404 de `005` registrado en auditorías anteriores
es histórico. No se reconstruyó ni se tocaron volúmenes/datos del stack.
04.4, revisión humana/lector de pantalla y teléfono físico siguen pendientes.

## Backlog anterior y Ted Runner — corte 2026-10-01

[BACKLOG.md](BACKLOG.md) es la fuente vigente de prioridades/estados por frente:
**web: 6 terminadas, 4 en progreso, 6 pendientes; Ted Runner: 2/4/7;
2048: 4/3/4**. Total: **40 tickets, 12 terminados/probados, 11 en progreso,
17 pendientes**. El backlog incluye columnas definidas y una tabla de avance
con tareas concretas por frente. Los estados se limitan a su alcance/evidencia.
El backlog antiguo de Orbit es historia, no una plataforma que reimplementar.

Alien Run se llama **Ted Runner** en la web, metadatos, iframe y fuentes de
configuración Unity. `/play/ted-runner` es la ruta pública; `/play/alien-run`
redirige con 308 conservando parámetros. Se mantienen IDs técnicos, SDK y
build `level-030`. La nueva build Unity con el nombre está en progreso TR-03,
con optimización release pendiente TR-10; no se recompiló Unity en esta entrega.

La limpieza Docker se ejecutó primero: **20,34 GB de caché**, contenedor temporal
detenido, imagen PostgreSQL sin uso y red de pruebas retirados. Se conservaron
los diez servicios activos y los cinco volúmenes. Después se reconstruyó la app,
lo que vuelve a crear caché. Evidencia: [DOCKER-CLEANUP-EVIDENCE.json](DOCKER-CLEANUP-EVIDENCE.json).

Validación del incremento anterior `5e9cdc1`: **315/315 pruebas, 42 archivos**, TypeScript/lint,
Docker standalone y **15 comprobaciones HTTP/hashes**, nueva ruta y alias.
Detalle: [PRODUCT-BACKLOG-EVIDENCE.json](PRODUCT-BACKLOG-EVIDENCE.json).
La GUI 2048 posterior **`unity-2048-005`** tiene 14/14 EditMode, 4/4 PlayMode,
315/315 web y WebGL aprobados; su práctica y animaciones pasaron navegador
en preview 3080. **G2048-05 está terminado y probado para ese alcance**;
G2048-06 mantiene aceptación visual humana y G2048-07 accesibilidad parcial.
La incorporación/versionado queda pendiente en **G2048-11**: 3081 todavía
sirve `002`; la URL `005` allí da 404. Se revisaron XML, seis hashes y se
repitieron 15 comprobaciones HTTP en preview, sin recompilar ni repetir gameplay.
Evidencia reciente: [2048-GUI-EVIDENCE.json](2048-GUI-EVIDENCE.json) y
[BACKLOG-UPDATE-EVIDENCE.json](BACKLOG-UPDATE-EVIDENCE.json).
La otra tarea cambió la rama activa del workspace a `codex/2048-clean-gameplay`;
la entrega de backlog se guarda en su propia rama sin cambiar ese checkout.
Verificar Git antes de continuar; no asumir árbol limpio ni cambiar de rama con WIP.

**G2048-04.1 implementada y verificada en APIs**: confirmación desde fila persistida,
recuperación de cierre ganador y 503 ante resultado desconocido. 30 regresiones
nuevas (27 rutas + 3 cliente Supabase/fixture HTTP); suite web 355/355, tipos/lint PASS.
No hubo DB real, cambio de RPC ni actualización 3081. La carrera de un movimiento
en vuelo que escriba después de cerrar requiere comprobación en 04.4; no se afirma
inmutabilidad del resultado. [Entrega y evidencia](2048-CLOSURE-IMPLEMENTATION.md).
**G2048-04.2 implementada y verificada con fixtures**: reloj servidor/monotónico,
desbloqueo con 45 segundos, locks separados y resincronización al volver visible
o desde caché. 26 pruebas nuevas y regresión corregida; suite 382/382, tipos/lint
PASS. Sin navegador competitivo, build ni actualización de 3081 en este incremento.
[Entrega y límites](2048-CLOCK-IMPLEMENTATION.md).
**G2048-04.3 implementada y verificada con fixtures**: recuperación de board/score/
estado/motivo, consulta después del cierre, recuperación explícita sin nueva partida
ni reenviar direcciones, resultado/ranking y compatibilidad con cliente web.
61 pruebas nuevas; suite 443/443, tipos/lint PASS. 126 regresiones PASS sobre el
incremento aislado para commit. Sin DB real, navegador competitivo ni actualización
de 3081. [Entrega y límites](2048-RECOVERY-IMPLEMENTATION.md).
**G2048-06.1 implementada en el host web**: controles, reloj, recuperación y resultado
accesibles alrededor de la cápsula, también al ampliar. 80/80 pruebas dirigidas;
práctica real en preview y 48 verificaciones de layout competitivo simulado en
escritorio/móvil/horizontal. Unity conserva tablero/puntaje/efectos. Sin torneo
autenticado actualizado ni aceptación humana/3081. [Entrega y límites](2048-PLATFORM-GUI-IMPLEMENTATION.md).
Continuar con foco/accesibilidad **07.1**, incorporación **11.1**, E2E **04.4**,
prueba física/humana y adopción **10.1**. A01 corregido a nivel de respuesta API;
A02 corregido en reloj y A04 en recuperación/consumidores; demás gaps y validación
integrada siguen abiertos. Estado y tareas en
[2048-GAP-CLOSURE-PLAN.md](2048-GAP-CLOSURE-PLAN.md). Auditoría y reproducciones en
[2048-CROSS-AUDIT.md](2048-CROSS-AUDIT.md).
Por frente: **WEB-11**, catálogo de juegos; **TR-04**, recorrido/reinicio y después
release TR-10/TR-03. No rehacer las animaciones verificadas de G2048-05.

## Ambiente local operativo — entrega previa `3f71511`

`npm run local:up` levanta Supabase local completo y el contenedor Torneos en
`127.0.0.1:3081`. Auth/email, Mailpit, Storage, DB y cuatro tareas Cron están
operativos. El propietario eligió pagos simulados para desarrollo: checkout,
confirmación y reembolso usan las APIs/RPC existentes, con estado persistente y
etiqueta visible sin cargos reales. `.env.local` y producción no se modificaron.

Auditoría npm completa: **0 vulnerabilidades**, incluido desarrollo; Next 16.3.8,
Vitest/coverage 4.1.11 y CLI Supabase 2.119.0. Validación actual: **315/315 pruebas
en 42 archivos**, scripts 4/4, TypeScript/lint PASS, Docker standalone exit 0 y
14 comprobaciones HTTP/hashes. E2E local de Auth, MFA, admin, torneo y ranking;
seis contratos de pago. Navegador: confirmación real en Mailpit, onboarding,
inscripción, Unity competitivo con puntuación servidor y recuperación al recargar,
checkout móvil y retorno confirmado. Sesión/pagos sobreviven al reinicio.

Guía: `AMBIENTE-LOCAL.md`; evidencia: `LOCAL-ENVIRONMENT-EVIDENCE.json`.
Google requiere configuración externa y está deshabilitado localmente. No hubo
dinero real, despliegue ni aceptación humana. Orbit ya no aparece en Docker;
su volumen tampoco aparece en el inventario final. No se ejecutó eliminación
ni prune durante aquella entrega. La limpieza posterior está registrada arriba.
Los apartados siguientes conservan la evidencia histórica de cada incremento;
sus inventarios, prioridades y nombres anteriores no sustituyen el backlog vigente.

## Historia: workspace y contenedor de aplicación

`C:/torneos` es el workspace activo. La auditoría inicial confirmó 4437 archivos
Alien Run idénticos al origen y cero deltas. Se corrigieron ocho herramientas/pruebas
Unity con rutas fijas al origen y se preservó aquí el catálogo local que utilizan.
`C:/play-games`, su WIP y el volumen PostgreSQL de Orbit permanecen intactos.

`compose.app.yaml` sirve web/APIs/2048/Alien Run en un contenedor independiente
`torneos-app-1`, healthy en `127.0.0.1:3081`, con placeholders de validación local.
Registro compartido de builds activas y verificación previa al empaquetado.
Fuentes Unity, assets licenciados, caches y secretos quedan fuera de Docker.

Validación: Docker webpack/standalone, 305/305 pruebas de plataforma, 4/4 scripts,
TypeScript/lint PASS, Unity 8/8 EditMode, 14 comprobaciones HTTP y navegador con
movimientos 2048/inicio Alien Run. No se afirma E2E competitivo ni aceptación humana.
Detalle: `WORKSPACE-Y-CONTENEDOR.md` y `CONTAINER-WORKSPACE-EVIDENCE.json`.
Orbit sigue disponible como referencia; retirarlo requiere preservar su historia
y datos. Hay avisos de dependencias existentes que resolver antes de publicar.

El propietario eligió TorneosPlay como base comercial y autorizó trasladar Alien Run
desde `C:/play-games`, además de crear 2048 en Unity con arte 2D generado con GPT.
Se preserva el origen completo. No se desplegó, modificó la DB ni ejecutó Flow.

## Historia: incremento de migración

| Entregable | Estado y evidencia |
| --- | --- |
| Alien Run, SDK, `.meta`, Packages y ProjectSettings en `games/alien-run` | 4437 archivos copiados/verificados por SHA256, sin conflictos. Snapshot `level-030` / `practice-v10`; origen preservado. |
| Nuevo 2048 en `games/2048/UnityProject` | Proyecto real Unity 6000.3.24f1, escena creada con Editor API, arte original y procedencia. |
| Práctica pública `/play` con Unity y versión ligera `/play/web` | `unity-2048-002` compilada y verificada en navegador: teclado, puntuación, reinicio, deslizamiento en viewport móvil y ampliar/volver. Capturas en `artifacts/unity-2048`. |
| Cliente de torneo `/tournaments/[id]/play/unity` | Implementado sobre APIs existentes; prueba de sesión aislada. E2E autenticado en staging pendiente. |
| Cliente productivo `/tournaments/[id]/play` | Se conserva durante la validación del cliente Unity. |
| Alien Run `/play/alien-run` | Build real `level-030` trasladada; verificados carga, handshake, inicio de práctica, controles de personaje y modo ampliado en navegador. No se completó una llegada desde este host. |
| Pruebas plataforma | 242/242, 35 archivos; `artifacts/unity-2048/platform-all-tests.json`. |
| Unity 2048 | 8/8 EditMode y 1/1 PlayMode (incluye glifos de controles), WebGL `002` compilada con gráficos. Descarga: 15.818.967 bytes, 74,9% menos que la primera build. |
| Entrega HTTP de builds | 6 archivos 2048 y 5 Alien Run: bytes coinciden con build, MIME y gzip correctos, iframe propio SAMEORIGIN; `/play` conserva DENY. Evidencia `artifacts/http-*.json`. |
| Compilación Next | Compilación final webpack/standalone exit 0, con TypeScript y generación de páginas. Log `artifacts/unity-2048/next-build-final.log`; paquete servidor sin fuentes Unity, SDK ni artefactos. |
| TypeScript y lint de archivos afectados | Ejecutados sin errores. |

Se excluyen de Git caches/bundles y assets KayKit/LocalArt. Se conservan localmente
para usar el proyecto existente. Solo el arte original de 2048 fue generado con IA.

El SDK compartido y el consumidor Unity tienen el mismo contenido; la diferencia
de SHA256 entre esas dos copias corresponde solo a saltos de línea LF/CRLF. No se
sobrescribió su consumidor. La transferencia conserva bytes idénticos al origen.

El modo ampliado ocupa el viewport de la página y ofrece salida visible. La prueba
de fullscreen nativo en el navegador integrado ocultó el canvas; se sustituyó por
este modo y se verificó su renderizado. La vista móvil es emulación de viewport,
no aceptación en un teléfono físico. Alien Run conserva su build de desarrollo
del origen (aprox. 116 MB); optimizar su entrega requiere un incremento posterior.

El otro chat terminó su incremento `level-030`. Se sincronizaron sus fuentes, escena,
SDK, diseño y build al cerrar. `C:/play-games` queda preservado como origen histórico;
continúa el trabajo nuevo desde `C:/torneos`. Si aparece un cambio posterior en el
origen, usa el script de transferencia y revisa conflictos antes de adoptarlo.

## Historia: opciones de negocio tras la migración

1. Validar 2048 Unity con cuentas, reconexión, duración y ranking en un Supabase de
   staging; luego decidir su adopción como cliente competitivo predeterminado.
2. Revisar con usuarios el recorrido público implementado localmente: catálogo,
   reglas, coste/premio, disponibilidad y retorno al torneo después de práctica o
   cuenta. Validar el flujo autenticado en staging; no se afirma aceptación humana.
3. Habilitar más juegos por una estrategia servidor y datos de partida por juego.
   Alien Run permanece como práctica; no acepta puntuaciones del cliente para premios.

Compilación y pruebas técnicas no equivalen a aceptación del propietario/usuarios,
validación legal, integración de dinero ni autorización de publicación.

## Historia: incremento de web pública

Implementado en `codex/tournament-discovery`: tarjetas compartidas entre portada
y catálogo, cupos agregados sólo en servidor, disponibilidad por horario/capacidad,
ficha con reglas/requisitos y acciones coherentes, retorno contextual desde ambas
prácticas de 2048 y conservación de destino en cuenta/confirmación/onboarding.
Errores de carga y conteo ya no se presentan como cero torneos o cero inscritos.
No se modificaron migraciones, economía ni clientes de juego.

Pruebas de esta entrega: **295/295 en 39 archivos**, TypeScript, lint afectado y
compilación Next webpack/standalone exit 0. Navegador con fixtures locales y Auth
simulada: estados, errores, destinos y render en escritorio/móvil. Evidencia en
`docs/WEB-DISCOVERY-EVIDENCE.json`; detalle/reproducción en
`docs/SIGUIENTE-INCREMENTO-WEB.md`; capturas/logs en `artifacts/tournament-discovery`.
E2E con cuentas de staging, teléfono físico y aceptación humana permanecen pendientes.
La política de equivalencia competitiva previa a captar participantes pagados
continúa abierta; esta entrega no autoriza lanzamiento pagado.

## Continuidad del trabajo

Para el próximo chat, usar el proyecto **torneos** y la copia local `C:/torneos` en
`codex/product-backlog-ted-runner`. Los incrementos desde `df6d463` aún no están integrados en `main`;
las builds y assets locales ignorados también deben conservarse. Decisiones,
evidencia, límites y mensaje para retomar en
[CONTEXTO-PARA-CONTINUAR.md](CONTEXTO-PARA-CONTINUAR.md).

## GUI de 2048 — 2026-10-01

Build local **unity-2048-005**: interfaz de partida con tablero y puntaje,
fichas/fondo 2D GPT e Inter (TMP). Inicio y nueva partida pertenecen a la
plataforma. Teclado y arrastre comparten deslizamiento, fusión y aparición;
los efectos siguen el estado confirmado y respetan movimiento reducido.

Validación: **14/14 EditMode, 4/4 PlayMode, 315/315 web**, TypeScript/lint,
WebGL y 15 comprobaciones HTTP/hashes. Navegador: inicio explícito, fusión
0 → 4 con teclado, arrastre en viewport 390 × 844 y reinicio 4 → 0 desde
la plataforma. Revisión visual y capturas del acabado final realizadas.
No es aceptación humana ni prueba en teléfono físico. El contenedor de
3081 no se reempaquetó; la revisión está en 127.0.0.1:3080/play.

Detalle: [2048-GUI.md](2048-GUI.md) y [evidencia](2048-GUI-EVIDENCE.json).
