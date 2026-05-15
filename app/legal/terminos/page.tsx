import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Términos y Condiciones — TorneosPlay',
  description: 'Términos y condiciones de uso de la plataforma TorneosPlay.',
}

export default function TerminosPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">
      <div>
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← Inicio</Link>
        <h1 className="text-3xl font-bold mt-4">Términos y Condiciones</h1>
        <p className="text-sm text-muted-foreground mt-1">Última actualización: 15 de mayo de 2026</p>
      </div>

      <Section title="1. Naturaleza del servicio">
        <p>
          TorneosPlay es una <strong>plataforma de competencias de habilidad</strong> en la que los
          participantes compiten en el videojuego 2048 bajo reglas comunes, ventanas de juego
          definidas, control de identidad y registro auditable de movimientos.
        </p>
        <p>
          La clasificación depende del puntaje obtenido por el jugador, sus decisiones durante la
          partida y los criterios de desempate publicados. La generación de tableros y nuevas piezas
          utiliza semillas determinísticas y reproducibles para fines de integridad técnica y
          auditoría; no se usa para sortear ganadores ni para alterar premios.
        </p>
        <p>
          La cuota de inscripción es el precio por participar en una competencia digital de
          habilidad, no una apuesta contra la plataforma ni contra otros participantes. La
          plataforma no ofrece juegos de casino, no recibe apuestas sobre eventos externos y no
          garantiza ganancias a ningún usuario. Si una autoridad competente exigiera ajustes
          operativos, la plataforma podrá suspender, modificar o cancelar torneos para mantener el
          cumplimiento normativo.
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
          En torneos pagados, la cuota de inscripción es el precio del derecho a participar e
          incluye IVA. La ficha del torneo informa antes del pago la cuota, cupos, mínimo de
          participantes, reglas y <strong>premios fijos publicados</strong>. Los premios no aumentan
          por la cantidad final de inscritos, salvo que la plataforma publique expresamente una
          promoción separada antes de abrir inscripciones.
        </p>
        <p>
          En cada inscripción, un <strong>75%</strong> se orienta al premio del torneo y un
          {' '}<strong>25%</strong> corresponde al fee bruto de la plataforma, ambos con IVA incluido.
        </p>
        <p>
          El cobro de la inscripción se realiza directamente a través de Flow.cl al momento de
          inscribirse. El checkout puede incluir un cargo de procesamiento visible antes del pago,
          destinado a cubrir costos de pasarela. El comprobante de pago electrónico emitido por Flow
          opera como boleta electrónica del servicio para efectos del Servicio de Impuestos Internos
          (SII), cuando dicha modalidad se encuentre correctamente habilitada para el comercio.
        </p>
        <p>
          El <strong>puntaje final</strong> es la única métrica de clasificación. En caso de
          empate, se considera el tile más alto alcanzado y luego la menor cantidad de movimientos.
          Los resultados son públicos y auditables a través del leaderboard de cada torneo.
        </p>
        <p>
          Si el torneo no alcanza el número mínimo de participantes inscritos al momento del
          cierre de inscripciones, será cancelado y <strong>todas las cuotas de inscripción serán
          reembolsadas</strong>. Por defecto, el reembolso se acredita como saldo retirable asociado
          a la cuenta del jugador; si Flow u otro proveedor permite una reversa operacional al medio
          de pago original, la plataforma podrá usar esa vía en lugar del crédito interno.
        </p>
      </Section>

      <Section title="5. Premios y saldo retirable">
        <p>
          La plataforma no acepta depósitos prepagados ni recargas. Cada inscripción a un torneo se
          cobra de forma individual al momento de inscribirse.
        </p>
        <p>
          Los <strong>premios</strong> obtenidos se acreditan automáticamente como saldo retirable
          asociado a la cuenta del ganador una vez finalizado y verificado el torneo. El saldo
          retirable se compone de premios ganados, reembolsos de torneos cancelados y devoluciones
          asociadas a solicitudes de retiro rechazadas, conforme a la política de retiros vigente.
        </p>
        <p>
          Los movimientos asociados a premios, reembolsos y retiros se registran de forma inmutable
          y el saldo disponible se actualiza en tiempo real.
        </p>
      </Section>

      <Section title="6. Retiros">
        <p>
          Los usuarios con KYC aprobado pueden solicitar el retiro de su saldo retirable, compuesto
          por premios ganados, reembolsos de torneos cancelados y devoluciones de retiros
          rechazados, mediante transferencia bancaria a una cuenta a su nombre en un banco chileno.
          Solo se permite una solicitud pendiente a la vez y el plazo de procesamiento es de hasta
          3 días hábiles.
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

      <Section title="8. Prevención de fraude y AML">
        <p>
          La plataforma aplica controles de identidad, titularidad bancaria, límites de retiro,
          revisión de patrones de juego, bloqueo de multicuentas y auditoría de movimientos. Las
          solicitudes de retiro pueden ser retenidas mientras exista una alerta de fraude, disputa,
          suplantación, uso de automatización, origen de fondos no justificado o inconsistencia de
          identidad.
        </p>
        <p>
          La política operacional completa está disponible en la{' '}
          <Link href="/legal/aml" className="underline underline-offset-2">
            Política AML y Antifraude
          </Link>
          .
        </p>
      </Section>

      <Section title="9. Impuestos">
        <p>
          Cada cobro de inscripción incluye el IVA correspondiente al servicio prestado por la
          plataforma. Cuando dicha modalidad esté habilitada ante el SII, la plataforma puede
          utilizar el voucher o comprobante electrónico de Flow como boleta electrónica del
          servicio. La plataforma podrá adoptar otra modalidad de emisión de documentos tributarios
          si el volumen, la operación o la normativa lo hacen conveniente.
        </p>
        <p>
          Los premios obtenidos en competencias de habilidad pueden estar sujetos a tributación
          según las normas del SII. El usuario es responsable de declarar sus premios como
          ingresos cuando corresponda conforme a la ley vigente.
        </p>
      </Section>

      <Section title="10. Privacidad">
        <p>
          El tratamiento de datos personales se rige por la{' '}
          <Link href="/legal/privacidad" className="underline underline-offset-2">
            Política de Privacidad
          </Link>
          {' '}y por la normativa chilena aplicable, incluyendo la Ley N.º 19.628 y, desde su
          entrada en vigencia, la Ley N.º 21.719.
        </p>
      </Section>

      <Section title="11. Modificaciones">
        <p>
          TorneosPlay puede modificar estos términos con un aviso previo de al menos 7 días
          hábiles publicado en la plataforma. El uso continuado del servicio tras la entrada en
          vigor de los cambios implica la aceptación de los nuevos términos.
        </p>
      </Section>

      <Section title="12. Jurisdicción y ley aplicable">
        <p>
          Estos términos se rigen por las leyes de la República de Chile. Cualquier disputa será
          sometida a la jurisdicción de los tribunales ordinarios de justicia de Santiago de Chile.
        </p>
      </Section>

      <div className="border-t pt-6 flex gap-6 text-sm text-muted-foreground">
        <Link href="/legal/privacidad" className="hover:text-foreground underline underline-offset-2">Política de Privacidad</Link>
        <Link href="/legal/reembolso" className="hover:text-foreground underline underline-offset-2">Política de Reembolso</Link>
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
