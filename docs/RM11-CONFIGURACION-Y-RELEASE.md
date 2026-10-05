# RM-11: configuración efectiva y release reproducible

2026-10-05. Implementación local en `codex/real-money-access`, base
`74845bfe1d8af697a452fc95a7a6ff24f3348746`, checkout aislado
`C:/Users/valde/.codex/worktrees/real-money-access/torneos`.
**NO_GO productivo vigente.** [Evidencia](RM11-CONFIGURACION-Y-RELEASE-EVIDENCE.json).

## Resultado y contrato

Build, comprobador y servidor comparten normalización y precedencia de variables.
En producción, `FLOW_API_BASE` ausente/vacío o sandbox ya no puede aprobarse ni
resolverse como fallback al enviar una operación. Se exige `https://www.flow.cl/api`;
staging exige sandbox explícito. URLs de aplicación/callback HTTPS canónicas,
aliases consistentes, proyecto Supabase público/servidor idéntico y referencia
productiva protegida explícita para separar staging.

Se comprueban tipos de claves, placeholders, expiración/ref/rol de JWT legacy,
RUT con dígito verificador, razón social, cron y correo, titular y suplente distintos.
No se imprimen valores de credenciales. Claves opacas modernas y JWT decodificados
no prueban autenticidad o pertenencia: esas comprobaciones requieren Supabase real.
El RUT reutiliza el algoritmo existente; no constituye validación jurídica/tributaria.

Fuera de local se rechazan simuladores, email local y contraseña E2E inyectados al
runtime. La contraseña del runner E2E corresponde a su proceso independiente.
Local conserva simulación con endpoints HTTP exclusivamente loopback/gateway Docker,
`TORNEOS_ENVIRONMENT=local` y `TORNEOS_LOCAL_MODE=1`. Un hostname público, un origen
local en producción o una combinación servidor/navegador incoherente no aprueban.

Las variables públicas quedan congeladas en un snapshot de build, incluidos aliases
ausentes y destino. Cambiar key, URL, origen o ambiente exige reconstruir. Next 16.3.8
imprime Ready antes de cargar toda su configuración: el launcher empaquetado valida
la inyección real contra ese snapshot **antes de iniciar Next**. Docker y `npm start`
usan ese launcher. Instrumentation aplica también el contrato al runtime de Next;
un hosting administrado requiere su comprobación real en RM-12.

## Candidata identificable

Node 24.14.1/npm 11.11.0, lockfile, configuración, pruebas, fuentes y migraciones
seleccionadas se registran con SHA-256. Fuentes y SQL de texto se normalizan a LF
para comparar checkouts Windows/Linux; binarios, compilados y WebGL se hashean por
bytes exactos. Esta regla queda indicada en el manifiesto. Docker fija Node por digest y CI fija acciones
por SHA y PostgreSQL 17.11 por digest. `npm ci` se probó en una instalación propia;
el enlace inicial al node_modules del checkout compartido fue sustituido solamente
en este worktree. El target compartido se conservó.

`postbuild` prepara standalone con launcher, validadores, public y static. El manifiesto
registra archivos compilados, BUILD_ID, entradas públicas, cada archivo de los WebGL
seleccionados, migraciones y fingerprints de fuentes/release. Se rechazan enlaces a
rutas externas y archivos `.env` en la salida. Las credenciales privadas no entran
como build args ni como inventario; se inyectan al arrancar.

Esta candidata usa 2048 `unity-2048-007` y Ted Runner `level-030`, copiados localmente
desde sus publicaciones existentes. Sus hashes identifican esas copias; no se compiló
Unity nuevamente ni se aceptó su jugabilidad. Ted Runner no trae build-manifest de
procedencia y conserva alcance de práctica gratuita; sus hashes no habilitan premios.
Los assets/WebGL permanecen locales e ignorados. No se subieron a Git, IA ni registro.

Se identifican **siete migraciones comerciales** en `config/commercial-release.json`.
El inventario de versiones del destino se compara mediante archivo obtenido de una
lectura autorizada: no aplica SQL. Presencia de versión no demuestra contenido,
firmas, grants, historia ni compatibilidad de datos. No usar `db push` indiscriminado;
las dependencias históricas y el historial real deben revisarse antes de aplicar
cada migración comercial. Las fixtures SQL locales no certifican un replay completo.

Los hashes fijan entradas y artefactos de una compilación concreta. No se afirma
igualdad binaria entre compilaciones independientes ni portabilidad Windows/Linux
de dependencias nativas; cada plataforma debe producir y conservar su propio artefacto.

## Verificación y pipeline

| Verificación local | Resultado |
| --- | --- |
| Web | 3.779 pruebas, 79 archivos, PASS |
| PostgreSQL 17.11 | 118 comprobaciones, PASS; cluster propio detenido |
| Arranque standalone | 7 casos, PASS |
| npm ci | 720 paquetes, PASS |
| Lint global / tipos / build webpack-postbuild | PASS |
| Docker Linux / CI remoto / staging real | NOT_RUN |

Resultados finales y hashes se detallan en el JSON de evidencia. Pruebas web,
lint global, tipos, build webpack, instalación limpia, arranque sintético y regresión
nativa de 118 contratos SQL se ejecutaron localmente. El arranque válido sirve el
HTML WebGL con SAMEORIGIN; los casos inválidos salen con error antes de Ready.
No se ejecutaron solicitudes a proveedores, cobros ni mutaciones de DB operativa.

`commercial-candidate.yml` prepara jobs de código y SQL sin secretos de producción.
Código puede usar `--code-only` para probar el repositorio sin los WebGL ignorados;
eso no constituye una candidata completa. La ruta completa exige los builds locales.
El job manual staging descarga manifiesto y evidencias privadas, exige revisión limpia,
fuentes/migraciones coincidentes, artefacto/origen exactos, resultados recientes y
verifica los bytes SHA-256 de nueve pruebas. No despliega ni ejecuta proveedores.
Su resultado acredita **vinculación de evidencias**, no autenticidad de la ejecución
ni aceptación operativa: el responsable revisa las trazas reales de RM-12.

Los jobs y el environment `real-money-staging` están configurados en fuente.
Su ejecución remota, permisos/aprobadores y obligatoriedad en protección de rama
siguen NOT_RUN. Antes de release, exigir code/sql y evidencia staging de la candidata;
no convertir un job omitido en autorización. No se activaron workflows ni se hizo push.

Docker Linux no se construyó: el daemon local no está disponible. La validación
standalone corresponde a Windows x64, Node fijado y compilación production con
configuración pública **sintética de staging**, sin claves privadas reales.

## Dependencias

Auditoría actual: **8 HIGH de desarrollo, 0 hallazgos en dependencias productivas**.
La recomendación automática de npm implica downgrades incompatibles; no se aplicó.
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) no publica
versión corregida de braces al revisar. Se incorpora excepción limitada a paquete,
versión, paths dev del lockfile y ese advisory, con vencimiento **2026-11-05**.
Dependencias nuevas, cambios de versión/advisory, exposición productiva, auditoría
incompleta o excepción vencida hacen fallar la candidata. No se declara resuelto el
HIGH: queda riesgo de tooling acotado y revisión obligatoria antes del vencimiento.
Los PR sin confianza se ejecutan sin secretos, con permisos mínimos y timeout.

## Repetir la preparación

1. Checkout limpio del commit candidato; instalar Node/npm fijados y ejecutar `npm ci`.
2. Restaurar localmente los dos WebGL aprobados y comprobar sus hashes/procedencia.
3. Inyectar variables públicas y destino efectivo; `npm run check:production-env -- --phase public-build`.
4. `npm run release:check` ejecuta pruebas, lint global, webpack/postbuild, tipos y auditorías,
   y genera `artifacts/release/manifest.json`. `--code-only` limita el alcance a código.
5. Ejecutar SQL nativo con `node scripts/verify-commercial-entry-sql.mjs --cash --pg-bin <binarios-17>`.
6. Conservar el artefacto y manifiesto; inyectar configuración privada por el secret manager.
   Validar con `npm run check:production-env` (ambiente inyectado; `--load-env` es explícito)
   y usar el launcher de la salida: `node scripts/start-release.mjs` dentro del bundle.
7. Obtener inventario real por lectura y comparar con `npm run release:manifest -- --destination-inventory <versiones.json>`.
8. Ejecutar RM-12 sobre ese artefacto. Cada entrada de staging.json contiene `status`,
   `artifact` relativo y `artifact_sha256`; identidad, fecha, revision, source_fingerprint
   y release_fingerprint deben corresponder al manifiesto. Verificar con
   `node scripts/verify-staging-evidence.mjs <manifest.json> <staging.json>` y revisar trazas.

Para repetir únicamente el arranque sintético, construir usando staging de ejemplo:
APP_URL/NEXT_PUBLIC_SITE_URL `https://candidate.example.org`, ref staging
`abcdefghijklmnopqrst`, ref protegida `zyxwvutsrqponmlkjihg`, URL pública
`https://abcdefghijklmnopqrst.supabase.co` y clave pública `sb_publishable_` seguida
de 30 letras a. Después ejecutar `node scripts/verify-release-runtime.mjs`.
Estas fixtures no deben desplegarse ni confundirse con credenciales auténticas.

## Pendiente operativo

RM-12: proyecto/keys reales y grants, Storage privado, Auth/MFA, callback HTTPS Flow
sandbox, inscripción/juego/devolución/revisión/retiro y operador/suplente sobre el
artefacto identificado. También falta construir imagen Linux y ejecutar/proteger CI,
comprobar compatibilidad e historial destino, y aceptación humana/física. RM-04,
restauración/carga y autorización del piloto siguen sujetos a sus entregables.
La decisión continúa **NO_GO**; este incremento no habilita dinero real.

Referencias técnicas consultadas: documentación instalada Next 16.3.8 de environment
variables, instrumentation y standalone; [variables Vercel](https://vercel.com/docs/environment-variables),
[claves Supabase](https://supabase.com/docs/guides/getting-started/api-keys),
[API Flow](https://www.flow.cl/docs/api.html) y
[seguridad Actions](https://docs.github.com/en/actions/reference/security/secure-use).
