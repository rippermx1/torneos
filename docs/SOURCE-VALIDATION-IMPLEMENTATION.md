# WEB-16.1 — CI de código y diagnóstico

2026-10-05. Workflow de validación de fuentes para push, pull request y ejecución
manual. Comprueba la revisión Git seleccionada en una copia aislada, instala con
`npm ci` y ejecuta Vitest, los tests Node versionados, ESLint de todas las fuentes
versionadas, Next de producción y TypeScript. Un paso fallido deja salida no cero;
los demás pasos ejecutables siguen para reunir el diagnóstico. La copia no incluye
WIP, `.env` locales, bases de datos ni bundles Unity ignorados.

El workflow usa Node 24 y acciones fijadas a commits verificados de
[checkout](https://github.com/actions/checkout),
[setup-node](https://github.com/actions/setup-node) y
[upload-artifact](https://github.com/actions/upload-artifact). Tiene permiso de
lectura de código; no utiliza los secrets ni ejecuta workflows operativos. Solo
publica dos JSON de resumen con siete días de retención. No publica fuentes Unity,
arte licenciado, logs completos, registros de usuarios ni builds del juego.

El runner no hereda claves del padre, `NODE_OPTIONS` ni configuración npm de usuario;
usa placeholders locales de compilación y configuraciones npm vacías propias.
Los logs completos y detalles de tests permanecen en la carpeta local de la corrida,
ignorados por Git. El informe compartible solo recoge revisión, versiones, conteos,
estados y códigos de salida. Eso no sustituye una revisión de logs operativos.

## Uso

```powershell
node scripts/validate-source.mjs
node scripts/validate-source.mjs --ref HEAD --output artifacts/mi-validacion-nueva
node scripts/source-diagnostics.mjs --local --output artifacts/mi-diagnostico-nuevo.json
```

El primer comando crea un directorio UUID. Los destinos explícitos deben ser nuevos
y estar dentro de `artifacts`; nunca se sobrescribe evidencia anterior. Se conservan
el árbol de trabajo, el índice y las dependencias existentes. El runner mantiene su
copia y dependencias para revisar fallos; no hace limpieza recursiva del workspace.

El diagnóstico registra Git/Node/dependencias y presencia de entradas locales de
las builds registradas. Con `--local`, comprueba TCP en loopback 3081/54321/54324 y
la respuesta acotada de `docker version`. Un puerto abierto no confirma identidad,
salud, Auth, datos ni integridad de la cápsula. No lee dotenv, Docker inspect,
tokens, cookies o filas de la DB; no inicia ni repara servicios.

## Comprobaciones y defecto corregido

Siete tests nuevos verifican exclusión de credenciales, rechazo de rutas privadas,
fallos/timeouts, aislamiento de salidas, evidencia existente, symlinks y TCP local.
El workflow también se verificó con actionlint 1.7.12, descargado de su release
oficial y cotejado con su checksum; la herramienta permanece local e ignorada.

La primera corrida completa detectó un hash de migración incompatible con CRLF
en el checkout aislado. `reviewedMigrationHash` compara contenido con LF canónico,
aceptando exclusivamente LF/CRLF y registrando además el hash de los bytes reales.
Un test independiente rechaza cambios de SQL y de espacios. Los dos archivos SQL
y los hashes revisados se conservaron; no se aplicó ninguna migración.

Resultados finales y revisión exacta en
[E25](SOURCE-VALIDATION-EVIDENCE.json). Artefactos locales:
`artifacts/web16-source-first/`, `artifacts/web16-source-final/` y
`artifacts/web16-local-diagnostic.json`. La primera corrida fallida se conserva.

## Alcance pendiente

**WEB-16 En progreso; 16.1 validación de fuentes y diagnóstico implementados.**
Falta ejecutar el workflow en GitHub/Ubuntu después de publicar estos commits,
ensayar recuperación real de Supabase y estado del simulador y validar diagnóstico
de un incidente operativo. No se cambiaron workflows de cobros o liquidaciones,
configuración externa, branch protection, DB, Flow ni despliegues. La compilación
usa placeholders: no es una candidata de publicación ni prueba Auth o premios.

Los tests SQL con PostgreSQL nativo se omiten cuando no existe su runtime aislado;
el conteo de omitidos queda explícito. No se declara integridad SQL, restauración,
teléfono ni Unity WebGL a partir de esta CI de fuentes. El diagnóstico local de
esta entrega mantiene Docker y puertos del stack no disponibles: G2048-09.4 sigue
pendiente. La comprobación de bundles para empaquetar una imagen sigue perteneciendo
al guard existente `scripts/check-game-builds.mjs`, que no se elimina ni debilita.
