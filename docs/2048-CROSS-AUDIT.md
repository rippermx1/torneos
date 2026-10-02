# Auditoría cruzada: Unity 2048 y plataforma

Fecha: 2026-10-01. Workspace: `C:/torneos`, rama `codex/2048-clean-gameplay`.
Rol: auditor. No se modificaron fuentes funcionales, bases de datos, Flow,
contenedores ni despliegues. Se preservó el trabajo simultáneo del checkout.

**Dictamen: sincronización parcial comprobada; integración completa no aprobada.**
La práctica `unity-2048-005` sincroniza movimientos, tablero y puntaje con el host.
El cierre competitivo tiene fallos de confirmación y recuperación. La GUI nueva
no está incorporada al stack operativo ni al acceso habitual del torneo.

P1 significa corregir antes de aceptar la integración competitiva. P2 significa
corregir antes de dar por terminado el recorrido y la GUI solicitados.

## Hallazgos

### A01 — P1: el timeout confirma un cierre que puede no haberse guardado

Ubicación: `app/api/tournaments/[id]/game/timeout/route.ts:102-116`.
El resultado del UPDATE no se comprueba. La ruta retorna HTTP 200 y `timedOut:true`
tanto con un error de escritura como cuando el filtro `status=active` afecta cero
filas. El cliente toma esa respuesta como confirmación y comunica “Tiempo terminado”.
La web y el estado persistido pueden discrepar sobre la finalización. El score de
la respuesta también proviene de la lectura anterior al UPDATE, no de una lectura
final confirmada.

Reproducción: `cross-timeout.test.ts`, dos casos ejecutando la ruta real con un
cliente DB simulado. Error inyectado y cero filas produjeron 200/`timedOut:true`.
Esto prueba el defecto del código; no afirma que el stack real haya sufrido ese error.

Corrección requerida: comprobar error y resultado de escritura; ante una carrera,
recuperar el estado final real. Confirmar un estado terminal y su puntuación sólo
desde persistencia verificada. No afirmar cierre en un resultado desconocido.

### A02 — P1: el reloj puede bloquear una partida todavía válida

Ubicación: `lib/game/unity-2048-session.ts:102-118`.
`tick()` usa `Date.now()` local. Cuando cree que llegó el plazo, bloquea el juego.
Si el servidor responde `timedOut:false`, actualiza el deadline pero conserva
`locked:true`. Tampoco establece una referencia de tiempo servidor. Incluso al
corregir el reloj y mostrar 45 segundos disponibles, los movimientos siguen
bloqueados. Si el navegador continúa adelantado, repite la comprobación cada cinco
segundos hasta que vence realmente la partida.

Reproducción: empezar a las 16:00 con deadline 16:01, adelantar a 16:01:01,
responder `timedOut:false`, volver a 16:00:15 y ejecutar `tick()`/`move()`.
Resultado: tiempo 45, `game_over:false`, `locked:true`, ningún movimiento enviado.
Caso ejecutado en `cross-session.test.ts`.

Corrección requerida: sincronizar el cálculo del tiempo con el servidor y distinguir
espera de cierre de bloqueo por movimiento desconocido. Una negativa autoritativa
de cierre debe permitir recuperar la partida vigente sin repetir movimientos dudosos.

### A03 — P2: ampliar oculta los controles y estados de la plataforma

Ubicación: `components/game/unity-2048.tsx:68-81`.
La capa fija con z-index 100 contiene iframe y botón de salida. Inicio/nueva partida,
reloj y mensajes están fuera de ella. En navegador se reprodujo:

- Ampliar antes de iniciar: sólo aparecen score 0 y tablero vacío. El botón de
  inicio queda cubierto; hay que salir para comenzar.
- Durante práctica: nueva partida queda cubierta; hay que salir para reiniciar.
- El mismo layout competitivo deja fuera el reloj, aviso de cierre/error y acceso
  al ranking. Esta última conclusión se basa en la estructura del componente,
  no en un torneo autenticado ejecutado en navegador.
- Escape con foco en el canvas no cierra el modo ampliado: el evento del iframe
  no llega al listener de la ventana padre. El botón de salida sí funciona.

Corrección requerida: conservar los controles contextuales de plataforma en el modo
ampliado, con reloj competitivo y avisos visibles. Mantener el canvas centrado en
tablero/puntaje. Resolver salida por teclado dentro del iframe y foco de retorno.
Evidencia: `expanded-before-start.jpg`; comprobación DOM de controles cubiertos.

### A04 — P2: los estados terminales no tienen un contrato de recuperación completo

Ubicaciones: `app/api/tournaments/[id]/game/timeout/route.ts:68-72`,
`app/api/tournaments/[id]/game/start/route.ts:112-134`,
`lib/game/unity-2048-session.ts:57-67,110-117`.

Si otra pestaña termina por `no_moves`, timeout responde `{timedOut:false,score}`
sin deadline ni estado terminal. La sesión Unity interpreta ese estado ya cerrado
como “No se confirmó el cierre”, permanece bloqueada y conserva el score anterior.
Se reprodujo usando la respuesta de la ruta real simulada: score servidor 128,
score cliente 0, `game_over:false`.

Si se recarga después de expirar o finalizar una partida, start devuelve error en
lugar del estado final. El nuevo host conserva tablero vacío, score 0 y
`started:false`; el componente vuelve a ofrecer “Iniciar partida” aunque la API
lo rechaza. El error de expiración se reprodujo en la sesión con una respuesta
simulada; las ramas que lo generan se verificaron por lectura del código.
El ranking tiene un enlace independiente, pero el juego no recupera su resultado.

Corrección requerida: contrato explícito para partida vigente, completada, expirada
y abandonada, incluyendo score/tablero final confirmado. Mostrar resultado y
acción de ranking sin ofrecer otra partida competitiva.

### A05 — P2: el stack operativo conserva la GUI y el reinicio anteriores

Evidencia HTTP y navegador actual: preview 3080 carga `unity-2048-005`; el
contenedor 3081 carga `unity-2048-002`. Los seis archivos de 005 retornan 404 en
3081. Allí la partida de práctica inicia automáticamente y Unity todavía muestra
título/marca/estado y botón de nueva partida dentro del juego. Es una brecha de
incorporación conocida (G2048-11), no un fallo del handshake de la build 002.

Corrección requerida: incorporar juntos el host y la build 005 en el stack local
operativo y repetir el recorrido integrado. Esta auditoría no reconstruyó el contenedor.
Captura `stack-3081.jpg`; 15 observaciones HTTP en `http.json`.

### A06 — P2: la entrada habitual al torneo no utiliza la GUI Unity auditada

Ubicación: `app/(public)/tournaments/[id]/page.tsx:277`,
`app/(public)/tournaments/[id]/play/page.tsx:82`.
La ficha dirige a `/tournaments/[id]/play`, que monta `GameBoardClient`.
`Unity2048` sólo existe en la ruta separada `/play/unity`; la ficha no ofrece ese
acceso. La práctica usa Unity, pero el recorrido competitivo habitual usa otra GUI.
Es un alcance de adopción pendiente, ya registrado en la documentación previa.

Corrección requerida: decidir el acceso competitivo visible y probarlo con Unity
005 en el mismo stack, preservando registro, autorización, única partida y score
servidor. No basta con comprobar la práctica pública para aprobar esta integración.

## Comprobaciones satisfactorias

| Comprobación | Resultado y alcance |
| --- | --- |
| Build y handshake de práctica | 005 cargada; tablero inicialmente vacío y bloqueado; inicio explícito desde el host. |
| Teclado | Flechas y WASD emitieron movimientos; fusión con score 4 coincidente en host y canvas. Entradas durante animación se descartan por diseño. |
| Arrastre móvil | Viewport 390 × 844: arrastre descendente desplazó las dos fichas a la última fila y añadió una ficha; arrastre izquierdo fusionó dos 2 y mostró 4 en host/canvas. Es emulación con puntero, no teléfono físico. |
| Nueva partida | Botón del host, tras salir del modo ampliado: score 4 → 0 y tablero nuevo. |
| GUI | Inter legible; números claros; casillas y tablero redondeados; canvas nuevo contiene tablero/puntaje y efectos. Sin desbordamiento horizontal móvil. |
| Puntaje competitivo | Prueba de sesión: request sólo contiene gameId, direction, moveNumber y clientTimestamp; score/tablero se aplican desde respuesta servidor. No demuestra por sí sola integridad total. |
| Recuperación vigente | Fixture conserva score 64, move 20, “Partida recuperada” y prohíbe otro start competitivo. No es E2E autenticado. |
| Entrega WebGL 3080 | Seis hashes SHA256 coinciden con publicación local 005; gzip/MIME correctos; index permite iframe del mismo origen y página host conserva DENY. |
| Pruebas dirigidas actuales | 21/21: 8 casos nuevos de auditoría y 13 existentes de sesión/deadline. Los casos de defecto pasan porque comprueban su reproducción; no significan ausencia de fallos. |
| Unity previo | XML existente 14 EditMode + 4 PlayMode aprobado; leído, no vuelto a ejecutar ni recompilado en esta auditoría. |

## Observaciones de GUI y límites

En escritorio 1280 × 720, la vista embebida tiene un iframe 680 × 850, más cabecera
y controles: el tablero completo no cabe en una sola pantalla. Ampliar resuelve el
tamaño del tablero pero introduce A03. Ajustar por alto disponible mejoraría el
recorrido normal. El canvas expone instrucciones accesibles y el host anuncia score,
pero no ofrece una representación semántica de las 16 celdas para lector de pantalla.
No se certificó accesibilidad completa, teléfono físico ni aceptación humana.

La vista 3080 usa placeholders para Auth/DB/Flow. Se probaron las interacciones
reales de práctica; los contratos competitivos se verificaron mediante código y
fixtures aislados. No se inició un torneo real, no se cambió una DB ni se generaron
pagos. No se auditaron producción ni el procesamiento financiero del ranking.
No se ejecutaron una nueva build Next, Unity ni la suite web completa en este turno.

## Reproducir y evidencia

```powershell
npx vitest run artifacts/2048-cross-audit/__tests__ lib/game/__tests__/unity-2048-session.test.ts __tests__/game-deadline.test.ts --reporter=json --outputFile=artifacts/2048-cross-audit/tests.json
node artifacts/2048-cross-audit/http-audit.mjs
```

Los casos y capturas están en `C:/torneos/artifacts/2048-cross-audit`, ignorado por
Git; el informe y su índice de evidencia se guardan en `docs`.
[Índice de evidencia](2048-CROSS-AUDIT-EVIDENCE.json).
Orden recomendado: A01/A02, A04, A03 y después incorporación A05/adopción A06
con E2E autenticado en el stack local autorizado.
