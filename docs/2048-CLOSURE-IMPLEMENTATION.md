# G2048-04.1 — confirmación del cierre persistido

Fecha: 2026-10-01. Implementado y verificado en las APIs del checkout local.
Alcance: corregir A01 de [la auditoría](2048-CROSS-AUDIT.md); integración autenticada
y validación de interleavings en DB real siguen en G2048-04.4.

## Cambio entregado

Timeout y las ramas de expiración de start/move comparten `closeExpiredGame`.
La escritura filtra gameId, tournamentId, userId y estado activo. Solicita la fila
persistida con `UPDATE ... RETURNING` a través de Supabase `.select().maybeSingle()`.
La respuesta utiliza score y ended_at de esa fila, no los de la lectura anterior.

Un error de escritura/transporte responde 503 / `GAME_CLOSURE_UNCONFIRMED`, sin
`timeout:true` ni `timedOut:true` y sin exponer diagnósticos DB. No se reintenta una
escritura cuyo resultado es incierto. Si no se modificó una fila, se recupera el
estado con los mismos filtros de propiedad: se acepta únicamente un estado terminal
persistido con score válido. Un estado activo, ausente o una lectura fallida no
constituyen cierre confirmado. Otra petición que terminó por `no_moves` conserva
ese motivo y su puntuación; no se convierte en timeout.

No se cambiaron esquema DB, RPC, datos reales, motor de movimientos, Flow, Unity,
builds publicadas ni contenedores. Las respuestas de start/move conservan el error
HTTP existente y añaden puntuación/fecha confirmadas; el contrato de recuperación
terminal completo pertenece a G2048-04.3.

## Verificación ejecutada

- **27 regresiones de rutas**: timeout/start/move, error de escritura, cero filas,
  estado activo tras recuperación, cierre ganador, score actualizado por movimiento
  previo, motivo no_moves, lectura fallida, usuario ajeno y petición anónima; también
  cierre de ventana, deadline no alcanzado e idempotencia de timeout existente.
- **3 pruebas del cliente Supabase real contra fixture HTTP local**, sin DB:
  filtros y retorno del PATCH, cero filas seguido de GET de recuperación, rechazo
  sin repetición de PATCH. La versión instalada de PostgREST JS solicita lista y
  convierte cardinalidad cero a null para `.maybeSingle()`.
- **355/355 pruebas** de la suite web del checkout compartido; TypeScript y lint
  de archivos afectados aprobados. Incluye trabajo previo de otros frentes presente
  localmente; no afirma que esos cambios estén en este commit.
- Los tests de producto son versionados en `__tests__`. `artifacts/**` queda fuera
  de Vitest por defecto: las reproducciones históricas de la auditoría se conservan,
  pero comprobar un defecto antiguo no es una regresión del comportamiento corregido.

Comandos:

```powershell
npx vitest run --reporter=json --outputFile=artifacts/2048-cross-audit/closure-all-tests.json
npx tsc --noEmit
npx eslint lib/tournament/close-expired-game.ts 'app/api/tournaments/[id]/game/timeout/route.ts' 'app/api/tournaments/[id]/game/start/route.ts' 'app/api/tournaments/[id]/game/move/route.ts' __tests__/game-closure-routes.test.ts __tests__/game-closure-postgrest.test.ts vitest.config.mts
```

## Alcance de cierre y siguiente paso

A01 queda corregido y comprobado **a nivel de API y transporte simulado**; no es
aprobación del recorrido competitivo completo ni validación de persistencia real.
Una fila retornada confirma el estado en ese momento, no demuestra que ningún
escritor posterior pueda alterarla. La RPC histórica `record_game_move` actualiza
por ID sin condición `status=active`: el interleaving de un movimiento ya en vuelo
que termine después del timeout sigue requiriendo prueba y revisión en G2048-04.4.
No se afirma que la puntuación terminal sea inmutable bajo ese interleaving.

No se recompiló Unity ni Next producción; no se actualizó 3081. Se preservaron
fuentes/builds/WIP ajenos y `main`. Siguiente tarea: **G2048-04.2**, reloj y bloqueo.
[Índice de evidencia](2048-CLOSURE-EVIDENCE.json).
