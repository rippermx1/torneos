# 2048 — cierre con pruebas simuladas aceptadas

Fecha: 2026-10-05. **G2048-04, 06, 07 y 08 terminados y probados en el alcance
local automatizado/simulado aceptado por el propietario.** [Evidencia E28](2048-SIMULATED-ACCEPTANCE-EVIDENCE.json).

El propietario pidió: «puedes simular las pruebas? y en base a estar terminar los
tickets?». Se adoptó esa instrucción como sustitución de los criterios de cierre
humano/físico de 04.4, 06.2, 07.2 y 08.1 por comprobaciones automatizadas. Se
conservan los resultados anteriores y sus límites; no se afirma que una simulación
demuestre comportamiento del Xiaomi, suspensión del sistema, habla de un lector
de pantalla o comprensión humana. Los 11 tickets de 2048 quedan cerrados según
este alcance. Este cierre no activa una operación pública con dinero real.

## Resultado por tarea

| Tarea | Criterio simulado ejecutado | Resultado |
| --- | --- | --- |
| G2048-04.4 | Sesión real compilada desde el contexto operativo 094: pausa sin ticks/reloj monotónico congelado, retorno, desfase anticipado, respuesta de movimiento perdida, recuperación y dirección posterior. Auth/API/PostgreSQL reales; vencimiento natural de 300 segundos. | Siete controles PASS. Una partida, dos movimientos, puntaje 4, timeout persistido. Tres comprobaciones autenticadas adicionales: recuperar, consultar timeout y rechazar dirección tardía sin alterar resultado/historial. GUI operativa normal/ampliada y ranking provisional coherentes. |
| G2048-06.2 | Unity `007` real en navegador: fusiones/puntaje/tablero, tabla confirmada, vista normal/ampliada, escritorio 1280×720 y móvil simulado 390×844/844×390. Resultado final competitivo visible. | Seis combinaciones únicas sin desbordamiento horizontal ni reinicio al cambiar de vista/tamaño. Fusión 0→4 y práctica hasta 16; resultado competitivo 4, tiempo 00:00 y controles de reinicio ausentes. Capturas inspeccionadas. |
| G2048-07.2 | Guía previa al inicio, árbol accesible y semántica HTML como sustitución explícita de la aceptación con lector/persona: coordenadas de 16 celdas, puntaje/estado, contraste nominal, navegación Tab/Shift+Tab/Escape y foco de retorno. | Contratos y navegación PASS; tabla `aria-live=off`, puntaje anunciado y guía disponibles en ambas vistas. Sin prueba de voz de un lector real ni estudio de comprensión. |
| G2048-08.1 | Tamaños móviles, cuatro arrastres mediante ratón, gesto corto, cambios de tamaño, carga, memoria/FPS del WebGL instrumentado y contratos de suspensión/retorno. | Siete direcciones exactas: tres teclas y cuatro arrastres; gesto corto sin dirección duplicada. Sin errores de juego ni pérdida de contexto. 120 muestras de rendimiento del PC y seis archivos HTTP con hash/gzip/MIME/ETag verificados. |

151 regresiones PASS en 12 archivos, sin omitidas; lint de los tres scripts nuevos
PASS. Diez controles de navegador, siete de sesión/API y tres adicionales de
resultado inmutable PASS. No se ejecutó otra ronda de Unity Editor: el juego y
su build permanecen intactos. Se prueba la cápsula ya publicada.

## Entorno y mediciones

La plataforma operativa es `http://127.0.0.1:3081`, imagen
`sha256:51412127d028715b658a2921115b39d45a6dc874204728df34add89315312e25`
(094/E26), cápsula `unity-2048-007`. No se activó otra imagen ni se adoptó el WIP
de otros juegos. La prueba de práctica instrumentada usa exclusivamente loopback
65170 y sólo permite práctica/recursos públicos: no reenvía cookies, Auth/API/Flow.
El servicio ajeno en 3083 se conservó; el `server.json` antiguo de E18 no representa
ese proceso actual. El puerto se comprobó antes de decidir usar un probe propio.

Carga observada hasta `game.ready`: **3.705 ms** en el PC. WASM reservado:
**128 MiB**. El reporte E28 registra pico de memoria usada y rango/mediana de FPS.
Estas mediciones no se extrapolan al teléfono: no se controló caché fría ni red
móvil. El criterio automático de regresión exige carga dentro del timeout real
del host (90 segundos), memoria usada dentro de la reserva y mediana de FPS ≥30
en este PC; no define un SLA para Android.

Fixture E27 consumida una sola vez: torneo
`82f51723-acf1-4676-8d9a-49906a11e47f`, partida
`4fad83ee-db71-48d4-99c4-67222352798b`, usuario de prueba
`3c149ab4-e036-42b9-a5b4-0c9e5e7330ad`. Inicio 21:46:01 UTC, cierre 21:51:03 UTC,
deadline 21:51:01 UTC. No se adelantó el reloj del servidor ni se reescribieron
directamente board, puntaje o timestamps: cambiaron sólo mediante las APIs normales
de movimiento y cierre. Se descartó deliberadamente una respuesta real en
el adaptador de pruebas para modelar un transporte incierto; no se repitió la dirección.
El ranking sigue EN VIVO/provisional porque la ventana del torneo sigue vigente;
no se liquidó ni se emitió un crédito desde este incremento.

## Reproducción y archivos

```powershell
node scripts/verify-2048-background-local.mjs prepare
node scripts/simulate-2048-competitive-local.mjs
node scripts/verify-2048-background-local.mjs verify-closed
node scripts/start-2048-simulated-probe.mjs
node scripts/measure-2048-delivery.mjs
node scripts/report-2048-simulated-acceptance.mjs
```

La primera simulación requiere una fixture identificada sin partida; ambos scripts
rechazan consumir/reiniciar una existente. Una nueva ronda necesita otra fixture
identificada. El reporte final requiere los informes de regresiones y navegador
en `artifacts/2048-simulated/`, comprueba todos los PASS y el mismo runtime, y
registra hashes para contrastar evidencia. La compilación TypeScript es aislada
desde el contexto aceptado 094, sin sustituir la implementación del juego.

El probe reutiliza los cuatro scripts E18 en una copia propia con sólo puerto y
directorio de informes cambiados. No modifica el host o la cápsula inmutable.
Las credenciales siguen en artifacts ignorados y la sesión de prueba se cerró.
Procesos/pestañas auxiliares se retiran al finalizar; no se detienen servicios ajenos.

Capturas: `mobile-final.png`, `landscape-expanded.png`, `competitive-result.png`.
Métricas guardadas mediante la UI: recibo `c6c2e48c-372f-45e8-aa04-8d39f76fd7bb`.
Los informes completos, capturas y módulos compilados permanecen locales en
`artifacts/2048-simulated/`; el resumen versionado no incluye secretos ni recursos
artísticos. [E27 anterior](2048-BACKGROUND-VALIDATION.md) conserva la prueba real
omitida. Las observaciones físicas/humanas no ejecutadas quedan registradas como
límites de esta aceptación, no como resultados PASS.
