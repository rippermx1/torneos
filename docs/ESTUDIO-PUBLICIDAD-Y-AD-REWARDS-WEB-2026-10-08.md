# Estudio de monetización con publicidad y recompensas web

Fecha: 8 de octubre de 2026. Producto: TorneosPlay. Evaluación de factibilidad; no activa publicidad, proveedores, recompensas ni dinero real.

## Dictamen

**Es técnicamente factible monetizar los juegos gratuitos con publicidad web. La rentabilidad todavía no está demostrada.** Recomiendo comenzar por patrocinio directo y un piloto de anuncios fuera de la partida de 2048 gratuito. Los anuncios con recompensa pueden añadirse después, limitados inicialmente a cosméticos personales sin ventajas ni conversión a dinero.

No recomiendo usar anuncios para entregar saldo, financiar individualmente una inscripción pagada, aumentar premios o mejorar resultados de torneos. Tampoco recomiendo insertar anuncios durante una partida competitiva. La publicidad no cierra los pendientes operativos y legales del programa de dinero real.

La prioridad comercial propuesta es:

1. Medir audiencia, retorno y oportunidades reales de exposición.
2. Ofrecer un espacio de patrocinio acotado, con precio por período y entregables verificables.
3. Ensayar publicidad programática en práctica gratuita, si el proveedor admite el sitio y su contexto comercial.
4. Ensayar rewarded web con una recompensa cosmética claramente separada del progreso competitivo.
5. Escalar solamente si el ingreso incremental supera costos y pérdidas de retención/conversión.

Este orden es una recomendación del estudio, no un despliegue ni una contratación aprobada.

## 1. Evidencia del producto y límites

Se inspeccionó `C:/torneos`, rama `codex/2048-clean-gameplay`, HEAD `c8d7e75`, incluyendo trabajo compartido sin confirmar. Se revisaron README, STATUS, UNITY-GAMES, catálogo, runtimes, patrocinio Snake, privacidad, CSP, analítica y el análisis comercial del 5 de octubre. Sólo se crean este informe y su modelo numérico; no se modifica ese trabajo compartido.

| Evidencia local | Consecuencia para publicidad |
|---|---|
| Next/Supabase/Flow; clientes Unity WebGL integrados mediante iframe | Se puede monetizar la web manteniendo cuentas y comercio fuera del juego |
| 2048: práctica gratuita sin premios; competencia con movimientos y puntuación autoritativos | La práctica es el primer candidato; mantener inalteradas las reglas competitivas |
| Ted Runner: práctica gratuita, resultado local | Apto para exposición entre intentos; su resultado no habilita premios |
| Factory Empire: campaña/colonia y desafío normalizado de 24 horas sin premios | Hay oportunidades cosméticas; cualquier progreso acelerado debe quedar fuera del desafío |
| Snake: práctica multijugador, torneos gratuitos, progreso y rankings | El anuncio debe esperar a que termine la participación activa; no se puede pausar unilateralmente una sala |
| `config/snake-practice-sponsor.json`: `enabled:false` y campos vacíos | Existe un componente preparado, no un patrocinio activo ni una integración con red publicitaria |
| Factory FE3D-13 y embudo Snake instrumentados | Hay elementos reutilizables, pero no una medición comprobada de toda la audiencia monetizable |
| RM-14 documenta IN_PROGRESS / NO_GO para dinero real | Monetizar práctica no habilita cobros ni pagos de premios |

`runtime-builds.json` identifica 2048 `unity-2048-007`, Ted `level-030`, Snake `snake-arena-014` y Factory `factory-empire-3d-054`. Eso identifica el checkout; no prueba que todas esas versiones estén en el sitio público. STATUS distingue la última Factory local de una publicación remota. El catálogo cloud-development también condiciona la disponibilidad de Ted y Snake.

La evaluación de hosting Snake deja pendiente un host persistente y su ensayo por Internet. Su ingreso publicitario deberá cubrir también ese costo; no asumir que la publicación de la web resuelve la autoridad de las salas.

**El propietario confirmó durante este estudio que la audiencia todavía no se mide.** No se consultaron analíticas privadas, cuentas de anuncios ni facturación del producto. No se validaron anuncios reales, navegadores con SDK, ingresos, inventario disponible o contratos. Los datos de audiencia, país, retención, costos y aprobación del proveedor permanecen pendientes. Las cifras posteriores son escenarios, no un pronóstico.

## 2. Compatibilidad con torneos y dinero real

Hay tres decisiones independientes: legalidad de la modalidad, aceptación del contenido por la red y diseño de la recompensa. Aprobar una de ellas no aprueba las otras.

### Torneos pagados con premios

Google Publisher Restrictions incluye juegos de Internet donde se paga dinero u otros elementos de valor para tener la oportunidad de ganar dinero o premios según el resultado. La definición no se limita a casinos ni exige que el resultado sea azaroso. Chile no figura en las exclusiones territoriales enumeradas. El formato documentado de inscripción pagada y premio fijo presenta, por tanto, **un riesgo concreto de quedar restringido**: es una inferencia de la política sobre este producto, no una clasificación emitida por Google. La restricción reduce las fuentes de demanda y puede dejar sin anuncios; no equivale por sí misma a prohibición universal de monetización. [Restricciones oficiales de Google](https://support.google.com/publisherpolicies/answer/10437795?hl=en).

Solicitar evaluación del sitio describiendo expresamente práctica, torneos, inscripciones y premios. Limitar el código de anuncios a rutas gratuitas ayuda a delimitar inventario, pero no garantiza aprobación de la cuenta o del dominio. No ocultar la modalidad comercial ni abrir otro dominio para eludir una clasificación.

Google también prohíbe monetizar contenido ilegal. La aceptación publicitaria no sustituye la revisión jurídica chilena pendiente. La SCJ distingue los juegos de azar por el papel esencial del acaso: llamar al producto «habilidad» no resuelve automáticamente su calificación. [Publisher Policies](https://support.google.com/publisherpolicies/answer/10502938?hl=en), [definición de SCJ](https://www.scj.gob.cl/juegos-de-azar/).

Las políticas de Google Ads para **comprar campañas** son un régimen distinto de las políticas para **recibir ingresos como publisher**. Tampoco aplicar las reglas de Google Play como si fueran reglas de publicación de una web. [Política de campañas Google Ads](https://support.google.com/adspolicy/answer/15132179?hl=en).

### Qué entregar por ver publicidad

Google prohíbe recompensas monetarias directas, como efectivo, criptomonedas y tarjetas regalo. Admite determinados beneficios indirectos o no monetarios, utilizables dentro de la plataforma y no transferibles. Exige explicar la recompensa, participación voluntaria, continuidad normal si se rechaza y entrega del beneficio prometido. [Política de anuncios con recompensa](https://support.google.com/adsense/answer/9121589?hl=en).

Para TorneosPlay propongo esta política inicial de producto:

| Beneficio | Decisión propuesta | Motivo |
|---|---|---|
| Tema del tablero, marco de perfil o apariencia de práctica | Candidato | Personal, cosmético y sin efecto en resultados; sujeto a aceptación de proveedor |
| Revivir o deshacer una jugada en práctica sin clasificación | Evaluar después | Cambia el juego; exige modo separado y ninguna publicación como resultado oficial |
| Acelerar producción en Factory | Posponer | Puede alterar progreso/comunidad; necesita aislamiento comprobado de desafíos y rankings |
| XP o monedas existentes de Snake | Posponer | Primero demostrar todos sus usos; no asumir que una moneda es puramente cosmética |
| Saldo retirable, efectivo, cripto o tarjeta regalo | Excluir | Recompensa monetaria; no implementar ese circuito |
| Crédito de inscripción, entrada a torneo pagado o beneficio canjeable por premios | Excluir del piloto | Mezcla recompensa publicitaria con participación monetaria; no se declara permitido por la política |
| Vida extra, puntos, mejores semillas o multiplicador en una competencia | Excluir | Rompe la comparación entre participantes |

No todo beneficio indirecto está prohibido: **la exclusión de créditos de torneo es una decisión conservadora de producto**, ante una modalidad monetaria sin aceptación específica. No se presenta como una prohibición literal de todos los descuentos digitales.

### Torneos gratuitos patrocinados

Es viable estudiar un patrocinador que pague por presencia de marca y financie un evento gratuito. Un importe de patrocinio contratado es distinto de prometer una recompensa al jugador por ver anuncios.

El piloto recomendado no entrega premios monetarios. Si más adelante se propone un premio en dinero o especie, requiere revisión específica de bases, legalidad, proveedor y presupuesto. La entrada gratuita no garantiza automáticamente aceptación. Los premios se comprometen con financiamiento disponible; nunca con una proyección incierta de impresiones del evento. Ver o clicar publicidad no debe cambiar acceso, clasificación ni probabilidades.

## 3. Compatibilidad por juego y superficie

Las valoraciones son propuestas de diseño, sujetas a una integración posterior.

| Juego / modo | Ubicación inicial | Rewarded posible | Límites y prioridad |
|---|---|---|---|
| 2048 gratuito | Catálogo o resultado fuera del tablero; entre partidas | Tema visual personal | **Primera prioridad:** no requiere modificar puntuación ni autoridad |
| 2048 competitivo | Patrocinio estático informativo antes/después, si es aceptado | Ninguno en el piloto | Sin pausas, overlays, ventajas o dependencia del SDK; programática excluida inicialmente |
| Ted Runner gratuito | Resultado o transición entre intentos | Apariencia; revivir sólo en un modo no clasificado futuro | Segunda prioridad cuando la build esté publicada y verificada; evitar anuncios sobre controles táctiles |
| Snake práctica | Resultado, después de muerte/salida confirmada | Cosmético que preserve hitbox, velocidad, visibilidad y legibilidad | El bloque de patrocinio ya existe; publicación y continuidad del host son requisitos adicionales |
| Snake torneo gratuito / rankings | Lobby antes de admitir jugadores o resultado final | Ninguna ventaja | No anuncios en cuenta regresiva ni criatura activa; no alterar XP/ranking por publicidad |
| Factory campaña | Pantalla de entrada/salida o panel externo al mundo | Apariencia de colonia sin efecto económico | Retención y diversión aún no demostradas; evitar fabricar una carencia para vender su alivio con anuncios |
| Factory desafío 24 h | Antes del inicio explícito o después del cierre confirmado | Ninguna ventaja | No cambiar seed, tiempo efectivo, producción, puntuación o estado importado |
| Prototipos no incluidos en catálogo | Ninguno inicialmente | Pendiente | No agregar SDK antes de contar con juego publicable y recorrido comprobado |

Excluir anuncios de autenticación, checkout Flow, billetera, KYC, descargas privadas, soporte y administración. Mantener el área de juego y sus controles libres de banners y enlaces publicitarios. No colocar un anuncio pegado a «Reiniciar», «Confirmar» o controles de acción: crea riesgo de clic accidental. [Política de ubicaciones AdSense](https://support.google.com/adsense/answer/1346295?hl=en).

El componente Snake actual identifica «Publicidad», abre el enlace como patrocinado y no carga SDK, imágenes remotas o tracking. Es una base aprovechable para patrocinio directo, aunque todavía falta oferta comercial, configuración y un patrocinador real.

## 4. Proveedores y formatos

| Alternativa | Compatibilidad comprobada en documentación | Condición comercial / conclusión |
|---|---|---|
| Patrocinio directo | Componente propio fuera del juego | Mayor control y poca integración; demanda, precio y contratación sin demostrar. Primera opción a validar |
| AdSense display | Publicidad de contenido web | Cuenta/sitio elegibles y aprobación. Usar inventario gratuito delimitado; aprobación no garantizada |
| AdSense H5 Games Ads | Intersticiales y rewarded con Ad Placement API | Producto por solicitud y cuenta AdSense aprobada. Mejor ajuste específico a juegos web propios |
| Ad Manager + GPT rewarded web | Inventario desktop, móvil y tablet; formato en páginas optimizadas para móvil | Alternativa si se dispone de demanda y operación de Ad Manager; no es garantía de fill ni ingresos |
| Unity Ads SDK | iOS/Android; WebGL no soportado | **Descartado para la web actual**. Que el cliente sea Unity no lo vuelve compatible con ese SDK |
| CrazyGames / Poki | Portales con sus SDK y monetización | Canal de distribución de una versión gratuita; no un reemplazo directo para monetizar toda la plataforma propia |
| GameDistribution | SDK Unity WebGL, incluidos rewarded | Distribución e integración dentro de su red; revisar autorización del dominio, licencias y contrato antes de elegir |
| Playwire / Venatus | Servicios para publishers, incluidos gaming/web | Evaluar con audiencia real y oferta concreta; no asumir admisión, tarifa o condiciones para Chile |

Fuentes de formatos y acceso: [elegibilidad AdSense](https://support.google.com/adsense/answer/9724/eligibility-requirements-for-adsense?hl=en), [solicitud H5 Games Ads](https://support.google.com/adsense/answer/1705831?hl=en), [H5: formatos y uso](https://support.google.com/adsense/answer/9959170?hl=en), [GPT rewarded](https://developers.google.com/publisher-tag/samples/display-rewarded-ad), [Unity Ads: plataformas](https://docs.unity.com/en-us/grow/ads/references/faq).

**Detalles que cambian la decisión:**

- Ad Manager documenta rewarded web en desktop, móvil y tablet. El ejemplo GPT exige páginas optimizadas para móvil y permite que la creación del slot devuelva `null`. No significa «sólo teléfonos»; hay que ensayar compatibilidad y ausencia de inventario en cada navegador. [Ad Manager web](https://support.google.com/admanager/answer/9116812).
- CrazyGames sólo admite anuncios de su SDK; Basic Launch no comparte ingresos. Sus reglas de cuentas requieren integración con su sistema y restringen login externo. Una cápsula gratuita invitado de 2048/Ted encaja mejor que trasladar directamente Auth/Flow/KYC. [Anuncios CrazyGames](https://docs.crazygames.com/requirements/ads/), [cuentas CrazyGames](https://docs.crazygames.com/requirements/account-integration/).
- Poki monetiza con su SDK y no admite compras dentro del juego ni sistemas publicitarios de terceros en esa modalidad. La distribución requiere acuerdo; no asumir que sirve para instalar anuncios en torneosplay.cl. [Monetización Poki](https://developers.poki.com/guide/how-monetization-works).
- GameDistribution publica un SDK específico para Unity WebGL. Su existencia demuestra posibilidad técnica, no autorización del producto comercial ni del uso de cada asset en una red de distribución. [SDK oficial](https://github.com/GameDistribution/gd-sdk-unity).
- Playwire publica cifras de admisión diferentes: su página de criterios sugiere 100.000 pageviews; su FAQ menciona 500.000 mensuales y presencia en países angloparlantes. Confirmar con la empresa el criterio aplicable; no usar ninguno como requisito universal de publicidad web. Venatus requiere evaluación comercial; no se verificó un mínimo aplicable a este producto. [Criterios Playwire](https://www.playwire.com/qualification-criteria), [FAQ Playwire](https://www.playwire.com/faq), [Venatus](https://www.venatus.com/).

No seleccionaría una mediación compleja inicialmente. Primero comprobar una ubicación, una fuente de demanda y una recompensa. Los SDK de portales corresponden a adaptadores de distribución del juego original, conservando su fuente y licencias, sin reconstruir una segunda copia ni trasladar las funciones comerciales a Unity.

## 5. Cambios técnicos necesarios

### Integración web y Unity

Para patrocinio estático y display de página, la presentación vive en Next fuera del canvas. Para H5, la API y el tag deben compartir el documento del canvas: en los juegos actuales sería el HTML de la cápsula iframe. La UI de consentimiento/oferta puede mantenerse en la web y comunicar sólo eventos acotados al juego. No basta insertar un tag en el layout global. Google también documenta `allow="autoplay"` para determinadas demandas de iframe. [Estructura oficial H5](https://developers.google.com/ad-placement/docs/html5-game-structure).

La CSP del contenedor está en `lib/security/csp.ts` y la de cápsulas en `next.config.ts`. La actual allowlist de conexiones/imágenes de las cápsulas no admite los recursos externos publicitarios. Una integración debe definir permisos por proveedor y superficie; conservar nonce, comprobación de origen/emisor y separación de APIs privadas. Evitar abrir globalmente `connect-src *` o desactivar CSP. Un SDK tercero ejecuta código: no cargarlo en pantallas con datos bancarios/documentos ni enviar tokens, RUT, correo, KYC o saldo como targeting.

Cada build publicada es inmutable: una integración H5 necesita nuevo ID, manifiesto y pruebas. No modificar una cápsula histórica en sitio. Un iframe del mismo origen no es por sí solo una frontera de privacidad contra scripts de terceros; revisar acceso al contexto de cuenta y, si el proveedor lo permite, considerar aislamiento de origen para la superficie publicitaria gratuita. Eso requiere diseño y pruebas propios, no una migración a microservicios.

### Estado y recompensas

Proponer un adaptador pequeño con estados: desactivado → disponible → oferta aceptada → mostrando → concedido/cerrado/error. El SDK tiene timeout y recuperación; una caída, rechazo, adblock o no-fill deja jugar normalmente. Silenciar/restaurar audio sólo cuando corresponda. En una sala Snake viva no pausar cliente mientras el servidor continúa: esperar a salir de juego activo. En Factory, la simulación/tiempo debe conservar las reglas originales.

La concesión debe usar el evento de recompensa del proveedor, no un click, un temporizador propio ni el simple cierre. Para GPT es `rewardedSlotGranted`; la finalización de vídeo puede no coincidir con la concesión. **Ad Manager no ofrece server-side verification para web.** Llevar la solicitud a nuestro servidor no convierte ese evento del navegador en prueba verificable de visionado. [Eventos y límite de verificación](https://support.google.com/admanager/answer/9116812).

Un eventual cosmético persistente necesita catálogo allowlisted, recompensa personal, intento con caducidad emitido por servidor, concesión idempotente, límites, auditoría mínima y recuperación si falla el guardado. Esto reduce abuso y duplicación; no elimina falsificación de callbacks. Aceptar sólo beneficios de bajo impacto y sin transferencia; no conectarlos al ledger monetario, Flow o liquidación de premios. Si otro proveedor ofrece verificación server-to-server para **su producto web**, comprobarla antes de atribuirle garantías.

Conservar el mismo beneficio prometido aunque ocurra un fallo transitorio de nuestra persistencia; permitir resolver el reclamo sin exigir otro anuncio. Ofrecer el rewarded sólo cuando haya inventario y un beneficio realmente disponible; ante rechazo o cierre antes de la concesión, continuar sin ese extra.

### Privacidad y operación

La privacidad del checkout compartido afirma que no se usan cookies de seguimiento de terceros ni publicidad comportamental (`app/legal/privacidad/page.tsx`, sección 9). Esa afirmación necesita revisión antes de integrar una red que introduzca esos tratamientos. La candidata RM-14 tiene documentación distinta y no debe asumirse integrada en esta rama; revisar la versión efectivamente desplegada al implementar.

Definir inventario de datos/proveedores, finalidad, conservación, transferencias, retiro del consentimiento y borrado de registros publicitarios. No confundir aceptar términos, consentir tracking y optar por ver un rewarded. Publicidad no personalizada tampoco equivale automáticamente a ausencia de almacenamiento o tratamiento técnico.

Para publicidad personalizada de Google a usuarios del EEE, Reino Unido y Suiza se exige CMP certificada e integrada con TCF. El país de la empresa no sustituye el país del visitante. [Requisitos CMP](https://support.google.com/adsense/answer/13554116?hl=en).

En Chile, revisar el tratamiento bajo la Ley 19.628 y preparar la transición a la Ley 21.719, cuya entrada en vigor figura para el **1 de diciembre de 2026**. Diseñar el piloto con la transición cercana, sin asumir que una CMP certifica toda la conformidad jurídica. [Ley 19.628](https://www.bcn.cl/leychile/Navegar?idNorma=141599), [Ley 21.719](https://www.bcn.cl/leychile/Navegar?idNorma=1209272&idVersion=2026-12-01).

El onboarding monetario exige mayoría de edad; la práctica pública puede visitarse sin cuenta. No asumir por ello una audiencia verificada 18+. Definir edades y configuración de menores antes de segmentar anuncios. No convertir KYC en requisito de práctica sólo para obtener datos publicitarios.

Identificar claramente patrocinio/publicidad, separar controles y verificar creatividades, enlaces y categorías de marca. Proponer bloquear apuestas, promesas financieras engañosas y otras categorías incompatibles con el público. Habilitar reporte de anuncios y apagado operativo por juego/formato. [SERNAC: publicidad y prácticas comerciales](https://www.sernac.cl/portal/618/w3-article-65391.html), [circular sobre publicidad nativa](https://www.sernac.cl/portal/618/articles-65742_archivo_01.pdf).

## 6. Economía: cuánto podría aportar

No se encontró un eCPM comprobado para TorneosPlay. **Los importes de esta sección son valores elegidos para sensibilidad, no tarifas de Google, una cotización ni un benchmark chileno.** Se expresan en USD, sin conversión cambiaria ni estimación tributaria.

DAU significa promedio de jugadores activos al día durante 30 días; no usuarios registrados ni visitantes únicos mensuales. Se cuenta una impresión publicitaria sólo cuando se muestra; una oportunidad, una carga de juego o un evento del cliente no equivalen a ingreso conciliado.

```text
Impresiones display/mes = DAU × 30 × sesiones/día × oportunidades/sesión
                         × elegibilidad × sin-adblock × fill × render
Impresiones rewarded/mes = la misma fórmula × aceptación de la oferta
Ingreso = impresiones display × eCPM neto display / 1.000
        + impresiones rewarded × eCPM neto rewarded / 1.000
Margen incremental = ingreso conciliado - costos incrementales
                     - pérdida de contribución de otros canales
```

eCPM neto aquí significa ingreso atribuible al publisher después de la participación de la red y ajustes incluidos en ese importe; no descontar nuevamente esas comisiones. Impuestos, costos bancarios/cambio y mínimos/plazos de liquidación requieren el contrato real. No usar una promesa de eCPM bruto como si fuera dinero disponible.

### Supuestos comunes ilustrativos

| Variable | Valor elegido |
|---|---:|
| Sesiones por jugador activo/día | 2 |
| Oportunidades display por sesión | 2 |
| Oportunidades rewarded por sesión | 1 |
| Aceptación rewarded | 25% |
| Fracción elegible por política/región/consentimiento | 80% |
| Fracción sin bloqueo de anuncios, condicionada a elegibilidad | 90% |
| Fill de solicitudes elegibles | 70% |
| Render efectivo de anuncios llenados | 95% |
| Concesión/completitud sobre rewarded mostrados, sólo para medir beneficios | 80% |

Estos factores son aproximaciones condicionales de un embudo. Al medirlos, usar denominadores consistentes y no restar adblock/consentimiento dos veces. La concesión del beneficio no se multiplica otra vez en ingresos: el modelo usa impresiones mostradas y un eCPM efectivo por esas impresiones. Si el contrato usa otro denominador, adaptar la fórmula.

Los escenarios suponen suficiente inventario gratuito y oportunidades distintas. No sirven para estimar publicidad en torneos restringidos. Tampoco proponen mostrar display e intersticial/rewarded encadenados en el mismo resultado. Un piloto con una sola ubicación obtendrá menos inventario que este modelo combinado.

| Escenario de tarifas hipotéticas | Display, USD/1.000 impresiones | Rewarded, USD/1.000 impresiones |
|---|---:|---:|
| Bajo | 0,50 | 2,00 |
| Base | 2,00 | 5,00 |
| Alto | 5,00 | 10,00 |

| DAU promedio | Display mostrados/mes | Rewarded mostrados/mes | Ingreso bajo USD/mes | Base USD/mes | Alto USD/mes |
|---:|---:|---:|---:|---:|---:|
| 100 | ≈5.746 | ≈718 | 4,31 | 15,08 | 35,91 |
| 1.000 | 57.456 | 7.182 | 43,09 | 150,82 | 359,10 |
| 10.000 | 574.560 | 71.820 | 430,92 | 1.508,22 | 3.591,00 |

Con 1.000 DAU, el base se compone de **USD 114,91 display + USD 35,91 rewarded**. Es una simulación aritmética. Aún hay que descontar infraestructura, soporte, implementación/mantenimiento, privacidad, fraude y cualquier adquisición incremental. No hay evidencia para declarar que ads financiarán desarrollo o premios.

Para cubrir un costo incremental hipotético de USD 100/mes, el base requiere unos **664 DAU promedio**; para USD 500, **3.316 DAU**. Ambos umbrales excluyen otros costos y pérdida comercial, mantienen todos los supuestos constantes y no constituyen objetivos aprobados. En una plataforma nueva con cambios de geografía/fill, no extrapolar linealmente.

### Implicaciones comerciales

- Sesiones largas de Factory no generan muchas pageviews automáticamente. El inventario depende de transiciones aceptables y ofertas voluntarias, no de refrescar anuncios para inflar impresiones.
- El base equivale a unos USD 0,005 por día de jugador activo. Diez días activos aportarían aproximadamente USD 0,05 antes de costos bajo estos supuestos. La adquisición pagada requiere LTV real; comprar tráfico no se justifica sólo por visitas.
- Rewarded con cosméticos puede tener baja aceptación si la apariencia no importa al jugador. Mejorar atractivo es legítimo; reducir deliberadamente la experiencia normal para forzar anuncios perjudica el producto.
- Patrocinio por período puede evitar depender de grandes volúmenes de impresiones. Su valor depende de comunidad, afinidad y entregables, y requiere venderlo. No se ha demostrado disposición a pagar de marcas.
- Un torneo patrocinado tiene su propia cuenta: ingreso neto del patrocinio menos producción, operación, soporte, promoción y premios comprometidos. La factibilidad del formato pagado documentado no se transfiere automáticamente a ese nuevo servicio.
- Definir quién contrata, factura y recibe las liquidaciones; no mezclar ingresos publicitarios con pasivos de premios ni prometer liquidación inmediata. La proyección no constituye criterio tributario o un cierre contable.

El archivo `ESTUDIO-PUBLICIDAD-Y-AD-REWARDS-WEB-2026-10-08.modelo.json` conserva supuestos y resultados sin redondear para sustituirlos por datos reales.

## 7. Propuesta de implementación por incrementos

| Incremento propuesto | Entrega | Evidencia para avanzar |
|---|---|---|
| ADS-01 — audiencia y oferta de patrocinio | Medición por juego/modo/país/dispositivo; línea base D1/D7 y sesiones; ficha comercial de patrocinio con ubicaciones, período y métricas | Cohorte real separada de QA/bots; costos e inventario útiles conocidos; oferta revisable |
| ADS-02 — piloto display o patrocinio | Una ubicación externa de 2048 gratuito; patrocinio Snake sólo cuando pueda operar públicamente; configuración desactivable por ambiente | Privacidad efectiva, creatividades, contrato/aprobación según formato y continuidad sin anuncio |
| ADS-03 — rewarded cosmético | Una recompensa concreta personal, catálogo y estados; consentimiento, persistencia/idempotencia si corresponde | Rechazo/no-fill/error/duplicado/recarga/sesión revocada; beneficio entregado una vez; ningún cambio económico o competitivo |
| ADS-04 — medición comercial | Piloto real, inicialmente 14–28 días tras obtener audiencia y acceso al proveedor; comparación con grupo sin anuncios | Ingresos reconciliados, retorno, abandono, costos y conversiones por cohorte; ampliar ventana si faltan muestras |
| ADS-05 — expansión | Nuevos juegos y formatos según rendimiento observado | Margen positivo y preservación de experiencia; hosting Snake y dispositivos reales verificados |

Los IDs ADS son una propuesta de este estudio, no un nuevo roadmap ya aprobado ni sustitutos de RM-14. La selección entre display y patrocinio depende de admisión y demanda: si no hay red o sponsor, se puede completar ADS-01 sin simular ingresos.

**Primer alcance recomendado:** práctica 2048 sin premios, anuncio externo en resultado o catálogo con contenido útil, sin SDK global, sin ventajas y sin cambios al ledger. Mantener patrocinio directo como alternativa. No empezar por boosts de Factory ni por rewarded de monedas existentes.

En develop usar mocks o el modo de prueba oficial, no impresiones/clics monetizados del equipo o pruebas automatizadas. H5 ofrece `data-adbreak-test="on"`, con escenarios de anuncio disponible/no disponible; eso prueba integración cliente, no aprobación o fill real. [Modo de prueba H5](https://developers.google.com/ad-placement/docs/test). La activación pública requiere evaluar la superficie final y las condiciones del proveedor. Las políticas AdSense prohíben clics propios e inflación artificial del tráfico. [Políticas del programa](https://support.google.com/adsense/answer/48182?hl=en).

## 8. Medición, aceptación y asuntos abiertos

Separar los siguientes eventos: oportunidad, elegibilidad, oferta, aceptación, solicitud, fill, impresión reportada por SDK, grant, persistencia del beneficio, cierre y error. Conciliar impresiones/ingresos con el reporte del proveedor; telemetría propia no demuestra pagos. Medir sesión siguiente, D1/D7, abandono tras anuncio, disposición a repetir y coste de soporte. Preservar la atribución del embudo comercial sin enviar datos sensibles a la red.

Diseño del ensayo: un grupo control sin anuncios y uno con una sola ubicación, asignación consistente por jugador cuando sea posible, desglose por juego/país/dispositivo y exclusión explícita de desarrollo/QA/tráfico inválido. No inferir causalidad comparando semanas con audiencias diferentes. Con poco tráfico, empezar por usabilidad y demanda; ampliar el período antes de afirmar diferencias estadísticas.

Antes del piloto, el propietario debe definir presupuesto máximo y tolerancias de abandono/retención/rendimiento. Este estudio no aprueba un SLO ni inventa márgenes aceptables. Apagar inmediatamente ante alteración de resultados, cobros/recompensas monetarias indebidas, exposición de datos, oferta engañosa o fallos que impidan continuar.

| Asunto abierto | Qué falta para decidir |
|---|---|
| Audiencia y rentabilidad | DAU/MAU, países, sesiones, oportunidades, adblock y D1/D7 reales; costos completos |
| Aceptación de red | Cuenta, sitio, inventario gratuito y contexto de torneos evaluados; no se presentó solicitud |
| Patrocinio | Interés de marcas, precio, contrato, entregables y medición; componente actual sigue desactivado |
| Privacidad | Documento desplegado, configuración de tratamiento/consentimiento y transición normativa revisados |
| Rewarded | Elegir cosmético concreto; trazabilidad de todos sus usos; experiencia y abuso web comprobados |
| Publicación y operación de juegos | Distinguir build local, disponibilidad cloud y dispositivos; host Snake aún pendiente según documentos |
| Licencias/distribución | Revisar derechos de arte/audio y alcance del portal elegido; no se enviaron assets locales a terceros |
| Dinero real | Revisión legal, financiera y operacional del circuito RM permanece independiente y abierta |

**Decisión recomendada:** avanzar en medición y diseño de patrocinio/piloto gratuito. La publicidad es una fuente complementaria plausible; todavía no hay datos que permitan tratarla como negocio rentable ni como financiación segura de torneos con dinero real.

## Referencias internas para continuar

- `docs/STATUS.md` y `docs/UNITY-GAMES.md`: estado local, publicación y límites por juego.
- `components/game/public-game-catalog.tsx` y `lib/game/runtime-builds.json`: modalidades y cápsulas del checkout.
- `docs/SNAKE_ARENA_RESULT_SPONSOR.md`, componente y configuración homónimos: patrocinio preparado/desactivado.
- `docs/SNAKE_ARENA_HOSTING_ASSESSMENT.md`: continuidad y costos del alojamiento Snake.
- `docs/ANALISIS-PRODUCTO-VIABILIDAD-2026-10-05.md`: modelo comercial anterior; sus supuestos no son ingresos de publicidad.
- `docs/RM14-CUENTAS-DATOS-Y-ATENCION.md`: implementación de desarrollo y NO_GO monetario.
- `app/legal/privacidad/page.tsx`, `lib/security/csp.ts`, `next.config.ts`: cambios a evaluar antes de cargar SDK externos.
- `lib/analytics/factory-sessions.ts` y `lib/analytics/snake-funnel.ts`: instrumentación existente; sus datos/eventos no prueban audiencia monetizable ni ingresos publicitarios.

Fuentes externas primarias consultadas el 8 de octubre de 2026, enlazadas junto a cada hallazgo. Las páginas de ayuda pueden mantener versiones o fechas internas anteriores; se tomó la documentación accesible al realizar este estudio. No se usaron tarifas de terceros ni afirmaciones de foros como evidencia de rentabilidad.
