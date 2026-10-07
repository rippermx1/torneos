# RM-13: recuperación, backlog, reinicios y carga

Fecha: 2026-10-07. Alcance: develop y clon local aislado de Supabase develop.
**Implementación técnica verificada; aceptación operativa RM-13 IN_PROGRESS;
dinero real NO_GO.** No se realizaron cobros, devoluciones ni correos externos.

## Cambios

Los workers comparten un presupuesto de 35 segundos para iniciar unidades de
trabajo, dejando margen para la petición Flow de hasta 8 segundos, persistencia
y heartbeat en funciones configuradas para 60 segundos. Ceden entre unidades
durables; una operación externa incierta conserva su nonce y no se reenvía.
La cancelación manual usa el mismo presupuesto. Este margen no constituye una
garantía frente a demoras arbitrarias de DB o una única finalización muy grande.

Los torneos se seleccionan sólo cuando necesitan transición. La marca persistente
`last_transition_checked_at` se guarda antes de procesar y rota los lotes de 25
tras errores o reinicios. El barrido de cancelados registra obligaciones y deja
el envío al worker de devoluciones, evitando anidar múltiples lotes de proveedores.
Se informa trabajo intentado, diferido y obligaciones aseguradas sin confundirlas
con devoluciones pagadas.

Se añadieron herramientas para exportar esquema/grants, datos de aplicación,
Auth y metadatos Storage, y exportar/importar los bytes privados por Storage API.
Los respaldos usan AES-256-GCM, etiquetas autenticadas y SHA256. La restauración
general exige un destino propio vacío, verifica cada proyección COPY y conserva
IDs/propietarios de objetos mientras reconstruye sus versiones del backend.
La exportación detecta cambios del inventario de objetos; aún requiere una ventana
sin escrituras/DDL para coordinar DB y Storage. Las pruebas de corrupción,
truncamiento, clave y etiqueta incorrectas rechazan los respaldos alterados.

## Evidencia ejecutada

| Ensayo | Resultado y alcance |
| --- | --- |
| Copia real de Supabase develop | 92 proyecciones COPY iguales; 6 usuarios, 6 identidades, 3 sesiones, 1 factor MFA, 71 migraciones del snapshot; PG 17.11. Sin modificar el origen durante el respaldo. |
| Auth tras pérdida de datos y reinicio | Contraseña de cuenta de ensayo restaurada y MFA TOTP sintético válidos mediante GoTrue real. Nuevas claves locales: se prueba reautenticación, no continuidad de sesiones firmadas antiguas. |
| Storage tras pérdida de archivos | SHA256 y controles de acceso de 3 archivos sintéticos privados correctos; anónimo y usuario ajeno denegados. Recuperación observada de datos/servicios y MFA: 35.019 ms. |
| Importación portable por Storage API | 10 archivos sintéticos, 664 bytes; bytes, IDs y propietarios conservados y lectura anónima denegada. Develop tenía 0 objetos: no se afirma recuperación de documentos personales reales. |
| Backlog superior a un lote | 61 pagos y 61 devoluciones simulados; 58 torneos vencidos, 25 controles aún no vencidos, caída simulada de 25 horas. 25 torneos posteriores avanzaron pese a 25 fallos inyectados. Sin devoluciones duplicadas; controles intactos. |
| Flow lento simulado | Timeout real del cliente de 8 s; primera corrida duró 40.158 ms, procesó 5 unidades y difirió 45. Pendientes drenados tras reiniciar la aplicación. |
| Recuperación financiera completa | Base local vaciada y restaurada; 96 tablas comparadas por contenido. 61 obligaciones y 15 resultados recuperados; dispatch incierto pasó a unknown, no pudo reclamarse, recibió la respuesta original con su nonce y se concilió. Ledger intacto. Recuperación y conciliación observadas: 21.805 ms. |
| 15 jugadores concurrentes | 240 peticiones HTTP, 15 resultados únicos; snapshots recuperados después de perder una respuesta y reiniciar, sin repetir una dirección incierta. |

El p95 de movimientos fue **2.724,17 ms** en loopback (105 muestras) y
**2.562,67 ms** con 600 ms de RTT inyectado (90 muestras). Se midió Next en modo
desarrollo y Supabase local, con calentamiento/compilación y reinicios. Las
cohortes no permiten deducir una mejora con peor red ni capacidad de Vercel.
**Por decisión del propietario, se mide sin aprobar un SLO.** No se midieron FPS
móviles, pérdida/jitter de WAN real ni capacidad/cold starts productivos.

Suite final: **3.838 pruebas / 84 archivos PASS**, tipos y lint PASS. La evidencia
adjunta identifica la candidata, el build remoto y las comprobaciones HTTPS.
La candidata `e2174d8e43816ca553763fcb78d1894a9d48ebb6` está READY en
`https://rm12-torneos-dev.vercel.app`, proyecto Vercel torneos-dev, despliegue
`dpl_HEaQhWirx1SvgqWiGCVFpa2qn2Sy`. Se verificaron hashes de los 288 archivos
subidos, 33 checks de páginas/práctica/sesiones/Storage, 17 checks operativos y
los cuatro workers por HTTPS. Tres procesadores devolvieron 200; watchdog/monitor
conservan 503 con procesamiento sano y preparación financiera bloqueada. Simulador
hospedado devuelve 404, proveedores bloqueados y dominio compartido preservado.
La compilación remota pasó; no se afirma igualdad de bytes compilados con Windows.
La migración `20261007152409_rm13_recovery_fairness.sql` se aplicó sólo a develop
con versión cloud `20261007162953`; SHA256 de SQL canónico coincide. Diez jobs
existentes conservados, caja pausada y pagos/devoluciones de develop en cero.

## Reproducción y recuperación

Ejecutar desde el checkout RM, con dependencias del lockfile y Docker Desktop.
Los scripts fijan el origen develop `jnoyjewsqbooqaiighcs` y el destino local
`torneos-rm13-recovery`. No usar estas herramientas para restaurar sobre develop
compartido ni producción. Los ensayos de pérdida de datos vacían **todo el clon**.

1. Crear sólo si no existe la red propia:
   `docker network create --opt com.docker.network.bridge.host_binding_ipv4=127.0.0.1 torneos-rm13-recovery`.
   Ejecutar `node scripts/rm13-local-stack.mjs` para generar config sin migraciones
   ni seeds automáticos. Iniciar con CLI fijado, `--workdir artifacts/rm13/stack`,
   excluyendo realtime, studio, postgres-meta, logflare, vector, edge-runtime,
   supavisor e imgproxy. Guardar toda salida de inicio en el directorio privado.
   Usar la imagen PG 17.11 (`public.ecr.aws/supabase/postgres:17.11.0.002`)
   compatible con el origen y verificar `show server_version` antes de restaurar;
   una imagen CLI antigua no reproduce este ensayo. No actualizar el stack compartido.
2. Antes de importar datos, ejecutar `node scripts/rm13-bind-loopback.mjs`.
   Docker Desktop no respetó el binding por defecto; este helper conserva mounts
   y reconstruye únicamente los contenedores propios con binding explícito.
   Comprobar API 23421, DB 23422, mail 23424 en 127.0.0.1, sin conexiones externas.
3. Respaldo de origen sólo lectura:
   `node scripts/rm13-backup-cloud.mjs --confirm-develop-backup`.
   Requiere sesión CLI Supabase autorizada y variables dev en
   `C:/torneos/.env.cloud-development.local`. Exporta también bytes Storage.
   Conservar el manifiesto y directorio cifrado de esa ejecución juntos.
4. Destino vacío: `node scripts/rm13-restore-cloud.mjs --confirm-owned-empty-target`.
   `--verify-restored-target` compara un destino ya restaurado antes de introducir
   fixtures o permitir escrituras. Los cron externos no se restauran activos;
   el runtime y firmas locales se reconstruyen sin secretos Flow/Resend reales.
5. Ejecutar `node scripts/rm13-auth-storage-rehearsal.mjs` y
   `node scripts/rm13-storage-import-rehearsal.mjs` secuencialmente. La primera
   requiere las cuentas de ensayo en `C:/torneos/.env.cloud-test-users.local`.
6. Iniciar `node scripts/rm13-runtime.mjs` con salida privada. Ejecutar
   `node scripts/rm13-backlog-load.mjs`, luego
   `node scripts/rm13-financial-recovery.mjs`, siempre secuencialmente.
   `--resume` reutiliza exclusivamente las fixtures propias; `--load-only` repite
   carga sin afirmar haber repetido backlog. Después detener sólo runtime/stack RM-13.

Mantener `artifacts/rm13/private` y `.env.rm13-local` fuera de Git con ACL Windows
del propietario. No imprimir dumps Auth, logs crudos, archivos de gateway ni
variables. Los dumps temporales del exportador se borran tras cifrar; los demás
diagnósticos privados pueden contener datos o claves locales. La clave del
ensayo está en la misma máquina: aún no se acredita custodia independiente.

Tras un desastre real, mantener caja/envíos pausados; reconstruir configuración
Auth/SMTP/OAuth/Vault por un canal de secretos, revocar/reemitir sesiones según
las nuevas claves y verificar acceso privado. Conciliar operaciones reconocidas
por el proveedor mediante registros originales, conservar dispatch unknown y
resolver diferencias con operador/revisor **antes** de reactivar envíos. Un restore
de DB no revierte una operación ya ejecutada en Flow o banco.

## Aceptación aún pendiente

- Respaldo periódico fuera de la máquina, retención, restauración con claves
  custodiadas por separado y medición de RPO efectivo. Objetivo de diseño de
  15 minutos no certificado; no se creó un servicio de backup periódico.
- RTO cloud de infraestructura/configuración completa (objetivo de diseño 4 h),
  portabilidad del MFA humano original, OAuth/SMTP/Vault y ensayo con titular y
  suplente. Los tiempos locales de un dataset pequeño no aprueban esos objetivos.
- Conciliación real Flow/banco, aceptación de carga en infraestructura destino
  y eventual SLO acordado. Monto/pagador y autorización siguen siendo requisitos
  previos al ensayo de dinero real.
- RM-14: recuperación/revocación de cuentas, retención/eliminación y soporte;
  aceptación legal/financiera y demás gates de RM-12/RM-15 conservados.

[Evidencia](RM13-RECUPERACION-Y-CARGA-EVIDENCE.json).
