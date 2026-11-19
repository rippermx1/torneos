# Integración de juegos en develop — 2026-10-06

Destino: proyecto separado Vercel `torneos-dev`, ID
`prj_QHiZYuYkztFToMGmwhPsyOx9nVdG`, y Supabase dev
`jnoyjewsqbooqaiighcs`. La fuente capturada incluye WIP compartido; el HEAD por sí
solo no identifica esta entrega. El manifiesto con SHA-256 identifica cada entrada.
La captura final corresponde a las 12:08 de Santiago. El cambio posterior de texto
en `unity-factory-empire-3d.tsx`, de otra entrega Factory en curso, se conserva en
el workspace y no se añade a esta publicación congelada de la build 035.

**Publicado y verificado:** [catálogo develop](https://torneos-dev.vercel.app/play/catalog),
deployment `dpl_DXTdRYRTgfUaCrkh6Y4rtu3c1TFM`, estado `READY`.
4.252 pruebas web/100 archivos, 16 pruebas Node, tipos/ESLint/build local y remoto PASS.
32 controles en candidata y 32 en dominio final; 26 chunks examinados por ambiente.
Navegador: Unity 2048 inicia y suma 4 puntos con una combinación; Factory 035 carga
y restaura la colonia local previa (255 ferrita, 2/14 logros), sin errores de consola.
No se ejecutó otro ciclo Editor/PlayMode ni torneo competitivo cloud en esta entrega.

## Contenido

| Juego | Versión capturada | Estado en develop |
| --- | --- | --- |
| 2048 | `unity-2048-007` | Práctica y cliente competitivo; incluye el panel de fin de partida y tabla del ranking compartido. |
| Factory Empire 3D | `factory-empire-3d-035` | Campaña local/con cuenta, ocho familias, 23 tecnologías, legado, comunidad y desafío de 24 horas. |
| Snake Arena | `snake-arena-014`, local | Hosting pendiente por decisión del propietario. Sin WebGL ni enlace a salas/creación de torneos en el catálogo cloud. |
| Ted Runner | `level-030`, local | KayKit/LocalArt permanecen locales conforme a AGENTS.md. Sin WebGL en el paquete cloud. |

El catálogo `/play/catalog` muestra los cuatro juegos y los accesos disponibles.
No monta un iframe hasta entrar al juego. Factory ofrece campaña, comunidad y
desafío; 2048 conserva el destino del torneo seleccionado. El catálogo de torneos
no consulta ni anuncia rondas Snake en cloud. Los proyectos y builds Unity locales
se preservan; no se recompila ni se reconstruye otro cliente desde semillas.

Factory usa cuatro contratos JSON importados desde el proyecto Unity real:
reglas de campaña, logros, parámetros de desafío y reglas congeladas del desafío.
El empaquetador anterior omitía los dos últimos; ahora descubre esos imports en
las fuentes congeladas. Incluye también las configuraciones JSON usadas por la web.
Las reglas del desafío siguen separadas del catálogo ampliado de campaña.

La contabilidad publicada se conserva byte por byte en sus módulos dedicados.
Los reportes y tipos compartidos incorporan además los contratos actuales de juegos.
Flow sandbox sigue sin credenciales; Resend/Google deshabilitados. No se ejecutan
migraciones, crons, cobros ni cambios de esquema/configuración remota en esta entrega.

## Captura y validación

`package-cloud-development.mjs --games` escribe bajo `artifacts/games-development`.
Conserva el puntero histórico `artifacts/cloud-development/latest-package.json` que
utiliza la publicación contable. Cada captura tiene una carpeta nueva, registro de
builds, contratos y hashes de todos los archivos, incluidos `vercel.json` y
`.vercelignore`. Rechaza builds incompletas, secretos locales, arte excluido y cambios
de fuente durante la copia. Normaliza los includes de TypeScript sólo en la copia.

```powershell
node --test scripts/cloud-development-package.test.mjs scripts/check-cloud-development.test.mjs
node scripts/package-cloud-development.mjs --games
node scripts/inspect-games-development.mjs
$gamesPackage = Get-Content artifacts/games-development/latest-package.json | ConvertFrom-Json
npx vercel@62.2.0 env pull "$($gamesPackage.directory)/.env.vercel-production.local" --environment=production --yes --cwd $gamesPackage.packageDirectory --scope carlos-projects-a9dcfa0f
npm ci --prefix $gamesPackage.packageDirectory
npm ci --prefix "$($gamesPackage.packageDirectory)/games/snake-arena/server"
node scripts/validate-games-development.mjs
```

Las credenciales descargadas quedan fuera del paquete y en artifacts ignorados.
`inspect-games-development.mjs` sólo lee Vercel y crea el enlace local del paquete;
no modifica variables, dominio, protección ni el `.vercel` del checkout comercial.
La validación comprueba ambiente, hashes y conservación de contabilidad antes de
compilar. Pruebas completas se ejecutan contra las fuentes del workspace; el paquete
de publicación omite las pruebas raíz que dependen de herramientas locales.

## Publicación

Se crea una candidata en el canal principal del proyecto **dev**, con
`--prod --skip-domain`, y se verifica antes de promoverla al dominio dev.
La CLI gestiona el acceso a la candidata protegida; no se deshabilita la protección.
`verify-games-development.mjs --candidate` compara hashes WebGL, gzip/MIME,
encabezados iframe/noindex, páginas, Auth real y lecturas de comunidad/desafío.
No inscribe cuentas, inicia desafíos, muta colonias ni ejecuta cron. Cierra solamente
su propia sesión Auth. Después de promover, repite contra el dominio canónico.

Estado final y artefactos: [evidencia de integración](INTEGRACION-JUEGOS-DEVELOP-EVIDENCE.json).
El deployment previo para retorno es `dpl_97VBvufgcoKozhAKLytz7Hjjs7SW`.
La aceptación artística, el rendimiento en teléfono físico, el hosting Snake y la
operación con dinero real conservan sus límites separados.

Se observó un recorte del HUD/catálogo Factory al ampliar el juego en IAB de
1280×720. La entrada normal carga, pero la ampliación requiere seguimiento de GUI;
no se marca aceptación visual completa. El bug se observó sobre la build capturada,
sin modificar el proyecto Unity ni su arte para esta integración.

## Dependencias heredadas

La instalación informó 11 avisos npm: uno crítico, nueve altos y uno moderado;
con `--omit=dev` queda un aviso alto de `source-map-js` 1.2.1
([GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)).
El lockfile se preservó; esta integración no acredita una auditoría npm limpia.
Los reportes completos se conservan en artifacts de esta entrega.
