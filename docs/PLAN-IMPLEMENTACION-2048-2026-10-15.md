# Plan de implementación de 2048 para Torneos

Fecha: 15 de octubre de 2026. Deriva del [plan comercial de 30 días](PLAN-COMERCIAL-2048-30-DIAS-2026-10-15.md).

**Implementar primero práctica con progreso personal y medición, después un reto gratuito real, y finalmente entrenamiento recompensado y presentación de tickets. Cada incremento debe poder revisarse funcionando antes de abrir el siguiente alcance.**

Este documento es un plan ejecutable; no implementa ni activa las funciones. El ensayo usa un solo juego, el proyecto Unity existente y el monolito actual.

## Base de trabajo y resultado esperado

Al revisar este plan, el checkout compartido está en `codex/2048-clean-gameplay`, HEAD `c8d7e7515d18911de42099d8fe24ac8e7cf10d63`, con 416 entradas de estado previas. Existe otra candidata, `codex/real-money-access`, HEAD `1005495124a73e761a3f61da5ae7b06f195ed884`, con correcciones de acceso/operación monetaria.

Antes de editar, identificar una candidata aislada compatible con el 2048 actual y los contratos necesarios de acceso. Incorporar sólo dependencias justificadas; no aplicar todo el WIP, sobrescribir juegos o asumir que el árbol local representa el deploy público.

La cápsula 2048 puede conservarse inicialmente. El host controla la práctica y Unity renderiza los estados; marcas, entrenamiento, oferta de anuncios y navegación pueden añadirse en la web. La restauración debe probarse con WebGL real. Cambios dentro del canvas o incompatibilidad observada podrían requerir recompilar el proyecto Unity original.

El producto mínimo del mes será:

- Práctica ilimitada con récord local sin ayuda y resultado accionable.
- Medición que permite distinguir apertura, juego, repetición y regreso.
- Dos retos gratuitos legítimos, sin premio, abiertos los días 14 y 21.
- Entrenamiento opcional con una jugada alternativa, si cabe después de asegurar lo anterior.
- Integración publicitaria real sólo con proveedor aceptado; en otro caso, demostración identificada.
- Ficha de torneo con ticket y disponibilidad honesta, reutilizando el recorrido comercial existente.

## Orden de ejecución y presupuesto

Las horas siguientes son topes iniciales de asignación, **no estimaciones garantizadas de entrega**. Suman 50 horas, incluyendo integración, convocatoria y observación. Si una dependencia consume más, se reasigna presupuesto y se retiran funciones accesorias; no se extiende automáticamente el mes.

| Paso | Paquete | Dependencia | Tope inicial |
| --- | --- | --- | ---: |
| 0 | Candidata, inventario de runtime y contratos | Ninguna | 2 h |
| 1 | Práctica, marca e historial local, resultado | 0 | 6 h |
| 2 | Medición mínima y recopilación | 0; integrado con 1 | 4 h |
| 3 | Formato gratuito, ficha, inscripción y clasificación | 0; compatible con 1–2 | 6 h |
| 4 | Checkpoint y entrenamiento demostrable | 1 | 5 h |
| 5 | Adaptador de rewarded | 4; proveedor para modo real | 4 h |
| 6 | Oferta de ticket informativa | 1; reutilizar formato vigente | 3 h |
| 7 | Verificación integrada, convocatorias y análisis | 1–3 obligatorios; 4–6 recortables | 20 h |

Los seis primeros paquetes técnicos no tienen que terminar antes de empezar a observar usuarios. La primera entrega útil corresponde a 1–2. Los retos deben estar operables antes de abrir su convocatoria; una tarjeta con fecha no equivale a un torneo implementado.

Si el paso 3 excede las seis horas asignadas, se toman primero horas de 4–6. Su alcance incluye validación SQL y del recorrido, no sólo añadir un selector al administrador. Si aun así no cabe, el mes valida práctica/retorno y conserva **competencia no validada**.

## Paso 0 — Preparar una candidata coherente

**Entrega:** rama/candidata identificada, alcance de archivos y versión exacta del runtime, sin alteración de partidas o servicios compartidos.

Revisar fuentes, publicaciones y permisos necesarios. El checkout de juegos y la candidata RM no son intercambiables. Las correcciones de acceso existentes deben integrarse o reutilizarse donde correspondan antes de presentar el reto como recorrido servidor confiable.

Leer las guías de la versión instalada de Next antes de modificar rutas/componentes y seguir el flujo de migraciones Supabase. Generar las migraciones por la CLI, sin inventar timestamps ni aplicar automáticamente el historial completo. Distinguir preparación de SQL, ensayo local y aplicación al destino de desarrollo definido.

**Cierre:** fuentes y dependencias del incremento identificadas; runtime 2048 real disponible en el preview; entorno y alcance de integración conocidos. No requiere rehacer Factory, Snake, Ted o RTS ni cerrar toda la preparación monetaria para construir progreso local.

## Paso 1 — Práctica con marca y resultado útil

**Entrega:** jugar → ver progreso → repetir, con la marca conservada después de recargar.

Archivos existentes principales:

- [Sesión](../lib/game/unity-2048-session.ts).
- [Host](../components/game/unity-2048.tsx).
- [Resultado](../components/game/2048-game-result.tsx).

Nuevo módulo propuesto: `lib/game/2048-personal-progress.ts`, con contrato pequeño y validado de almacenamiento local.

Implementar:

1. Identidad estable de práctica, versión de reglas, estado sin ayuda/asistido, máximo puntaje y ficha máxima.
2. Hasta cinco entradas de historial, distinguiendo activa, terminada e interrumpida.
3. Actualización de marca desde movimientos válidos de práctica, sin esperar únicamente a perder.
4. Guardar la partida anterior antes de Nueva partida y usar el mismo recorrido en toolbar y panel final.
5. Persistencia de progreso al ocultar/salir, con upsert por identidad para evitar duplicados. Ocultar la pestaña no termina la partida; si el navegador la restaura desde bfcache se conserva la identidad activa. Esto guarda marca e historial, sin prometer restaurar el tablero de práctica después de una recarga.
6. Resultado con nueva partida, comparación personal y acceso al próximo reto cuando exista.

Escape y volver a la vista de página sólo cierran ampliación; no deben declarar terminada una partida. Al fallar o bloquearse el almacenamiento, se conserva el juego y se informa de que la marca no pudo guardarse.

**Pruebas necesarias:** marca antes de perder, reinicio, recarga, pausa/retorno, salida parcial, almacenamiento corrupto/bloqueado, duplicados y exclusión de torneo/entrenamiento. La marca local nunca se envía como resultado competitivo.

**Cierre visible:** una partida real modifica su marca; reiniciar/recargar la conserva; resultado y nueva partida funcionan en el host con el mismo runtime.

## Paso 2 — Medición de juego y regreso

**Entrega:** eventos consultables y un informe/CSV acotado del ensayo, con denominadores verificables.

Crear un módulo propuesto `lib/analytics/2048-sessions.ts` y un receptor de eventos en el monolito. Para recopilar observaciones públicas automáticamente, persistirlas en un almacén de desarrollo autorizado; no copiar el archivo JSON de una instancia de Snake como si fuera persistencia distribuida.

Separar almacenamiento de marcas personales y medición comercial. La colección debe ser recuperable/observable y no depender de que el jugador vuelva a exportar manualmente.

Eventos mínimos:

- Apertura, runtime listo, inicio y primer movimiento válido.
- Umbral de movimientos, fin, interrupción y nueva partida.
- Consulta de reto; inscripción, comienzo y cierre confirmados por servidor.
- Oferta, demostración o concesión real de entrenamiento; uso/error.
- Consulta de ficha de ticket; solicitud de aviso sólo si ese contrato está implementado.

Contexto mínimo: event ID, fecha UTC, identidad de navegador/sesión/partida, modo, build, versión de reglas, canal y categoría real/QA/demostración/proveedor. No guardar tablero, seed, RUT, documentos, banco o credenciales en analítica. Definir acceso, conservación y reflejar la recopilación en la información de privacidad aplicable.

Un `publish` del host no es un movimiento: también ocurre por reloj o preferencias. En práctica, registrar movimientos desde `next.moved`; para inscripción y resultados, usar confirmación servidor.

**Pruebas necesarias:** duplicados, reintentos, no-ops, nuevas partidas, recargas, categorías excluidas, D7 por America/Santiago y cohortes inmaduras. Un identificador de navegador no equivale a una persona única.

**Cierre visible:** una sesión de prueba aparece una vez en el informe, con inicio/repetición correctos; QA no se mezcla con la cohorte comercial. Si la colección falla, jugar sigue siendo posible y el informe conserva la pérdida como desconocida.

## Paso 3 — Reto gratuito real sin premio

**Entrega:** creación → inscripción → intento → clasificación, con entrada cero y premios cero.

Es el cambio estructural principal. Extender un formato gobernado nuevo de 2048 gratuito y no-test, conservando presets comerciales e históricos.

Revisar y ajustar:

- [Presets y validación de finanzas](../lib/tournament/finance.ts).
- [Tipos](../types/database.ts), creación administrativa y formularios.
- Restricciones de premio positivo y presets gobernados mediante una migración nueva.
- Registro, inicio, recuperación, movimiento, cierre y clasificación.
- Presentación pública, resultado final, notificaciones y adaptadores contables.

Contrato del formato:

- Entrada cero y los tres premios cero, rechazando combinaciones monetarias.
- Mínimo propuesto de dos inscritos y máximo de 15 para el piloto; el objetivo comercial de 12–15 participantes no se usa como mínimo financiero. Mantener una sola categoría, sin división por habilidad en este ensayo.
- Cinco minutos completos, un intento por cuenta y ventana de juego de 24 h.
- Inscripción previa; cierra al abrir la ventana.
- Último inicio nuevo admitido hasta cierre menos 300 segundos. La recuperación conserva identidad y deadline original.
- Puntaje servidor a partir de direcciones; clasificación provisional/oficial conforme al cierre.
- Resultado que reconoce puesto, puntaje y ficha; sin columna de premio o mensajes de dinero ganado.
- Cuenta habilitada y requisitos existentes de correo, mayoría de edad y términos; este formato no requiere pago, documentos bancarios o KYC monetario.
- El reto no modifica la división utilizada en torneos pagados. Comprobar esa exclusión en la finalización y los procesos de rating.

El finalizador actual contempla premio adjudicado cero y condiciona créditos a importes positivos. Reutilizarlo donde corresponda y comprobar que el formato nuevo realmente no produce obligaciones financieras. No es necesario inventar otro sistema de ranking.

**Pruebas necesarias:** formato válido y combinaciones rechazadas; roles/permisos efectivos; cupo y doble inscripción; intento único; último inicio permitido; recuperación; timeout y cierre idempotente; resultados oficiales; ausencia de Flow, créditos wallet, devoluciones o asientos monetarios. Probar también que presets pagados y freerolls históricos conservan sus reglas.

No utilizar `internal_test`, premio simbólico o versión anterior de política como sustituto del formato comunitario. [Schema inicial](../supabase/migrations/001_init_schema.sql) y [presets gobernados](../supabase/migrations/20260805181748_governed_tournament_presets_v3.sql) explican la dependencia.

**Cierre visible:** usuario real de ensayo se inscribe y termina un intento; el servidor publica la clasificación y el inspector confirma cero movimientos monetarios. La prueba técnica usa fixtures identificadas y separadas de jugadores reales.

## Paso 4 — Entrenamiento desde un checkpoint

**Entrega:** después de terminar una práctica, explorar una alternativa sin modificar el resultado original.

Implementarlo primero como demostración sin anuncio. Guardar una copia del estado anterior al último movimiento válido, incluyendo tablero, puntaje, seed, número de movimiento y dirección original. Una dirección sin efecto no reemplaza ese checkpoint.

Usar el motor existente para comprobar que alguna dirección alternativa permite continuar. La simulación no muta la partida. Si todas terminan inmediatamente, no ofrecer el beneficio.

Cerrar el resultado legítimo, abrir una continuación con identidad propia y marcarla como asistida de forma irreversible. Una sola restauración; ninguna continuación asistida actualiza marca general, clasificación, premio o intento. Nueva partida normal vuelve al modo sin ayuda.

**Pruebas necesarias:** copia independiente de arrays, restauración exacta del RNG, no-ops, alternativa útil, consumo único, nueva partida durante una oferta, exclusión de marcas y rechazo cuando existe configuración competitiva. Confirmar snapshot restaurado, bloqueo, foco y entradas con WebGL real.

**Cierre visible:** una partida terminada conserva su resultado; la continuación muestra Entrenamiento, permite otra dirección y no contamina récords o torneos.

## Paso 5 — Adaptador de anuncios recompensados

**Entrega:** conectar el beneficio ya probado a tres estados explícitos: desactivado, demostración y proveedor real.

Nuevo contrato propuesto: `lib/ads/rewarded.ts`, fuera de Unity. Evitar cargar el SDK globalmente en rutas competitivas.

Cada oferta y solicitud debe vincularse a la partida original y checkpoint. Distinguir disponibilidad, rechazo, cierre, ausencia de anuncio, error y concesión. Una concesión duplicada no duplica el beneficio y un callback tardío no restaura otra partida. Resolver el comportamiento de concesiones tardías en el contrato antes de integrar el proveedor.

Límite exploratorio: una concesión por partida original y dos al día; fallos/rechazo no consumen concesiones. El reinicio gratuito sigue disponible.

El modo real requiere proveedor aceptado y revisión de privacidad, CSP, iframe, foco/audio y carga. La demostración permanece rotulada y sus eventos no cuentan como impresión, grant publicitario ni ingreso. El callback web nunca habilita entradas, saldo, premios o ventajas competitivas.

**Pruebas necesarias:** duplicados/tardíos, cambio de partida, cierre sin grant, no-fill, error, bloqueo publicitario, retorno de foco y uso normal conservado. Para el proveedor, usar su modo de prueba durante QA.

**Cierre visible:** la misma función de entrenamiento opera con el adaptador; la interfaz y el informe distinguen demostración de publicidad real. Si la red no está aceptada, se entrega sólo demostración y se mantiene monetización no validada.

## Paso 6 — Vincular la oferta de ticket

**Entrega:** desde la práctica y los resultados, consultar una oferta completa y honesta.

Reutilizar ficha, autenticación y checkout existentes; no construir otro sistema de pagos o una billetera de anuncios. El preset comercial actual tiene duración/precio/premios propios y no cambia automáticamente por crear el reto gratuito.

Mientras el ticket no esté habilitado, mostrar estado no disponible y condiciones propuestas. Puede añadirse aviso voluntario sólo si también se implementan su recepción, consentimiento y conservación; no contar un clic como una suscripción recibida.

La compra real utiliza las condiciones, elegibilidad, confirmación Flow y operación existentes cuando estén aceptadas. El alcance del mes no incluye rehacer ni dar por cerrada la preparación de dinero real.

**Pruebas necesarias:** precio/duración/premios desde contrato servidor, estado no disponible, conservación del destino de login, ausencia de checkout activo cuando no corresponde y exclusión de grants publicitarios como elegibilidad/pago.

**Cierre visible:** jugador comprende la oferta y su disponibilidad. El informe registra interés informado; ventas sólo si posteriormente hay compras efectivas autorizadas y servicio entregado.

## Paso 7 — Integrar y ejecutar el ensayo

**Entrega:** una candidata identificada y dos actividades reales del mismo 2048.

Antes de la primera convocatoria, comprobar:

1. Build Next, tipos, lint de fuentes aplicables y pruebas pertinentes.
2. Runtime WebGL exacto, archivos servidos y bridge, no sólo HTML de página.
3. Recorrido gratuito completo: práctica → marca → resultado → inscripción → intento → clasificación.
4. Permisos reales de Auth/Data API y contrato SQL en desarrollo autorizado.
5. Entrenamiento/ads sólo si están listos; con sus categorías y exclusiones comprobadas.

Una ronda integrada de navegador debe cubrir escritorio, disposición móvil, teclado, foco, ampliación, pausa y recuperación. El navegador emulado no sustituye teléfono físico o aceptación humana; no se vuelven a pedir al propietario como requisito ceremonial. Las sesiones del público y los dispositivos que se usen se registran con su alcance real.

Si la cápsula no cambió, verificar su identidad y comportamiento sin reconstruir Unity por rutina. Si un cambio de cliente resulta necesario, agrupar compilación y pruebas Editor/Play Mode en una ronda útil del proyecto original.

Activar la candidata del ensayo en el destino de desarrollo definido sin sobrescribir otros juegos o aliases ajenos. Publicar fechas sólo para un recorrido comprobado. No ejecutar scripts de smoke que crean datos sobre el entorno compartido como si fueran lecturas inocuas.

Operar retos de días 14 y 21, registrar convocatoria/asistencia/soporte y cerrar el informe al día 30. Medir segunda partida libre orgánica y participación en el segundo reto por separado, D7 maduro, repetición de quienes no quedaron primeros y horas/costos. Los criterios comerciales y denominadores están en el [plan de validación](PLAN-COMERCIAL-2048-30-DIAS-2026-10-15.md).

## Dependencias y primera entrega

El orden técnico es: **base → práctica + medición → reto real → entrenamiento → rewarded → integración de oferta de ticket**. La preparación comercial de proveedores y dinero puede revisarse en paralelo, sin bloquear el avance local del gratuito.

La primera entrega que implementaría es **práctica con marca persistente, resultado accionable y eventos mínimos de inicio/repetición**, conservando el 2048 Unity existente. Puede revisarse funcionando antes de modificar el formato de torneos.

Al terminar cada incremento, registrar qué quedó implementado, qué se probó localmente, qué se verificó en desarrollo y qué sigue pendiente de proveedor o jugadores. La siguiente decisión debe responder a la experiencia observada, manteniendo un solo juego.
