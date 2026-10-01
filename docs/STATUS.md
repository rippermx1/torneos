# Estado — TorneosPlay

Actualizado: 2026-09-30. Rama local de trabajo: `codex/tournament-discovery`,
derivada de `codex/unity-games-migration` en `db49046`. `main` sigue en `6308515`.

El propietario eligió TorneosPlay como base comercial y autorizó trasladar Alien Run
desde `C:/play-games`, además de crear 2048 en Unity con arte 2D generado con GPT.
Se preserva el origen completo. No se desplegó, modificó la DB ni ejecutó Flow.

## Incremento de migración

| Entregable | Estado y evidencia |
| --- | --- |
| Alien Run, SDK, `.meta`, Packages y ProjectSettings en `games/alien-run` | 4437 archivos copiados/verificados por SHA256, sin conflictos. Snapshot `level-030` / `practice-v10`; origen preservado. |
| Nuevo 2048 en `games/2048/UnityProject` | Proyecto real Unity 6000.3.24f1, escena creada con Editor API, arte original y procedencia. |
| Práctica pública `/play` con Unity y versión ligera `/play/web` | `unity-2048-002` compilada y verificada en navegador: teclado, puntuación, reinicio, deslizamiento en viewport móvil y ampliar/volver. Capturas en `artifacts/unity-2048`. |
| Cliente de torneo `/tournaments/[id]/play/unity` | Implementado sobre APIs existentes; prueba de sesión aislada. E2E autenticado en staging pendiente. |
| Cliente productivo `/tournaments/[id]/play` | Se conserva durante la validación del cliente Unity. |
| Alien Run `/play/alien-run` | Build real `level-030` trasladada; verificados carga, handshake, inicio de práctica, controles de personaje y modo ampliado en navegador. No se completó una llegada desde este host. |
| Pruebas plataforma | 242/242, 35 archivos; `artifacts/unity-2048/platform-all-tests.json`. |
| Unity 2048 | 8/8 EditMode y 1/1 PlayMode (incluye glifos de controles), WebGL `002` compilada con gráficos. Descarga: 15.818.967 bytes, 74,9% menos que la primera build. |
| Entrega HTTP de builds | 6 archivos 2048 y 5 Alien Run: bytes coinciden con build, MIME y gzip correctos, iframe propio SAMEORIGIN; `/play` conserva DENY. Evidencia `artifacts/http-*.json`. |
| Compilación Next | Compilación final webpack/standalone exit 0, con TypeScript y generación de páginas. Log `artifacts/unity-2048/next-build-final.log`; paquete servidor sin fuentes Unity, SDK ni artefactos. |
| TypeScript y lint de archivos afectados | Ejecutados sin errores. |

Se excluyen de Git caches/bundles y assets KayKit/LocalArt. Se conservan localmente
para usar el proyecto existente. Solo el arte original de 2048 fue generado con IA.

El SDK compartido y el consumidor Unity tienen el mismo contenido; la diferencia
de SHA256 entre esas dos copias corresponde solo a saltos de línea LF/CRLF. No se
sobrescribió su consumidor. La transferencia conserva bytes idénticos al origen.

El modo ampliado ocupa el viewport de la página y ofrece salida visible. La prueba
de fullscreen nativo en el navegador integrado ocultó el canvas; se sustituyó por
este modo y se verificó su renderizado. La vista móvil es emulación de viewport,
no aceptación en un teléfono físico. Alien Run conserva su build de desarrollo
del origen (aprox. 116 MB); optimizar su entrega requiere un incremento posterior.

El otro chat terminó su incremento `level-030`. Se sincronizaron sus fuentes, escena,
SDK, diseño y build al cerrar. `C:/play-games` queda preservado como origen histórico;
continúa el trabajo nuevo desde `C:/torneos`. Si aparece un cambio posterior en el
origen, usa el script de transferencia y revisa conflictos antes de adoptarlo.

## Próximas opciones de negocio

1. Validar 2048 Unity con cuentas, reconexión, duración y ranking en un Supabase de
   staging; luego decidir su adopción como cliente competitivo predeterminado.
2. Revisar con usuarios el recorrido público implementado localmente: catálogo,
   reglas, coste/premio, disponibilidad y retorno al torneo después de práctica o
   cuenta. Validar el flujo autenticado en staging; no se afirma aceptación humana.
3. Habilitar más juegos por una estrategia servidor y datos de partida por juego.
   Alien Run permanece como práctica; no acepta puntuaciones del cliente para premios.

Compilación y pruebas técnicas no equivalen a aceptación del propietario/usuarios,
validación legal, integración de dinero ni autorización de publicación.

## Incremento de web pública

Implementado en `codex/tournament-discovery`: tarjetas compartidas entre portada
y catálogo, cupos agregados sólo en servidor, disponibilidad por horario/capacidad,
ficha con reglas/requisitos y acciones coherentes, retorno contextual desde ambas
prácticas de 2048 y conservación de destino en cuenta/confirmación/onboarding.
Errores de carga y conteo ya no se presentan como cero torneos o cero inscritos.
No se modificaron migraciones, economía ni clientes de juego.

Pruebas de esta entrega: **295/295 en 39 archivos**, TypeScript, lint afectado y
compilación Next webpack/standalone exit 0. Navegador con fixtures locales y Auth
simulada: estados, errores, destinos y render en escritorio/móvil. Evidencia en
`docs/WEB-DISCOVERY-EVIDENCE.json`; detalle/reproducción en
`docs/SIGUIENTE-INCREMENTO-WEB.md`; capturas/logs en `artifacts/tournament-discovery`.
E2E con cuentas de staging, teléfono físico y aceptación humana permanecen pendientes.
La política de equivalencia competitiva previa a captar participantes pagados
continúa abierta; esta entrega no autoriza lanzamiento pagado.

## Continuidad del trabajo

Para el próximo chat, usar el proyecto **torneos** y la copia local `C:/torneos` en
`codex/tournament-discovery`. La entrega `df6d463` aún no está integrada en `main`;
las builds y assets locales ignorados también deben conservarse. Decisiones,
evidencia, límites y mensaje para retomar en
[CONTEXTO-PARA-CONTINUAR.md](CONTEXTO-PARA-CONTINUAR.md).
