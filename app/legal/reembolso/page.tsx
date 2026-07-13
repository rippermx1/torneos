import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Política de Reembolso y Pago de Premios — TorneosPlay',
  description: 'Condiciones de reembolso, cancelación de torneos y pago de premios.',
}

export default function ReembolsoPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">
      <div>
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← Inicio</Link>
        <h1 className="text-3xl font-bold mt-4">Política de Reembolso y Pago de Premios</h1>
        <p className="text-sm text-muted-foreground mt-1">Última actualización: 6 de julio de 2026</p>
      </div>

      <Section title="1. Cuotas de inscripción — Regla general">
        <p>
          La cuota de inscripción a un torneo <strong>no es reembolsable</strong> una vez que la
          ventana de juego ha comenzado y el participante ha iniciado su partida, salvo que aplique
          alguna de las excepciones descritas a continuación.
        </p>
        <p>
          Si el participante se inscribe pero <strong>no inicia su partida</strong> antes del
          cierre de la ventana de juego, no tiene derecho a reembolso, ya que la cuota cubre el
          derecho a participar, independientemente de si se ejerce.
        </p>
      </Section>

      <Section title="2. Cancelación de torneo por la plataforma">
        <p>
          Si TorneosPlay cancela un torneo por cualquier motivo (problemas técnicos graves,
          fuerza mayor u otras causas), <strong>todas las cuotas de inscripción serán
          reembolsadas en su totalidad</strong>, incluyendo la parte orientada al premio del torneo
          y el fee de plataforma asociado. El reembolso se realiza mediante{' '}
          <strong>reversa al mismo medio de pago</strong> utilizado en la compra, gestionada a
          través de la pasarela de pago (Flow). El plazo de abono depende del emisor del medio de
          pago. Las participaciones canjeadas con recompensas se restituyen como recompensa.
        </p>
      </Section>

      <Section title="3. Torneo que no alcanza mínimo de participantes">
        <p>
          Si al cierre del período de inscripción el torneo no ha alcanzado el número mínimo de
          participantes requerido, el torneo será <strong>cancelado automáticamente</strong> y las
          cuotas de inscripción serán reembolsadas íntegramente, incluyendo el fee de plataforma,
          sin necesidad de solicitud por parte del usuario. El reembolso se realiza mediante{' '}
          <strong>reversa al mismo medio de pago</strong> utilizado en la compra; el plazo de abono
          depende del emisor del medio de pago.
        </p>
      </Section>

      <Section title="4. Problemas técnicos durante la partida">
        <p>
          Si el sistema experimenta una falla técnica comprobable que impide al participante
          completar su partida (caída del servidor, error de validación de movimientos, etc.),
          se evaluará el reembolso de la cuota caso a caso. El usuario debe reportar el incidente
          a través del sistema de disputas dentro de las 24 horas siguientes.
        </p>
        <p>
          Los problemas de conectividad del lado del usuario (internet caído, batería agotada,
          cierre accidental del navegador) <strong>no dan derecho a reembolso</strong>, ya que
          la partida se registra como abandonada.
        </p>
      </Section>

      <Section title="5. Pago de premios">
        <p>
          Los usuarios con KYC aprobado pueden solicitar el <strong>pago de sus premios
          pendientes</strong> mediante transferencia bancaria. La plataforma no mantiene cuentas ni
          saldos de dinero de usuarios, no acepta recargas ni depósitos prepagados; cada
          participación se compra y se paga directamente en Flow al momento de inscribirse.
        </p>
        <ul>
          <li>El pago se realiza por el <strong>total de premios adeudados</strong> (tope de $500.000 CLP por solicitud).</li>
          <li>Monto mínimo para solicitar el pago: <strong>$5.000 CLP</strong> en premios acumulados.</li>
          <li>La cuenta bancaria debe estar a nombre del titular verificado documentalmente.</li>
          <li>Se acepta una solicitud de pago pendiente a la vez por usuario.</li>
          <li>El plazo de procesamiento es de <strong>1 a 3 días hábiles</strong>.</li>
          <li>No se cobra comisión por pagos a cuentas bancarias chilenas.</li>
        </ul>
      </Section>

      <Section title="6. Rechazo de una solicitud de pago">
        <p>
          La plataforma puede rechazar una solicitud de pago de premios si:
        </p>
        <ul>
          <li>Los datos bancarios no coinciden con la identidad verificada (KYC).</li>
          <li>La cuenta bancaria no está a nombre del titular verificado.</li>
          <li>Existe una investigación de fraude o disputa activa sobre la cuenta.</li>
          <li>Los premios provienen de actividad sospechosa o no autorizada.</li>
        </ul>
        <p>
          En caso de rechazo, los premios permanecen como <strong>pendientes de pago</strong> (si no
          existe una investigación activa que justifique una retención temporal) y el usuario puede
          corregir los datos y volver a solicitar el cobro. El usuario es notificado con la razón
          del rechazo.
        </p>
      </Section>

      <Section title="7. Disputas">
        <p>
          Para presentar una disputa o reclamación, accede a la sección{' '}
          <strong>Mi cuenta → Disputas</strong> dentro de la plataforma. Responderemos en un
          plazo de 5 días hábiles. Si la disputa no puede resolverse internamente, puedes
          recurrir al{' '}
          <a
            href="https://www.sernac.cl"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            SERNAC
          </a>{' '}
          o a los tribunales competentes de Santiago de Chile.
        </p>
      </Section>

      <div className="border-t pt-6 flex gap-6 text-sm text-muted-foreground">
        <Link href="/legal/terminos" className="hover:text-foreground underline underline-offset-2">Términos y Condiciones</Link>
        <Link href="/legal/privacidad" className="hover:text-foreground underline underline-offset-2">Política de Privacidad</Link>
        <Link href="/legal/aml" className="hover:text-foreground underline underline-offset-2">Política AML</Link>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="space-y-2 text-sm text-muted-foreground leading-relaxed [&_ul]:list-disc [&_ul]:list-inside [&_ul]:space-y-1 [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  )
}
