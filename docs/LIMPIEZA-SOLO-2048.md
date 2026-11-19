# Limpieza del proyecto: sólo 2048

Fecha: 2026-11-06. Rama de trabajo: `codex/2048-clean-gameplay`, HEAD inicial `c8d7e75`.

Se retiraron del proyecto activo Ted Runner/Alien Run, Snake Arena, Factory Empire
y RTS Duel: proyectos Unity y builds publicados, servidores, rutas públicas y de
administración, APIs, componentes, bibliotecas, pruebas y herramientas exclusivas.
El catálogo, las páginas de práctica y torneos, el registro de builds, el arranque
Docker y el empaquetador de develop mantienen únicamente 2048.

El workspace ya tenía trabajo sin confirmar. Se preservaron los cambios ajenos
de contabilidad, cuentas, pagos y plataforma. El respaldo local externo está en
`C:/torneos-cleanup-backups/20261106-only-2048`; contiene el estado previo y las
carpetas retiradas, incluidos los proyectos locales. No se publicaron assets.

## Conservación de 2048

- 270 archivos protegidos de fuentes, configuración y recursos Unity, WebGL y
  contratos de 2048 conservan exactamente sus SHA256 previos.
- Nueve archivos adicionales del legado/motor/enlaces y diez de WIP compartido
  fueron comparados con el respaldo: idénticos.
- Se conserva `unity-2048-007`, sus cápsulas previas y el proyecto Unity real.
- Los componentes `game-board*.tsx` y el motor legado permanecen intactos.
  `/play/web` y `/play/unity` ya redirigían a `/play`; siguen haciéndolo.
- La autoridad de resultados competitivos permanece en el servidor.
- El historial de migraciones y sus tipos de base de datos se conservan para
  instalaciones existentes; no se ejecutaron cambios de DB, Flow o servicios remotos.

## Validación ejecutada

| Comprobación | Resultado |
| --- | --- |
| Suite web completa Vitest | 3.637/3.637 PASS |
| Herramientas Node | 32/32 PASS |
| Unity 6000.3.24f1 EditMode | 18/18 PASS |
| Unity PlayMode | 4/4 PASS |
| Next producción, webpack | PASS, 60 páginas estáticas generadas |
| TypeScript sin emisión | PASS |
| ESLint de páginas/componentes/configuración modificados | PASS |
| HTTP: host, assets SHA256, gzip, MIME, framing, caché y acceso admin | 14 PASS |
| Rutas/builds de juegos retirados | 9/9 devuelven 404 |
| Navegador Unity real | Carga `007`, movimientos, fusión/puntaje 0→4, reinicio, ampliar/Escape PASS |
| Navegador legado original aislado | Flechas 0→24, WASD 0→8, reinicio y mejor puntaje PASS |
| Layout emulado 390×844 | Ambos clientes sin desbordamiento horizontal; Unity con 16 casillas |
| Comparación de archivos protegidos | PASS, cero diferencias |
| Paquete congelado de develop | 267 archivos; único runtime: `2048: unity-2048-007` |

Las pruebas de navegador usaron Next compilado en `127.0.0.1:3280` con configuración
aislada, sin credenciales productivas. El legado se montó en una vista temporal de
prueba en `127.0.0.1:3281`; no se añadió una nueva ruta pública. La vista temporal
reutilizó estilos y fuentes del Next compilado. No hubo excepciones JavaScript
durante las comprobaciones finales. La GPU de navegador es emulada/software.

No se reconstruyó ni sobrescribió la cápsula inmutable de 2048: se probaron las
fuentes en Editor/PlayMode y el WebGL existente en navegador.

## Hallazgos y límites

La comprobación adicional `verify-accounting-sql.mjs` falla en la línea 67:
`0 !== 420168`. Se reprodujo exactamente el mismo fallo con el script y las
migraciones respaldados **antes de la limpieza**, usando el mismo motor SQL local.
Es un fallo preexistente de esa comprobación; no se corrigió lógica contable ajena.
Su motor PGlite se trasladó de un directorio de Snake a `artifacts/accounting/sql-runtime`
para conservar la herramienta contable después de retirar ese juego.

Docker Desktop no tenía disponible su motor Linux: no se ejecutó un build de imagen
ni un recorrido dentro del contenedor. Next standalone sí se compiló y ejecutó.
La aceptación humana, un teléfono físico y el recorrido Auth/DB de develop no forman
parte de estas pruebas locales. El siguiente paso es integrar/publicar la candidata
en develop y comprobar allí el recorrido existente de 2048 con su configuración real.
La limpieza no se ha desplegado en develop ni producción, ni se ha hecho merge o push.

## Evidencia local y candidata

- `artifacts/cleanup-2048/preservation.json`: identidad de 2048 y WIP revisado.
- `artifacts/cleanup-2048/vitest-final.json`, `node-tests-final.log`,
  `editmode.xml`, `playmode.xml`, `build-final.log`, `types.log`, `lint.log`.
- `artifacts/cleanup-2048/http.json`, `browser.json` y capturas `unity-*.png`, `legacy-*.png`.
- `artifacts/cleanup-2048/accounting-sql.log` y `accounting-sql-before.log`.
- `artifacts/cleanup-2048/develop-package.json`: ubicación/manifiesto de la candidata.
- `artifacts/cleanup-2048/task-changes.json`: cambios de esta limpieza respecto
  del estado local recibido, separados del trabajo que ya estaba sin confirmar.

El paquete de develop contiene fuentes web y la cápsula seleccionada, sin proyectos
Unity, recursos privados, variables secretas ni runtimes de otros juegos. Los registros
y paquetes históricos de QA no son despliegues vigentes.
