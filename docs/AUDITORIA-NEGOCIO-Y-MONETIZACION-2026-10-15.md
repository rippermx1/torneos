# Auditoría de negocio y monetización de TorneosPlay

Fecha de corte: 15 de octubre de 2026, America/Santiago. Mercado inicial confirmado: Chile, con expansión posterior a Latinoamérica. El propietario confirma que todavía no hay métricas comerciales medidas.

**TorneosPlay tiene activos para probar un negocio, pero aún no demuestra demanda ni rentabilidad. Las dos vías deben convivir como modalidades distintas: juego gratuito financiado por publicidad y competencia organizada con ticket. La primera puede comenzar con medición de jugadores; la segunda mantiene NO_GO para cobrar dinero real. Los anuncios requieren aceptación del proveedor antes de activarse.**

El principal problema empresarial es convertir desarrollo en una propuesta que atraiga, retenga y aporte margen después de atender a sus usuarios. Construir más juegos no resuelve por sí solo ese problema. La prioridad es una experiencia gratuita medible, una competencia gratuita que valide convocatoria y, en paralelo, resolver las condiciones del futuro ticket.

## Alcance y evidencia

La revisión cubre negocio, producto, marketing, economía unitaria, controles monetarios, contabilidad, privacidad y condiciones legales/publicitarias. Incluye lectura de fuentes actuales, consultas cloud de solo lectura, comprobaciones HTTP públicas, pruebas focales y recálculo de escenarios. **No constituye auditoría de estados financieros ni certificación jurídica, tributaria o de seguridad integral.** Faltan cartolas, contratos particulares, registros SII, costos reales y operación comercial observada.

Se conservaron los 411 cambios/entradas de estado existentes en el checkout compartido. Se distinguen:

| Superficie | Identificación al corte | Qué permite concluir |
| --- | --- | --- |
| Checkout de juegos/plataforma | `C:/torneos`, `codex/2048-clean-gameplay`, HEAD `c8d7e7515d18911de42099d8fe24ac8e7cf10d63` más WIP | Fuentes actuales de esta copia; no identidad automática del deploy |
| Candidata monetaria | `C:/Users/valde/.codex/worktrees/real-money-access/torneos`, HEAD `1005495124a73e761a3f61da5ae7b06f195ed884`, limpio al consultar | Correcciones financieras y de acceso existentes en una rama distinta |
| Supabase `torneos` | Proyecto activo asociado a la plataforma comercial | Permisos y agregados actuales; no autorización de lanzamiento |
| Supabase `torneos-dev` | Proyecto activo de desarrollo | Controles más avanzados; ensayos no equivalen a pagos reales |
| Web pública | Dominio canónico y dos alias dev consultados | Respuesta HTTP y texto servido; no prueba de gameplay, rendimiento ni flujo autenticado completo |

En `torneos` se observaron dos torneos internos gratuitos completados, dos inscripciones y cero intentos Flow, retiros y devoluciones. En dev: un torneo, una inscripción y cero intentos Flow, retiros y devoluciones. Estos conteos no son audiencia comercial ni prueban ausencia de gastos, aportes o actividad fuera de esas bases.

Pruebas nuevas: 29/29 en seis archivos del checkout compartido y 83/83 en nueve archivos de la candidata RM. Cubren finanzas, settlement, refunds y áreas de contabilidad/integridad o caja/retiro/recuperación/sesiones según rama. Son pruebas locales; no se repitieron builds Unity/Next, pruebas humanas ni una operación financiera externa. El chequeo de entorno productivo local falla por configuración incompleta y Flow sandbox; no describe las variables privadas de Vercel.

El [modelo recalculable](AUDITORIA-NEGOCIO-Y-MONETIZACION-2026-10-15.modelo.json) conserva supuestos y resultados. La [evidencia resumida](AUDITORIA-NEGOCIO-Y-MONETIZACION-2026-10-15.evidencia.json) conserva las comprobaciones actuales. Las fuentes locales y los documentos de entregas anteriores se citan donde afectan el dictamen.

## Dictamen por alternativa

| Alternativa | Valor que compra o aporta el usuario | Estado y condición económica |
| --- | --- | --- |
| Gratuito con anuncios | Entretenimiento; recompensa opcional útil en práctica | Apto para medir demanda. Monetización condicionada a proveedor, privacidad y rendimiento. Requiere escala y retorno |
| Torneo con ticket | Participación organizada, condiciones claras, clasificación confiable y resolución de incidencias | Contribución teórica positiva. NO_GO monetario: integración, permisos productivos, clasificación jurídica, aceptación Flow y ciclo externo pendientes |
| Convivencia | Una marca y catálogo; elección explícita entre jugar gratis y competir | Viable como diseño. Elegibilidad publicitaria del sitio mixto todavía no demostrada |

La publicidad debe tener sentido aunque el jugador jamás compre una entrada. El torneo debe aportar valor a quien participa y no gana. No comprometer premios con ingresos publicitarios futuros ni tratar el saldo de usuarios como capital operativo.

## Hallazgos materiales

P0 impide cobrar dinero real. P1 afecta el primer ensayo comercial o la capacidad de medirlo. P2 condiciona crecimiento/control.

| ID | Prioridad | Hallazgo actual | Acción y evidencia de resolución |
| --- | --- | --- | --- |
| A01 | P0 | En `torneos`, authenticated conserva INSERT de inscripciones, política de fila propia/rol user y ningún trigger de negocio en esa tabla. También conserva SELECT de `games.seed` bajo lectura de partidas propias | Integrar los controles ya existentes y comprobar roles reales/Data API en la versión elegida. La consulta de metadatos reproduce la exposición de OP-01/02; no se explotó un torneo |
| A02 | P0 | La clasificación del modelo exacto y la aceptación comercial de Flow no están acreditadas | Dictamen sobre juego, azar, entrada, premio, condiciones y publicidad; aceptación escrita del proveedor sobre ese negocio |
| A03 | P1 | Código de juegos, controles RM y entrega contable no son una única candidata aceptada | Identificar release y migraciones compatibles, integrar y verificar el recorrido completo. No volver a declarar inexistentes las correcciones ya implementadas |
| A04 | P1 | La operación financiera externa no está demostrada; dev mantiene caja pausada | Ensayo externo con confirmación auténtica en el ambiente disponible. El expediente de esta cuenta indica Flow productivo: requiere ciclo privado con dinero real, montos/pagador definidos y autorización concreta, con banco, documentos y revisión |
| A05 | P1 | No hay cohortes, CAC, recompra ni costos empresariales medidos | Instrumentar denominadores y adquirir una cohorte real antes de estimar ingresos o comprar crecimiento |
| A06 | P1 | La publicidad del producto mixto puede tener demanda restringida | Evaluar el sitio y el modelo completo con la red; no confundir separar rutas con aprobación |
| A07 | P1 | La comunicación promete pago/premios mientras el alcance público difiere del desarrollo | Alinear portada, catálogo y estados con la oferta operativa. El catálogo público consultado devuelve 404, aunque el alias de juegos dev devuelve 200 |
| A08 | P1 | Primer cierre empresarial sin aprobar; saldos externos desconocidos y documento tributario por medio de pago pendiente | Completar CONT-11 y definir boleta/voucher, notas de crédito y premios con contador |
| A09 | P1 | Privacidad pública declara ausencia de seguimiento de terceros/publicidad comportamental; rewarded introduciría nuevos tratamientos | Definir proveedor, datos, finalidades, consentimiento aplicable y retención antes de publicar la integración |
| A10 | P2 | Cartera amplia y controles locales de analítica sin medición comercial consolidada | Un juego de adquisición y una hipótesis de retorno por ensayo; separar resultados por juego/modo/canal y priorizar con evidencia |

En dev, los permisos INSERT de inscripciones y SELECT de seed están revocados y existen triggers de registro/partida. Esto evidencia avance técnico; no cierra A01 en la base `torneos`. Los advisors muestran avisos informativos de RLS sin políticas, compatibles con tablas de uso servidor, y una advertencia de protección de contraseñas filtradas desactivada en ambos proyectos. Esa advertencia ya fue omitida por decisión del propietario en RM-14; se conserva como riesgo conocido, sin volver a pedir activación. [Referencia del advisor de contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Los antiguos OP-03/04/06 tienen correcciones en la candidata RM: obligaciones de devolución durables, reclamación previa al proveedor, tratamiento de resultado incierto y solicitud/débito de retiro transaccionales. El riesgo vigente es integración y validación externa, no ausencia de implementación. Véanse [RM05–07](RM05-RM07-DINERO-RECUPERABLE.md), [RM12](RM12-SCHEDULER-Y-CALLBACKS-DEVELOP.md), [RM13](RM13-RECUPERACION-Y-CARGA.md) y [RM14](RM14-CUENTAS-DATOS-Y-ATENCION.md).

Que la configuración local apunte a sandbox no demuestra que el comercio disponga de ese ambiente. El [expediente RM-12](RM12-STAGING-Y-ENSAYO.md) registra únicamente Flow productivo para esta cuenta. Confirmar esa condición al preparar el ensayo; no sustituir el ciclo pendiente por un simulador ni ejecutar cobros durante esta auditoría.

## Producto y propuesta de valor

La hipótesis de público inicial es adultos en Chile que buscan partidas breves y competencia casual. Es una segmentación a probar, no una descripción medida de clientes. Conviene validar por separado a quienes buscan progreso personal y a quienes valoran competir en un horario o clasificación común.

| Juego | Activo aprovechable | Uso comercial inicial propuesto |
| --- | --- | --- |
| 2048 | Práctica invitada, cliente competitivo y motor servidor; evidencia de recorrido dev | Primera adquisición gratuita y prueba de convocatoria. Candidato posterior a tickets, sujeto a integridad y clasificación del azar |
| Snake Arena | Misiones, cosméticos, ranking semanal y torneos gratuitos con servidor | Comunidad/retorno; considerar hosting persistente y concurrencia real |
| Factory Empire | Progreso, metas de regreso y modalidad incremental local | Ensayo de retención propio. No trasladar producción/bonos a una competencia pagada |
| Ted Runner | Práctica gratuita | Catálogo gratuito; su resultado local no habilita premios |
| RTS Duel | Laboratorio y evidencia técnica local | Investigación posterior; no tratarlo como torneo monetario disponible |

Fuentes: [catálogo](../components/game/public-game-catalog.tsx), [estado](STATUS.md), [Factory incremental](games/factory-empire/3D-INCREMENTAL-BULK.md), [Snake hosting](SNAKE_ARENA_HOSTING_ASSESSMENT.md). No se recomienda abrir otro proyecto antes de medir los existentes.

La portada actual prioriza pago y premios y la metadata promete premios reales. El navbar “Practicar” conduce a 2048, mientras el catálogo agrupa más opciones. En HTTP actual, portada, práctica, torneos y privacidad del dominio canónico responden 200; `/play/catalog` responde 404. El mismo catálogo responde 200 en `torneos-dev.vercel.app` y 404 en el alias RM. La disponibilidad del catálogo de desarrollo no debe anunciarse como publicación comercial común.

Propuesta de navegación: “Jugar gratis” y “Torneos”, con ficha de cada juego, modalidad disponible y condiciones claras. En gratuito, permitir jugar primero; cuenta opcional cuando permita guardar o continuar algo valioso. En competitivo, explicar precio final, premio, mínimo, cupos, plazo, desempate, desconexión, revisión, devolución y pago antes del checkout. Cuenta/KYC y datos bancarios deben corresponder a finalidades justificadas, sin trasladar por defecto todos los requisitos monetarios al visitante gratuito.

## Anuncios y recompensas

El primer piloto recomendado es una ubicación entre partidas de práctica de 2048, con cosmético personal no transferible. Debe poder rechazarse y continuar normalmente. Un espacio publicitario preparado no demuestra monetización: el patrocinio Snake sigue desactivado y no se encontró una red rewarded activa.

La [política de recompensas de Google](https://support.google.com/adsense/answer/9121589?hl=en) prohíbe recompensas monetarias directas y exige beneficios indirectos personales, utilizables en la plataforma y no transferibles, además de información previa y participación voluntaria. Vidas extra pueden ser admisibles en práctica; Torneos debe excluirlas de resultados competitivos por equidad.

| Beneficio | Decisión para Torneos |
| --- | --- |
| Cosmético personal, sin reventa ni efecto competitivo | Candidato al piloto |
| Vida extra/deshacer de práctica | Evaluar después; mantener fuera del ranking/torneo |
| Efectivo, cripto, tarjeta regalo o saldo retirable | Excluir: recompensa monetaria directa prohibida por Google |
| Ticket, crédito o descuento de torneo con premio | Excluir del piloto. No hay aceptación específica para este producto; no afirmar una prohibición literal universal de todo descuento digital |
| Multiplicador de score, recurso o ventaja competitiva | Excluir por integridad del torneo |

El límite de 25% de Google se refiere a descuentos/vouchers de bienes físicos; no es una regla general sobre cualquier descuento digital. No habilitar `rewardsEnabled` o rakeback para implementar rewarded: son contratos de producto diferentes.

Las [restricciones para publishers](https://support.google.com/publisherpolicies/answer/10437795?hl=en) incluyen contenido con pago para optar a dinero/premios según el resultado, sin una excepción general por habilidad en esa definición. Chile no figura entre las exclusiones territoriales de esa restricción. Para Torneos existe riesgo de menor demanda, potencialmente ninguna; no se deduce una prohibición universal de toda publicidad. Una separación de rutas, iframe o dominio no sustituye evaluación del sitio completo.

| Opción | Encaje y límite comprobado |
| --- | --- |
| Google H5 Games Ads | Web con intersticial/rewarded; solicitud y AdSense aprobado. Admisión no garantizada. [Acceso](https://support.google.com/adsense/answer/1705831?hl=en) |
| Ad Manager/GPT rewarded web | Compatible con web optimizada para móvil; no garantiza demanda. SSV no disponible para web. [Documentación](https://support.google.com/admanager/answer/9116812?hl=en) |
| Unity Ads | Su SDK no soporta WebGL; usar Unity no resuelve publicidad web. [FAQ](https://docs.unity.com/en-us/grow/ads/references/faq) |
| Patrocinio directo | Puede financiar un espacio contratado; requiere vender y cumplir entregables, sin patrocinador ni precio demostrados |
| GameDistribution | Alternativa de distribución, sujeta a alojamiento, enlaces, tracking y derechos publicitarios contractuales. No asumir instalación libre en el embudo propio. [Contrato](https://static.gamedistribution.com/terms/developer.html) |

El evento de concesión de recompensa debe distinguirse del cierre del anuncio y de la impresión facturable. La idempotencia y límites reducen duplicados; no convierten un callback web en prueba de visionado humano. La recompensa debe tener un costo y un riesgo tolerables ante abuso. Sin fill, error o bloqueo publicitario, el usuario sigue jugando. QA debe utilizar [modo de prueba](https://developers.google.com/ad-placement/docs/test), sin generar tráfico facturable artificial.

La integración requiere revisar CSP, iframe/canvas, audio/foco, carga móvil y privacidad. No enviar RUT, KYC, banco, saldo ni historial pagado a segmentación. Las [políticas publisher](https://support.google.com/publisherpolicies/answer/10502938?hl=en) restringen usos de datos y contenido ilegal; los ingresos pueden ajustarse por [tráfico inválido](https://support.google.com/adsense/answer/16737/definition-of-invalid-traffic?hl=en-GB).

### Economía publicitaria ilustrativa

Se reutilizan los supuestos explícitos del [estudio de octubre 8](ESTUDIO-PUBLICIDAD-Y-AD-REWARDS-WEB-2026-10-08.md): 30 días, dos sesiones por usuario activo/día, dos oportunidades display y una rewarded por sesión; aceptación rewarded 25%, elegibilidad 80%, ausencia de adblock 90%, fill 70% y render 95%. eCPM base supuesto: USD2 display y USD5 rewarded. **No son tarifas ofrecidas, benchmarks chilenos ni ingresos previstos.**

| DAU promedio | Solo rewarded, base USD/mes | Display + rewarded, base USD/mes |
| ---: | ---: | ---: |
| 100 | 3,59 | 15,08 |
| 1.000 | 35,91 | 150,82 |
| 10.000 | 359,10 | 1.508,22 |

Con 1.000 DAU, el rango de sensibilidad de solo rewarded es USD14,36–71,82; el mixto USD43,09–359,10. Los USD150,82 anteriores **incluyen display**. Con un costo incremental hipotético de USD500/mes, la base necesitaría aproximadamente 13.924 DAU solo rewarded o 3.316 DAU con ambos formatos, antes de otros costos/ajustes/impuestos.

Fórmula: impresiones finales conciliadas × eCPM neto observado / 1.000. La completitud de recompensa se modela aparte; no volver a descontarla del ingreso si el eCPM ya usa impresiones mostradas. Evitar vender oportunidades, impresiones de QA o estimaciones de panel como ingreso cobrado.

## Tickets y economía del torneo

La política existente cobra entrada final IVA incluido y absorbe Flow. El formato comercial es $5.000 por participación, 12–15 jugadores y premio fijo $33.000: primero $24.750, segundo $8.250. El premio se publica antes del pago; no debe aumentar ventajas ni cambiar por ver anuncios. Fuentes: [reglas](../lib/business/rules.ts), [finanzas](../lib/tournament/finance.ts), [política comercial](politica-negocio-torneos.md). El gross-up de `lib/flow/fees.ts` es legado y no debe sumarse al precio actual.

La tarifa pública contrastada es 3,19% + IVA con abono al siguiente día hábil y $202 + IVA por devolución; verificar contrato/medio efectivo antes de operar. [Flow tarifas](https://web.flow.cl/es-cl/tarifas/). Devolver una entrada no elimina el costo original de cobro. [Flow reembolsos](https://web.flow.cl/es-cl/reembolsos/).

| Participantes | Cobro bruto CLP | Venta sin IVA | Flow neto | Premios | Contribución | Contribución/bruto |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 12 | 60.000 | 50.420 | 1.914 | 33.000 | 15.506 | 25,84% |
| 13 | 65.000 | 54.622 | 2.074 | 33.000 | 19.548 | 30,07% |
| 14 | 70.000 | 58.824 | 2.233 | 33.000 | 23.591 | 33,70% |
| 15 | 75.000 | 63.025 | 2.393 | 33.000 | 27.633 | 36,84% |

Cálculos redondeados a pesos, antes de captación, soporte, infraestructura, trabajo del fundador, contador, asesoría, fraude e impuesto a la renta. Se supone crédito fiscal válido por IVA de Flow. No es utilidad neta empresarial. Sin recuperar ese IVA, la contribución de 12 jugadores baja a $15.143.

Con 12 inscritos quedan $24.722 en caja tras Flow bruto y premios, pero aproximadamente $9.216 corresponden al IVA neto estimado. Caja bancaria aparente y margen distribuible son distintos. El precio completo es la venta bajo la política actual; no se calcula IVA sólo sobre la diferencia entre entradas y premios. La aplicación definitiva depende del modelo validado con contador.

El formato premia a dos de 12–15 participantes. La proporción de premiados, 13%–17%, no es una probabilidad individual de ganar. Si la única razón para comprar es recuperar dinero, la mayoría de compradores no recibe premio y puede abandonar; medir recompra de no ganadores es central. Se necesita valor de organización y competencia, además de integridad frente a bots, colusión, cuentas múltiples y condiciones de juego comparables.

### Sensibilidad a captación y cancelación

Ejemplo hipotético: 30 torneos completados al mes con 14 participantes, soporte $300/participación, 25% de participaciones de clientes nuevos, costos fijos $500.000 y tres cancelaciones adicionales con ocho pagos cada una.

| CAC por nuevo pagador | Resultado mensual antes de renta |
| ---: | ---: |
| $0 | $73.040 |
| $1.000 | −$31.960 |
| $3.000 | −$241.960 |
| $5.000 | −$451.960 |

El escenario contiene 420 participaciones y 105 clientes nuevos supuestos; no demuestra que existan. Cancelar con ocho pagos exige devolver $40.000 y deja $2.892 de costo neto de cobro/devolución, aproximadamente $3.441 de salida bruta por comisiones. El principal devuelto revierte venta/obligación, no es otro gasto que deba contarse dos veces.

A 14 jugadores, después de $300 de soporte por participación quedan aproximadamente $1.385 por compra antes de CAC y fijos. Un CAC de $3.000 requiere al menos tres compras para recuperar sólo adquisición/soporte. Esa repetición aún no está medida.

Los $250.000 de costo fijo objetivo en código son un parámetro; los $500.000 del ejemplo son una hipótesis. Inventariar hosting web y servidores persistentes, dominios, email, licencias, mantenimiento, contador, abogado, contenido, captación, atención y remuneración del fundador. No convertir trabajo gratis en rentabilidad sostenible.

## Marketing y validación comercial

La promesa propuesta es jugar gratis y competir bajo reglas claras, sin presentar la plataforma como forma de obtener ingresos. Para crecer, la ventaja debe ser una comunidad accesible, calendario confiable, partidas comprensibles y resultados/disputas atendidos. El catálogo por sí solo no constituye distribución.

El primer ensayo debe concentrar jugadores: un juego principal y una ventana de torneo gratuito, evitando múltiples horarios vacíos. Promoción inicial mediante contenido breve del juego, comunidades que permitan difusión y creadores pequeños, con enlaces identificables por campaña. No se contactó a terceros. Referidos y anuncios de adquisición se evaluarán después de observar activación y retorno.

Comprar publicidad para captar jugadores usa reglas distintas de monetizar como publisher. Google Ads contempla concursos pagados no casino de habilidad bajo condiciones que excluyen resultados total o parcialmente aleatorios. No declarar automáticamente elegible a 2048 con generación aleatoria ni automáticamente prohibido todo concurso de habilidad. [Google Ads juegos y apuestas](https://support.google.com/adspolicy/answer/15132179?hl=en).

Propuesta de ensayo gratuito: cuatro semanas y unos 200 inicios elegibles nuevos como muestra exploratoria; extender si no llegan, sin prometer significancia ni una fecha de lanzamiento pagado. Primera semana para eventos/teléfonos y tres siguientes para observar cohortes. D1/D7 por calendario Chile madura al terminar el día objetivo +1/+7 en America/Santiago; no mezclar esa definición con ventanas de 24/168 horas o métricas UTC existentes. Fijar presupuesto máximo antes de gastar y valorizar horas del propietario.

| Indicador | Definición | Regla interna inicial propuesta |
| --- | --- | --- |
| Inicio jugable | Primer input confirmado / aperturas elegibles | Investigar si <90%; segmentar dispositivo/red |
| Activación 2048 | Inicio nuevo con 60 s de interacción o resultado válido / inicios nuevos | Explorar ≥70%; no contar pestaña abierta |
| Segunda partida | Activados que inician otra partida en 24 h / activados | Explorar ≥30% |
| D1 / D7 | Nuevos que vuelven a jugar día calendario Chile +1/+7 / cohorte madura | Explorar ≥15% / ≥5%; publicar n e incertidumbre |
| Captación | Costo completo del canal / nuevos activados y / nuevos pagadores | Comparar con contribución acumulada observada |
| Convocatoria | Inscritos que comienzan / inscritos; completados / comienzos | Investigar ausencias, espera y fallos |
| Ticket | Ocupación al plazo, cancelación, reembolso, soporte y recompra 30/90d | Medir también no ganadores; crecer por margen neto de cohorte |
| Rewarded | Oferta, aceptación, solicitud, fill, impresión, grant y persistencia | Denominadores distintos; ingreso confirmado por proveedor |
| Protección del juego | Abandono, segunda partida, D7 y reclamos según exposición | No aceptar ingreso a costa de destruir retorno |

Estos valores son criterios exploratorios propuestos, **no benchmarks ni resultados actuales**. Registrar QA/bots/equipo por separado, modo, build, país, dispositivo y canal; minimizar datos personales y definir conservación. No unir publicidad con KYC o información financiera.

Definir una identidad estable para cada denominador. Un navegador anónimo o una cuenta no prueba una persona única: reportar retorno de navegadores/cuentas cuando ésa sea la unidad observada. Para atribuir cambios a los anuncios se necesita un grupo sin anuncios, asignación estable y tamaño/maduración suficientes; comparar quienes aceptan rewarded con quienes lo rechazan introduce selección. Un piloto pequeño puede producir resultados descriptivos, sin demostrar efecto causal ni contribución incremental.

El funnel Snake está apagado por defecto, usa archivo local/cookie de seis horas y no incluye atribución ni D7/D30. Factory usa observaciones locales/importación manual y distingue navegador observado de persona. Son bases técnicas, no un tablero comercial consolidado. Fuentes: [Snake funnel](WEB09-SNAKE-FUNNEL.md) y [observación Factory](games/factory-empire/3D-GAMEPLAY-OBSERVATION.md). Basta una implementación acotada en el monolito; no hace falta una plataforma de analítica o microservicios nueva.

## Contabilidad, impuestos y caja

CONT-01–10 incorporan journal completo, devengo, documentos, gastos/aportes/otros ingresos, provisiones Flow, cartolas, conciliación y cierres versionados. La entrega dev con documentos sintéticos no demuestra un cierre empresarial real. CONT-11 conserva `reviewed=false`, `closed=false` y saldos externos desconocidos. CONT-12, emisión/presentación fiscal, permanece pendiente. [Backlog contable](CONTABILIDAD-BACKLOG.md), [primer cierre](CONTABILIDAD-PRIMER-CIERRE.md).

| Flujo | Registro/control necesario |
| --- | --- |
| Ticket cobrado antes del evento | Cobro y obligación/ingreso diferido según política de devengo; venta y documento fiscal sin duplicación |
| Evento completado | Reconocer ingreso y premio/obligación según condiciones; trazabilidad del resultado y revisión |
| Cancelación/devolución | Reversa/N/C cuando corresponda, obligación durable y conciliación del pago efectivo |
| Premio/retiro | Pasivo separado del ingreso; transferencia cancela obligación y no crea otro gasto del mismo premio |
| Liquidación Flow | Movimiento entre cuentas, separado de factura de comisión/IVA y diferencias |
| Publicidad | Separar estimación, ingreso finalizado/devengado, cuenta por cobrar, deducciones y cobro |
| Patrocinio | Contrato, entregables, devengo y documento; no inferir venta por tener un espacio disponible |
| Gastos/aportes | Costos previos a ventas, cuentas por pagar y capital documentados; no sólo tickets |

El reporte F29 interno actual se centra en inscripciones. Otros ingresos pueden registrarse manualmente; eso permite iniciar un cierre controlado sin construir un ERP, pero exige una política publicitaria y revisión consolidada del contador. No asumir IVA cero por cobrar del extranjero: la exportación de servicios tiene condiciones específicas. [SII exportación de servicios](https://www.sii.cl/destacados/exportador_servicios/).

La elección voucher/boleta requiere revisar medios reales habilitados en Flow y modelo de emisión declarado al SII. El comprobante de tarjeta puede tener validez tributaria en las condiciones aplicables; no cualquier comprobante o transferencia reemplaza una boleta. El código habilita varios medios y el módulo no emite automáticamente todos los DTE. [SII voucher y modelo de emisión](https://www.sii.cl/destacados/boleta_electronica_voucher/index.html). La regla general para servicios de sociedades de capital contempla IVA salvo exención aplicable; formalizar el tratamiento exacto del producto y premios. [SII servicios e IVA](https://www.sii.cl/preguntas_frecuentes/iva_servicios_profesionales/001_320_8308.htm).

Para el primer cierre: confirmar septiembre de 2026, responsable/revisor/contador e identidad vigente; revisar SII/giro/régimen; obtener cartolas de apertura/cierre, liquidaciones y facturas Flow, RCV/N/C y gastos/aportes/deudas anteriores. Si no hubo actividad, documentar ausencia por fuente. Conciliar, reemplazar estimaciones y aprobar el paquete congelado. La ausencia de ventas o de métricas no elimina los gastos ni obligaciones previas.

La caja disponible debe cubrir premios comprometidos, saldos adjudicados, retiros abiertos, devoluciones, pagos inciertos, impuestos y reserva adicional, sin duplicar el mismo pasivo al pasar de premio a retiro. Los ingresos publicitarios futuros y Flow pendiente no sustituyen banco disponible. El monto depende del calendario y exposición real; no fijarlo arbitrariamente. [RM10 caja](RM10-CONCILIACION-Y-RESERVA-CAJA.md). En dev, la consulta actual confirma `paused=true` y límites/reserva adicionales sin configurar.

## Clasificación legal y privacidad en Chile

La SCJ explica que el azar y su explotación están sujetos a habilitación legal y mantiene su advertencia sobre apuestas online no autorizadas. Esto no basta para dictaminar que cualquier torneo de habilidad es ilegal o legal. Debe analizarse **el modelo exacto**: papel del azar, condiciones equivalentes, resultados, entrada, premio, promoción y operación. Llamarlo “ticket”, fijar el premio, cobrar IVA o publicar términos no resuelve esa clasificación. [SCJ juegos de azar](https://www.scj.gob.cl/juegos-de-azar/), [SCJ preguntas frecuentes](https://www.scj.cl/preguntas-frecuentes-p/).

2048 incorpora generación aleatoria; proteger la semilla evita cierta anticipación, pero no prueba ausencia de azar, equivalencia de condiciones o participantes humanos. Revisión de ganadores, retenciones, apelación, titularidad de pago y controles de multiaccount/bots son riesgos de negocio, además de técnicos. Un gratuito con premio patrimonial también necesita análisis: eliminar el precio no convierte cualquier modalidad en libre de condiciones.

Privacidad/KYC exige finalidad, acceso limitado, conservación y eliminación con excepciones justificadas. RM-14 recibe solicitudes, pero el borrado definitivo y política de retención todavía no están cerrados. La Ley 21.719 tiene entrada en vigor general el **1 de diciembre de 2026**, posterior al corte de esta auditoría; preparar su implementación antes de ampliar datos o añadir redes. [BCN Ley 21.719](https://www.bcn.cl/leychile/navegar?i=1209272).

## Secuencia de trabajo y decisiones de inversión

Las vías avanzan en paralelo; sus lanzamientos no necesitan ocurrir el mismo día. La siguiente secuencia evita gastar adquisición antes de saber qué retiene al jugador.

| Orden | Entrega concreta | Responsable propuesto | Criterio de salida |
| --- | --- | --- | --- |
| 1 | Definir propuesta dual, juego principal, calendario gratuito, eventos y presupuesto del ensayo | Propietario/producto | Un recorrido disponible y denominadores verificables |
| 1 en paralelo | Expediente del modelo jurídico, Flow y publicidad; primer cierre y costos reales | Propietario, abogado, contador | Clasificación/condiciones escritas y presupuesto/caja documentados |
| 2 | Integrar controles existentes y corregir divergencia entre release, DB y catálogo público | Ingeniería | Permisos y flujo verificados contra candidata identificada, sin perder WIP |
| 3 | Observar cohorte gratuita y convocatoria de competencia sin dinero | Producto/marketing | Activación, D1/D7, participación e incidencias con personas reales |
| 4 | Probar una ubicación rewarded aceptada, con recompensa personal y control de efecto en retorno | Ingeniería/producto/proveedor | Reporte conciliado y reward fiable; medir retorno. Afirmar contribución incremental sólo con comparación válida, o presentar resultados descriptivos |
| 5 | Completar ensayo monetario externo y primer ciclo privado autorizado | Operación/revisor/contador | Cobro, devolución, premio y banco/documentos conciliados; incidencias resueltas |
| 6 | Abrir piloto pagado acotado y medir recompra, fraude, soporte y margen | Propietario/operación | Cohorte rentable observada y cobertura de pasivos antes de escalar |

Detener o corregir el experimento si el juego no activa/retiene, el costo de captar supera la contribución observada, los torneos no alcanzan mínimo, los anuncios dañan retorno o quedan obligaciones sin resolver. No forzar el ticket para compensar publicidad insuficiente.

La decisión empresarial pendiente no es elegir entre publicidad o tickets. Es demostrar que cada modalidad aporta valor y contribución, y que su convivencia cumple las condiciones del producto, proveedores y operación. Hasta entonces: **medir gratuito, preparar monetización publicitaria y mantener NO_GO monetario**.
