# RM-12: preparación y despliegue en dev

2026-10-05. IN_PROGRESS. NO_GO para operar con dinero real.

Este documento conserva la evidencia del primer preflight. El estado posterior,
con variables productivas cargadas y Google habilitado, está en
[RM12-VALIDACION-DEVELOP.md](RM12-VALIDACION-DEVELOP.md), de 2026-10-06.

El candidato usa el proyecto Vercel `torneos-dev` y Supabase
`jnoyjewsqbooqaiighcs`. Su origen previsto es
`https://rm12-torneos-dev.vercel.app`, separado del dominio compartido actual.
El despliegue no sustituye el avance de Factory Empire en `torneos-dev.vercel.app`.

## Validación y cambios efectivos

- Ensayo offline del catálogo real: 39 tablas, 64 funciones y grants/políticas
  capturados sin filas, identidades Auth, secretos, jobs ni archivos privados.
  Seis migraciones comerciales pasan; restauración del catálogo anterior en
  otra base local PASS. Auth se reproduce con helpers mínimos; esto no prueba
  una recuperación completa de Supabase ni recuperación de datos reales.
- Las seis migraciones comprometidas se aplicaron exclusivamente en dev.
  Catálogo posterior PASS: siete dependencias de la candidata presentes,
  RLS/grants, dieciocho RPC, siete triggers, tres buckets privados y semilla
  2048 sin SELECT de navegador. MCP asigna timestamps nuevos: se acredita cada
  archivo mediante nombre canónico y hash del SQL completo, normalizando CRLF
  y saltos de línea finales. No se alteró manualmente el historial.
- Auth real de jugador y operador PASS; once tablas privadas y semilla rechazan
  GET de cero filas con ambas cuentas. Operador sigue AAL1 sin factores: MFA
  AAL2 pendiente. Las sondas cerraron sólo sus propias sesiones.
- `STAGING_PHASE=preflight` requiere Supabase aislado, credencial privada y cron
  válidos. Rechaza claves Flow/Resend y bloquea los cinco entrypoints de envío
  antes del transporte. El monitor externo respeta también el bloqueo.
  El despliegue exige reconstrucción para cambiar la fase; la aceptación
  financiera rechaza cualquier evidencia de preflight.
- El canal production de Vercel puede alojar staging sólo si su ID real coincide
  con el proyecto staging declarado y difiere del productivo protegido.
- Paquete de publicación: aplicación de la candidata y WebGL 2048 aprobado.
  No publica assets licenciados de Alien Run ni WIP de Factory Empire.
  Alien Run indica que no está disponible en este ensayo.
- Identidad comercial recuperada de variables productivas de Vercel, según
  autorización del propietario. No se copiaron credenciales Supabase productivas.
  ALERT_EMAIL y OPS_ESCALATION_EMAIL no existen en esa fuente; variables sensibles
  Resend no fueron recuperadas ni enviadas al candidato de preflight.

Pruebas locales: 3.811 casos en 81 archivos PASS; TypeScript y ESLint PASS.
Publicación Vercel y prueba de aplicación PASS:

- URL: [RM-12 en torneos-dev](https://rm12-torneos-dev.vercel.app).
  Mantiene la protección de acceso de Vercel. La verificación utilizó un enlace
  temporal, sin deshabilitar la protección del proyecto.
- Revisión publicada `9548aed84894be97ebf6cdd7ae3792a1df3a1ca2`;
  despliegue `dpl_7Boj1sHipzgvaBnqcRV3QCSS1Dp8`, estado READY.
  Compilación webpack y TypeScript remotos PASS. Los 287 archivos de entrada
  coinciden byte por byte con el árbol de fuentes registrado por Vercel.
  Huella SHA256 del inventario: `5c78653fd74440780f13bc5124f46d53fc9abb4d84b4b6a0d13d9ec88413d388`.
  No se afirma igualdad de bytes compilados con la salida Windows anterior.
- Cuatro páginas HTTPS, entrada iframe y cuatro assets WebGL PASS. Sesión real
  de jugador, página de premios y práctica autenticada inicio/movimiento PASS.
  Jugador y operador AAL1 reciben 403 antes de operar caja.
- Tres objetos sintéticos privados: descarga de control con service role PASS;
  anon, jugador ajeno y operador AAL1 denegados en los tres buckets. Eliminación
  de las sondas comprobada; cero objetos de prueba remanentes.
- Navegador de escritorio: canvas Unity cargado, banner de bloqueo visible,
  sin overlay de framework ni errores no capturados. Seis flechas reales llevan
  el puntaje de 0 a 20. Esto acredita práctica gratuita, no torneo financiado.
- Caja pausada y cero pagos/devoluciones/retiros creados. El dominio compartido
  permanece asignado a otro despliegue; recibió una actualización concurrente
  de `dpl_3VxaPf5t4yAGb2TRX28GjgJpJXFH` a
  `dpl_97VBvufgcoKozhAKLytz7Hjjs7SW`, que se preservó.

[Evidencia del despliegue](RM12-DESPLIEGUE-DEV-EVIDENCE.json). Los 16 artefactos
locales se congelaron con hashes en un checkpoint independiente; no contiene
credenciales ni el enlace temporal de acceso.

## Pendientes para el ensayo financiero

MFA de operadores y suplente, correos operativos, revisión de remitente/credencial
Resend, recuperación completa, lectura de objetos por operador AAL2, recepción humana,
callback HTTPS entregado por Flow y ciclo completo inscripción/premio/retiro/
devolución. Definir monto máximo en CLP y pagador antes de cualquier cobro.
La caja permanece pausada y no se ejecutaron cobros, devoluciones ni transferencias.
