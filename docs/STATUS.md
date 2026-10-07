# Estado — TorneosPlay

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

## Preparación de dinero real: RM-12 — 2026-10-05

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

Seis migraciones ensayadas y aplicadas sólo en Supabase dev; catálogo, grants,
semilla y Auth real PASS. Candidata `9548aed` publicada en el proyecto torneos-dev:
https://rm12-torneos-dev.vercel.app, con proveedores bloqueados y caja pausada.
3.811 pruebas/81 archivos, tipos/lint/build remoto, 287 archivos publicados,
práctica WebGL real y denegación de objetos privados PASS. Dominio compartido
asignado a otro despliegue; trabajo simultáneo preservado.
MFA AAL2, correos operativos, recuperación completa y ciclo financiero pendientes.
Definir monto/pagador antes de cobro. **RM-12 IN_PROGRESS; NO_GO vigente.**
[Despliegue](RM12-DESPLIEGUE-DEV.md),
[evidencia](RM12-DESPLIEGUE-DEV-EVIDENCE.json),
[protocolo inicial](RM12-STAGING-Y-ENSAYO.md).

## Preparación de dinero real: RM-11 — 2026-10-05

Candidata `codex/real-money-access`, checkout aislado; configuración efectiva
compartida build/runtime, launcher que rechaza configuración inválida antes de
iniciar Next, toolchain fijado, manifiesto de fuentes/WebGL/SQL/artefacto y pipeline
preparado. Auditoría: 8 HIGH dev con excepción limitada hasta 2026-11-05; producción 0.
**Validación local; NO_GO vigente.** CI remoto/obligatoriedad, Docker Linux y staging
real no ejecutados. Continúa RM-12, ensayo externo sobre la candidata identificada.
[Entrega](RM11-CONFIGURACION-Y-RELEASE.md) y
[evidencia](RM11-CONFIGURACION-Y-RELEASE-EVIDENCE.json).

## Preparación de dinero real: RM-10 — 2026-10-05

Candidata `codex/real-money-access`, checkout aislado; **implementación local**
de cortes diarios banco/Flow, evidencia privada y doble revisión. Diferencias
con responsable/plazo, comisiones reales conciliadas explícitamente y reserva
consolidada sin duplicar premios, saldo y retiros. Nuevos cobros/publicaciones
se bloquean por pausa, corte vencido, diferencias, límite o cobertura insuficiente.
**Sin migración operativa, despliegue, movimientos bancarios ni dinero real.**
**NO_GO vigente**; siguen ensayo externo/contador y RM-11, configuración efectiva.
[Entrega](RM10-CONCILIACION-Y-RESERVA-CAJA.md) y
[evidencia](RM10-CONCILIACION-Y-RESERVA-CAJA-EVIDENCE.json).

## Preparación de dinero real: RM-09 — 2026-10-05

Candidata `codex/real-money-access`, checkout aislado; **implementación local**
de obligaciones por monto/edad, comprobaciones contables, incidentes persistentes,
acuse con MFA, escalamiento al suplente y recuperación comprobada. Inicio,
éxito del procesamiento y fallo del respaldo separados; avisos durables con
aceptación del proveedor distinguida de entrega y recepción humana.
Watchdog cada cinco minutos en configuración fuente y monitor externo preparado.
**Sin migración operativa, despliegue, correos reales ni activación de workflows.**
**NO_GO vigente**; sigue RM-10, conciliación y reserva de caja.
[Entrega](RM09-OBLIGACIONES-Y-ALERTAS.md) y
[evidencia](RM09-OBLIGACIONES-Y-ALERTAS-EVIDENCE.json).

## Preparación de dinero real: RM-08 — 2026-10-05

Candidata `codex/real-money-access`, checkout aislado; **implementación local**
de revisión obligatoria de todos los premios reales, retenciones persistentes,
validación vigente de ban/KYC/roles/disputas y pago manual con operador responsable
más un segundo aprobador. Incertidumbre exige conciliación; comprobantes
conservados y referencias únicas. Gasto/pasivo preservados durante la revisión.
**3.628 pruebas web / 68 archivos, 83 checks PostgreSQL, tipos/lint y build
Next Webpack PASS**. Sin aplicación operativa, despliegue o transferencias reales.
**NO_GO vigente**; sigue RM-09, obligaciones por edad/monto y alertas atendidas.
[Entrega](RM08-RETENCION-Y-REVISION-PREMIOS.md) y
[evidencia](RM08-RETENCION-Y-REVISION-PREMIOS-EVIDENCE.json).

## Preparación de dinero real: RM-05/06/07 — 2026-10-05

Candidata `codex/real-money-access`, checkout aislado; **implementación local** de
pagos recuperables por orden comercial, obligaciones de devolución dentro de la
cancelación/settlement, reclamo único de envío y retiros con solicitud/débito
atómicos e identificador estable. Incertidumbre visible y sin reenvío automático.
**3.591 pruebas web / 65 archivos, 62 checks PostgreSQL, tipos/lint y build
Next Webpack PASS**. Sin aplicación operativa, Flow externo o activación de dinero.
**NO_GO vigente**; siguiente RM-08, retención/revisión de premios y pagos.
[Entrega](RM05-RM07-DINERO-RECUPERABLE.md) y
[evidencia](RM05-RM07-DINERO-RECUPERABLE-EVIDENCE.json).

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

Actualizado: 2026-10-01. Rama local de trabajo: `codex/operational-local-environment`,
desde `8790a37`. `main` sigue en `6308515`.

## Ambiente local operativo

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
ni prune durante esta entrega. Los apartados siguientes son evidencia histórica.

## Workspace y contenedor de aplicación

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

## Incremento de migración

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

## Próximas opciones de negocio

1. Validar 2048 Unity con cuentas, reconexión, duración y ranking en un Supabase de
   staging; luego decidir su adopción como cliente competitivo predeterminado.
2. Revisar con usuarios el recorrido público implementado localmente: catálogo,
   reglas, coste/premio, disponibilidad y retorno al torneo después de práctica o
   cuenta. Validar el flujo autenticado en staging; no se afirma aceptación humana.
3. Habilitar más juegos por una estrategia servidor y datos de partida por juego.
   Alien Run permanece como práctica; no acepta puntuaciones del cliente para premios.

Compilación y pruebas técnicas no equivalen a aceptación del propietario/usuarios,
validación legal, integración de dinero ni autorización de publicación.

## Incremento de web pública

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
`codex/operational-local-environment`. Los incrementos desde `df6d463` aún no están integrados en `main`;
las builds y assets locales ignorados también deben conservarse. Decisiones,
evidencia, límites y mensaje para retomar en
[CONTEXTO-PARA-CONTINUAR.md](CONTEXTO-PARA-CONTINUAR.md).
