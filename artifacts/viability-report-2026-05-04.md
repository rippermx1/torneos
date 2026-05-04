# Informe de viabilidad de negocio - Torneos 2048

Fecha: 4 de mayo de 2026  
Alcance revisado: `http://localhost:3001/wallet`, `https://www.torneosplay.cl/`, codigo local, base Supabase configurada, documentos internos y fuentes externas actuales.

## Veredicto ejecutivo

El producto es **tecnicamente viable como MVP**, pero **todavia no es viable como negocio rentable en su estado actual**. La razon principal no es el margen unitario: los presets pagados pueden ser rentables si alcanzan el minimo de jugadores. El problema es que no hay evidencia actual de demanda pagada ni de recargas reales: la base muestra **$0 en pagos Flow pagados**, **9 intentos Flow no exitosos** y la billetera esta financiada por ajustes/promociones, no por caja real.

Recomendacion: **no escalar paid acquisition ni premios grandes todavia**. Pasar a una etapa de piloto controlado de 30 dias, con torneos de bajo premio, presupuesto promocional cerrado, KYC/manual revisado, conciliacion diaria y metas cuantitativas de conversion. Si no se validan depositos reales y recurrencia, el negocio debe pivotear antes de invertir en crecimiento.

## Producto observado

El sitio publico comunica una competencia de habilidad en 2048 con premios en CLP, llamadas a "Ver torneos", "Practicar gratis" y registro. El estado publico actual muestra **sin torneos activos**, lo que reduce conversion porque el usuario no ve una oportunidad inmediata para jugar.

La wallet local redirige a login si no hay sesion. Desde codigo, la pantalla de billetera muestra saldo disponible, saldo retirable, historial, boton de retiro y boton de recarga. El saldo retirable aparece como **solo premios** (`app/(user)/wallet/page.tsx:53-54`), lo cual es una decision antifraude correcta, pero debe quedar alineada con legal y soporte.

La recarga usa Flow por defecto y permite Mercado Pago como alternativa (`app/(user)/wallet/deposit/page.tsx:19-24`). Para Flow, el usuario ve neto a billetera, comision de procesamiento y total a pagar. El minimo de recarga es $1.000 CLP.

El retiro exige datos bancarios, minimo $5.000 CLP y descuenta el saldo al enviar la solicitud (`app/(user)/wallet/withdraw/page.tsx:13`, `:81`, `:200`). Operativamente esto reduce doble gasto, pero obliga a soporte/admin a resolver rapido los rechazos.

## Metricas reales actuales

Foto agregada de la base al 4 de mayo de 2026:

| Area | Resultado |
| --- | ---: |
| Perfiles | 24 |
| KYC aprobado | 16 |
| Terminos aceptados | 18 |
| Usuarios registrados en torneos | 14 |
| Torneos historicos | 10 |
| Torneos completados | 8 |
| Torneos cancelados | 2 |
| Inscripciones totales | 68 |
| Partidas completadas | 64 |
| Torneos activos | 0 |
| Intentos Flow pagados | 0 |
| Intentos Flow rechazados/expirados | 8 rechazados, 1 expirado |
| Retiros pendientes | 0 |
| Pasivo de billeteras | $116.840 |

Lectura: hay uso funcional y partidas completadas, pero **no hay traccion comercial validada**. Las inscripciones pagadas historicas suman **$32.000 CLP**, mientras los premios acreditados totales suman **$71.340 CLP**. El diferencial se explica por freerolls/promociones y ajustes.

## Rentabilidad unitaria

El modelo correcto es reconocer ingreso cuando el usuario consume saldo en una inscripcion, no cuando recarga. La formula interna calcula:

`utilidad minima = min_players * entry_fee - premios * 1,19 / neto_flow`

Con Flow a dia habil siguiente, el costo oficial revisado es 3,19% + IVA; el neto conservador usado por el codigo es 96,20%. Esto esta alineado con la pagina oficial de tarifas de Flow.

Presets actuales:

| Preset | Entrada | Premios | Minimo | Utilidad minima despues de IVA/Flow | Margen minimo |
| --- | ---: | ---: | ---: | ---: | ---: |
| Express | $1.000 | $9.500 | 14 | $2.248 | 16,1% |
| Estandar | $3.000 | $27.000 | 14 | $8.601 | 20,5% |
| Elite | $10.000 | $95.000 | 14 | $22.484 | 16,1% |
| Freeroll | $0 | $5.000 | 2 | -$6.185 contable | N/A |

Los torneos pagados completados historicos muestran una utilidad contable positiva pero baja:

| Grupo | Jugadores | Ingreso | Premios | Revenue requerido con IVA/Flow | Utilidad |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pagados completados | 32 | $32.000 | $23.040 | $28.501 | $3.499 |

Conclusion financiera: **el unit economics puede funcionar**, pero el volumen actual es insignificante. Con margen real de $2.248 a $8.601 por torneo minimo, se necesitan muchos torneos completados para cubrir infraestructura, soporte, KYC, contabilidad, disputas, marketing y riesgo legal. Con la demanda actual, no cubre ni una operacion minima.

## Viabilidad comercial

Fortalezas:

- Propuesta simple: juego conocido, habilidad, dinero real, bajo ticket.
- Flujo tecnico completo: auth, KYC, wallet, recarga, retiro, torneos, cron, refunds, finalizacion y leaderboard.
- Guardas de rentabilidad al crear torneos pagados.
- Retiro limitado a premios, lo que reduce arbitraje de comisiones y lavado basico.

Debilidades:

- No hay torneos activos en produccion; la landing queda sin "evento" que convierta.
- No hay pagos reales exitosos registrados; el checkout no esta probado comercialmente.
- El producto depende de liquidez: sin masa critica, los torneos no alcanzan minimo y se cancelan.
- 2048 solo puede saturarse rapido. Falta variedad, ligas, ranking persistente, temporadas o retos diarios.
- No hay evidencia de CAC, conversion deposito -> inscripcion, ni segunda inscripcion.
- La landing publica dice "Deposita con Mercado Pago", mientras la wallet local prioriza Flow. Eso genera inconsistencia comercial.

## Riesgo legal y compliance

Este punto es el principal riesgo de negocio. El producto se posiciona como competencia de habilidad, no azar. Sin embargo, al haber cuotas, premios monetarios, wallet, KYC y retiros, se parece operacionalmente a real-money gaming.

La SCJ indica que en Chile los juegos de azar son ilegales por regla general salvo autorizacion especial, y que mientras no exista legislacion especifica para juegos de azar en linea, su operacion es ilegal. Esto no prueba que una competencia de habilidad sea ilegal, pero si obliga a tener una opinion legal formal que sostenga:

- que 2048 esta determinado predominantemente por habilidad;
- que la plataforma no opera apuestas ni juegos de azar;
- que los premios no dependen de sorteo, probabilidad o matching manipulable;
- que KYC, mayoria de edad, residencia, impuestos, AML y datos personales estan cubiertos.

Riesgos internos detectados:

- Terminos dicen que los retiros son de "depositos + premios ganados", pero el codigo y wallet limitan a "solo premios". Hay que corregir legal o producto antes de operar.
- La politica dice "una solicitud de retiro pendiente a la vez", pero el endpoint no parece imponer esa restriccion.
- KYC actual es formulario/manual; para operar con dinero real debe robustecerse con verificacion documental, revision de titularidad bancaria y auditoria.

## Rentabilidad esperada

Escenario actual: no rentable. Hay pasivo de billeteras de $116.840, cero recargas pagadas y premios/acreditaciones financiadas por ajustes. Esto es normal para pruebas, pero no valida negocio.

Escenario piloto sano:

- 2 torneos Express diarios, minimo 14 jugadores: utilidad minima mensual aproximada $134.880.
- 1 torneo Estandar diario, minimo 14 jugadores: utilidad minima mensual aproximada $258.030.
- Total antes de costos fijos/soporte/marketing: $392.910 CLP/mes.

Ese escenario requiere 42 inscripciones pagadas diarias y aun asi deja poco margen si se suma soporte, promociones, fraudes, KYC y contabilidad. Con targets mas altos el margen mejora bastante, pero primero hay que demostrar liquidez.

## Decision

Estado actual: **no rentable y no listo para escala comercial**.  
Potencial: **viable como piloto controlado**, siempre que se trate como producto regulado/fintech-lite y no como simple juego web.

Go/No-go recomendado:

- **Go para piloto cerrado** con presupuesto maximo de premios/promociones.
- **No-go para lanzamiento masivo** hasta tener opinion legal, pagos reales exitosos, torneos activos recurrentes y conciliacion diaria.

## Metas minimas para declarar viable

Durante 30 dias:

- 300 usuarios registrados.
- 120 KYC aprobados.
- 80 depositantes reales.
- 400 inscripciones pagadas.
- 35% de depositantes con segunda inscripcion.
- 70% de torneos pagados alcanzando minimo.
- Margen bruto positivo despues de premios, IVA, pasarela y freerolls.
- Cero retiros fuera de SLA de 3 dias habiles.
- Cero discrepancias entre saldo wallet, Flow/MP y banco.

## Acciones prioritarias

1. Corregir inconsistencia legal/producto sobre retiros: si solo premios son retirables, la politica debe decirlo de forma clara.
2. Crear torneos activos de bajo riesgo antes de enviar trafico.
3. Cambiar homepage para mostrar proximo torneo con countdown, premio, entrada, cupos y CTA directo.
4. Medir embudo: visita -> registro -> KYC -> deposito -> inscripcion -> juego -> segunda inscripcion.
5. Separar dinero promocional de saldo real y marcar bonus/no-retirable como tal.
6. Validar Flow en produccion real con montos chicos y conciliacion.
7. Obtener opinion legal chilena antes de invertir en ads.
8. Implementar limite real de una solicitud de retiro pendiente.
9. Agregar dashboard semanal de caja: banco + Flow pendiente - saldo usuarios - retiros pendientes - premios comprometidos.
10. Probar 2 formatos: Express diario y Estandar semanal. No lanzar Elite hasta probar liquidez.

## Fuentes externas usadas

- Flow Chile, tarifas: https://web.flow.cl/es-cl/tarifas/
- SCJ, advertencia sobre plataformas ilegales de juego en linea: https://www.scj.cl/noticias_scj/scj-advierte-sobre-uso-no-autorizado-de-su-imagen-institucional-para-promover-plataformas-ilegales-de-juego-en-linea/
- SCJ, juego ilegal en Chile: https://www.scj.gob.cl/juego-ilegal/cual-es-el-juego-ilegal/
- DataReportal, Digital 2026 Chile: https://datareportal.com/reports/digital-2026-chile
- Diario Financiero, mercado chileno de apuestas/juegos online 2025: https://www.df.cl/empresas/industria/el-mapa-de-la-silenciosa-industria-de-apuestas-y-juegos-online-en-chile-en
- Skillz 2025 10-K, modelo y metricas de real-money skill gaming: https://www.sec.gov/Archives/edgar/data/1801661/000180166126000020/sklz-20251231.htm
- WorldWinner, ejemplo de cash-prize skill games: https://worldwinner.com/
- Vercel pricing/docs: https://vercel.com/pricing
- Supabase billing docs: https://supabase.com/docs/guides/platform/billing-on-supabase

## Verificaciones ejecutadas

- `npm run analyze:business`: sin issues criticos, pasivo wallet $116.840, sin torneos activos.
- Consulta agregada Supabase con service role: metricas de usuarios, torneos, pagos, wallet y disputas.
- `npm test -- __tests__/flow-fees.test.ts __tests__/tournament-finance.test.ts __tests__/wallet.test.ts`: 2 suites, 11 tests passed.
- `npm run check:production-env`: falla en entorno local por `APP_URL` localhost y token Mercado Pago de prueba; esto no prueba que Vercel produccion este mal, pero si muestra que el env local no sirve para promover a produccion sin cambios.
