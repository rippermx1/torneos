import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Términos y Condiciones — Torneos 2048',
  description: 'Términos y condiciones de uso de la plataforma Torneos 2048.',
}

export default function TerminosPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">
      <div>
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← Inicio</Link>
        <h1 className="text-3xl font-bold mt-4">Términos y Condiciones</h1>
        <p className="text-sm text-muted-foreground mt-1">Última actualización: 4 de mayo de 2026</p>
      </div>

      <Section title="1. Naturaleza del servicio">
        <p>
          Torneos 2048 es una <strong>plataforma de competencias de habilidad</strong> en la que los
          participantes compiten en el videojuego 2048 por sus propias capacidades cognitivas y
          estratégicas. Los resultados dependen exclusivamente del desempeño individual del jugador
          y <strong>no de factores aleatorios</strong>.
        </p>
        <p>
          Esta plataforma <strong>no constituye un juego de azar</strong> en los términos de la Ley
          N.º 19.995 ni de ninguna otra normativa vigente en la República de Chile. La cuota de
          inscripción es el precio por participar en una competencia deportiva-electrónica, no una
          apuesta.
        </p>
      </Section>

      <Section title="2. Requisitos de participación">
        <ul>
          <li>Ser mayor de 18 años de edad.</li>
          <li>Ser residente en la República de Chile.</li>
          <li>Contar con una cuenta verificada en la plataforma (KYC aprobado).</li>
          <li>Aceptar íntegramente los presentes términos y condiciones.</li>
        </ul>
        <p>
          La plataforma se reserva el derecho de solicitar documentos adicionales para acreditar
          la identidad del usuario conforme a la normativa vigente.
        </p>
      </Section>

      <Section title="3. Registro y cuenta">
        <p>
          Cada usuario puede tener una sola cuenta. El uso de múltiples cuentas, scripts
          automatizados, bots o cualquier herramienta que altere la jugabilidad natural está
          estrictamente prohibido y resultará en la suspensión permanente de la cuenta y la
          pérdida del saldo disponible.
        </p>
      </Section>

      <Section title="4. Torneos y reglas de competencia">
        <p>
          Cada torneo establece sus propias reglas (duración, cuota de inscripción, premios,
          ventana de juego). El jugador acepta dichas reglas al momento de inscribirse.
        </p>
        <p>
          El <strong>puntaje final</strong> es la única métrica de clasificación. En caso de
          empate, se considera el tile más alto alcanzado y luego la menor cantidad de movimientos.
          Los resultados son públicos y auditables a través del leaderboard de cada torneo.
        </p>
        <p>
          Si el torneo no alcanza el número mínimo de participantes inscritos al momento del
          cierre de inscripciones, será cancelado y <strong>todas las cuotas serán
          reembolsadas</strong> automáticamente.
        </p>
      </Section>

      <Section title="5. Billetera y transacciones">
        <p>
          Los fondos depositados en la billetera de la plataforma son administrados en pesos
          chilenos (CLP). Las transacciones se registran de forma inmutable y el saldo disponible
          se actualiza en tiempo real.
        </p>
        <p>
          Los depósitos no son retirables directamente; se usan para pagar inscripciones y otros
          servicios de la plataforma. Esta regla reduce riesgos de fraude, lavado y uso de la
          billetera como mecanismo de giro de dinero.
        </p>
        <p>
          Los <strong>premios</strong> obtenidos se acreditan automáticamente en la billetera del
          ganador una vez finalizado y verificado el torneo. Pueden solicitarse retiros conforme
          a la política de retiros vigente.
        </p>
      </Section>

      <Section title="6. Retiros">
        <p>
          Los usuarios con KYC aprobado pueden solicitar el retiro de su saldo retirable, que
          corresponde a premios ganados y devoluciones de retiros rechazados, mediante
          transferencia bancaria a una cuenta a su nombre en un banco chileno. Solo se permite
          una solicitud pendiente a la vez y el plazo de procesamiento es de hasta 3 días hábiles.
          Ver{' '}
          <Link href="/legal/reembolso" className="underline underline-offset-2">
            Política de Reembolso
          </Link>{' '}
          para más detalles.
        </p>
      </Section>

      <Section title="7. Prohibiciones">
        <ul>
          <li>Uso de herramientas automatizadas (bots, scripts, macros).</li>
          <li>Colusión entre participantes para alterar resultados.</li>
          <li>Múltiples cuentas o suplantación de identidad.</li>
          <li>Cualquier conducta que distorsione la competencia leal.</li>
        </ul>
        <p>
          Las infracciones a estas prohibiciones serán sancionadas con la expulsión permanente y,
          en caso de fraude comprobado, serán denunciadas a las autoridades competentes.
        </p>
      </Section>

      <Section title="8. Impuestos">
        <p>
          Los premios obtenidos en competencias de habilidad pueden estar sujetos a tributación
          según las normas del Servicio de Impuestos Internos (SII) de Chile. La plataforma emite
          boletas de honorarios o comprobantes correspondientes cuando así lo exija la normativa.
          El usuario es responsable de declarar sus ingresos conforme a la ley.
        </p>
      </Section>

      <Section title="9. Privacidad">
        <p>
          El tratamiento de datos personales se rige por la{' '}
          <Link href="/legal/privacidad" className="underline underline-offset-2">
            Política de Privacidad
          </Link>
          {' '}y la Ley N.º 19.628 sobre protección de la vida privada.
        </p>
      </Section>

      <Section title="10. Modificaciones">
        <p>
          Torneos 2048 puede modificar estos términos con un aviso previo de al menos 7 días
          hábiles publicado en la plataforma. El uso continuado del servicio tras la entrada en
          vigor de los cambios implica la aceptación de los nuevos términos.
        </p>
      </Section>

      <Section title="11. Jurisdicción y ley aplicable">
        <p>
          Estos términos se rigen por las leyes de la República de Chile. Cualquier disputa será
          sometida a la jurisdicción de los tribunales ordinarios de justicia de Santiago de Chile.
        </p>
      </Section>

      <div className="border-t pt-6 flex gap-6 text-sm text-muted-foreground">
        <Link href="/legal/privacidad" className="hover:text-foreground underline underline-offset-2">Política de Privacidad</Link>
        <Link href="/legal/reembolso" className="hover:text-foreground underline underline-offset-2">Política de Reembolso</Link>
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
