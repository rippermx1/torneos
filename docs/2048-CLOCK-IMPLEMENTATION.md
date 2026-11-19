# G2048-04.2 — reloj y desbloqueo

Fecha: 2026-10-01. Gap A02 de la auditoría cruzada. Implementado y verificado
en lógica de sesión, rutas con fixtures y conexión de eventos del host.
Siguiente: **G2048-04.3**, recuperación del estado terminal completo.

## Comportamiento

Las respuestas exitosas de inicio/recuperación, movimiento (incluido no-op) y
consulta de timeout incorporan `serverNow` ISO. Inicio y movimientos activos
incluyen `deadlineAt`; la consulta de partida vigente conserva su deadline.
Son campos adicionales: los campos de tablero, RNG, puntuación y número de
movimiento mantienen su contrato para el cliente web existente.

`ServerGameClock` estima el tiempo con `deadlineAt - serverNow` al recibir la
respuesta y resta el tiempo transcurrido de `performance.now()`. Cambiar la
hora del equipo no modifica ese contador. Se actualiza al iniciar/recuperar,
recibir un movimiento confirmado y consultar vigencia. El transporte introduce
una aproximación en el tiempo mostrado; el servidor sigue validando el límite
y confirmando el cierre. No se amplía la duración almacenada de una partida.

El host consulta vigencia al volver a estar visible y al restaurar una página
desde la caché del navegador. Esto también corrige una suspensión durante la
cual el contador monotónico no avanzó. Los listeners y el intervalo se retiran
al desmontar. Las consultas durante un movimiento se agrupan en una sola
consulta posterior; una consulta de tiempo en vuelo no se duplica.

Una respuesta vigente con 45 segundos recupera la capacidad de mover. El
bloqueo distingue petición en vuelo, espera de cierre, movimiento incierto y
cierre/vigencia inciertos. Confirmar únicamente tiempo no recupera el tablero
de un movimiento cuya respuesta se perdió: ese bloqueo y su aviso de recarga
se conservan, sin repetir la dirección ni sobrescribir score con una consulta
parcial. Un cierre desconocido tampoco se vuelve a solicitar automáticamente.

Para APIs antiguas sin `serverNow`, se toma una muestra de hora local una vez
por respuesta, como compatibilidad de transición. Esa combinación no garantiza
corregir un desfase inicial: la corrección completa requiere incorporar juntos
cliente y APIs actualizados en G2048-11.1. Un `serverNow` presente pero inválido
se rechaza; no se sustituye silenciosamente con la hora del navegador.

## Evidencia

- 18 pruebas nuevas de reloj/sesión: desfase en ambas direcciones, cambio de hora,
  recuperación, suspensión, actualización por movimiento, datos inválidos,
  concurrencia y locks independientes.
- 3 pruebas nuevas del host React, con hooks/DOM simulados: visibilidad,
  restauración desde caché y retiro de listeners/intervalo.
- 5 pruebas nuevas de rutas con DB simulada: creación, recuperación, movimiento,
  no-op y límite por ventana; se comprueban los campos de tiempo y los previos.
- Regresión de sesión existente actualizada: la respuesta vigente de 45 segundos
  debe desbloquear y aceptar otra dirección, en lugar de conservar el defecto.
- Suite del checkout compartido: **382/382 pruebas, 48 archivos**. TypeScript y
  ESLint de archivos afectados: **PASS**. Informe en
  `artifacts/2048-clock/all-tests.json`; resumen [JSON](2048-CLOCK-EVIDENCE.json).
- Comprobación adicional de los archivos preparados para commit, sin las
  diferencias de GUI previas: **30/30 pruebas** de reloj/sesión/eventos,
  `artifacts/2048-clock/index-tests.json`. No se sustituyó el checkout compartido.

No se recompiló Unity ni Next para producción y no se ejecutó navegador en
este incremento: no cambió el canvas ni la GUI visual. Los eventos del host
están comprobados con fixtures, no con suspensión de un teléfono físico.

## Límites y conservación

No se modificaron esquema, DB real, RPC, Flow, builds Unity ni contenedor 3081.
La rama sigue en `codex/2048-clean-gameplay`, sin integrar a main. El commit
contiene únicamente este incremento; las diferencias previas de GUI en los
tres archivos compartidos se conservan fuera del índice, junto al resto del WIP.

El cliente ligero `GameBoardClient` conserva su implementación de reloj; recibe
campos adicionales compatibles, pero este cambio corrige la sesión Unity. La
incorporación en 3081 y el E2E competitivo autenticado se comprueban en 11.1/04.4.
La respuesta terminal `no_moves` sin tablero/deadline continúa siendo un gap
de 04.3. La inmutabilidad del resultado frente al RPC histórico de un movimiento
tardío sigue sin demostrarse, como se documentó en 04.1. El ticket G2048-04
permanece en progreso; no se cierra aceptación humana ni móvil físico.
