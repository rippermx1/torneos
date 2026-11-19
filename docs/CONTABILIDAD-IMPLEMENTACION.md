# Entrega contable — 2026-10-05

Backlog: [CONTABILIDAD-BACKLOG.md](CONTABILIDAD-BACKLOG.md).

## Comportamiento implementado

`/admin/accounting`, enlazado en la navegación y Finanzas, permite registrar gastos,
aportes, deudas/pagos a proveedores, ingresos adicionales, ajustes, liquidaciones y
facturas Flow. Los importes se ingresan en CLP y se almacenan en centavos enteros.
Proveedor/contraparte + tipo + referencia identifican el documento: repetirlo con el
mismo contenido es idempotente; cambiar su contenido rechaza la operación.

La cartola se importa como CSV, hasta 1000 filas por archivo, en una transacción:

```csv
fecha_iso,referencia,monto_clp,respaldo
2026-09-15T12:00:00-03:00,ABONO-001,10000,cartola-septiembre-p1
2026-09-16T12:00:00-03:00,CARGO-001,-1190,cartola-septiembre-p2
```

El matching exige igualdad exacta de monto firmado y mes Chile entre movimiento y
uno o varios asientos de Banco. Un asiento no puede conciliarse con dos movimientos.
Deshacer una conciliación requiere motivo. Factura a crédito y pago son eventos
distintos; liquidación Flow y su comisión son documentos distintos.

Las facturas Flow verificadas reemplazan provisiones específicas mediante reversas
marcadas como estimadas y un nuevo asiento confirmado. Reversar una factura restaura
las provisiones originales para que no desaparezca un costo pendiente. El IVA
recuperable exige verificación documental explícita; una provisión no valida RCV.

`/admin/reports` conserva las fuentes operativas para cobros/IVA, con orden determinista,
y usa el journal para ingreso reconocido y contribución de torneos. El F29 interno de ese reporte corresponde a inscripciones; otros ingresos y su IVA se revisan en las cuentas de la empresa para preparar la declaración externa. `/admin/accounting`
obtiene saldos, resultado completo y documentos de un paquete consistente. Las lecturas
operativas del reporte anterior son de gestión y no constituyen un paquete congelado.
`analyze:business` ahora consulta el mismo paquete por `BUSINESS_REPORT_PERIOD=AAAA-MM`.

El diario se exporta completo desde un único JSON SQL, sin el máximo de filas REST.
Sus totales se derivan de las mismas líneas. Encabezados HTTP indican conteo, Debe y
Haber. CSV conserva centavos decimales y neutraliza fórmulas de texto. El IVA mensual suma el redondeo de cada documento, como el journal; no redondea otra vez el bruto agregado.

El balance nuevo muestra saldo inicial, movimiento y final según naturaleza de cuenta;
el del reporte anterior sigue siendo un balance de **movimientos del mes**. El resultado
de empresa incluye otros ingresos y gastos generales, además de torneos y provisiones.

## Cierre y seguridad

La migración `20261005181131_accounting_operations_and_controlled_close.sql` prepara
tablas con RLS y acceso de lectura exclusivo de servicio, funciones privilegiadas
privadas y wrappers públicos invoker. Las APIs y el layout administrativo requieren MFA;
el actor de cada escritura procede de la sesión, y SQL vuelve a comprobar su rol.
Documentos y bitácora son inmutables; las correcciones generan reversas.

Un lock de transacción compartido en el journal y exclusivo en operaciones/paquetes
evita congelar medios asientos concurrentes. El cierre bloquea escrituras en ese mes,
incluidas conciliaciones y cargas de banco. Requiere meses anteriores cerrados,
asientos completos/balanceados, todas las referencias bancarias enlazadas, provisiones
resueltas, N/C verificadas y saldos externos iguales al libro. Mes vigente no se cierra.

Cada cierre conserva JSON completo (incluidos asientos con metadatos y referencias
originales), revisión, actor, fecha, versión y huella MD5 para
comprobar identidad del paquete; **no es firma digital**. Reabrir exige motivo y orden
inverso de cierres posteriores. La versión anterior permanece descargable e inmutable.
La bitácora propia se incluye completa en el paquete; la pantalla muestra las últimas 100.

**Consecuencia operativa:** un webhook que intente crear un asiento nuevo en un mes
cerrado debe resolverse mediante reapertura controlada; no se cambia su fecha para
eludir el cierre. Reintentos de eventos ya asentados siguen siendo idempotentes.

## Activación y límites

Las nuevas páginas y los reportes requieren sus RPC; no hay fallback silencioso a datos
parciales. La migración se aplicó el 5 de octubre en Supabase `torneos-dev`; la
integración usa una candidata web local independiente en el puerto 3085.
Estado y evidencia: [activación de desarrollo](CONTABILIDAD-ACTIVACION-DESARROLLO.md).
Producción, Flow y los despliegues Vercel existentes no se modificaron.

Respaldos: referencias a documentos originales conservados por la empresa; el módulo
no emite ni autentica DTE, no importa RCV/cartolas automáticamente y no verifica su
integridad con el banco/SII. El responsable realiza esa revisión antes de aprobar.
No incluye nómina, depreciación automática, inventario ni declaración tributaria.
Es un registro contable administrativo para este negocio, con exportación al contador.

## Validación

Publicación del módulo en [Vercel dev](https://torneos-dev.vercel.app/admin/accounting)
completada: [paquete, despliegue y controles HTTP](CONTABILIDAD-PUBLICACION-DESARROLLO.md).
La versión publicada pasó 38 pruebas en ocho archivos, tipos, ESLint y build local/remoto;
nueve controles HTTP en la candidata y nueve en el dominio final, con Auth/TOTP reales.
El ensayo de documentos sigue siendo sintético; no acredita un cierre empresarial real.

- **27 pruebas / 8 archivos PASS:** reportes, cálculo exacto de importes, CSV completo,
  devengo entre meses, simulaciones, presets, autorización de API (MFA simulado)
  y origen público distinto del hostname interno de standalone.
- **SQL PASS:** diez grupos de escenarios en PostgreSQL/PGlite aislado, aplicando
  las migraciones reales sobre un esquema simplificado de Auth/operación. Incluye
  deuda/pago, ingresos adicionales, atomicidad, duplicados, verificación IVA,
  matching agrupado, facturas/reversas, N/C, saldos acumulados, permisos y cierres.
- **Tipos y ESLint PASS** en los archivos de la entrega.
- **Next 16 producción PASS:** build aislado `.next/accounting-20261005`, con las
  páginas y APIs nuevas. El build agregó sus rutas de tipos a `tsconfig.json`.
- **Revisión visual PASS** del componente React y CSS de producción con datos
  sintéticos, escritorio y viewport 390×844; desborde del selector CSV corregido.
  Capturas en `artifacts/accounting/ui-desktop.png` y `ui-mobile.png`.
- **Integración dev PASS:** migración aplicada en `torneos-dev`, web standalone
  local 3085, ocho controles con Supabase Auth/TOTP AAL2/PostgREST reales. Incluye
  solicitudes concurrentes duplicadas, proveedor/pago, cartola, exportaciones,
  cierre/reapertura/reversas y snapshot anterior conservado. Datos sintéticos.
- **NOT_RUN:** intercalados arbitrarios de webhooks/cierres entre conexiones,
  conciliación con documentos reales, aceptación del contador y publicación Vercel dev.

Los ensayos SQL aislados, de API simulada y visuales se distinguen del recorrido
dev con Auth/MFA real documentado arriba. La vista
estática puede reproducirse con `node scripts/preview-accounting-ui.mjs`; sus
formularios no están conectados. Evidencia consolidada: [CONTABILIDAD-EVIDENCIA.json](CONTABILIDAD-EVIDENCIA.json).

Reproducir SQL (runtime ya disponible localmente): `node scripts/verify-accounting-sql.mjs`.
Se puede indicar `ACCOUNTING_PGLITE_PATH` si cambia la ruta del runtime. El script no
usa credenciales ni modifica servicios externos. Evidencia: `artifacts/accounting/sql-evidence.json`.
