# G2048-09.2 — desempates, límites y revisión adversarial

2026-10-04. **G2048-09.2 terminado y probado localmente**: implementación web y
migración de permisos verificadas, 3.180 pruebas web y 25 comprobaciones SQL reales
PASS. El cierre corresponde a código y pruebas; aplicación/activación operativa
queda en integración. **G2048-09 sigue En progreso** por contramedidas pendientes.
Rama `codex/2048-clean-gameplay`; implementación `92ae970`, cierre sobre esa base.
Sin activación ni merge a main.
[Evidencia](2048-ADVERSARIAL-EVIDENCE.json).

Unity conserva tablero y puntaje confirmado. La plataforma autoriza la cuenta,
orquesta la sesión, calcula cada dirección y persiste el resultado. No se cambian
el motor, el proyecto Unity, WebGL `007`, DB operativa, Flow ni despliegues.

## Correcciones preparadas

| Brecha reproducida o contrastada con fuente | Corrección | Evidencia local |
| --- | --- | --- |
| Ranking provisional y auditoría omiten el último desempate del finalizador SQL | Orden completo: puntaje descendente, ficha máxima descendente, movimientos ascendentes, `user_id` ascendente. Resultado cerrado conserva `rank` persistido | Se ejecutan ambas páginas reales con un transporte simulado y se comparan sus órdenes con la consulta de la migración `20260805163009` |
| Cuotas separadas por cuenta + IP declarada permiten renovar el límite cambiando la IP | Claves por cuenta, compartidas entre torneos/pestañas/IP; inicio 15, movimiento 240 y timeout 30 solicitudes por 60 segundos | Pruebas de rutas con IP rotada, cuentas distintas y cuota denegada; RPC real sustituido por transporte simulado |
| Fallos de la RPC de cuotas permiten continuar | Estas tres rutas exigen cuota confirmada: 503 `RATE_LIMIT_UNAVAILABLE` si RPC/SDK/datos fallan; 429 si se agota | Pruebas del helper real. Política predeterminada de otros consumidores conservada |
| `null`, arrays, tipos incorrectos, fracciones y desbordamiento JSON llegan a consultas o generan 500 | Validación anterior a consultas de partidas: objeto, ID acotado, dirección válida, número entero de movimiento PostgreSQL y timestamp entero no negativo seguro | Casos inválidos → 400 y ninguna lectura de partida/commit. Solicitudes inválidas consumen cuota de su cuenta |
| El instante exacto de fin aún permite iniciar; la configuración del torneo se cachea cinco minutos | Fin exclusivo (`now >= end`), configuración fresca por movimiento y perfil confirmado para autorizar inicio/movimiento | Casos de reloj exacto, cancelación posterior, perfil ausente/error y recuperación sin reiniciar deadline |
| API permite consultar futuros estados RNG para anticipar apariciones | `nextRngStates: []` en creación, recuperación, conflicto de inicio y movimiento. Se mantiene el campo legado; Unity usa apariciones confirmadas y no lo consume | Puntuación/tablero/seed enviados por cliente se ignoran; no se publica RNG futuro en las respuestas probadas |
| Detector aplica umbral de cinco con cuatro intervalos, incluye movimientos futuros y acepta fechas inválidas | Se exigen seis filas para cinco intervalos finitos positivos; ventana termina en el movimiento analizado | Se prueba `analyzeMove` real: cuatro intervalos no sancionan; cinco sí; ráfaga rota/futura no sanciona |
| Retroceso del reloj del cliente suspende automáticamente; fallos de escritura se reportan como sanción aplicada | Reloj cliente produce señal `client_clock` sin sanción. Se comprueban perfil retornado y errores de invalidación | Pruebas de retroceso, perfil faltante, error de perfil y error de partidas |

Las cuotas limitan **solicitudes**, no puntaje ni número total de jugadas válidas.
Su fuente sigue siendo `rate_limit_consume`; no se introduce otro contador en
memoria. La duración sigue siendo el menor valor entre inicio + duración máxima
y fin del torneo. La restricción existente `unique(tournament_id, user_id)` y la
recuperación de conflictos conservan una partida por cuenta y torneo.

Leer la configuración fresca añade una consulta por movimiento, ejecutada junto
con perfil/partida. Debe medirse en el recorrido físico/competitivo pendiente.
El cliente web optimista histórico deja de disponer de RNG anticipado; la entrada
canónica ya usa Unity exclusivamente. No se afirma compatibilidad jugable con ese
cliente retirado.

## Corrección de permisos verificada

La migración `20260805163009_fixed_prize_business_model.sql` concede `SELECT` sobre
**toda** `public.games` a `authenticated`. La política de
`20260507001033_optimize_rls_policy_performance.sql` permite al jugador leer su
fila. `seed` es una columna de esa fila. Por la combinación de ambas fuentes, un
jugador podría obtener la semilla activa directamente mediante PostgREST, aunque
la API ya no exponga RNG futuro. **Reproducido en PostgreSQL real con el grant
anterior y una política de fila propia.** RLS limita filas, no oculta columnas;
ver [documentación oficial](https://supabase.com/docs/guides/database/postgres/row-level-security).

Corrección versionada:
[migración](../supabase/migrations/20261004184805_guard_2048_seed_visibility.sql),
creada con Supabase CLI 2.119.0 mediante `migration new guard_2048_seed_visibility`.
Revoca lectura general/semilla del navegador y concede solo columnas de estado
seguras. Conserva la política de filas y acceso servidor `service_role`; la
auditoría pública sigue mostrando huellas calculadas en servidor, no la semilla
cruda. El candidato anterior se reemplazó por esta migración como fuente única.
**Aplicada y probada solo en el cluster aislado; sin aplicar al ambiente operativo.** La regla
de [AGENTS.md](../AGENTS.md) dice «No cambies DB, Flow, despliegues, recursos externos
ni licencias por esta migración»; esta entrega conserva ese alcance.

El verificador SQL ejecutó **25/25 comprobaciones PASS** en PostgreSQL **17.11**
nativo portable: grant inseguro reproducido, semilla/`SELECT *` bloqueados tras
migrar, columnas propias seguras y acceso servidor conservados, cuatro niveles
de desempate, sesión única, cuota 240/241, 20 peticiones paralelas compartiendo
15 inicios permitidos, expiración y aislamiento de cuotas/permisos. También volvió
a ejecutar los 13 casos del contrato de commit: dos direcciones simultáneas
persisten una sola, movimiento pendiente tras timeout conserva resultado, reloj
incluye espera por bloqueo, tablero/secuencia obsoletos y RPC sin permiso rechazados.

Docker sigue sin responder. Se utilizaron los [binarios oficiales de EDB](https://www.enterprisedb.com/download-postgresql-binaries),
distribución enlazada por [PostgreSQL](https://www.postgresql.org/download/windows/),
sin instalador ni servicio Windows. Cada ejecución inicializa una carpeta UUID
propia en artifacts, escucha solo en `127.0.0.1` y se detiene en `finally`:
**cleanup PASS**. Ningún proceso/DB de otro trabajo se detuvo. No se leyó ni cambió
Supabase operativo ni se copiaron sus datos. Binario y datos sintéticos quedan
locales e ignorados; procedencia/hash en evidencia.

## Límites que las pruebas hacen explícitos

- Dos cuentas autenticadas no pueden modificar la partida ajena con estas rutas.
  Cada una conserva su cuota. Esto permite usuarios legítimos detrás de una misma
  IP y **no identifica a una persona con varias cuentas**.
- La simulación adversarial de 39 movimientos a intervalos de 500 ms y score bajo
  pasa `analyzeMove` y revisión de ganador sin alertas. No es una prueba E2E de bot
  autenticado: confirma un contraejemplo de las heurísticas reales con transporte
  simulado. La autoridad de puntaje no prueba juego humano.
- `after()` analiza tras persistir y responder. No garantiza bloqueo en N+1 frente
  a solicitudes concurrentes. Suspensión de perfil e invalidación son dos
  escrituras: si falla la segunda puede quedar perfil suspendido con invalidación
  sin confirmar. El error se reporta; no se declara atomicidad ni se cambió DB.
- Umbrales de tiempo/puntaje siguen siendo heurísticos. Ráfagas de recepción por
  transporte pueden generar señales; no se acredita ausencia de falsos positivos.

## Verificación y reproducción

**3.180 pruebas en 14 archivos PASS**, tipos del incremento y lint PASS, ejecutados
nuevamente junto con las 25 pruebas SQL al cerrar. Incluye
los 2.936 casos compartidos de reglas y pruebas existentes de cierres, transporte
PostgREST, regreso al torneo, entrada Unity, disponibilidad y revisión de ganadores.
Los primeros lotes reprodujeron 26 fallos de contrato/limiter y siete del detector
antes de las correcciones; reportes en `artifacts/2048-adversarial` (ignorados).

Compilación Next **16.3.8**, TypeScript y 58 páginas estáticas PASS en una copia
aislada de las fuentes web de `c46ae22` + solo los cambios de runtime de 09.2.
Dependencias locales compartidas mediante junction; credenciales de compilación
ficticias y URL Supabase inalcanzable. No se copiaron proyectos Unity, secretos ni
WIP cloud/Factory/Snake. Advertencia de tracing dinámico en `lib/dev/local-flow.ts`
preexistente; no se modificó ese frente. Candidata **sin activar**.

```powershell
node scripts/verify-2048-adversarial.mjs
# Windows: usa los binarios portables locales, un cluster nuevo y loopback.
node scripts/verify-2048-adversarial.mjs --sql --pg-bin artifacts/2048-adversarial/postgres-portable/pgsql/bin
# Alternativa con Docker operativo: contenedor propio sin red.
node scripts/verify-2048-adversarial-sql.mjs
node scripts/verify-2048-adversarial.mjs --sql
```

No se ejecutaron navegador autenticado/DB operativa ni nuevas pruebas físicas o
Editor Unity. Sus resultados anteriores no cierran estos límites.

## Trabajo siguiente

1. **Integración operativa pendiente:** verificar grants del ambiente autorizado,
   aplicar la migración probada y activar la candidata web según su procedimiento
   autorizado. El cierre local de 09.2 no declara ese ambiente corregido ni probado.
2. **G2048-09.3:** tratar los hallazgos confirmados de automatización pausada,
   persona con varias cuentas y coherencia de sanción/resultado cerrado. G2048-09
   padre sigue abierto. Las pruebas adversariales de 09.2 describen estos límites;
   no constituyen una solución de identidad/bots ni habilitan premios comerciales.
3. Continúan 08.1 (informe Xiaomi), 04.4 (regreso competitivo físico), 06.2
   (aceptación visual) y 07.2 (lector/nuevo usuario).
