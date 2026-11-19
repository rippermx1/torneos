# G2048-07.1 — navegación entre la cápsula y la plataforma

Fecha: 2026-10-02. Rama `codex/2048-clean-gameplay`; base `5700a38`.

La plantilla real de Unity comunica Escape y Tab/Shift+Tab a su host. Ambos lados
comprueban origen, ventana emisora, canal y versión; la navegación además identifica
la build. Escape devuelve el foco al control de vista de la plataforma y cierra
la vista ampliada. Tab permite salir del canvas y volver a entrar con el teclado.
La carga del juego ya no toma el foco de la página automáticamente.

En vista ampliada el contenedor es un diálogo modal: se aíslan con `inert` las
ramas externas, se conserva su valor anterior y el bloqueo de desplazamiento,
y se restauran al salir. El recorrido de Tab consulta los controles disponibles
en ese momento, incluyendo recuperación, ranking y reintento. Durante carga o
fallo el iframe no recibe foco. La cápsula y la sesión permanecen montadas al
cambiar de vista: salir no reinicia ni finaliza una partida competitiva.

«Consultar tablero» pertenece a la plataforma. Su tabla ofrece las 16 celdas
confirmadas, coordenadas, casillas vacías y puntaje. Usa el mismo estado que
se envía a Unity; no calcula otro tablero. No es una región de anuncios en vivo:
el reloj no repite la tabla. La cápsula conserva únicamente tablero, puntaje
y efectos; la plataforma mantiene el inicio y la orquestación del torneo.

El canvas y los controles tienen foco visible. Se verifica la preferencia de
movimiento reducido al cargar y al cambiar. El color nominal de la ficha 8 se
oscurece de `(0.23, 0.53, 0.45)` a `(0.23, 0.50, 0.43)`: blanco sobre la ficha
pasa de 4,28:1 a 4,70:1. Las once variantes de texto de fichas superan 4,5:1
con sus colores nominales. Esa comprobación no sustituye una medición física
de legibilidad del arte renderizado.

La cápsula final usa el ID inmutable **`unity-2048-007`**. Se conserva `005`;
`006` es la compilación intermedia de navegación, anterior al ajuste de contraste.
La publicación es exclusivamente local. Los cambios de otros juegos se conservan.
No se modifican APIs de torneo, DB, Flow, despliegues ni licencias.

La evidencia ejecutada y las capturas se registran en
[2048-ACCESSIBILITY-EVIDENCE.json](2048-ACCESSIBILITY-EVIDENCE.json) y
`artifacts/2048-accessibility/`: 119/119 pruebas dirigidas y 531/531 del repositorio,
14/14 Editor y 4/4 Play Mode, tipos/lint, WebGL y Next webpack (65 páginas estáticas).
En navegador: inicio/reinicio por teclado, fusión con WASD, tabla consultada con
Tab/Enter, ciclo de Tab/Shift+Tab ampliado, Escape conservando puntaje 4 y casillas,
arrastre emulado y vistas 1280×720, 390×844 y 844×390 sin desbordamiento horizontal.
La preferencia de movimiento reducido se verifica con fixtures de eventos del
host; no se afirma una prueba física del ajuste del sistema operativo.
El cierre técnico de esta subtarea no cierra
G2048-07 completo: lector de pantalla, comprensión de una persona nueva y teléfono
físico siguen en 07.2/06.2/08.1. G2048-11.1 incorpora y versiona conjuntamente
los cambios Unity/arte que siguen compartidos y la candidata final en 3081;
después 04.4 comprueba el recorrido competitivo autenticado.
