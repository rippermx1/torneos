# Publicación contable en Vercel dev — 2026-10-05

Estado: **READY, publicado y verificado**.
Acceso: [Contabilidad](https://torneos-dev.vercel.app/admin/accounting), con cuenta
administradora del entorno dev y MFA. La producción comercial no recibió cambios.

Proyecto Vercel: `torneos-dev`, `prj_QHiZYuYkztFToMGmwhPsyOx9nVdG`.
Supabase: `jnoyjewsqbooqaiighcs`. Despliegue final:
`dpl_97VBvufgcoKozhAKLytz7Hjjs7SW`,
`https://torneos-o1iboz6ep-carlos-projects-a9dcfa0f.vercel.app`.
Ambos aliases dev apuntan a ese despliegue; el dominio principal es
`https://torneos-dev.vercel.app`.

## Alcance del paquete

La base es el paquete de la versión publicada anteriormente:
`dpl_3VxaPf5t4yAGb2TRX28GjgJpJXFH`. Se comprobaron sus 348 archivos contra su
manifest antes de copiar. El overlay tiene 15 cambios contables; conserva los
contratos de juegos de esa base. La página compartida de reportes excluye el
enlace del trabajo simultáneo de Snake, y los tipos agregan sólo las RPC/columnas
contables. Los archivos generados `vercel.json` y `.vercelignore` de la base se
conservan, junto con `next-env.d.ts` generado por Next. Total subido: 357 archivos.

Los SHA-256 de los assets publicados de 2048 `unity-2048-007` y Factory Empire
`factory-empire-3d-009` permanecen iguales. No se incorporaron nuevas builds,
assets KayKit/LocalArt, proyectos Unity ni avances ajenos del checkout compartido.
La metadata Git de CLI identifica el HEAD del checkout, no un commit que contenga
exactamente esta publicación: la fuente exacta está en el manifest del paquete.

El primer candidato omitió la configuración generada después del manifest de la
base. La comprobación del dominio detectó la falta de `X-Robots-Tag`; se restauró
el despliegue anterior, se corrigió el paquete y se publicó una segunda candidata.
La versión final conserva **`noindex, nofollow`**, `crons: []` y la validación de
Supabase dev antes de compilar. El build remoto confirmó Flow sin credenciales
y correo externo desactivado. No se cambiaron credenciales ni migraciones.

## Verificaciones ejecutadas

- 38 pruebas / 8 archivos del paquete PASS; ESLint, TypeScript y Next build PASS.
- Build remoto Vercel READY, ejecutando `check-cloud-development.mjs` con el ref dev.
- Nueve controles HTTP PASS en la candidata protegida y nueve en el dominio final.
  Auth, cookies SSR, PostgREST y desafío TOTP AAL2 reales; cuentas sintéticas existentes.
- Anónimo, usuario común y administrador AAL1 sin acceso contable. Admin AAL2 pudo
  leer diario, saldos, cierre guardado y páginas; se rechazaron origen ajeno,
  período inválido y cierre sin revisión. El replay del aporte fue idempotente.
- Exportación CSV/JSON de las doce líneas, sumas balanceadas y snapshot original
  de seis líneas conservado tras reapertura. Los registros contables antes/después
  del ensayo permanecieron iguales; no se añadieron movimientos ni cierres.
- Comprobación de secretos de servidor y del ref productivo en el HTML y chunks
  descargados de login, contabilidad y finanzas, sin coincidencias.
- Assets WebGL publicados comprobados contra todos sus hashes de la base.
- Consulta de logs del despliegue final: sin resultados 5xx en la ventana observada.
  Esta observación acotada no garantiza ausencia de errores futuros.

La protección Vercel sigue habilitada. El acceso temporal a la candidata dejó de
existir; se confirmó que su enlace vuelve a redirigir a SSO y no entrega cookie de
acceso. Se eliminó su archivo privado local. Las sesiones Supabase del ensayo se
cerraron con alcance local; no se modificaron contraseñas, roles ni factores MFA.

## Evidencia y operación pendiente

Evidencia resumida: [JSON](CONTABILIDAD-PUBLICACION-EVIDENCIA.json).
Manifest, inventario de subida, build y verificaciones:
`artifacts/accounting-cloud/2026-10-05T21-08-05.398Z/`.
Los archivos privados de entorno quedan fuera del paquete y del repositorio.

El ensayo usa únicamente `PRUEBA-CONTABLE-227a1cad`, con saldos finales y controles
en cero. El propietario declara **sin movimientos reales**. CONT-11 permanece
pendiente de confirmar período, respaldos/saldos externos y revisión del contador;
no se aprobó un cierre real. La aceptación humana de la web y la operación fiscal
CONT-12 siguen pendientes. [Expediente de pre-cierre](CONTABILIDAD-PRIMER-CIERRE.md).

Si se requiere revertir la web dev, el despliegue anterior conservado es
`dpl_3VxaPf5t4yAGb2TRX28GjgJpJXFH`. La reversión de web no borra registros ni revierte
el esquema contable de Supabase dev.
