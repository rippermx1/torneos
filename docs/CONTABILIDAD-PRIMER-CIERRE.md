# CONT-11 — expediente del primer cierre

Preparado el 5 de octubre de 2026. El propietario confirmó **sin movimientos reales**.
Período propuesto: **septiembre de 2026**, último mes terminado. No se aprobó un
cierre ni se registraron gastos, aportes, cobros o comprobantes ficticios de la empresa.

El expediente está en `artifacts/accounting/primer-cierre-2026-09/pre-cierre.json`.
Los datos faltantes conservan `null`; no se sustituyen por saldos cero del ambiente
de desarrollo. `reviewed=false` y `closed=false` mantienen explícita la revisión pendiente.

## Estado documental

| Dato | Estado |
|---|---|
| Actividad real | Sin movimientos, según declaración del propietario |
| Período | Septiembre 2026 propuesto; pendiente confirmación |
| Razón social/RUT | Extraídos del certificado aportado, emitido el 30-01-2026; vigencia posterior no verificada |
| Responsable de revisión y contador | Pendientes; no se asignan por aparecer como representante en el estatuto |
| Banco inicial/final y respaldo | Pendientes de revisión externa |
| Flow pendiente y respaldo | Pendientes de revisión externa o constancia documentada de ausencia |
| Revisión RCV y N/C | Pendiente o constancia documentada de ausencia |
| Revisión del contador | Pendiente |
| Cierre congelado aprobado | No generado |

## Identidad de empresa aportada

El propietario aportó el certificado de estatuto actualizado, CVE `CRnB8RwnqrHi`,
emitido el 30 de enero de 2026. Se extrajeron y cotejaron visualmente razón social,
RUT, constitución, domicilio comunal y representante designado. La ficha y trazabilidad
quedan en `artifacts/accounting/company-document-review/company-profile.json`,
fuera del repositorio y del despliegue. El PDF original permanece intacto.

La identidad se incorporó al pre-cierre local. El documento identifica el estatuto
a su fecha de emisión; no se verificaron su firma electrónica, cambios posteriores
ni la situación actual en SII. El representante designado no se asigna automáticamente
como revisor del cierre.

El estatuto declara capital de $1.000.000, enterado $0 y pendiente $1.000.000 a esa
fecha. Esos importes se conservan en la ficha documental: no se crearon asientos
ni se usaron como saldos bancarios. Banco, Flow, RCV y aprobación siguen pendientes.

## Datos de desarrollo verificados

La consulta de septiembre en `torneos-dev` conserva seis asientos, doce líneas,
tres documentos y tres movimientos bancarios del ensayo `PRUEBA-CONTABLE-227a1cad`.
El aporte, la factura y el pago tienen sus reversas; resultado, Banco y Flow
terminan en cero. No hay cierre activo; la versión del ensayo permanece reabierta.
Los cuatro controles automáticos están en cero.

Ese saldo cero resulta del ensayo y sus reversas. Los documentos sintéticos
no se incorporan al expediente real ni se borran para aparentar un libro vacío.
La información de la empresa procede de sus fuentes y de la revisión del responsable.

## Completar el expediente

1. Confirmar período, vigencia de la identidad aportada y responsable de la revisión. El módulo solo
   admite cerrar meses terminados; octubre aún está abierto.
2. Incorporar la cartola y los saldos externos de apertura/cierre, el pendiente
   Flow y la revisión RCV/N/C. Si no existe actividad o una fuente no aplica,
   conservar una constancia identificable del responsable en lugar de inventar
   un documento. La declaración del chat queda conservada como antecedente.
3. Verificar que no existan gastos, aportes, deudas o saldos anteriores omitidos.
   Registrar únicamente documentos reales, conservando su referencia original.
4. En el entorno operativo elegido, comparar el libro con esos respaldos,
   conciliar todos los movimientos y resolver los controles automáticos.
5. El responsable revisa y aprueba desde `/admin/accounting`. Descargar después
   el paquete congelado y los CSV para el contador. Este paso todavía está pendiente.

La aprobación del módulo conserva responsable, versión, referencias y saldos;
no emite DTE ni presenta declaraciones. CONT-12 sigue pendiente como tarea separada.
La web de esta entrega ya está publicada con Supabase dev en
[Vercel dev](https://torneos-dev.vercel.app/admin/accounting), con sus controles
de publicación aprobados. La migración/publicación en producción comercial y
la aprobación del primer cierre real siguen pendientes.

## Evidencia de esta preparación

Lectura actual de Supabase dev: conteos, controles y referencias sintéticas
coinciden con el ensayo de CONT-10. El JSON del expediente se validó y conserva
los saldos externos desconocidos y la aprobación pendiente. No se ejecutaron
migraciones, escrituras contables, cierres, cambios de Flow ni despliegues.

[Backlog](CONTABILIDAD-BACKLOG.md) · [Activación dev](CONTABILIDAD-ACTIVACION-DESARROLLO.md).
