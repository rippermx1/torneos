# Backlog — TorneosPlay

Actualizado el 2026-11-06: el único juego mantenido es 2048. Los demás frentes
de juego se retiraron por instrucción del propietario. Se conserva debajo el
registro técnico de 2048; sus fechas y entornos son históricos.

## Trabajo vigente

- Validar la limpieza y preparar su integración en develop.
- Continuar los pendientes comerciales, contables y de cuentas de la plataforma
  según `docs/STATUS.md`, conservando los límites operativos ya establecidos.
- Mantener Unity, componentes web legado, contratos y motor autoritativo de 2048.

No trasladar conclusiones de QA local a producción o aceptación humana.
Alcance y comprobaciones: [limpieza 2048](LIMPIEZA-SOLO-2048.md).

## 2048

Proyecto único: `games/2048/UnityProject`; fuentes versionadas y contenedor operativo 3081 en **`unity-2048-007`** (E15). `005` y la intermedia `006` se conservan localmente. Dirección aprobada: Unity como único cliente jugable en práctica y torneo. G2048-10.1 retira la alternativa ligera de la navegación y conserva rutas antiguas como alias. En torneo, Unity envía **direcciones**, el servidor mantiene tablero/puntuación; el navegador no declara su puntuación como confiable.

| ID | Prioridad | Estado | Alcance / evidencia / qué falta |
| --- | --- | --- | --- |
| G2048-01 | — | Terminado y probado | **Cliente Unity y arte original**: proyecto real, escena/`.meta` conservados y procedencia E3/E6. `005` usa fondo GPT v2, fichas v3, Inter/TMP y silueta redondeada; 14 EditMode/4 PlayMode y WebGL aprobados. E7 comprueba 17.561.829 bytes en seis archivos publicados incluyendo manifiesto. La reducción histórica de `002` no es una medición de esta build. |
| G2048-02 | — | Terminado y probado | **Práctica utilizable**: teclado/deslizamiento, puntuación, ampliar/volver y alternativa ligera histórica (retirada en 10.1). En `005`, inicio y nueva partida pertenecen al host; el canvas muestra tablero/puntaje y no incluye reinicio ni botones de dirección. Navegador E6: inicio, fusión 0 → 4, arrastre móvil y nueva partida 4 → 0. Emulación móvil no equivale a teléfono físico. |
| G2048-03 | — | Terminado y probado | **Contrato competitivo autoritativo**: direcciones, una petición en vuelo, tablero/puntuación servidor, accesos y recuperación sin repetir una petición incierta. Pruebas unitarias y sesión autenticada local con recarga E1. Duración/cierre completo del cliente Unity en G2048-04. |
| G2048-04 | — | Terminado y probado | **04.4 cerrado con simulación aceptada (E28)**: siete controles con Auth/API/DB reales y ciclo de vida modelado, deadline natural 300 s, respuesta perdida sin repetición y movimiento posterior válido. Un resultado timeout de 4 puntos inmutable; tres controles HTTP adicionales, GUI normal/ampliada y ranking provisional coherentes. E16/E27 conservados. Regreso físico real no ejecutado; el propietario sustituyó ese criterio por simulación. |
| G2048-05 | — | Terminado y probado | **GUI y animación de desplazamiento/fusión en preview**: `005` compilada; deslizamiento, fusión, aparición y puntos ganados siguen estado confirmado, no predicen puntuación competitiva. Pruebas de planificación y PlayMode cubren fusión, cancelación/reinicio y animación; navegador E6 y hashes/HTTP E7. Alcance cerrado: implementación y validación local en 3080. La integración/versionado se separa en G2048-11; aceptación visual en G2048-06. |
| G2048-06 | — | Terminado y probado | **06.2 cerrado con simulación aceptada (E28)**: GUI real normal/ampliada en 1280×720, 390×844 y 844×390, seis combinaciones sin desbordamiento ni reinicio. Fusión/puntaje/16 casillas y resultado competitivo visibles; capturas revisadas. Legibilidad humana no medida; criterio original sustituido por aceptación automatizada. 06.1 y arte existentes conservados. |
| G2048-07 | — | Terminado y probado | **07.2 cerrado con accesibilidad automatizada aceptada (E28)**: guía previa y ampliada, semántica/estado/16 casillas, contraste nominal, Tab/Shift+Tab/Escape y foco de retorno PASS. E14/E23 conservados. No se afirma voz de lector real ni comprensión de persona nueva; criterio de cierre sustituido explícitamente por el propietario. |
| G2048-08 | — | Terminado y probado | **08.1 cerrado con simulación móvil aceptada (E28)**: cuatro arrastres de ratón y gesto corto sin duplicados, seis layouts, 120 muestras PC (carga 3,705 s, mediana 60 FPS, WASM reservado 128 MiB/pico usado 84,63 MiB), sin error/context lost; seis archivos hash/gzip/MIME/ETag PASS. No se extrapola al Xiaomi ni a batería/temperatura/suspensión física; criterio original sustituido. |
| G2048-09 | — | Terminado y probado | **09.1–09.4 terminados localmente (E19/E20/E21/E26)**. Equivalencia, límites/desempates, semilla privada, revisión antes de liquidar y sanciones atómicas. **09.4 integrado en 3081**: Docker recuperado; dos migraciones con filas conservadas, candidata 094 healthy, 101 web/9 Node, 12 controles Auth/MFA HTTP/SQL, 11 observaciones GUI y seis archivos HTTP PASS. Descarte/sanción persistidos, ranking único y crédito sintético único; historial liquidado preservado. Bot variable y cuentas sin KYC siguen como límites explícitos; no lanzamiento pagado ni aceptación humana/física. |
| G2048-10 | — | Terminado y probado | **Unity como único cliente jugable (10.1, A06/E17)**: entrada habitual monta Unity `007`; rutas antiguas redirigen sin otra partida y conservan retorno seguro. Sin alternativa ligera visible. Imagen 101 activa/healthy en 3081 con autorización; 195 pruebas, 14 checks candidata y 14 checks operativos, navegador con ficha/GUI ampliada/mismo resultado y ranking 16. Configuración/volúmenes/servicios y DB preservados; imagen anterior conservada. No cierra revisión humana/física o segundo plano real. |
| G2048-11 | — | Terminado y probado | **GUI incorporada al ambiente local operativo**: **11.1** cierra A05 (E15). Fuentes/recursos `afb1fbd`, host y cápsula inmutable `007` activos juntos en 3081; `005` conservada y retorno disponible. 533 pruebas web, build Docker, 34 checks HTTP/hashes/MIME/gzip/framing y navegador frío/caliente, flechas/WASD/arrastre, reinicio, ampliar/Tab/Escape. Volúmenes, servicios y datos comerciales preservados; Auth renovó el token de la sesión existente. El 404 de `007` en E14 es histórico. El E2E competitivo queda en 04.4; no hay merge a main ni despliegue externo. |

