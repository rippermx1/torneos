# RM-12: preparación y despliegue en dev

2026-10-05. IN_PROGRESS. NO_GO para operar con dinero real.

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
Publicación HTTPS y prueba de aplicación: pendientes de registrar abajo.

## Pendientes para el ensayo financiero

MFA de operadores y suplente, correos operativos, revisión de remitente/credencial
Resend, recuperación completa, acceso real a objetos privados, recepción humana,
callback HTTPS entregado por Flow y ciclo completo inscripción/premio/retiro/
devolución. Definir monto máximo en CLP y pagador antes de cualquier cobro.
La caja permanece pausada y no se ejecutaron cobros, devoluciones ni transferencias.
