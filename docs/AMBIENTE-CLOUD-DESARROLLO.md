# Ambiente cloud de desarrollo

Actualización 2026-10-06: [integración de juegos en develop](INTEGRACION-JUEGOS-DEVELOP.md)
publicada con 2048 `007`, Factory Empire 3D `035`, catálogo actualizado y contabilidad
preservada. Snake mantiene hosting pendiente; Ted Runner permanece local.
La descripción de la entrega original del 2 de octubre se conserva abajo como antecedente.

Configuración solicitada por el propietario el 2 de octubre de 2026.

- Supabase: `torneos-dev`, ref `jnoyjewsqbooqaiighcs`, organización `nebutechlabs`, región `us-east-1`.
- Vercel: proyecto independiente `torneos-dev`, ID `prj_QHiZYuYkztFToMGmwhPsyOx9nVdG`.
- Dirección asignada: `https://torneos-dev.vercel.app`.
- Deploy verificado: `dpl_3VxaPf5t4yAGb2TRX28GjgJpJXFH`, estado `READY`.
- Configuración reproducible: `config/cloud-development.json` y `config/cloud-development.env.example`.
- Credenciales locales: `.env.cloud-development.local` y `.env.cloud-test-users.local`, ignoradas por Git.

Este proyecto Vercel utiliza su dominio principal para el ambiente de desarrollo.
El proyecto `torneos`, su dominio comercial, su enlace `.vercel/project.json` y su
base Supabase no se utilizan como destinos de estas operaciones. No se cambia
la rama del checkout compartido ni se envía su trabajo pendiente a GitHub.

## Contenido y límites

El paquete incluye la plataforma Next, 2048 `unity-2048-007` y Factory Empire 3D
`factory-empire-3d-009`. Conserva las versiones capturadas en el manifiesto del
paquete aunque otro trabajo actualice posteriormente el registro local.

Ted Runner no se empaqueta: `AGENTS.md` exige mantener KayKit y LocalArt locales.
Snake Arena no se ofrece en el catálogo cloud mientras no se adapte y compruebe
su servidor persistente. Sus módulos TypeScript necesarios para compilar las APIs
se incluyen; no se inicia un servidor de salas en Vercel. Sus páginas de práctica
informan que el juego todavía no está disponible en este ambiente.

Flow apunta exclusivamente a sandbox y carece de credenciales: los cobros no están
habilitados. Google y los correos transaccionales Resend tampoco están habilitados.
Supabase Auth conserva confirmación por email y tiene el dominio dev en su lista
de redirecciones. La entrega no acredita recepción de correos ni aceptación humana.
Los datos iniciales son cuentas sintéticas, sin saldo ni KYC aprobado.

La herramienta Supabase informó costo de creación de 0 al mes. Esto no acredita
capacidad ilimitada ni autoriza una actualización de plan o servicios adicionales.

## Empaquetar

```powershell
node --test scripts/check-cloud-development.test.mjs
node scripts/package-cloud-development.mjs
```

El resultado queda en una carpeta nueva bajo `artifacts/cloud-development`.
`latest-package.json` apunta al paquete y al manifiesto de entradas con SHA-256.
Solo se copian fuentes web autorizadas y las builds seleccionadas. Se excluyen
credenciales, proyectos Unity, cachés, arte local y versiones WebGL anteriores.
El paquete genera su propio `vercel.json` y deshabilita los crons Vercel.

## Configurar recursos

La creación del proyecto Supabase requiere elegir organización y confirmar costo;
no forma parte de los scripts. `configure-cloud-development.mjs` usa la sesión
autenticada de la CLI Vercel y las claves dev capturadas localmente mediante:

```powershell
npx supabase projects api-keys --project-ref jnoyjewsqbooqaiighcs --reveal --output json |
  Set-Content -LiteralPath .env.cloud-api-keys.local -Encoding utf8
node scripts/configure-cloud-development.mjs
```

Ese script verifica el destino, prueba la clave de servidor contra el Supabase dev,
configura exclusivamente `torneos-dev`, escribe los secretos en archivos ignorados
y enlaza el paquete, sin reenlazar el repositorio a otro proyecto. No lo ejecutes
contra producción ni reutilices claves productivas.

Las migraciones se ejecutaron con una copia aislada de `supabase/migrations`,
`--project-ref jnoyjewsqbooqaiighcs`, sin seeds ni secretos Vault copiados. Auth se
configuró con un `config.toml` mínimo en `artifacts/cloud-development/supabase-config`.

## Cuentas y pruebas

```powershell
node --env-file=.env.cloud-development.local scripts/seed-cloud-development.mjs
```

Cuentas: `jugador.dev@example.com` y `operador.dev@example.com`. Contraseña aleatoria
en `.env.cloud-test-users.local`; el operador debe configurar MFA en la web antes
de usar funciones administrativas que lo requieren. El script preserva las cuentas
existentes y no reinicia su MFA ni les acredita dinero.

La evidencia técnica y estado final del deploy se registran en
`artifacts/cloud-development` y `docs/CLOUD-DEVELOPMENT-EVIDENCE.json`.

## Desplegar una nueva versión

Después de empaquetar, ejecutar `configure-cloud-development.mjs` enlaza únicamente
el paquete a `torneos-dev`. Validar configuración y compilar antes de publicar:

```powershell
$cloudPackage = (Get-Content artifacts/cloud-development/latest-package.json | ConvertFrom-Json).packageDirectory
npx vercel@62.2.0 deploy $cloudPackage --dry --json --scope carlos-projects-a9dcfa0f
npx vercel@62.2.0 deploy $cloudPackage --prod --yes --scope carlos-projects-a9dcfa0f
node --env-file=.env.cloud-development.local scripts/verify-cloud-development.mjs
```

`--prod` asigna el dominio principal del proyecto separado **torneos-dev**. No se
ejecuta desde el checkout enlazado a `torneos` ni promueve su dominio comercial.
El build Vercel valida el proyecto Supabase y Flow sandbox antes de compilar.
No hay conexión Git automática: estos despliegues son explícitos desde el paquete.

El archivo ZIP de esta entrega es
`artifacts/cloud-development/2026-10-02T22-01-11-197Z/torneos-dev-source.zip`.
El paquete también añade `X-Robots-Tag: noindex, nofollow` para buscadores.

## Scheduler y verificación técnica

```powershell
node --env-file=.env.cloud-development.local scripts/configure-cloud-development-scheduler.mjs
```

Este comando usa `--linked` junto con `--project-ref` explícito y un workdir aislado;
no modifica el enlace Supabase del checkout. Cuatro jobs en la base de desarrollo
llaman al dominio dev con su propio secreto en Vault. Sus endpoints respondieron
200; el de transición de torneos rechaza solicitudes sin credencial con 401.

Comprobaciones de esta entrega: 603/603 pruebas web, 11/11 de configuración y bloqueo
Flow en runtime, 6/6 del simulador local tras acotar su rastreo, lint y builds
Next/TypeScript local y Vercel. 22/22 HTTP/assets con hashes, gzip y MIME correctos;
53 archivos de cliente examinados sin clave de servidor ni secreto cron.
Navegador: login, 2048 cargado/iniciado/movimiento y Factory Empire cargado/extracción
continua de 0 a 33 ferrita. No sustituyen pruebas de torneo competitivo ni aceptación.

El asesor Supabase no reportó avisos de nivel WARNING/ERROR. Conserva siete avisos
INFO de RLS sin políticas en tablas operativas usadas por el servidor; no se
abrieron políticas para esas tablas. [Descripción del aviso](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
