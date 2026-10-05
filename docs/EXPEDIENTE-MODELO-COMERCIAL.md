# Expediente de revisión del modelo comercial

Preparado el **2026-10-05**. Estado: **borrador para revisión; sin dictamen jurídico, aprobación de Flow ni validación tributaria**. No se ha enviado a terceros. Forma parte de RM-04 del plan de operación con dinero real.

## Modelo que debe evaluarse

TorneosPlay propone torneos de 2048 para mayores de 18 años en Chile, con cuenta, aceptación de bases y KYC aprobado para la participación pagada. URL comercial de referencia: [TorneosPlay](https://www.torneosplay.cl). La empresa y su representante deben completar los antecedentes de la siguiente sección antes de tramitar el expediente.

| Aspecto | Modelo propuesto / fuente |
| --- | --- |
| Venta | Inscripción individual de $5.000 CLP, precio final; el tratamiento IVA del modelo interno queda sujeto a revisión contable |
| Formato | 12–15 participantes; premio fijo $33.000: primer lugar $24.750, segundo $8.250 |
| Partida | 10 minutos dentro de una ventana de 24 horas; una sesión competitiva por cuenta y torneo |
| Ranking | Puntaje descendente, ficha máxima descendente, menos movimientos y `user_id` ascendente como último desempate técnico |
| Azar | Aparición de fichas mediante RNG determinista con semilla de servidor; el jugador decide las direcciones. No afirmar que el juego carece de azar ni que su clasificación jurídica ya está resuelta |
| Integridad | Servidor calcula tablero y resultado; cliente envía direcciones. Protecciones de acceso en preparación; automatización y multicuenta mantienen límites de detección |
| Cobro | Checkout Flow individual; confirmación consultada al proveedor; inscripción por settlement servidor/DB |
| Saldo | Wallet de premios/reembolsos del producto existente. No se propone recarga, depósito ni apuesta entre usuarios |
| Retiro | Solicitud y transferencia bancaria al titular; titularidad, retenciones/revisión y separación de autorización/ejecución pendientes del plan |
| Cancelación | Reglas de mínimos, ventanas y devolución que deben revisar abogado/Flow; durabilidad y conciliación financiera pendientes |
| Alcance inicial | Sólo 2048. Propuesta de un torneo pagado activo a la vez; Snake Arena gratuito, Ted Runner/Factory Empire práctica |

Referencias técnicas: `lib/tournament/finance.ts`, `lib/game/rng.ts`, `lib/game/engine.ts`, `lib/legal/terms.ts` y [modelo comercial vigente](roadmap-retencion-rentabilidad.md). Revisar las bases públicas con la implementación final: este cuadro no sustituye un contrato ni describe una operación productiva ya habilitada.

## Antecedentes que debe aportar el propietario

| Antecedente | Estado |
| --- | --- |
| Razón social, RUT, representante, domicilio y contacto comercial | Pendiente; mantener documentos personales en repositorio restringido |
| Inicio de actividades/giro, cuenta bancaria de empresa y titular | Pendiente de acreditar |
| Abogado y contador responsables; operador, suplente y revisor de pagos | Pendiente de designación nominal |
| Contrato/cuenta comercial Flow, rubro declarado y respuesta de aceptación | Pendiente de acreditar |
| Bases, privacidad, devolución, plazo de pago, atención y apelación finales | Borrador técnico; requieren revisión del modelo real |
| Reserva de caja, máximo de exposición y presupuesto de operación | Pendiente de aprobar y financiar |

## Consultas para resolver antes de dinero real

**Abogado:** clasificar el modelo exacto considerando entrada, premio fijo y RNG de 2048; determinar condiciones territoriales/edad, obligaciones del organizador, bases, cancelación, revisión de ganadores, apelación, atención y tratamiento de datos. Entregar conclusión escrita sobre si el modelo puede operar y qué cambios/condiciones exige. Si cambia el modelo, actualizar alcance, reglas y pruebas.

**Flow:** confirmar por escrito aceptación del rubro y este formato; medios autorizados, costos, liquidación, reservas/contracargos y condiciones de devolución. Pedir el contrato técnico vigente de creación/consulta/reembolso, correlación por orden comercial, garantías de idempotencia y procedimiento para una respuesta perdida. Un identificador local estable no acredita deduplicación del proveedor. Referencia: [términos de Flow](https://web.flow.cl/es-cl/legal), revisados en la planificación del 2026-10-04; verificar la versión aplicable a la cuenta al tramitarlo.

**Contador:** revisar IVA/base, documentos por cada medio de pago y modelo de emisión declarado, anulaciones/notas de crédito, contabilización de premios/reembolsos, reserva y conciliación RCV/Flow/banco/F29. Las hipótesis del código no constituyen validación tributaria. Referencias oficiales usadas en el plan: [voucher y modelo de emisión](https://www.sii.cl/destacados/boleta_electronica_voucher/) y [boleta por transferencia](https://www.sii.cl/preguntas_frecuentes/bol_electr_vtas_serv/001_380_7869.htm).

## Registro de decisiones

Guardar cada respuesta con fecha, persona/entidad, modelo/versiones revisadas, conclusión, condiciones y referencia al documento restringido. Estados admitidos: pendiente, requiere antecedentes, aprobado con condiciones, rechazado. Una condición pendiente impide usar esa aprobación para lanzar. No publicar documentos de identidad, contratos privados o credenciales en Git.

La preaprobación comercial y el dictamen jurídico son decisiones separadas. Este expediente sólo prepara la revisión; la activación productiva espera además los cierres técnicos, operativos y financieros del plan.
