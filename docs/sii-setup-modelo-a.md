# Configuración tributaria previa al primer cobro real

Esta lista operacional complementa la política de
[`contabilidad-producto.md`](./contabilidad-producto.md). No sustituye las
instrucciones vigentes del SII, Flow ni la revisión del contador.

## 1. Decisión de emisión

La implementación presupone que el voucher emitido por el pago electrónico es
la boleta de la venta completa. Antes del lanzamiento:

- Declarar ante el SII el modelo de emisión de boletas mediante voucher que
  corresponda a la empresa.
- Activar en Flow la modalidad tributaria consistente con esa declaración.
- No emitir una segunda boleta propia por el mismo cobro.
- Hacer un cobro controlado de $1.000 y verificar que aparezca una sola vez en
  Flow y en el Registro de Ventas.

Guía oficial: [SII — Boleta electrónica y voucher](https://www.sii.cl/destacados/boleta_electronica_voucher/index.html).

## 2. Prueba tributaria de aceptación

Con un cobro final de $1.000, verificar:

- Voucher por $1.000.
- Venta neta interna de $840,34 e IVA débito de $159,66.
- Un solo documento en el Registro de Ventas.
- Coincidencia entre `flow_order`, `commerce_order`, voucher y asiento contable.
- Conciliación administrativa sin diferencias.

Después, completar una devolución controlada y comprobar:

- devolución acreditada por Flow;
- Nota de Crédito Electrónica emitida por el mecanismo acordado;
- folio y fecha registrados en `/admin/refunds`;
- rebaja del IVA en el período de la nota de crédito, sin duplicidad documental.

## 3. Cierre mensual

- Conciliar vouchers Flow con ventas e IVA del panel.
- Revisar líneas/códigos vigentes del F29 con el contador; las instrucciones
  oficiales identifican los campos de vouchers y su IVA incluido.
- Conciliar facturas Flow y otros documentos de compra con el RCV antes de usar
  créditos fiscales.
- Resolver reembolsos sin N/C y asientos desbalanceados antes de declarar.
- Guardar el paquete del período: CSV contable, journal, vouchers, N/C, facturas,
  cartola bancaria y comprobantes de premios.

Referencia: [instrucciones oficiales del F29](https://www.sii.cl/servicios_online/instrucciones_f29_20241112.pdf).

## 4. Revisión profesional requerida

Solicitar al contador confirmación escrita de:

- giro y calidad afecta de la actividad;
- modelo exacto de emisión elegido en SII/Flow;
- códigos del F29 aplicables al período;
- régimen de renta y respaldo deducible de premios;
- tratamiento de premios para ganadores y eventuales obligaciones informativas.

No existe en el producto un "Modelo B" activable por configuración. Tratar sólo
la comisión como venta requeriría que un tercero distinto fuese realmente el
organizador/vendedor y que existiera mandato, contratos, documentos y flujos de
pago coherentes. Ese no es el negocio implementado.
