# Plan de cierre: 2048 y plataforma

Fecha: 2026-10-01. Basado en [auditoría cruzada](2048-CROSS-AUDIT.md).
Estado: **G2048-04.1–04.3 implementadas y verificadas en contratos/lógica con fixtures**.
[Cierre](2048-CLOSURE-IMPLEMENTATION.md), [reloj](2048-CLOCK-IMPLEMENTATION.md) y
[recuperación/compatibilidad](2048-RECOVERY-IMPLEMENTATION.md), con sus límites.
A01 corregido en respuestas, A02 en reloj, A04 en recuperación de resultado.
Integración/DB real pendiente en 04.4. **06.1 implementada** en el contenedor web:
práctica real en preview y estados competitivos con fixtures de layout.
[Entrega y límites](2048-PLATFORM-GUI-IMPLEMENTATION.md). **07.1 implementada** en
la candidata local `007`: [navegación y accesibilidad](2048-ACCESSIBILITY-IMPLEMENTATION.md).
**11.1 terminada y probada localmente**: host y cápsula `007` incorporados juntos
a 3081, fuentes versionadas, datos/servicios preservados y retorno disponible.
[Entrega y evidencia](2048-INTEGRATION-IMPLEMENTATION.md). **04.4 en progreso**:
Auth/Unity/DB/cierre/ranking local comprobados; inicios concurrentes y movimiento
posterior al timeout corregidos y activos en 3081, con autorización explícita del
propietario para RPC/host locales. Cuatro carreras con DB real PASS; resultado final
16 inmutable tras timeout y ranking. Falta regreso real desde segundo plano:
el navegador automatizado mantiene ambas pestañas visibles; Chrome no conectado.
[Recorrido y hallazgos](2048-COMPETITIVE-IMPLEMENTATION.md).
**10.1 implementada y verificada en candidata aislada 3082** según la nueva dirección
aprobada: Unity como único cliente jugable. Entrada habitual/alias/resultado/ranking
comprobados; A06 operativo conserva activación en 3081 pendiente.
[Entrega E17](2048-UNITY-ENTRY-IMPLEMENTATION.md). Revisión física/humana sigue
abierta. Fixtures no equivalen a aceptación del producto.

## Orden de implementación

Son subtareas de tickets existentes del [backlog](BACKLOG.md), no nueve tickets
adicionales. Se mantienen los estados y el conteo de tickets principales.
P0 = siguiente corrección; P1 = incremento posterior según dependencias. La
severidad P1/P2 de la auditoría es distinta de estas prioridades de ejecución.

| Orden | ID / ticket principal | Prioridad | Entregable concreto | Depende de | Gap que atiende |
| ---: | --- | --- | --- | --- | --- |
| 1 | G2048-04.1 | P0 | Cierre persistido y confirmado por el servidor. | — | A01 |
| 2 | G2048-04.2 | P0 | Reloj sincronizado y recuperación tras rechazo de timeout. | 04.1 | A02 |
| 3 | G2048-04.3 | P0 | Recuperar partida vigente o resultado final desde un contrato explícito. | 04.1, 04.2 | A04 |
| 4 | G2048-06.1 | P1 | Controles, reloj, avisos y resultados visibles en GUI normal y ampliada. | 04.3 | A03; tamaño de escritorio |
| 5 | G2048-07.1 | P1 | Escape dentro del iframe, foco accesible y lectura del tablero. | 06.1 | A03; accesibilidad |
| 6 | G2048-11.1 | P1 | Host y build final incorporados juntos al stack operativo 3081. | 04.1–04.3, 06.1, 07.1 | A05 |
| 7 | G2048-04.4 | P1 | Recorrido local corregido y verificado; completar regreso real de segundo plano. | 11.1; RPC/host corregidos activos | A01 corregido con DB real; regreso real pendiente |
| 8 | G2048-06.2 / 07.2 / 08.1 | P1 | Prueba física móvil y aceptación de la GUI de la build candidata. | 11.1; 04.4 para el recorrido competitivo | Límites de validación humana y dispositivos |
| 9 | G2048-10.1 | P1 | Unity como único cliente jugable; alias anteriores conservan contexto y partida. | Host/API de 04.4 y cápsula 007; móvil/revisión humana se verifican por separado | A06 |

El orden es la secuencia recomendada de integración. Las correcciones visuales
pueden prepararse mientras se resuelven las APIs, pero no se cierra su coherencia
competitiva sin comprobar los estados finales del paso 3. La prueba física/humana
no impide terminar antes las correcciones técnicas ni incorporarlas localmente.

## Tareas y criterios de cierre

### 1. G2048-04.1 — confirmar el cierre persistido

Implementar en las rutas de timeout y en las ramas de expiración de start/move:

- Comprobar errores y resultado del cambio de estado, incluyendo cero filas.
- Resolver carreras mediante el estado final persistido y su puntuación actual.
- Ante guardado desconocido/fallido, responder sin afirmar que finalizó.
- Conservar propiedad de la partida, límite de una partida y autoridad del servidor.

**Cierra A01 cuando:** error de escritura no produce confirmación de cierre;
cero filas recupera el estado real o comunica incertidumbre; repetición de cierre
es coherente; carrera entre último movimiento y cierre devuelve score/estado
persistidos. Cubrir rechazo de usuario ajeno. Pruebas de ruta con fixtures, sin
repetir operaciones mutables a ciegas ni alterar esquema DB.

### 2. G2048-04.2 — sincronizar tiempo y desbloquear con evidencia

- Añadir a las respuestas relevantes una referencia autoritativa de tiempo, de
  forma compatible con el consumidor web existente.
- Calcular el tiempo restante con referencia servidor y tiempo monotónico local;
  resincronizar al recuperar la sesión o volver del segundo plano.
- Separar bloqueo por petición en vuelo, movimiento desconocido y espera de cierre.
- Una respuesta de partida vigente debe recuperar la capacidad de mover sin
  levantar un bloqueo por movimiento incierto ni repetir ese movimiento.

**Cierra A02 cuando:** reloj adelantado/atrasado/corregido y suspensión de pestaña
no consumen ni congelan una partida vigente por decisión exclusivamente local;
el caso auditado vuelve a permitir movimientos con 45 segundos disponibles;
el servidor conserva la decisión final sobre el deadline. Probar además timeout
simultáneo con una petición en vuelo y recuperación sin duplicados.

### 3. G2048-04.3 — recuperar estados finales y resultado

- Definir un contrato compatible para vigente, completada por falta de movimientos,
  expirada y abandonada, con board, score, moveNumber, motivo y estado confirmado.
- Recuperar esos datos en start/timeout y en la sesión Unity; revisar que las
  respuestas nuevas no rompan `GameBoardClient`.
- Mostrar resultado final y acceso al ranking desde la plataforma. Una partida
  competitiva terminada no debe volver a ofrecer inicio ni reinicio.
- Mantener errores de autorización y estados desconocidos separados de cierre.

**Cierra A04 cuando:** recargar una partida terminada conserva tablero/puntaje;
el caso servidor `no_moves` con score 128 deja cliente finalizado y score 128;
expiración/abandono muestran su estado; otra pestaña y una respuesta de red perdida
se recuperan sin fabricar ni repetir un movimiento. No usar score 0 como sustituto
de un resultado que no se pudo recuperar.

### 4. G2048-06.1 — mantener accesible la plataforma al ampliar la cápsula

Implementada: 80/80 pruebas dirigidas, práctica real en preview y 48 verificaciones
de layout con estados simulados. Controles HTML del host; Unity no orquesta datos.
Se conserva aceptación humana pendiente en 06.2. [Evidencia](2048-PLATFORM-GUI-IMPLEMENTATION.md).

- Mantener el juego en tablero/puntaje. La plataforma contiene inicio, nueva
  partida de práctica, reloj competitivo, avisos, resultado/ranking y salida.
- Hacer visibles esas acciones también en el modo ampliado: iniciar antes de jugar,
  reiniciar práctica, saber cuánto tiempo queda y entender por qué se bloqueó.
- Ajustar tamaño al alto disponible para mostrar tablero completo y puntaje en
  1280 × 720, sin obligar a desplazar la página para jugar. Evitar controles que
  tapen casillas, desbordamiento horizontal y recortes en móvil/paisaje.

**Cierre técnico de A03, salvo foco/Escape del paso 5:** navegador en escritorio y
390 × 844, modo normal/ampliado, antes/durante/después de partida y con error de red.
Inicio y nueva partida accesibles; reloj/avisos/ranking visibles en competitivo;
canvas conserva únicamente tablero, score y sus efectos. Guardar capturas de la
build candidata. G2048-06 completo conserva la revisión humana del paso 8.

### 5. G2048-07.1 — teclado, foco y accesibilidad del tablero

Implementación 2026-10-02: puente Escape/Tab, foco de retorno, aislamiento modal,
tabla confirmada y contraste nominal corregido en `007`. Evidencia detallada en
[2048-ACCESSIBILITY-IMPLEMENTATION.md](2048-ACCESSIBILITY-IMPLEMENTATION.md).
No cierra aceptación humana/lector de pantalla de 07.2.

- Comunicar Escape desde el iframe con origen/source/protocolo comprobados.
- Gestionar entrada/salida del modo ampliado y devolver foco a una acción útil;
  impedir tabulación hacia controles cubiertos y mantener foco visible.
- Exponer una representación accesible sincronizada de las 16 celdas, además del
  score, sin añadir ruido visual al canvas ni anunciar de nuevo toda la partida
  en cada tick del reloj.
- Verificar contraste, movimiento reducido, flechas/WASD y equivalencia del gesto.

**Cierra Escape/foco de A03 y avance técnico de accesibilidad:** Escape funciona
con foco dentro de Unity; sólo teclado permite iniciar, jugar, salir y reiniciar
práctica; lector de pantalla puede consultar tablero/score; la preferencia de
movimiento reducido se aplica al cargar y cambiar. No cerrar G2048-07 sólo con
un atributo ARIA: comprobar el recorrido con lector de pantalla y lectura humana.

### 6. G2048-11.1 — incorporar la versión al stack operativo

Terminado y probado en 3081 el 2026-10-02: fuentes/recursos `afb1fbd`, imagen
local `007`, 533 pruebas web, build Docker, 34 checks HTTP y navegador real.
Ted/Snake/Factory conservan builds operativas y límites previos. Cierra A05;
no cierra 04.4 ni aceptación humana. [Detalle](2048-INTEGRATION-IMPLEMENTATION.md).

- Conciliar y versionar únicamente el alcance autorizado, preservando WIP de Ted
  Runner, Factory Empire, SnakeArena y otros frentes. No cambiar de rama encima
  de archivos ajenos ni integrar su trabajo sin revisar.
- Si se modifica plantilla/Unity, compilar un ID nuevo disponible; conservar 005
  como snapshot. Actualizar registro, host y publicación de la build juntos.
- Construir la app y reempaquetar el contenedor local, conservando volúmenes,
  cuentas/sesiones y configuración del entorno. No ejecutar reseed/reset/prune.

**Cierra A05:** 3081 carga exactamente la build candidata registrada; todos sus
archivos responden 200 con hashes, MIME/gzip y framing correctos; carga fría/caliente,
inicio explícito, teclado/arrastre, reinicio y GUI ampliada funcionan allí. Comprobar
que los demás juegos/rutas existentes no regresaron. Registrar commit/build/entorno
y punto de retorno al paquete anterior. No implica despliegue externo.

### 7. G2048-04.4 — comprobar el recorrido competitivo completo

**2026-10-02: en progreso.** 9 casos API autenticados, GUI/cierres y tres rankings
oficiales coincidentes. Inicio concurrente 200/500 corregido a 200/200.
A01 corregido con autorización explícita: RPC y host activos en 3081, **4/4 carreras
reales PASS**; un movimiento pendiente no altera el cierre ni el ranking score 16.
13 comprobaciones en DB desechable, 240 regresiones web y build Next PASS. Cuatro
casos API nuevos contra 3081 y recuperación por botón desde dos pestañas Unity PASS.
Falta regreso real de segundo plano. [Evidencia y siguiente acción](2048-COMPETITIVE-IMPLEMENTATION.md).

En cuentas y fixtures locales de prueba identificados, sin modificar partidas
existentes ni usar pagos reales, comprobar:

- Ficha/inscripción/autorización, inicio explícito y límite de una partida.
- Movimientos y puntuación persistida iguales a la presentada por plataforma/Unity.
- Recarga, desconexión/respuesta perdida, segundo plano y dos pestañas concurrentes.
- Cierre por deadline y por falta de movimientos; resultado y ranking coherentes.
- Reloj desfasado y fallo de persistencia mediante inyección aislada de fallos.

**Cierra el alcance local de G2048-04:** no divergen estado terminal, score ni
moveNumber en el recorrido observado; el usuario puede recuperar o consultar su
resultado; no hay movimientos duplicados ni reinicio competitivo. Adjuntar evidencia
de la build servida en 3081 y pruebas de integración, no sólo mocks. Mantener
staging externo separado si todavía no se ha ejecutado allí.

### 8. G2048-06.2 / 07.2 / 08.1 — cerrar revisión física y humana

- Probar en teléfono físico identificado: gesto real, orientación, retorno tras
  suspensión, carga, memoria y fluidez; corregir los problemas observados en Unity.
- Comprobar lectura de valores/puntaje, fusiones y avisos; una persona nueva debe
  poder iniciar, realizar un movimiento y entender fin/error sin guía del desarrollador.
- Registrar observaciones, corregir problemas concretos y obtener decisión visual
  explícita sobre la build revisada. Verificar lector de pantalla y foco.

**Cierre:** evidencia de dispositivo/build, resultados medidos y observaciones
humanas resueltas. Si falta una persona o dispositivo, se mantiene esa subparte
pendiente; capturas/emulación no la sustituyen. Cierra G2048-06/07/08 sólo por sus
criterios respectivos, sin confundir compilación con aceptación humana.

### 9. G2048-10.1 — Unity como único cliente jugable

Dirección aprobada por el propietario el 2026-10-02: Unity expone la cápsula y
la plataforma orquesta la competencia. Se retira el requisito de una alternativa
ligera visible y de alternar clientes. El cliente anterior permanece en Git y en
la imagen operativa anterior para retorno técnico.

- `/tournaments/[id]/play` monta Unity desde la acción habitual de la ficha;
  `/tournaments/[id]/play/unity` redirige allí sin iniciar otra partida.
- `/play` conserva práctica Unity; `/play/web` y `/play/unity` redirigen a `/play`
  y conservan únicamente el retorno seguro a la ficha del torneo.
- Preservar Auth, inscripción, única partida y recuperación del resultado;
  direcciones, tiempo y puntuación siguen bajo autoridad del servidor.
- Comprobar desde ficha hasta cliente/resultado/ranking en la candidata aislada;
  documentar la versión efectivamente activa en 3081. Su activación local y
  cualquier despliegue externo son acciones separadas.

**Cierre de implementación:** rutas sin segundo cliente jugable, recuperación de
la misma partida y verificaciones de acceso/redirección/navegador. **Cierre A06
operativo:** entrada habitual comprobada sobre la candidata activa en 3081.
04.4 conserva regreso real de segundo plano pendiente; 06.2/07.2/08.1 conservan
las verificaciones humanas y físicas. No bloquean el cambio de rutas autorizado
ni se dan por completadas al compilarlo.

## Evidencia y cierre de cada tarea

Al implementar, convertir los casos de auditoría que hoy confirman defectos en
regresiones que exijan el comportamiento corregido, y conservar sus reproducciones
como antecedentes. Llevar las pruebas relevantes al árbol versionado; actualmente
los scripts de auditoría están en `artifacts`, ignorado por Git.

Por tarea registrar ID, gap, commit, build/entorno, comprobación ejecutada y resultado.
Una prueba aislada cierra un defecto de contrato, pero no el E2E de G2048-04.4.
El cierre técnico y la revisión humana permanecen diferenciados. Actualizar el
backlog y anexar evidencia de resolución sin reescribir la auditoría original como
si los fallos nunca hubieran existido.

El trabajo se mantiene en el monolito existente y el proyecto Unity real. No incluye
microservicios, cambios de esquema/Flow/licencias ni despliegues externos. Conservar
fuentes, `.meta`, snapshots y recursos privados. Validar cada incremento con las
pruebas pertinentes; compilar Unity sólo si cambian sus fuentes/plantilla/assets.
