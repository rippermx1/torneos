# Primer incremento: acceso comercial y semilla de 2048

Fecha **2026-10-05**. Estado: **candidata implementada y validada localmente; integración operativa pendiente**. Se mantiene **NO_GO para dinero real**.

## Base y aislamiento

Base: `299075d20ca7d631b3d86782951f3b763ec742d8`, después del cierre local de G2048-09.2. Rama de entrega: `codex/real-money-access`. Checkout aislado: `C:/Users/valde/.codex/worktrees/real-money-access/torneos`. El checkout compartido `C:/torneos` conserva su rama y WIP de juegos; no se copiaron ni reconstruyeron assets Unity.

La candidata conserva 2048 `unity-2048-007`, direcciones calculadas por servidor y la migración existente `20261004184805_guard_2048_seed_visibility.sql`. Los hashes de fuentes y de los archivos Unity locales identifican la base; no acreditan que esa versión esté servida por un ambiente remoto.

## Cambio observable

Una fila de inscripción ya no basta para jugar un torneo pagado. El servidor exige autorización afirmativa de la base en inicio/movimiento; si falta la nueva RPC, la red falla o su respuesta no confirma autorización, devuelve 503 y no muta la partida. Pago ausente devuelve 402; elegibilidad/inscripción no válidas devuelven 403. La lectura de un resultado propio cerrado se conserva.

La migración nueva `20261005131208_guard_commercial_entry.sql`, creada con CLI, contiene:

- Revocación de escrituras de navegador en inscripciones, partidas, movimientos e intentos de pago, incluidos grants independientes por columna. Conserva SELECT/RLS y el acceso servidor.
- Control de rol `user`, no suspensión, mayoría de edad, aceptación vigente de términos y KYC aprobado para pago. Se comprueban registros actuales bajo locks, sin confiar en metadata editable del JWT.
- Inscripción pagada exige intento del mismo usuario/torneo, monto íntegro correcto, status `paid`, confirmación de proveedor 2 y orden Flow positiva. La API pública del proveedor se verifica en el flujo servidor existente; sólo éste puede liquidar por RPC.
- Inserción de inscripciones protegida por trigger: serializa cupo, comprueba cuota y ventana con reloj real tras la espera por lock. Las gratuitas conservan ruta servidor con edad/términos/rol, sin exigir un cobro ni KYC pagado.
- Settlement marca el pago dentro de la transacción antes de registrar; ambos pasos se revierten juntos si inscripción/cupo/elegibilidad fallan. Verifica correlación de token/orden y mantiene idempotencia por orden comercial.
- Creación/cambio de tablero o puntaje exige autorización también al escribir en DB. Revocar KYC/pago entre el preflight y commit impide el movimiento; la inserción de `game_moves` revierte con el UPDATE fallido. Cerrar sin cambiar el resultado conserva su comportamiento.

Las funciones nuevas privilegiadas están restringidas y fijan `search_path` vacío. El SDK incorpora el tipo de la RPC. La versión de términos SQL está comprobada contra `CURRENT_TERMS_VERSION`; cualquier actualización futura de términos debe actualizar esa autorización versionada.

## Evidencia y reproducción

Ver [evidencia resumida](RM01-RM03-ACCESO-COMERCIAL-EVIDENCE.json). Se ejecutaron las pruebas del código versionado de esta candidata; los juegos nuevos sin seguimiento en el checkout compartido no forman parte de ese recuento. El verificador SQL usa políticas/RPC relevantes de las migraciones originales y un esquema fixture mínimo, no un clon completo de Supabase.

Resultado: **3.562/3.562 pruebas web en 63 archivos; 36/36 comprobaciones PostgreSQL 17.11; tipos y lint dirigidos PASS; Next 16.3.8 Webpack PASS**. Los ensayos SQL también ejecutan los adaptadores contables originales: la inscripción rechazada revierte sus asientos; settlement repetido conserva una venta/comisión y los asientos comprobados cuadran. No acredita circuito tributario ni conciliación bancaria real.

```powershell
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js lib/tournament/competitive-entry.ts types/database.ts 'app/api/tournaments/[id]/game/start/route.ts' 'app/api/tournaments/[id]/game/move/route.ts' __tests__/competitive-entry.test.ts __tests__/game-closure-routes.test.ts scripts/verify-commercial-entry-sql.mjs
node scripts/verify-commercial-entry-sql.mjs --pg-bin C:/torneos/artifacts/2048-adversarial/postgres-portable/pgsql/bin
```

El cluster es nuevo y exclusivo del ensayo, sólo escucha loopback y se detiene al finalizar. Las identidades/claims SQL son fixtures; **no son JWT de Supabase ni pruebas HTTP Data API**. Los logs y JSON detallados se conservan bajo `artifacts/commercial-entry` en este checkout, ignorado por Git.

La build Next 16.3.8 se ejecutó con configuración sintética y `--webpack`. El build predeterminado Turbopack falló porque `node_modules` es un enlace al checkout original fuera de la raíz de su filesystem. Se conserva el fallo, sin cambiar el bundler del producto ni instalar/sobrescribir dependencias compartidas. La compilación Webpack valida esta candidata; no demuestra un build Turbopack en el runner de despliegue.

## Pendientes para cerrar operativamente OP-01/02

1. Revisar/integrar la candidata en la rama de release, seleccionando las dos migraciones de acceso; no aplicar todo el WIP de juegos ni cambiar la DB productiva en este incremento.
2. Inventariar inscripciones/juegos vigentes antiguos sin prueba de pago, campos nulos o elegibilidad incompatible. Resolver/quarantinar con trazabilidad antes de activar torneos; no contar esas filas para mínimos ni conceder premios, no borrarlas ni fabricar evidencia de cobro.
3. Probar contra un Supabase de staging autorizado con Auth/JWT y Data API reales: grants por tabla/columna, ownership, RPC, vistas/exportaciones, lectura admin y recorrido competitivo completo. Una base sin la RPC devuelve 503 por diseño; la migración debe preceder a la activación de estas rutas.
4. Medir el costo de autorización fresca y locks durante movimientos concurrentes. Sin benchmark de latencia/carga ni aceptación física/humana nueva en esta entrega.

No hay aplicación cloud, Flow real, despliegue, transferencia ni merge a main. RM-01 fija la base técnica, pero la asignación nominal/reserva sigue pendiente. RM-02 y RM-03 cuentan con implementación/pruebas locales, no cierre de integración operativa. [RM-04 tiene expediente preparado](EXPEDIENTE-MODELO-COMERCIAL.md), sin respuestas externas.

## Siguiente incremento

RM-05/06/07: separar vencimiento comercial de resultado financiero; obligaciones durables de devolución antes del envío; retiros atómicos. Este cambio sólo ajusta el orden transaccional necesario para autorizar una inscripción legítima. No corrige el manejo de pagos tardíos/desconocidos, refunds duplicados ni débitos huérfanos de la auditoría.

Si el pago fue confirmado por Flow pero la elegibilidad se revoca antes del settlement, la transacción de inscripción revierte; ese cobro externo continúa siendo una obligación por conciliar/reembolsar. La recuperación durable de ese caso y las antiguas fallas del refund deben cerrarse en RM-05/06 antes de dinero real. El crédito/rakeback legado no constituye prueba de pago en este modelo y no habilita entrada pagada; no se activa ninguna recompensa.
