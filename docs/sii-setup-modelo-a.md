# Configuración SII — Modelo A (interim de lanzamiento)

Este documento describe los pasos manuales que el operador del SpA debe
ejecutar fuera del código para que la plataforma cumpla con la normativa
SII bajo el régimen "Modelo A" (voucher Flow como boleta electrónica).

> **Estado del código:** la constante `TAX_REGIME` en
> [`lib/tax/regime.ts`](../lib/tax/regime.ts) está fija en `'A'`. El
> webhook Flow no encola documentos en `dte_documents` mientras esté en
> Modelo A; toda la maquinaria DB ya está lista para el día que migremos
> a Modelo B (LibreDTE).

---

## 1. Precondiciones empresariales

- [x] SpA constituido y RUT activo
- [x] Inicio de actividades en SII para giros relevantes
  - "Otros servicios de información n.c.p." (código 631990) o
  - "Servicios de entretenimiento n.c.p." (código 932909)
- [x] Cuenta corriente bancaria empresa
- [ ] **Confirmar afecto a IVA** (1ª categoría) en F4415

## 2. Configuración Flow.cl como emisor de vouchers DTE

Flow ofrece "voucher con valor tributario" — un documento electrónico
emitido por Flow al momento del cobro que el SII reconoce como boleta
de venta del comercio.

### Pasos en el panel Flow
1. Ingresar a https://www.flow.cl/app/web/login.php
2. Configuración → Facturación / Documentos tributarios
3. Activar "**Emitir documentos tributarios electrónicos**"
4. Llenar:
   - Razón social del SpA
   - RUT empresa
   - Giro (mismo que SII)
   - Dirección comercial
5. Subir certificado digital de la empresa **(opcional en Modelo A;
   requerido sólo si se quiere control directo del CAF; Flow puede
   emitir bajo su propio convenio)**
6. Confirmar la activación. Flow valida con SII en 1–3 días hábiles.

### Pasos en Mi SII
1. Ingresar a https://misiicl.sii.cl con RUT empresa
2. Servicios online → Boleta electrónica → Configurar postulación
3. Indicar:
   - **Tipo de emisor:** "Emisor a través de tercero (Flow)"
   - **Folio inicial:** según asignación SII
4. SII enviará validación y confirmará postulación.

### Verificación
- Realizar un cobro de prueba ($1.000 a tu propio RUT)
- Confirmar que en el panel Flow aparece el folio del voucher
- Confirmar en Mi SII → Consultar boletas electrónicas que el folio
  aparezca registrado a nombre del SpA

## 3. Régimen tributario mensual (F29)

En Modelo A la totalidad del monto cobrado por Flow es venta gravada.

### Mensualmente:
1. **Descargar libro de ventas** desde el panel Flow
   (todos los vouchers emitidos en el mes)
2. **Conciliar** con `/api/admin/reports/accounting.csv` y
   `flow_payment_attempts` filtrando `status='paid'` y agrupado por mes
   calendario según `settled_at`
3. **F29 línea 110** (ventas afectas):
   - Bruto: `f29_venta_afecta_bruta_clp`
   - Base: `f29_base_neta_clp`
   - IVA débito: `f29_iva_debito_clp`
4. **F29 línea 521** (IVA crédito): IVA pagado en facturas de gastos
   (Flow fees facturados a la empresa, hosting, etc.)
5. **IVA neto a pagar** = débito − crédito

### Reportes internos en la plataforma
- `/admin/reports` muestra el resumen mensual Modelo A y obligaciones de wallet.
- `/api/admin/reports/accounting.csv` es el CSV principal para conciliación
  mensual. **En Modelo A**, los campos tributarios principales son
  `f29_venta_afecta_bruta_clp`, `f29_base_neta_clp` e
  `f29_iva_debito_clp`.
- `/api/admin/reports/finance.csv` queda como reporte interno de comisión de
  plataforma y será fiscalmente más relevante si se migra a Modelo B.

## 4. Renta (F22 anual)

- Ingresos brutos = `SUM(net_amount_cents)` del año (sin IVA)
- Costos deducibles:
  - Pago de premios (transferencias a ganadores)
  - Comisiones Flow facturadas
  - Hosting, gastos operativos con factura
- Régimen tributario sugerido: **Pro-Pyme General (14 D Nº3)** mientras
  facturación anual < UF 75.000.

## 5. Trigger de migración a Modelo B

Migrar a Modelo B (LibreDTE + custodia) cuando se cumplan ambos:

- [ ] **Volumen sostenido > $1.500.000 CLP/mes** de inscripciones
  (3 meses consecutivos validados)
- [ ] **Ahorro proyectado de IVA > $260.000/mes**

Pasos para migrar (referencia, no ejecutar todavía):

1. Tramitar **certificado digital empresa** (e-certchile o
   Chilefirmas, ~$12.000 CLP/año)
2. Provisionar VPS (~$8 USD/mes, e.g. DigitalOcean)
3. Instalar LibreDTE self-hosted
4. Certificar instalación con SII (proceso de set de pruebas, ~2 sem)
5. Cambiar `TAX_REGIME = 'B'` en [`lib/tax/regime.ts`](../lib/tax/regime.ts)
6. Implementar cliente LibreDTE en `lib/dte/libredte-client.ts`
7. Implementar cron en `app/api/cron/dte-emit/route.ts`
   que procese `dte_documents.status='pending'`
8. Reescribir T&C para reflejar custodia (mandato civil)
9. Notificar a SII el cambio de régimen tributario (modificación de
   F4415 si aplica)

## 6. Riesgos de operar en Modelo A

- **Tributariamente "caro"**: pagas IVA sobre el bruto del cobro,
  no sólo sobre tu margen. Aceptable mientras volumen sea bajo.
- **Cambio de régimen requiere coordinación con SII**: no es trivial
  cambiar de "voucher como boleta" a "boleta propia LibreDTE" sin
  rectificatorias del período de transición. Planear el switch para
  el inicio de un mes calendario.
- **Pérdida de IVA crédito por premios**: en Modelo A los premios
  pagados no son IVA crédito (son gastos de marketing/promoción
  según interpretación). En Modelo B serían passthrough sin IVA.

## 7. Checklist final pre-launch

- [ ] Flow panel: voucher con valor tributario activado y validado
- [ ] Mi SII: postulación a "emisor por tercero" aprobada
- [ ] Cobro de prueba: voucher emitido y registrado
- [ ] Calendario mensual: reminder día 10 para F29
- [ ] Cuenta operativa empresa con saldo para pagar premios
- [ ] Política de reembolso revisada (`/legal/reembolso`)
- [ ] T&C versión actual aceptada (`/legal/terminos`)
