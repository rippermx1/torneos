import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Política AML y Antifraude — TorneosPlay',
  description: 'Controles mínimos de prevención de fraude, abuso y lavado de activos.',
}

export default function AmlPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">
      <div>
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← Inicio</Link>
        <h1 className="text-3xl font-bold mt-4">Política AML y Antifraude</h1>
        <p className="text-sm text-muted-foreground mt-1">Última actualización: 8 de mayo de 2026</p>
      </div>

      <Section title="1. Alcance">
        <p>
          Esta política describe los controles mínimos aplicados por TorneosPlay para prevenir
          fraude, abuso de la plataforma, multicuentas, automatización no autorizada, suplantación
          de identidad, uso indebido de medios de pago y operaciones incompatibles con el modelo de
          competencias de habilidad.
        </p>
        <p>
          La plataforma no acepta depósitos prepagados ni recargas. Cada inscripción pagada se cobra
          directamente para un torneo específico y los retiros sólo pueden provenir de premios,
          reembolsos acreditados o devoluciones de retiros rechazados.
        </p>
      </Section>

      <Section title="2. Conoce a tu cliente">
        <ul>
          <li>Participación pagada sólo para mayores de 18 años.</li>
          <li>KYC aprobado antes de inscribirse en torneos pagados o solicitar retiros.</li>
          <li>Validación de RUT, nombre y titularidad bancaria antes de procesar retiros.</li>
          <li>Una cuenta por persona natural.</li>
          <li>Cuenta bancaria de retiro a nombre del titular verificado.</li>
        </ul>
      </Section>

      <Section title="3. Señales de alerta">
        <ul>
          <li>Múltiples cuentas asociadas a la misma identidad, dispositivo, patrón o medio de pago.</li>
          <li>Retiros repetidos, fraccionados o incompatibles con la actividad normal del usuario.</li>
          <li>Intentos de retirar fondos mientras existe disputa, investigación o KYC inconsistente.</li>
          <li>Patrones de juego imposibles, automatizados o no humanos.</li>
          <li>Colusión, traspaso de cuentas, suplantación o documentos inconsistentes.</li>
          <li>Uso de VPN, proxy, automatización o scraping para ocultar origen o manipular actividad.</li>
        </ul>
      </Section>

      <Section title="4. Controles operativos">
        <ul>
          <li>Límites diarios y mensuales de retiro.</li>
          <li>Una solicitud de retiro pendiente por usuario.</li>
          <li>Rate limit en endpoints de juego, checkout, KYC, disputas y retiros.</li>
          <li>Registro auditable de movimientos con timestamp de servidor.</li>
          <li>Validación de ranking y premios desde backend, no desde el cliente.</li>
          <li>Retención temporal de fondos ante alertas de fraude, disputa o inconsistencia KYC.</li>
        </ul>
      </Section>

      <Section title="5. Revisión y medidas">
        <p>
          Ante una alerta, TorneosPlay puede solicitar antecedentes adicionales, pausar retiros,
          invalidar partidas, cancelar inscripciones, suspender cuentas, anular premios asociados a
          fraude comprobado y conservar evidencia técnica para auditoría o requerimientos de
          autoridad competente.
        </p>
        <p>
          Si una operación resulta sospechosa por su naturaleza, patrón, volumen, identidad o
          relación con terceros, la plataforma podrá escalarla a revisión legal y contable externa
          antes de liberar fondos.
        </p>
      </Section>

      <Section title="6. Conservación de evidencia">
        <p>
          Se conservan registros de pagos, inscripciones, partidas, movimientos, KYC, disputas,
          retiros, acciones administrativas y cambios relevantes de cuenta por el tiempo necesario
          para cumplimiento legal, soporte, auditoría, defensa de derechos y prevención de fraude.
        </p>
      </Section>

      <div className="border-t pt-6 flex gap-6 text-sm text-muted-foreground">
        <Link href="/legal/terminos" className="hover:text-foreground underline underline-offset-2">Términos y Condiciones</Link>
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
