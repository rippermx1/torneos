# Workspace único y contenedor de Torneos

Verificado el 2026-10-01 en `codex/torneos-container-workspace`, desde `8bc1312`.

**Actualización posterior:** el entorno operativo está en
`codex/operational-local-environment`; ver `AMBIENTE-LOCAL.md`. Sustituye los
placeholders por Supabase local y el simulador de pagos. Orbit y su volumen ya
no aparecen en el inventario final. Los datos/servicios descritos abajo corresponden
a la auditoría histórica de `8790a37`, no al estado actual de Docker.

## Decisión de continuidad

El workspace activo de plataforma y juegos es **C:/torneos**. Abrir aquí Next y los
proyectos Unity existentes; guardar aquí código, catálogos y resultados nuevos.
`C:/play-games` se conserva como respaldo histórico, sin destinarle trabajo nuevo.
No hace falta volver a copiar Alien Run ni reconstruir otro proyecto Unity.

La comprobación inicial por SHA256 encontró **4437/4437 archivos idénticos**, cero
deltas y cero conflictos en fuentes, metadata, Packages, ProjectSettings, SDK,
diseño y manifiesto trasladados. Los cuatro archivos de runtime WebGL de
`level-030` también coinciden con Orbit. El HTML de Torneos tiene su propio puente.

La revisión encontró 15 referencias fijas a `C:/play-games` en ocho archivos de
herramientas/pruebas Unity. Ahora usan `WorkspacePaths`, que encuentra la raíz
del workspace desde `Application.dataPath`, independientemente del directorio de
trabajo. Las salidas quedan en `artifacts/alien-run`; la documentación local en
`games/alien-run/docs`. Se trasladaron y verificaron el catálogo JSON de prefabs
y su CSV. **Conservar esos dos archivos locales:** el JSON también es entrada de
las herramientas de refinamiento. Permanecen ignorados por Git.

La auditoría posterior registra ocho conflictos deliberados: son estos cambios
nuevos de Torneos frente al respaldo. No sobrescribirlos desde el origen.
El baseline de transferencia sigue intacto. Las normalizaciones de saltos de
línea que hizo Unity en dos ProjectSettings se restauraron a sus bytes originales.

Para revisar futuros deltas sin escribir archivos ni reemplazar el baseline:

```powershell
node scripts/migrate-alien-run.mjs C:/play-games --dry-run
```

## Qué conserva el origen

Orbit tiene un portal propio, API FastAPI, contratos, herramientas y evidencia
histórica que no son parte del monolito comercial. Su Git está en `main`,
`179a344`, con **36 entradas modificadas y 390 sin seguimiento**. Tener copiado
el juego no convierte todo ese contenido en material descartable.

Sus tres contenedores siguen en el proyecto Compose `orbit-arcade`; sus imágenes
no montan `C:/play-games`. PostgreSQL usa el volumen
`orbit-arcade_postgres_data`, con 12 jugadores, 63 runs y 12 sesiones al auditar.
Se comprobaron los mismos IDs, mounts y conteos al terminar. No se detuvieron
contenedores ni se borró origen, Git, imágenes, volumen o información histórica.

Para retirar Orbit después: preservar el estado completo del repositorio y su WIP,
respaldar PostgreSQL, decidir el destino de las prácticas históricas y entonces
retirar sus servicios. Esas prácticas no deben convertirse en resultados con premios.
Mantener el respaldo fuera del trabajo activo cumple la transición de workspace;
su eliminación o retiro no se ejecutaron en este incremento.

## Una aplicación con varios juegos

`compose.app.yaml` define el proyecto **torneos** con un único servicio `app`.
Sirve Next, APIs comerciales y las builds WebGL bajo el mismo origen. No depende
del portal ni de la API de Orbit. Supabase y Flow conservan sus integraciones
externas; meter sus datos/procesos dentro del contenedor no forma parte del cambio.

Las versiones activas se declaran en `lib/game/runtime-builds.json`, compartido por
los clientes y el verificador de empaquetado. El build falla si faltan archivos
de esas versiones. Docker incluye los WebGL publicados pero excluye proyectos
Unity, fuentes licenciadas, caches, `.env*`, Git y artefactos. La imagen ejecuta
como UID 1001. Las builds locales ignoradas deben existir antes de construirla.

Para usar un Supabase de staging configurado por el propietario:

```powershell
Copy-Item .env.docker.example .env.docker
# Completar .env.docker con las variables del entorno elegido.
docker compose --env-file .env.docker -f compose.app.yaml up -d --build
node scripts/verify-container.mjs http://127.0.0.1:3081
```

Las variables `NEXT_PUBLIC_*` quedan fijadas al construir; cambiar runtime no
cambia el destino del navegador. Secretos privados entran por `env_file` en runtime.
El contenedor no instala Unity: los juegos se editan/compilan en los proyectos
locales existentes y se publican con `scripts/publish-unity.mjs`.

El antiguo `docker-compose.yml` solo ofrece DB/PostgREST de desarrollo, sin Auth.
Si se usa, elegir explícitamente otro proyecto:
`docker compose -p torneos-db-local -f docker-compose.yml ...`. No mezclarlo con
el proyecto `torneos` ni con Orbit.

## Validación ejecutada

El contenedor local **torneos-app-1** quedó healthy en
[http://127.0.0.1:3081](http://127.0.0.1:3081). Se construyó con placeholders en
`.env.docker-preview` y fixtures de lectura locales en el puerto 59999; no tiene
credenciales operativas de Auth, pagos o DB. La fixture ya existente en el host
se alcanza desde Docker por `host.docker.internal`. No es un servicio productivo.

Se corrigió CSP para el HTTP de loopback definido en `APP_URL`, conservando
`upgrade-insecure-requests` para hosts públicos y nonce en scripts/estilos.
`style-src-attr` permite los atributos de tamaño/posición usados por la interfaz.

- Next webpack/standalone compilado **dentro de Docker**, TypeScript y lint afectados PASS.
- Plataforma: **305/305**, 40 archivos; scripts de transferencia/empaquetado **4/4**.
- Unity Alien Run: compilación de scripts y **8/8 EditMode**, incluidos límites de rutas.
- HTTP: **14 comprobaciones**, rutas públicas, hashes de 10 archivos de juegos,
  gzip/MIME, SAMEORIGIN en juegos, DENY en app y redirect de admin anónimo.
- Navegador: 2048 recibe direcciones y llega a 16 puntos de práctica; Alien Run
  anuncia `level-030` / `practice-v10` e inicia práctica. Ampliar/volver funciona;
  viewport 390 sin overflow y sin violaciones CSP. Capturas de 2048 revisadas.
- Auditoría inicial y preservación de origen/Orbit: `artifacts/container-workspace`.

No se recompilaron los WebGL, no se ejecutaron PlayMode ni llegada completa de
Alien Run en este incremento. Staging autenticado, teléfono físico y aceptación
humana siguen pendientes. El contenedor unifica entrega y ejecución de clientes;
**Alien Run todavía no tiene integración competitiva servidor ni premios**.

`npm audit --omit=dev` detectó cinco avisos de dependencias existentes, incluyendo
uno crítico en Next 16.2.10. Se conserva el informe local; esta entrega de
consolidación no actualiza dependencias ni afirma preparación para publicación.
