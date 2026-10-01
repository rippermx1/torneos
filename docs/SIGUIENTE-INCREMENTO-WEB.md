# Siguiente incremento: elegir un torneo y conservar la intención de participar

Determinado el 2026-09-30 desde `C:/torneos`, rama
`codex/unity-games-migration`, HEAD `db49046`. Implementado localmente en
`codex/tournament-discovery`; validación autenticada en staging y aceptación
humana pendientes. Evidencia: `WEB-DISCOVERY-EVIDENCE.json`.

## Resultado para el usuario

Una persona descubre un torneo de 2048, entiende si puede inscribirse y bajo qué
condiciones, practica o crea su cuenta y vuelve a la ficha del torneo elegido.
La web conduce la participación; el juego sirve para practicar y competir.

## Evidencia de la elección

Se leyeron `AGENTS.md`, `README.md`, `STATUS.md` y
`CONTEXTO-PARA-CONTINUAR.md`, las políticas de negocio vigentes y las rutas actuales.
El árbol estaba limpio y la migración sigue sin integrar en `main`.

| Ya existe | Fricción observada en el código |
| --- | --- |
| Portada y catálogo `/tournaments` | El catálogo muestra entrada, primer premio e inicio; no muestra cupos, duración ni cierre de inscripción. Su etiqueta depende del estado almacenado, no de la ventana temporal ni de la capacidad. |
| Ficha `/tournaments/[id]` | Publica premios, fechas, mínimo y máximo, pero no resume juego, ranking/desempates ni una partida por participante. Ofrece inscripción según ventana sin comprobar capacidad en esa presentación; el checkout sí comprueba el cupo. |
| Registro, login, confirmación y onboarding | La ficha enlaza a `/sign-up` y `/sign-in` sin destino. Login y callbacks ya admiten un destino interno seguro, pero registro lleva a onboarding y onboarding termina en el catálogo. Se pierde el torneo elegido. |
| Práctica 2048 y ranking | La práctica vuelve al catálogo genérico. La ficha ya enlaza al ranking; conviene conservar esa conexión. |
| Manejo de carga | El catálogo distingue error y vacío. La portada usa `data ?? []` sin tratar el error y puede presentar una indisponibilidad como ausencia de torneos. |

Se abrió `/tournaments` en el navegador del servidor local existente en el puerto
3080: mostró «Error al cargar los torneos». El script `dev:games` configura
Supabase/Flow ficticios; esta observación no prueba una avería de producción ni
ausencia de torneos reales. No se ejecutaron cuentas, cobros ni consultas remotas
de staging para este diagnóstico.

## Alcance del incremento

1. **Elegir:** mejorar las tarjetas existentes de portada y catálogo con juego
   2048, precio final, premio total y distribución accesible en la ficha, horario
   de Chile, cierre de inscripción, duración y cupos. Priorizar oportunidades de
   inscripción y distinguir próximos, completos y en curso. Si no se puede leer
   disponibilidad, mostrarla como desconocida; no convertir un error en cero
   inscritos o cero torneos. Leer sólo conteos desde el servidor, sin exponer
   registros de participantes ni crear migraciones.
2. **Entender:** resumir en la ficha una partida por participante, duración máxima
   limitada por el cierre, puntaje calculado por servidor, ranking por puntaje,
   mayor ficha y menos movimientos, premios fijos y condiciones de cancelación.
   La migración vigente también ordena por `user_id` para resolver empates
   completos de forma estable; no prometer un desempate por rapidez o azar.
   Verificar el resumen contra las APIs y migraciones vigentes antes de escribirlo.
   Mantener acceso a las bases completas y al ranking. El estado de cupo es
   informativo; la inscripción sigue siendo validada por el servidor.
3. **Continuar:** conservar el ID/destino del torneo al practicar 2048, cambiar
   entre login y registro, confirmar email y completar onboarding. Reutilizar
   `lib/auth/redirect.ts`, validando el destino en el servidor y manteniendo los
   requisitos actuales de cuenta, edad, términos y KYC. Tras esos pasos, volver a
   la ficha para que el usuario decida inscribirse; volver no inicia un pago.
4. **Recuperarse:** presentar vacío y error como estados distintos, con acciones
   útiles de reintento o práctica. Comprobar el recorrido en escritorio y móvil.

No incluye filtros complejos, notificaciones, nuevas modalidades, cambios de
economía, DB, Flow, despliegues, recursos externos ni recompilación de juegos.
Alien Run continúa identificado como práctica gratuita sin torneos con premios.
El cliente competitivo Unity continúa optativo hasta su validación autenticada.

## Comprobación observable

- Con fixtures locales de torneos próximos, inscribibles, completos y en curso,
  cada tarjeta/ficha muestra estado y siguiente acción coherentes. Probar límites
  de tiempo y capacidad, y fallos de lectura; no simularlos con datos productivos.
- Desde una ficha, practicar y regresar conserva el torneo. La versión ligera
  de 2048 también conserva el destino; la navegación genérica sigue funcionando.
- Con cuentas sintéticas en staging autorizado, registro/confirmación/onboarding
  y login regresan a la misma ficha. Rechazar destinos externos o malformados.
  Si no hay staging autorizado, reportar esa prueba como pendiente.
- TypeScript, lint afectado, pruebas de disponibilidad/destinos y compilación Next
  pasan. Capturas y navegación en escritorio y viewport móvil verifican el render.
- La comprensión del usuario sobre precio, premio, horarios y cómo participar
  se revisa por separado de las pruebas técnicas; no se presume aceptación humana.

## Condición comercial pendiente

`politica-negocio-torneos.md` mantiene un bloqueo previo a captar participantes
pagados: las partidas usan seeds individuales y falta una decisión de condiciones
competitivas equivalentes y revisión jurídica. Este incremento mejora el producto
local y puede validarse con fixtures/pruebas controladas; no resuelve ni autoriza
el lanzamiento pagado. La integración monetaria productiva tampoco queda validada
por la existencia del código o por mejorar las pantallas.

Después de este recorrido, el siguiente candidato es validar el cliente 2048
Unity con cuentas de staging, recuperación de sesión, duración y ranking.

## Entrega local

Portada y catálogo comparten tarjetas con horarios de Chile, precio final,
premio total fijo, duración, conteos y estados calculados según hora/cupo.
La ficha publica reglas, requisitos y distribución; ofrece práctica con retorno
al mismo torneo y conserva el destino en registro, login, confirmación, reenvío
de confirmación y onboarding. Los destinos se vuelven a validar en el servidor.
Un conteo fallido queda desconocido y no ofrece inscripción; el checkout existente
continúa validando la capacidad real.

Validación ejecutada: 295 pruebas en 39 archivos, TypeScript, lint afectado y
compilación Next webpack/standalone con exit 0. Navegador local con fixtures:
estados, errores/vacío, práctica Unity y ligera con retorno, cambio registro/login,
registro con respuesta Auth simulada y generación del enlace de confirmación,
redirección a login al solicitar onboarding sin sesión y rechazo de destinos
externos. Contratos de callbacks y finalización de onboarding probados con mocks.
Capturas revisadas en escritorio y viewport móvil; sin desbordamiento horizontal
en 1280, 390 y 320 px. Esto no es E2E con Supabase remoto ni prueba en teléfono.

Para revisar con datos sintéticos, ejecutar en terminales separadas, verificando
primero que los puertos estén disponibles o pertenezcan a estos procesos:

```powershell
node scripts/preview-tournament-fixtures.mjs
npm run dev:games
```

Abrir `http://127.0.0.1:3080/tournaments`. El servicio de fixtures escucha sólo en
`127.0.0.1:59999`, rechaza mutaciones y no crea cuentas, envía correos ni cobra.
Los escenarios `ready`, `empty`, `catalog-error`, `count-error` y `detail-error`
se seleccionan con `http://127.0.0.1:59999/__fixture?scenario=ready`.
Logs, informe y capturas: `artifacts/tournament-discovery`.
