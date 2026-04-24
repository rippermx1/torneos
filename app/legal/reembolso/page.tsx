import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Política de Reembolso y Retiros — Torneos 2048',
  description: 'Condiciones de reembolso, cancelación de torneos y política de retiros.',
}

export default function ReembolsoPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">
      <div>
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← Inicio</Link>
        <h1 className="text-3xl font-bold mt-4">Política de Reembolso y Retiros</h1>
        <p className="text-sm text-muted-foreground mt-1">Última actualización: 23 de abril de 2026</p>
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
          Si Torneos 2048 cancela un torneo por cualquier motivo (problemas técnicos graves,
          fuerza mayor u otras causas), <strong>todas las cuotas de inscripción serán
          reembolsadas en su totalidad</strong> a las billeteras de los participantes en un plazo
          de 24 horas hábiles.
        </p>
      </Section>

      <Section title="3. Torneo que no alcanza mínimo de participantes">
        <p>
          Si al cierre del período de inscripción el torneo no ha alcanzado el número mínimo de
          participantes requerido, el torneo será <strong>cancelado automáticamente</strong> y las
          cuotas serán reembolsadas íntegramente sin necesidad de solicitud por parte del usuario.
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

      <Section title="5. Retiros de fondos">
        <p>
          Los usuarios con KYC aprobado pueden solicitar el retiro de su saldo disponible
          (depósitos + premios ganados) sujeto a las siguientes condiciones:
        </p>
        <ul>
          <li>Monto mínimo de retiro: <strong>$5.000 CLP</strong>.</li>
          <li>La cuenta bancaria debe estar a nombre del titular verificado.</li>
          <li>Se acepta una solicitud de retiro pendiente a la vez.</li>
          <li>El plazo de procesamiento es de <strong>1 a 3 días hábiles</strong>.</li>
          <li>No se cobra comisión por retiros en cuentas bancarias chilenas.</li>
        </ul>
      </Section>

      <Section title="6. Rechazo de solicitud de retiro">
        <p>
          La plataforma puede rechazar una solicitud de retiro si:
        </p>
        <ul>
          <li>Los datos bancarios no coinciden con la identidad verificada (KYC).</li>
          <li>Existe una investigación de fraude o disputa activa sobre la cuenta.</li>
          <li>El saldo proviene de actividad sospechosa o no autorizada.</li>
        </ul>
        <p>
          En caso de rechazo, los fondos son devueltos automáticamente al saldo disponible de la
          billetera y el usuario es notificado con la razón del rechazo.
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
