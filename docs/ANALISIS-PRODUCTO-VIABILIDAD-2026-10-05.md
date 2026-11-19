# TorneosPlay: producto y factibilidad de ingresos

Fecha de evaluación: 5 de octubre de 2026. Roles: analista financiero, marketing, diseñador y contador.

## Dictamen

TorneosPlay tiene un formato de torneo con contribución positiva y una base técnica comercial aprovechable. El propietario confirmó **«sin ventas»** durante esta evaluación. Todavía no hay evidencia suficiente para declarar viable una empresa rentable: faltan compras reales, costos completos, costo de adquisición, recompra y resolución de condiciones para operar premios en dinero.

La recomendación es continuar con validación comercial acotada y presupuesto limitado. No justificar más inversión en juegos únicamente por la expectativa de que las inscripciones financiarán el desarrollo. La primera hipótesis adicional a contrastar es vender eventos operados por TorneosPlay a empresas o patrocinadores, con participación gratuita; requiere definir una oferta, contrato y economía propios. Esa modalidad no está comercialmente implementada ni garantiza por sí sola conformidad legal.

## Alcance y calidad de evidencia

- Revisión del repositorio actual en `C:/torneos`, rama `codex/2048-clean-gameplay`, HEAD observado `1b58a55a070684888f833cf2f363ad34d1e37d95`. Hay trabajo compartido sin confirmar; este informe no modifica aplicación, DB, pagos o despliegues.
- Fuentes internas: README, STATUS, business-model, politica-negocio-torneos, contabilidad-producto, accounting, reglas de negocio, finanzas de torneos, checkout Flow, RNG competitivo, documentación de integridad y patrocinio Snake.
- Navegador público: portada, `/play` y `/tournaments` de `https://www.torneosplay.cl`. En esta visita no había torneos activos; la práctica visible correspondía a 2048 clásico. No se inició sesión, realizó un pago ni evaluó una partida competitiva autenticada.
- Los juegos Unity y el catálogo que aparecen en el repositorio y previews no equivalen al producto público observado.
- No se consultaron bancos, analítica privada ni bases productivas. El propietario confirmó «sin ventas»; se toma como dato de negocio proporcionado por él, no como auditoría de cuentas. No se proporcionaron costos completos o métricas de audiencia.
- Un reporte histórico, `artifacts/business-report-1777924325322.json`, fechado el 4 de mayo de 2026, tiene cero cobros Flow pagados. Es antiguo, no representa octubre y no se usa para estimar ventas actuales.
- No se ejecutaron pruebas de aplicación: es un análisis, no una entrega de software. Los cálculos fueron recalculados con JavaScript; las observaciones públicas provienen de lectura y navegador, no de una certificación operativa.

## 1. Producto: qué se vende y para quién

El producto vigente vende un derecho de participación en un torneo organizado por la empresa, con reglas y premios fijos. El usuario compra una experiencia de competencia: claridad de reglas, rivales, clasificación creíble, oportunidad de destacar y atención ante problemas. Un catálogo de juegos por sí mismo no demuestra demanda de inscripciones.

Segmento inicial propuesto, como hipótesis: adultos residentes en Chile que ya juegan casualmente y valoran competencia corta, ranking y comunidad. Los términos revisados requieren mayoría de edad, residencia en Chile y KYC para participar. El conjunto de jugadores casuales es más amplio que quienes están dispuestos a pagar $5.000 por una sola partida: no son mercados intercambiables.

La propuesta diferenciadora posible es organizar competencias cortas con juego integrado, precio claro, reglas comparables y atención local. Debe probarse frente a juegos gratuitos, comunidades que organizan desafíos sin cobro y herramientas de torneos existentes. Challonge ofrece organización gratuita y planes pagados: tener cuentas, rankings y un panel administrativo no constituye por sí solo una diferenciación comercial defendible.

No se estima TAM ni una cuota de mercado: no hay investigación suficiente para atribuir compradores o tasas de conversión a Chile. Los segmentos anteriores son hipótesis para entrevistas y pilotos.

### Capacidades y límites

| Área | Evidencia revisada | Consecuencia comercial |
|---|---|---|
| Plataforma | Cuenta, inscripción, checkout, reglas, clasificación y administración en código | Se puede aprovechar la base existente; no prueba ventas ni operación real completa |
| 2048 | Autoridad servidor sobre movimientos y puntuación; mejoras antifraude e integración aún en curso | Candidato a piloto; una puntuación auténtica no demuestra que jugó una persona |
| Snake Arena | Torneos gratuitos, progreso y clasificaciones en desarrollo | Puede sostener comunidad; hosting persistente y concurrencia necesitan operación y costos comprobados |
| Ted Runner | Práctica gratuita, resultado local con integridad limitada | No contabilizar como fuente habilitada de premios o ingresos por competencia |
| Factory Empire | Persistencia y comunidad en desarrollo; pendientes móviles | Hipótesis de retención; no hay oferta premium ni monetización demostrada |
| Patrocinio | Bloque Snake preparado, configuración desactivada | No hay patrocinador contratado, anuncios activos ni ingresos atribuibles |

## 2. Finanzas: economía real del formato vigente

La política actual es inscripción final de $5.000, mínimo 12, máximo 15 y premio total fijo de $33.000, repartido $24.750 / $8.250. El checkout revisado cobra exactamente la inscripción; `user_fee_cents` es cero. Las recompensas nuevas están desactivadas.

La inscripción completa es venta de la empresa conforme a su política actual. No corresponde tratar sólo un supuesto 25% como ingreso. La fórmula de gestión es:

```text
Contribución del torneo = inscritos × 5.000 / 1,19
                       - inscritos × 5.000 × 3,19%
                       - 33.000
```

Se usa la tarifa neta Flow para tarjetas con abono al día hábil siguiente. El IVA de esa comisión sólo es recuperable fiscalmente cuando corresponda y esté respaldado/conciliado; si no se recupera, disminuye el resultado. La factura y el contrato reales prevalecen sobre esta estimación.

| Inscritos | Cobros brutos | IVA incluido | Flow neto estimado | Premio fijo | Contribución antes de otros costos |
|---:|---:|---:|---:|---:|---:|
| 12 | $60.000 | $9.580 | $1.914 | $33.000 | $15.506 |
| 13 | $65.000 | $10.378 | $2.074 | $33.000 | $19.548 |
| 14 | $70.000 | $11.176 | $2.233 | $33.000 | $23.591 |
| 15 | $75.000 | $11.975 | $2.393 | $33.000 | $27.633 |

Cálculos con precisión completa y redondeo para mostrar pesos. El ledger y la facturación pueden tener pequeñas diferencias de redondeo por transacción.

Sin adquisición, operación variable o cancelaciones, cubrir $500.000 fijos requiere 33 torneos al mínimo o 19 llenos. Ese resultado es una cota optimista, no un pronóstico. Con $1.500.000 fijos requiere 97 al mínimo o 55 llenos antes de esos otros costos.

### Escenario mensual ilustrativo con adquisición y operación

Supuestos elegidos para explorar sensibilidad; no son costos observados ni tasas de mercado:

- 30 torneos completados, 14 inscripciones cada uno: 420 participaciones pagadas.
- Costos fijos de $500.000 al mes. Deben sustituirse por hosting, administración, contador, asesoría, mantenimiento y remuneración del propietario que realmente correspondan.
- Costo variable de soporte/operación: $300 por participación completada.
- Una cuarta parte de las participaciones corresponde a primera compra de un cliente nuevo: 105 clientes. El resto son compras de clientes existentes.
- CAC de $3.000 por nuevo cliente con primera participación completada. Debe incluir todo el gasto de captación, incluidas campañas fallidas; no sólo anuncios con éxito.
- Tres torneos adicionales cancelados, con ocho pagos a devolver en cada uno. La venta/principal se devuelve íntegramente. Cada pago genera pérdida de comisión de cobro $159,50 y costo neto de devolución $202: $361,50 netos, antes de soporte y desfase tributario.

| Concepto | CLP mensual |
|---|---:|
| Cobros brutos de torneos completados | $2.100.000 |
| Venta neta de IVA | $1.764.706 |
| Premios | -$990.000 |
| Comisión Flow neta | -$66.990 |
| Contribución antes de captación y operación | $707.716 |
| Operación variable | -$126.000 |
| Captación: 105 × $3.000 | -$315.000 |
| Costos netos de las 24 devoluciones | -$8.676 |
| Costos fijos | -$500.000 |
| Resultado operativo estimado antes de renta | **-$241.960** |

Con esos supuestos, cada torneo completado aporta $8.890,53 después de operación y captación. Cubrir fijos y las tres cancelaciones requiere 58 torneos completados: 812 participaciones al mes y, bajo la proporción asumida, 203 clientes nuevos. Las otras 609 participaciones exigen recompra; no son 609 usuarios únicos.

Si los costos fijos completos fueran $1.500.000, el mismo escenario requiere 170 torneos completados y 2.380 participaciones. Un negocio que sólo cuadra porque el trabajo del fundador se valora en cero no ha demostrado rentabilidad económica.

Esta proyección mantiene tres cancelaciones al cambiar el volumen; una tasa de cancelación que crezca con el volumen elevaría el umbral. No incorpora importes desconocidos de contracargos, incidentes, soporte de cancelaciones, premio impugnado, costos de desarrollo incremental o impuestos sobre la renta. No se asignan valores inventados a esos conceptos.

### Retención, CAC y caja

La contribución por participación, antes de soporte y captación, va de $1.292 al mínimo a $1.842 con 15. Eso limita cuánto se puede gastar en atraer a un comprador que participa una sola vez.

Con 14 inscritos y soporte de $300, una compra aporta aproximadamente $1.385 antes de CAC y fijos. Un CAC de $3.000 no se recupera en esa primera compra. Si se observan cuatro compras durante 90 días, la contribución acumulada previa a CAC/fijos sería $5.540. No se presume que esa recompra exista ni que cuatro compras generen utilidad suficiente: habría que pagar todavía adquisición y costos fijos.

La solvencia necesita caja disponible separada del resultado: premios comprometidos, devoluciones posibles, IVA pendiente y gastos hasta la siguiente liquidación. Un torneo cancelado con ocho pagos causa unos $2.892 de gasto neto de pasarela/devolución, además de la devolución del principal de $40.000; el desembolso bruto por comisiones incluye IVA. Flow informa que la devolución no elimina el costo de recaudación original.

Una devolución iniciada no es una devolución completada: Flow requiere aceptación del pagador y aplica plazos. La comunicación de la plataforma debe reflejarlo.

## 3. Marketing: demanda, diferenciación y recompra

La web pública explica el proceso y permite practicar sin cuenta. Sin embargo, el recorrido observado acaba en un catálogo sin torneos activos y sin fecha concreta de la próxima competencia. Gastar en tráfico hacia ese estado puede comprar visitas que no tienen oferta disponible.

El principal riesgo comercial es que las personas disfruten jugar gratis, pero no valoren suficientemente pagar por una partida de hasta diez minutos. Un premio atractivo no demuestra disposición a pagar recurrente. Medir cuentas creadas o puntos acumulados no resuelve esta pregunta.

El premio fijo equivale a 55% de los cobros con 12 inscritos y 44% con 15. El aumento de ocupación mejora el margen de la empresa pero reduce el premio agregado por participación. Dividir $33.000 por el número de inscritos da $2.750 o $2.200; es una media aritmética del premio total, no una probabilidad individual de ganar ni un retorno prometido. Para sostener recompra, la experiencia debe aportar diversión, progreso, rivales comparables y reconocimiento a quienes no ganan dinero.

Hipótesis de captación: comunidades adultas de juegos casuales y alianzas para dar visibilidad a eventos operados internamente. Contratar distribución o difusión es distinto de entregar administración, cobrar por cuenta ajena o repartir automáticamente ingresos; la política actual excluye esos intermediarios.

No recomendaría campañas amplias hasta medir este embudo por canal:

```text
Visita cualificada → práctica completada → cuenta confirmada
→ requisitos aprobados → primera compra → partida completada
→ segunda compra → contribución acumulada a 30/90 días
```

Definir conversión con denominadores y ventanas; distinguir usuarios únicos, compras y participantes. Medir retención entre compradores y, en particular, recompra de quienes no obtuvieron premio. D7 de jugadores gratuitos no sustituye la retención de pagadores.

La búsqueda de instrumentación en `app`, `lib` y dependencias no encontró un embudo comercial dedicado. Eso no descarta medición externa; ésta no fue consultada. Hace falta confirmar los datos antes de escalar inversión.

## 4. Diseño: claridad y confianza antes de más contenido

La presentación pública observada es sobria y legible. El mensaje de reglas, precio final y premios fijos ayuda a reducir incertidumbre. Los cambios de diseño prioritarios son comerciales:

1. Una próxima actividad real con fecha, condiciones y acción coherente. Si todavía no puede venderse, ofrecer un evento gratuito real o una comunicación de disponibilidad autorizada; no prometer oferta inexistente ni inventar cupos.
2. Explicar en una ficha cuánto se paga, cuánto dura, cuáles son las dos posiciones premiadas, cómo se comparan resultados, cuándo se confirma el torneo y qué sucede si se cancela.
3. Publicar responsable de la operación, canal de soporte y tiempos de pago comprobables. Mostrar ganadores y pagos sólo cuando sean reales y exista autorización para publicar sus datos.
4. Separar con claridad práctica, competencias gratuitas y modalidad pagada, incluida la disponibilidad efectiva de cada juego.
5. Dar valor visible después de perder: progreso, comparación útil y próxima actividad; no añadir ventajas pagadas que alteren la justicia competitiva.
6. Verificar carga, controles y recorrido hasta resultado en teléfonos reales. Las validaciones de layout/emulación registradas no sustituyen esa prueba.

No atribuyo al producto público las mejoras Unity presentes sólo en desarrollo. Tampoco se ha medido cuánto mejoraría la conversión con estos cambios.

## 5. Contabilidad y condiciones para cobrar

La contabilidad diseñada tiene una base razonable: doble partida, diferimiento de ingreso, premio devengado separado del pago y exclusión de pruebas/simulaciones. El libro interno no reemplaza documentos tributarios, cartola bancaria ni revisión profesional.

Puntos concretos:

- Mantener IVA sobre la venta completa según la política vigente; los premios no se descuentan de esa base.
- Conciliar cobros, documentos, liquidaciones Flow, banco y premios. Un saldo técnico de premios pendientes no es dinero libre de la empresa.
- Verificar el modelo de emisión declarado ante el SII y cada medio de pago. El SII reconoce voucher de tarjeta bajo el modelo correspondiente; para efectivo/transferencias exige boleta. No asumir que cualquier comprobante de Flow sustituye todos los documentos.
- Registrar notas de crédito y su período antes de rebajar IVA por devoluciones; distinguir reversa económica y documental.
- Reconocer crédito fiscal de la comisión desde factura real aceptada, no desde un cálculo estimado.
- Confirmar giro, régimen, deducibilidad/documentación de premios, eventuales declaraciones de ganadores y remuneraciones del propietario.
- Separar resultados operativos, capital para desarrollo y obligaciones históricas de créditos/premios.

El script `scripts/analyze-business-model.mjs` conserva una hipótesis 75% reserva / 25% plataforma y una fórmula de cobertura que no coincide con la política de premio fijo 55% y venta completa vigente. Además consulta muestras limitadas sin un cierre mensual explícito ni la exclusión fiscal completa documentada. No debe usarse como dictamen actual de rentabilidad sin alinear política, período y fuentes. No fue ejecutado ni modificado en esta revisión.

### Riesgo legal e integridad

La política interna mantiene abierta la comparabilidad de secuencias entre jugadores. El inicio competitivo revisado genera una semilla aleatoria por partida. Reproducir una partida sirve para auditoría; no demuestra condiciones equivalentes entre rivales. Los tests llamados de equivalencia verifican reglas TS/C#, no igualdad competitiva ni una clasificación jurídica.

La autoridad del servidor sobre score protege contra puntuaciones falsificadas; no elimina solvers, bots con cadencia variable o cuentas múltiples. Documentos recientes registran mejoras técnicas y pendientes de integración Auth/MFA. No equivalen a aprobación para cobrar premios en producción.

La SCJ informa que los juegos de azar son ilegales salvo autorización legal específica. Esa referencia general no clasifica este producto. Antes del piloto pagado se necesita revisión concreta de juego, aleatoriedad, bases y premios, además de confirmar aceptación contractual del negocio con Flow. Etiquetarlo como habilidad, tener KYC o limitar premios a $70.000 no resuelve por sí solo la cuestión. Patrocinar premios tampoco elimina automáticamente esa revisión.

## 6. Alternativas de ingresos

| Modalidad | Quién paga y por qué | Evaluación | Estado |
|---|---|---|---|
| Inscripción vigente | Jugador por competencia y experiencia | Contribución positiva; sensible a CAC, recompra, ocupación e integridad | Diseñada/implementada; viabilidad comercial no demostrada |
| Evento contratado / patrocinado | Empresa por actividad, engagement o visibilidad medible | Primera hipótesis adicional a validar; reduce necesidad de llenar con jugadores pagadores | Oferta, precio, contrato y operaciones por definir |
| Cosméticos o membresía | Jugador por identidad, comodidad o comunidad | Sólo después de demostrar audiencia recurrente y disposición a pagar; conservar igualdad competitiva | Desbloqueos gratuitos no son tienda ni ventas premium |
| Anuncios de red | Anunciante por alcance | Requiere escala y eCPM observado; no usar para justificar el negocio inicial | Bloque patrocinado no constituye red publicitaria |
| Licencia / autoservicio de organizadores | Organizador por gestionar sus propios torneos | Cambio sustancial, mayor soporte y competencia existente; no es el siguiente paso recomendado | Fuera del canal gobernado vigente |

Ejemplo de cotización B2B para contrastar, no tarifa de mercado: vender un evento en $250.000 netos más IVA y limitar costos directos completos a $150.000 netos deja $100.000 de contribución. Cinco eventos cubrirían $500.000 fijos sólo si esos costos incluyen entrega, premios, atención y captación y se logran ventas cobradas. La audiencia, el problema empresarial y el presupuesto deben validarse con clientes; hoy no hay evidencia de contratos.

## 7. Validación propuesta y decisión de inversión

### Primeras dos semanas

- Obtener ventas/cobros, participantes únicos, devoluciones, premios, costos y cartola por mes; confirmar separación de datos reales y pruebas.
- Entrevistar 10–15 adultos del segmento y 5–10 posibles compradores empresariales. Preguntar por hábitos, alternativas y compras anteriores; registrar compromisos concretos, no sólo opiniones positivas.
- Verificar que el juego y el recorrido operativo adecuados están disponibles. Resolver equivalencia competitiva, revisión jurídica, documentación y aceptación del procesador antes del cobro con premios.
- Definir techo de gasto del piloto y costo completo del trabajo del propietario. No presupuestar un mercado sin compradores observados.

### Prueba de 30–60 días, una vez resueltas esas condiciones

- Concentrar convocatoria en un solo formato; evitar repartir pocos jugadores entre muchos horarios y juegos.
- Buscar 10 torneos operados como muestra inicial de llenado, costos e incidencias. Es aprendizaje, no prueba concluyente de mercado.
- Como umbrales de gestión propuestos: al menos 8 de 10 alcanzan el mínimo sin financiar plazas artificialmente; contribución real positiva después de captación y operación; cero premios/devoluciones sin expediente.
- Medir primera y segunda compra, abandono de KYC, participación completada y recompra de no ganadores. La recompra necesaria debe justificar CAC con cohortes observadas y fecha de recuperación, no con una LTV teórica.
- Contrastar 1–2 pilotos empresariales pagados, si compradores muestran compromiso y se define la modalidad sin incumplir la política de operación interna.

### Continuar, ajustar o detener

Continuar inversión si hay compras cobradas y repetidas, ocupación consistente y una proyección basada en cohortes que cubre todos los costos. La política interna pide tres cierres mensuales reales conciliados antes de declarar sostenibilidad global.

Ajustar si existe uso recurrente gratuito, pero baja compra individual: concentrar comunidad y contrastar eventos contratados; no maquillar rentabilidad aumentando premios sin comprobar su efecto.

Detener el escalamiento de inscripciones si el CAC no se recupera, sólo vuelven ganadores/bots, fallan la mayoría de convocatorias o la modalidad no puede operar jurídicamente. Mantener la práctica gratuita es una decisión separada cuyo costo debe presupuestarse.

La próxima decisión comercial útil es validar quién paga y repite, con costos completos. Construir más juegos sin esa evidencia aumenta inversión comprometida y no responde por sí solo a la pregunta de ingresos.

## Fuentes externas consultadas el 5 de octubre de 2026

- [Flow: tarifas de tarjetas y reembolsos](https://web.flow.cl/es-cl/tarifas). 3,19% + IVA al siguiente día hábil; 2,89% + IVA al tercer día; devolución $202 + IVA. Ahorro neto de cambiar tarifa: $180 en un torneo de $60.000, insuficiente para resolver demanda/CAC por sí solo.
- [Flow: operación y costo de reembolsos](https://web.flow.cl/es-cl/reembolsos). El costo de recaudación original permanece y el pagador debe aceptar el reembolso.
- [SII: IVA aplicable a servicios y excepciones](https://www.sii.cl/noticias/2022/211222noti01aav.htm). Marco general; no pronunciamiento específico sobre TorneosPlay.
- [SII: voucher y modelo de emisión](https://www.sii.cl/destacados/boleta_electronica_voucher/index.html).
- [SCJ: juego ilegal y alcance institucional](https://www.scj.cl/juego-ilegal/cual-es-el-juego-ilegal/). No constituye dictamen sobre este juego concreto.
- [Challonge: precios y funciones](https://help.challonge.com/pricing). Evidencia de alternativas de organización, no benchmark directo de disposición a pagar por TorneosPlay.
- [Producto público observado](https://www.torneosplay.cl/).
