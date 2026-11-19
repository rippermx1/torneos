# RM-14: cuentas, datos y atención

Implementación en desarrollo, 7 de octubre de 2026. **RM-14 IN_PROGRESS; NO_GO**
para dinero real. El alcance técnico del ensayo se identifica en la evidencia;
no constituye aceptación legal, de los operadores ni de una eliminación real.

## Implementado

- Sesiones comprobadas contra Auth y `auth.sessions`, sin permisos de respaldo
  cuando falla la lectura de roles. Revocación de todos los dispositivos y
  bloqueo de tokens anteriores en las API y tablas personales de Data API.
- Recuperación por correo con prueba `otp` verificada y reciente (10 minutos),
  contraseña de 12 a 128 caracteres en el flujo web y revocación posterior.
  GoTrue registra recuperación y otras verificaciones por correo como `otp`;
  una sesión de contraseña o TOTP sola no habilita este endpoint. Esto no cambia
  ni certifica la política global de contraseñas del proveedor Auth.
- Cuenta suspendida: acciones de juego/comerciales bloqueadas; historial,
  soporte y solicitudes de datos disponibles. Escrituras directas de tablas
  personales y Storage requieren cuenta activa y sesión vigente.
- Documentos KYC y comprobantes con lectura privada, auditoría previa y enlaces
  de 60 segundos. El listado administrativo ya no firma documentos al renderizar.
  Las URLs firmadas siguen utilizables durante esos 60 segundos aunque la sesión
  sea revocada después de emitirse; no equivalen a un permiso permanente.
- `/support`: historial paginado, consulta/disputa/incidente con referencia,
  acuse y respuesta. Operador con MFA e independencia respecto del titular.
  El INSERT de soporte del servidor anterior mantiene compatibilidad mediante
  un trigger de auditoría; el INSERT del navegador está revocado.
- Solicitudes de acceso/eliminación, estados, respuesta fundamentada y auditoría
  transaccional. Una solicitud abierta por titular y tipo evita duplicación.
  Respuesta de acceso completa adjunta y revisada en bucket privado, máximo 4 MB.
  Descarga propia auditada con URL temporal; exportación inmediata separada de
  perfil/historial comercial, cuyo alcance parcial se declara en el archivo.
- La eliminación no puede marcarse completada: faltan política de retención,
  excepciones aprobadas y evidencia de borrado de archivos/copias. El circuito
  recibe y atiende solicitudes; **el motor de borrado definitivo no está cerrado**.
- Colas de soporte/datos y chequeo crítico de incidentes o pagos sin acuse en
  RM-09. Un acuse registra atención; no certifica una transferencia o una solución.
- Identidad comercial desde las variables autorizadas de Vercel; privacidad de
  desarrollo sin prometer seis años indiscriminados ni un plazo sin operador.
  Bases versionadas y condiciones comerciales anteriores conservadas.

## Validación y límites

Ensayo local con Auth/PostgREST/Storage reales en el clon aislado de develop,
usuarios y documentos sintéticos. Se probaron propiedad y MFA, rechazo de lectura
directa, acuse/resolución, duplicados, respuesta privada, suspensión, revocación,
recuperación/replay, verificación de email y expiración. Ledger intacto y caja
pausada. El catálogo de permisos de RPC del clon se alineó con develop antes del
ensayo: los grants por defecto del runtime local eran más amplios. Ese ajuste
local **no certifica recuperación completa de ACL de RM-13**; permanece como
dependencia de su ensayo de recuperación.

La candidata se publica sólo en el alias RM del proyecto `torneos-dev`. El alias
compartido de juegos conserva su despliegue; el código RM-14 no se ha fusionado
en esa candidata. La migración sí reside en la base compartida develop: integrar
la candidata de juegos y verificar su panel operativo sigue pendiente antes de
una publicación común. No se sobrescribieron fuentes ni assets del trabajo paralelo.

La evidencia registra tipos, lint, suite, build remoto, fuente subida, HTTP y
navegador. Igualdad de binarios compilados Windows/Linux: NOT_RUN. OAuth Google
se conserva configurado, con aceptación previa del propietario; este incremento
no repite el login humano Google ni afirma una nueva aceptación.

Candidata `aaa39d406205a949e4715aec113cccc393e4f315`, despliegue
`dpl_9CVRtFhTEDUtqfGdgR5LPPDyWAPY`, 304 archivos publicados y verificados.
3.853 pruebas en 86 archivos; 18 comprobaciones locales, escalamiento crítico
SQL transaccional adicional, 36 checks HTTPS de RM-14 y 17 de operación PASS.
Se retiraron cuatro cuentas locales y tres cloud, sus dos archivos por ensayo
y sus registros sintéticos. Las seis cuentas develop originales, tres sesiones,
ledger, caja pausada y diez jobs quedaron conservados. Watchdog con procesamiento
sano y `operationalReady=false`, acorde a proveedores bloqueados. Captura del
formulario real con cuenta sintética en `artifacts/rm14/browser-local-support.png`.

## Pendiente para cerrar RM-14

1. Protección de contraseñas filtradas **omitida por decisión expresa del
   propietario**. El advisor sigue WARN; no se reporta resuelta.
2. Matriz legal de finalidad/retención por categoría, base de cada excepción,
   custodia y eliminación de archivos/copias. Implementar y ensayar el borrado
   autorizado una vez definido ese contrato, preservando obligaciones vigentes.
3. Revisión legal de identidad, términos/base, costos, devolución, plazo de pago,
   revisión/apelación y privacidad para la fecha de lanzamiento. La Ley 21.719
   entra en vigencia el **1 de diciembre de 2026**; no se asume vigente en este
   ensayo de octubre. Fuentes primarias: [BCN Ley 21.719](https://www.bcn.cl/leychile/Navegar?idNorma=1209272&idParte=10527471&idVersion=2026-12-01)
   y [BCN Ley 19.628](https://www.bcn.cl/leychile/Navegar?dt=open&idLey=19628).
4. Titular y suplente reales, recepción del canal y aceptación humana de consulta,
   disputa e incidente, incluyendo el plazo comercial existente de tres días
   hábiles. Los operadores del ensayo son cuentas sintéticas y no cubren ese punto.
5. Integración con la candidata compartida y dependencias RM-12/RM-13 todavía
   abiertas. Monto/pagador y autorización concreta antes de cualquier cobro Flow.

Se mantiene `STAGING_PHASE=configuration`, caja pausada, Flow/Resend bloqueados y
correos operativos omitidos por instrucción del propietario. No se cobró, devolvió
ni transfirió dinero. [Evidencia](RM14-CUENTAS-DATOS-Y-ATENCION-EVIDENCE.json).

Al cierre, Docker Desktop dejó de responder. El PID del runtime propio ya no
existe y los puertos propios 23431/23421 están cerrados; la parada individual de
contenedores quedó NOT_VERIFIED. Las fixtures se eliminaron antes y no se reinició
Docker compartido ni se eliminaron volúmenes. El despliegue cloud sigue verificado.
