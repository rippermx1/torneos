# Propuesta de valor de Torneos con 2048 y validación en 30 días

Fecha: 15 de octubre de 2026. Mercado inicial: Chile. Único juego del ensayo: 2048.

**Propuesta de valor: Torneos es un club de 2048 donde puedes jugar gratis, mejorar tu marca y compararte con una comunidad en retos semanales de cinco minutos. El entrenamiento opcional ayuda a explorar decisiones; los torneos con ticket serán una modalidad adicional cuando estén habilitados.**

Mensaje principal propuesto para la web: **Juega 2048 gratis, supera tu marca y participa en el próximo reto de la comunidad.**

Esta entrega define producto, alcance y validación. Las funciones nuevas descritas no están implementadas aquí; no se modificaron juegos, DB, anuncios, pagos ni despliegues.

## Cliente y motivo para elegir Torneos

El público inicial propuesto son adultos en Chile que disfrutan puzzles breves, conocen o pueden aprender 2048 y valoran compararse con otras personas. Novatos e intermedios forman la cohorte principal; expertos se identifican y analizan por separado.

El beneficio es una pausa entretenida con progreso reconocible y una próxima actividad concreta. La diferenciación que se probará reúne tres elementos:

- Una marca personal que da sentido a la siguiente partida.
- Una oportunidad de explorar una decisión después de terminar.
- Una comunidad y una fecha en la que volver a comparar resultados.

El jugador puede disfrutar gratuitamente de todo el recorrido básico. El negocio tendrá dos fuentes potenciales de ingreso: publicidad voluntaria asociada al entrenamiento y entradas a competencias monetarias habilitadas. La audiencia y su disposición a pagar todavía necesitan validación.

La conexión entre modalidades será la experiencia de 2048, el historial, la cuenta existente cuando haga falta y el calendario. No se creará una moneda común, crédito canjeable, marketplace ni economía nueva.

## Cuatro modalidades con reglas visibles

| Modalidad | Qué recibe el jugador | Cuenta | Resultado | Monetización |
| --- | --- | --- | --- | --- |
| Jugar gratis | Práctica ilimitada y mejora de marca | Opcional; la marca local pertenece a este navegador | Marca personal sin ayuda | Sin anuncios obligatorios |
| Entrenamiento | Volver a una posición anterior y probar otra dirección | No exige abrir una cuenta monetaria | Continuación asistida, separada de marcas y clasificaciones | Un rewarded voluntario si el proveedor está aceptado |
| Reto gratuito | Una partida de cinco minutos dentro de una ventana publicada de 24 h | Cuenta para inscripción y resultado | Clasificación servidor; sin dinero ni premio patrimonial | Sin anuncios dentro de la partida |
| Torneo con ticket | Participación organizada con precio, reglas y premios publicados | Requisitos comerciales y legales aplicables | Resultado competitivo servidor y revisión | Precio de entrada; sin ayudas publicitarias |

El reto gratuito será la cita comunitaria principal del ensayo. Se celebrarán dos convocatorias en semanas consecutivas, abiertas los días 14 y 21. Cada una tendrá una ventana de 24 horas y un solo intento por cuenta bajo reglas publicadas. La inscripción será previa y cerrará cuando abra la ventana de juego, respetando el contrato actual. Para garantizar cinco minutos completos, el último inicio nuevo deberá admitirse al menos 300 segundos antes del cierre; la recuperación de una partida existente conservará su plazo original.

No se promete igualdad absoluta de oportunidades ni habilidad pura. El juego incorpora azar; compartir configuración, duración o incluso semilla no demuestra condiciones competitivas equivalentes. El diseño y clasificación de futuras competencias pagadas mantienen sus revisiones específicas.

## Recorrido propuesto

1. La portada lleva directamente a 2048 y muestra cuándo abre el próximo reto.
2. El jugador practica sin registro ni pago.
3. Al terminar ve puntaje, ficha máxima y comparación con su mejor marca local sin ayuda.
4. Puede comenzar otra partida, consultar el próximo reto o explorar una jugada alternativa mediante entrenamiento.
5. Para participar en el reto se inscribe con la cuenta existente, conoce las reglas y juega su intento.
6. El resultado muestra clasificación provisional/oficial según el estado y la fecha del próximo encuentro.
7. Una ficha diferenciada informa de futuros torneos con ticket, con su disponibilidad real.

La oferta de entrenamiento se presenta después de cerrar el resultado original. El acceso al reto y a la información de torneos no depende de aceptar anuncios.

## Funciones del primer alcance

| Función | Entrega mínima | Por qué aporta valor | Estado |
| --- | --- | --- | --- |
| Entrada única a 2048 | Jugar gratis como acción principal, próxima fecha y modos explicados | Reduce confusión y conecta la partida con una actividad | Cambio de presentación propuesto |
| Marca personal | Mejor puntaje sin ayuda, ficha máxima y hasta cinco resultados en este navegador | Permite reconocer mejora y elegir repetir | Nuevo en el host Unity actual |
| Resultado accionable | Otra partida, explorar jugada y próximo reto; compartir enlace por acción del jugador | Cierra la sesión y ofrece una siguiente intención | Existe resultado básico; ampliar |
| Reto gratuito real | Entrada cero, premios cero, cinco minutos, ventana de 24 h, intento único y clasificación servidor | Da contenido a la comunidad y permite observar repetición | Requiere formato legítimo nuevo |
| Entrenamiento rewarded | Una restauración al checkpoint previo al último movimiento válido | Permite explorar una decisión de la propia partida | Nuevo; aprobación publicitaria independiente |
| Ficha de ticket | Precio total, duración, mínimo, premios, reglas, cancelación y estado real | Permite valorar una compra concreta antes del checkout | Reutilizar oferta existente cuando esté habilitada |

El enlace para compartir cuenta como intención de compartir. Sólo una visita o partida atribuible al enlace permite registrar adquisición por invitación. No se enviarán mensajes automáticamente.

La marca del navegador es privada y no autoritativa. No se utilizará para inscribir, adjudicar premios, asignar ventaja ni validar resultados competitivos. Borrar almacenamiento o cambiar de dispositivo puede perderla; la sincronización de marcas entre dispositivos queda fuera del primer alcance.

Quedan fuera del mes nuevos juegos, skins/tienda, monedas, pases, ligas, matchmaking por habilidad, rachas con castigo, reto diario independiente, chat, apuestas o créditos por anuncios. Las siguientes funciones deben responder a comportamiento observado, no a completar el catálogo.

## Recompensa inicial

Recomiendo **probar otra jugada después de perder**, en lugar de comenzar con una colección cosmética.

Ejemplo de presentación:

> Práctica terminada.
>
> Nueva partida gratis.
>
> Explorar otra jugada: ver un anuncio para volver al estado previo a tu último movimiento válido. Esta continuación es entrenamiento y no cuenta para récords ni retos.

El beneficio es concreto y personal. No se anuncia como consejo óptimo, solución del puzzle ni mejora de habilidad demostrada: el jugador puede explorar una alternativa.

Reglas propuestas:

- Conservar el resultado legítimo original y cualquier marca obtenida antes de la ayuda.
- Guardar el checkpoint anterior al último movimiento válido, incluyendo tablero, puntaje y estado aleatorio necesario. Los movimientos sin efecto no reemplazan el checkpoint.
- Mostrar la oferta sólo cuando el motor existente confirme que al menos una dirección alternativa desde el checkpoint permite continuar jugando. Una dirección legal que también termina inmediatamente no basta; si no existe una alternativa útil, no se ofrece el anuncio.
- Crear una continuación identificada de forma persistente como entrenamiento.
- La continuación no actualiza marca general, clasificación, premio ni intento competitivo, ni genera otra oferta de recompensa.
- Máximo una concesión por partida original y dos por día como límite exploratorio. Rechazo, error o ausencia de anuncio no consumen una concesión.
- Nueva partida gratuita sigue disponible. No interrumpir partidas activas ni pedir ver anuncios para usar normalmente el producto.
- Ningún anuncio entrega ticket, descuento de inscripción, saldo, premio, movimientos extra o tiempo adicional en un reto/torneo.

Una concesión por partida y dos por día son decisiones del piloto, no reglas de Google. El límite local puede ser eludible; no debe presentarse como un control financiero o prueba de humanidad.

Google admite recompensas indirectas personales y menciona vidas extra; aplicar ese criterio a una continuación de entrenamiento es una inferencia de diseño, sujeta a aceptación del producto. La política exige información clara, elección voluntaria y conservación del uso normal al rechazar. [Política oficial de recompensas](https://support.google.com/adsense/answer/9121589?hl=en).

**Si no hay proveedor aceptado**, mostrar “Probar entrenamiento — demostración sin anuncio real”. El registro distinguirá esa demostración del rewarded real. Permite comprobar utilidad y comprensión, pero no valida aceptación de anuncios, fill, ingresos o rentabilidad.

En Ad Manager web, el cierre del anuncio y la concesión son eventos distintos, y no existe verificación server-side de visionado. El callback no puede generar valor monetario; las concesiones duplicadas deben ignorarse. [Documentación rewarded web](https://support.google.com/admanager/answer/9116812?hl=en).

## Conexión con torneos pagados

La práctica desarrolla familiaridad y mejora personal. El reto gratuito permite experimentar plazo, intento limitado, clasificación y próxima fecha. El ticket podrá ofrecer una competencia con premio y operación financiera bajo condiciones publicadas.

La función del anuncio será ampliar una oportunidad de entrenamiento personal. El ticket compra participación en una competencia concreta. El usuario conserva libertad para permanecer en el gratuito.

Durante el ensayo:

- Los retos gratuitos tendrán reconocimiento en la clasificación, sin premio patrimonial.
- No habrá clasificación para un torneo pagado mediante anuncios ni acumulación de entradas.
- La ficha de pago mostrará disponibilidad honesta. Mientras esté cerrado, utilizar “Torneos con ticket: todavía no disponibles” y, opcionalmente, “Quiero recibir aviso” con consentimiento.
- El interés se medirá sólo después de presentar condiciones y precio; nunca se contará como venta.

Como referencia de la oferta existente, el preset comercial define entrada final de **$5.000**, **12–15 participantes**, **premio total $33.000** y **10 minutos** por partida, con ventana de 24 h. El reto gratuito propuesto dura cinco minutos; no se alterará automáticamente el preset pagado. Fuente: [finanzas vigentes](../lib/tournament/finance.ts).

El precio sirve para investigar una oferta específica, no para declarar su aceptación. La disposición real a pagar requiere posteriormente compra autorizada, competencia entregada y observación de recompra, especialmente entre quienes no reciben premio.

Los anuncios de un sitio que ofrece pago y premios pueden tener demanda restringida. Separar rutas o modos no garantiza aceptación del proveedor; presentar el modelo completo forma parte de su evaluación. [Restricciones para publishers](https://support.google.com/publisherpolicies/answer/10437795?hl=en).

La preparación monetaria sigue en la [auditoría integral](AUDITORIA-NEGOCIO-Y-MONETIZACION-2026-10-15.md). El plan no presupone que en 30 días se resuelvan clasificación jurídica, aceptación de Flow, permisos, integración y ciclo financiero. Si siguen pendientes, la validación de venta también queda pendiente.

## Viabilidad sobre la base actual

**Práctica y resultado:** ya existen host Unity, motor de práctica y panel final. El host controla práctica con el motor actual; la cápsula renderiza los estados. El récord persistente y el entrenamiento son incrementos nuevos, no otra versión del juego. Fuentes: [sesión 2048](../lib/game/unity-2048-session.ts), [práctica](../lib/game/local-practice.ts), [host](../components/game/unity-2048.tsx), [resultado](../components/game/2048-game-result.tsx).

Una restauración de práctica parece posible en el host con snapshots existentes, sin construir otro motor ni necesariamente recompilar Unity. Debe verificarse foco, estado visible y bloqueo de ayudas competitivas en el runtime real antes de darla por entregada.

**Reto sin premio:** el formato actual no basta. Los presets ofrecen comercial pagado, freeroll con premio o prueba interna con importe sintético; la migración inicial exige primer premio positivo. Reutilizar registro, partida y clasificación requiere añadir un formato legítimo de entrada cero/premios cero, ajustar restricciones gobernadas y comprobar cierre, notificaciones y ausencia de obligaciones monetarias. Fuentes: [presets](../lib/tournament/finance.ts) y [schema inicial](../supabase/migrations/001_init_schema.sql).

No usar premio ficticio, versión antigua de política, saldo sintético o `internal_test` como evento comunitario. La conclusión corresponde a las fuentes locales revisadas; la implementación deberá verificar también el estado real del destino autorizado.

La inscripción actual cierra al abrir el juego; se reutilizará esa secuencia, con apertura y cierre visibles. El servidor actual puede recortar el plazo al cierre de la ventana: el nuevo formato deberá impedir inicios nuevos en los últimos cinco minutos para sostener la promesa de duración completa, sin bloquear recuperación de partidas ya iniciadas. Fuentes: [ventana de inscripción](../lib/tournament/helpers.ts) y [plazo de juego](../lib/tournament/game-deadline.ts).

Este formato es la dependencia principal del ensayo. Si no puede entregarse y comprobarse dentro de la primera semana, retirar primero las tareas de monetización y funciones accesorias. Si sigue sin ser operable, ejecutar sólo la prueba de práctica/retorno y declarar **competencia no validada**; no sustituirla por una tabla de puntajes declarados desde el navegador.

En competitivo se mantienen direcciones al servidor, puntaje calculado allí y revisión de resultados. No se transforma la marca local ni un callback publicitario en resultado oficial. Reutilizar cuenta, administración y checkout web; no introducir cuentas o pagos dentro de Unity.

## Plan de 30 días

Presupuesto inicial propuesto: **50 horas totales** para este ensayo, no una estimación garantizada de implementación ni un presupuesto aprobado. Incluye desarrollo acotado, verificación, convocatoria, observación, operación y análisis. Los trabajos legales/financieros amplios que excedan ese límite no se dan por resueltos.

Objetivo exploratorio: **50–80 jugadores nuevos** ajenos al desarrollo por un canal principal accesible. Si no llegan, registrar volumen, esfuerzo y motivo; no llenar el denominador con equipo, QA, bots o sesiones duplicadas. La captación es parte de la prueba, no una premisa asegurada.

| Días | Trabajo | Límite propuesto | Resultado revisable |
| --- | --- | ---: | --- |
| 1–7 | Preparar entrada/resultado/marca, registro mínimo y formato gratuito legítimo. Observar 6–8 primeras sesiones. Revisar elegibilidad publicitaria | 18 h | Un recorrido libre y un reto real verificables; alcance recortado si la dependencia no cabe |
| 8–14 | Reclutar por un canal, corregir un bloqueo observado, publicar reglas/fecha y abrir primer reto el día 14 | 12 h | Partidas reales, inscritos, intentos y costo de convocar |
| 15–21 | Observar vuelta; ensayar entrenamiento. Si hay proveedor aceptado, rewarded pequeño; si no, demostración rotulada. Abrir segundo reto el día 21 | 12 h | Repetición del grupo, uso del beneficio y comprensión de sus límites |
| 22–30 | Completar seguimiento, investigar interés informado en ticket y analizar cohortes maduras, costos y decisiones | 8 h | Informe con resultados por modalidad, pendientes y una decisión de inversión |

Las aperturas de los retos son semanales y cada ventana dura 24 h. Publicar horas de Chile, cierre previo de inscripción, último inicio permitido y cierre. No multiplicar horarios o categorías durante el ensayo.

Si el desarrollo consume el límite, se recorta primero entrenamiento/ads y presentación de pago; se protege la prueba de acceso, retorno y comunidad. No extender el mes indefinidamente para completar funciones sin observar jugadores.

## Métricas y criterios de decisión

Son umbrales internos exploratorios para decidir otro experimento, no benchmarks ni certificación de encaje de mercado.

| Pregunta | Métrica y denominador | Señal inicial propuesta |
| --- | --- | --- |
| ¿Pueden empezar? | Primer movimiento válido en 90 s / primeras aperturas elegibles | Investigar si <90%; separar errores de carga, controles y abandonos |
| ¿Entran en el juego? | Nuevos con 20 movimientos válidos / nuevos con primer movimiento | Investigar si <70%; no contar movimientos sin efecto |
| ¿Quieren repetir? | Activados que empiezan una segunda partida en 24 h / activados | Buscar ≥30%; separar reinicio orgánico de continuación entrenada |
| ¿Vuelven? | Regreso en día calendario Chile +7 / nuevos con día +7 completo | Buscar ≥15%, procurando al menos 40 casos maduros; mostrar conteos |
| ¿Hay convocatoria? | Inscritos, comienzos y finalizaciones por reto | Procurar 12–15 participantes reales y ≥70% de comienzo sobre inscritos |
| ¿La experiencia vale para quienes no destacan? | Participantes fuera de los dos primeros del reto 1 que empiezan el reto 2 / ese grupo | Buscar ≥30%; mostrar numerador y denominador |
| ¿Sirve el entrenamiento? | Concesiones realmente utilizadas / concesiones; errores de comprensión y uso posterior | Uso repetido por personas distintas y comprensión de que no puntúa; corregir confusión antes de ampliar |
| ¿Tiene interés el ticket? | Personas que piden aviso / personas que vieron ficha con precio y condiciones | Señal descriptiva de interés, sin equipararla a compra |
| ¿Cabe operarlo? | Horas del mes y directas por reto, costos y reclamos | Respetar 50 h; procurar ≤4 h operativas por convocatoria y explicar trabajo excepcional |

D7 madura al terminar el día +7 en America/Santiago. Para cerrar el informe antes de terminar el día 30, usar como cohorte madura a quienes empezaron hasta el día 22. Personas que llegaron después conservan estado pendiente, no se cuentan como pérdidas.

Separar retorno total, retorno por evento programado y juego fuera de eventos sin recordatorio registrado. Las citas semanales pueden ser parte del valor; no presentar toda asistencia como retorno espontáneo. Registrar recordatorios generales y ayuda individual.

Para rewarded real: oferta elegible, aceptación, solicitud, fill, impresión reportada, grant, uso y error son eventos distintos. Los ingresos proceden de reportes conciliados del proveedor. Las demostraciones no generan ninguno de esos resultados comerciales.

Con una muestra pequeña, el análisis de anuncios será descriptivo. Para afirmar efecto incremental en retención o contribución se necesita asignación estable a una variante sin anuncios y comparación suficientemente madura; comparar quienes aceptan voluntariamente con quienes rechazan introduce selección.

## Decisión del día 30

| Resultado | Decisión |
| --- | --- |
| Hay segunda partida, retorno y repetición de comunidad dentro del esfuerzo acotado | Continuar un incremento de esta misma propuesta; mantener un solo juego |
| Hay uso, pero un obstáculo concreto domina abandono/ausencias | Corregir ese obstáculo y repetir con condiciones comparables |
| Se usa el entrenamiento y se comprende su carácter asistido | Mantenerlo como beneficio candidato; publicidad sólo si está aceptada y medida |
| El entrenamiento genera confusión o no se utiliza | Retirarlo o replantearlo antes de añadir otra recompensa |
| Se declara interés en ticket sin venta habilitada | Conservar como interés informado; validación de pago pendiente |
| No hay deseo de repetir después de corregir el bloqueo principal | Revisar propuesta y experiencia; no responder añadiendo juegos |
| No se consigue público adecuado | Revisar canal y segmento; no atribuir automáticamente el problema a 2048 |

La salida del mes debe responder por separado: **valor del gratuito, valor de la cita comunitaria, utilidad de la recompensa, monetización publicitaria observada y compra del ticket**. Una dimensión puede mostrar avance y otra seguir sin validar.

El siguiente feature sólo se acepta si responde a una conducta observada o un obstáculo recurrente, tiene una medida de resultado y cabe sustituyendo otra tarea dentro del presupuesto. La propuesta prioritaria permanece: **una buena experiencia de 2048 que la gente elige repetir y una comunidad que vuelve a competir.**
