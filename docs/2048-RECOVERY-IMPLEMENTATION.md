# G2048-04.3 — recuperar partida y resultado

Fecha: 2026-10-01. A04 corregido a nivel de contrato y lógica, con fixtures.
Rama `codex/2048-clean-gameplay`, base `ec2cbf0`. Siguiente: **G2048-06.1**,
controles/avisos/resultado visibles en GUI normal y ampliada.

## Resultado observable

Una partida existente se recupera cuando Unity queda listo, sin ofrecer otro
inicio competitivo. Se conserva el tablero, puntaje y número de movimiento del
servidor, tanto vigente como terminada por `no_moves`, timeout o abandono. El
host muestra motivo/puntaje final y enlace al ranking; el canvas sigue recibiendo
tablero/puntaje por el puente existente. Los controles ampliados quedan en 06.1.

Las páginas Unity y web permiten consultar una partida propia después del cierre
del torneo. Sin inscripción, con lectura desconocida o sin partida existente
fuera de ventana, no ofrecen comenzar. La API mantiene Auth/rol, cuenta suspendida,
inscripción y filtros de propiedad; no se entrega seed ni cambia elegibilidad.

`Recuperar partida` consulta el estado completo tras perder una respuesta. Sólo
una recuperación explícita validada libera un movimiento incierto; no vuelve a
enviar la dirección. La petición `recoverOnly: true, gameId` nunca inserta otra
partida, y rechaza ausencia o identidad diferente. Si la existente venció, se
conserva el cierre condicionado de 04.1; no se repite un movimiento o un guardado
desconocido. La consulta automática de tiempo conserva el bloqueo de un movimiento
incierto vigente hasta la recuperación explícita.

## Contrato y compatibilidad

`start` y `timeout` retornan un estado completo confirmado para vigente/completada/
abandonada. Los campos previos siguen disponibles: board, score, gameId,
moveCount/moveNumber, deadlineAt, serverNow y flags de timeout. Se añaden
`stateConfirmed`, `status`, `gameOver`, `endReason` y `endedAt`. RNG se conserva
para partidas vigentes; los resultados no necesitan ni exponen el seed.

Una recuperación terminal en `start` responde 200; un movimiento rechazado por
partida ya terminada conserva HTTP 400, acompañado del resultado completo.
El cliente Unity admite ese resultado únicamente en 400/409 y tras validarlo;
401/403/503 siguen siendo errores. Ambos consumidores locales se actualizaron.
Estados incompletos, `invalid`, `not_started`, tablero ausente o recuperación
fallida devuelven 503 `GAME_STATE_UNCONFIRMED`, sin fabricar score cero ni cierre.
El cero es válido cuando figura expresamente en un resultado completo.

El cierre por expiración obtiene board/score/move_count de UPDATE RETURNING o de
la lectura del ganador concurrente, sin combinar el tablero viejo con el score
nuevo. El último movimiento que calcula `no_moves` realiza una lectura del
resultado persistido antes de responder como final. Un estado aún activo o una
lectura fallida no se presentan como resultado registrado.

`GameBoardClient` reconoce terminales al cargar, mover y consultar timeout; no
confunde abandono con falta de movimientos. Su contador usa referencia servidor
y tiempo monotónico, y la expiración local solicita confirmación antes de mostrar
el resultado. Una respuesta perdida pausa la cola y permite recuperación; una
respuesta tardía no sustituye el resultado terminal ya confirmado en la UI.

## Verificación y límites

- **443/443 pruebas, 53 archivos** del checkout compartido; TypeScript y lint
  afectados PASS. Se agregaron 61 pruebas: 28 sesión/HTTP/snapshot, 15 rutas,
  8 cliente web, 6 páginas, 2 host y 2 HTML de resultado renderizado.
- **126/126 pruebas** sobre copias aisladas de los archivos preparados para
  commit, excluyendo las diferencias previas de GUI. Incluye regresiones de reloj,
  cierres y consultas del cliente Supabase real contra HTTP simulado. Se verificó
  que SELECT de cierre incorpora board y move_count. No utiliza DB real.
- Informes `artifacts/2048-recovery/all-tests.json` e `index-tests.json`;
  [resumen de evidencia](2048-RECOVERY-EVIDENCE.json).

No se ejecutó navegador ni suspensión física en este incremento: la recuperación,
el acceso después del cierre y el HTML del resultado están comprobados mediante
fixtures. El E2E autenticado/otra pestaña real queda en 04.4, después de incorporar
host y build en 3081 mediante 11.1. No se recompiló Unity ni Next de producción.
No se modificaron esquema, DB real, RPC, Flow, recursos, licencias o despliegues.

El RPC histórico todavía puede escribir un movimiento tardío por ID sin condición
de estado activo. Se recupera el estado observado del servidor; no se afirma
inmutabilidad futura ni resolución de todos los interleavings reales de 04.4.
La aceptación humana, accesibilidad completa y móvil físico continúan pendientes.
G2048-04 permanece en progreso. El commit excluye WIP de GUI y otros juegos;
el checkout compartido no está limpio ni se integró a main.
