# Plataforma comercial y clientes Unity

Decisión del propietario (2026-09-30): continuar sobre TorneosPlay y trasladar los
juegos de `C:/play-games`. TorneosPlay ya implementa cuentas, inscripciones, ventanas
de torneo, pagos Flow y contabilidad. Mantener esa base reduce el trabajo duplicado.
Unity se usa para los clientes de juego, sin trasladar a Unity las cuentas ni los cobros.

Cada juego mantiene un proyecto real. Alien Run conserva el SDK/protocolo que ya
consume. 2048 usa un puente pequeño específico porque el límite real son movimientos
y estado autoritativo, no un resultado final del cliente. No hay framework de plugins.

## 2048

`Unity2048Session` organiza práctica, inicio explícito de torneo, estado servidor,
una jugada en vuelo, no-op, recuperación mediante recarga y cierre por timeout.
`Unity2048` comprueba origen y ventana emisora, canal, versión y build. La build
solo comunica direcciones/reinicio; no hay credenciales Supabase/Flow en Unity.
No se optimizan jugadas competitivas con un puntaje calculado en el cliente.

La práctica `/play` no escribe DB. La versión web anterior sigue en `/play/web`.
La ruta competitiva Unity es optativa mientras se valida con cuentas y DB de staging;
`/tournaments/[id]/play` conserva el cliente productivo conocido. No se afirma E2E
remoto, integridad humana, aceptación legal ni elegibilidad de una nueva modalidad.

## Archivos WebGL

Solo `public/games/:game/:build/index.html` admite iframe del mismo origen y CSP
necesaria para scripts propios y WebAssembly. Las demás páginas mantienen DENY y
su CSP. El proxy excluye `/games/` (archivos públicos compilados, sin datos privados),
incluyendo `.wasm`, `.data` y manifiestos. Páginas de juego/API siguen protegidas.

El publicador copia una build explícita e inventaría SHA256; un ID existente es
inmutable. Los bundles y cachés se ignoran en Git. Reconstruye/publica localmente
antes de empaquetar un despliegue. `.vercelignore` excluye fuentes Unity y arte local.
No se subió ningún recurso externo como parte del traslado.

2048 `unity-2048-002` usa stripping High y gzip con encabezados específicos para
JS, datos y WASM. La verificación HTTP descomprime y compara hashes contra la build.
El modo ampliado mantiene la proporción de cada juego dentro del viewport, conserva
el iframe y ofrece volver a la página. Usa CSS; no depende del fullscreen nativo.
La exclusión de fuentes Unity también se aplica al tracing de salida standalone.

## Lo que falta para torneos de varios juegos

El modelo actual guarda `current_board`, `highest_tile` y desempates específicos de
2048. Alien Run ya es jugable en práctica pero aún necesita reglas/ranking servidor,
persistencia propia de partidas y una estrategia de integridad acordada antes de
usar inscripciones con dinero. Ese trabajo es independiente de trasladar el gameplay.
