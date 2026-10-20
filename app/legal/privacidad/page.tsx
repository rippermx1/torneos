import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Política de Privacidad — TorneosPlay',
  description: 'Cómo recopilamos, usamos y protegemos tus datos personales.',
}

export default function PrivacidadPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">
      <div>
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← Inicio</Link>
        <h1 className="text-3xl font-bold mt-4">Política de Privacidad</h1>
        <p className="text-sm text-muted-foreground mt-1">Última actualización: 20 de octubre de 2026</p>
      </div>

      <Section title="1. Responsable del tratamiento">
        <p>
          TorneosPlay (en adelante &quot;la Plataforma&quot;) es responsable del tratamiento de los datos
          personales recopilados a través de este sitio web, en conformidad con la Ley N.º 19.628
          sobre protección de la vida privada y, desde su entrada en vigencia, con la Ley N.º 21.719
          sobre protección y tratamiento de datos personales.
        </p>
      </Section>

      <Section title="2. Datos que recopilamos">
        <p>Recopilamos la siguiente información:</p>
        <ul>
          <li><strong>Datos de registro:</strong> nombre, correo electrónico, nombre de usuario.</li>
          <li><strong>Datos de verificación (KYC):</strong> RUT, fecha de nacimiento, teléfono, ciudad, documentos de identidad, número de documento y estado de revisión.</li>
          <li><strong>Datos bancarios:</strong> banco, número de cuenta, nombre y RUT del titular, usados para verificar titularidad y procesar retiros.</li>
          <li><strong>Datos de juego:</strong> semillas de partida, movimientos, puntajes, tableros, historial de partidas y resultados (auditoría de competencia).</li>
          <li><strong>Actividad de 2048 gratuito:</strong> si juegas con una cuenta iniciada, registramos los días con al menos un movimiento válido, la primera y última observación de ese día y si jugaste práctica libre o desafío diario. Este registro de retorno no recibe tu tablero, semilla ni puntuación.</li>
          <li><strong>Datos de auditoría:</strong> eventos de envío, aprobación o rechazo de KYC y notas de revisión administrativa.</li>
          <li><strong>Datos técnicos:</strong> dirección IP, tipo de dispositivo, navegador, cookies de sesión.</li>
        </ul>
      </Section>

      <Section title="3. Finalidad del tratamiento">
        <p>Usamos tus datos para:</p>
        <ul>
          <li>Verificar tu identidad, documentos y titularidad bancaria, y cumplir con requisitos legales (KYC/AML).</li>
          <li>Gestionar tu cuenta, premios, retiros y transacciones.</li>
          <li>Procesar inscripciones, premios y retiros.</li>
          <li>Auditar la integridad de las competencias y detectar conductas fraudulentas.</li>
          <li>Medir el regreso a la práctica gratuita de 2048 y al desafío diario mediante reportes agregados de cuentas por día.</li>
          <li>Comunicarte información relevante sobre torneos y la plataforma.</li>
          <li>Cumplir con obligaciones tributarias ante el SII.</li>
        </ul>
      </Section>

      <Section title="4. Base legal">
        <p>
          El tratamiento de datos se basa en: (a) la ejecución del contrato de uso de la
          plataforma; (b) el cumplimiento de obligaciones legales; y (c) el consentimiento
          expreso del usuario al registrarse.
        </p>
      </Section>

      <Section title="5. Compartición de datos">
        <p>
          No vendemos ni cedemos tus datos personales a terceros con fines comerciales.
          Podemos compartir datos con:
        </p>
        <ul>
          <li>Proveedores de servicios de infraestructura, autenticación, base de datos y almacenamiento (por ejemplo, Vercel y Supabase).</li>
          <li>Proveedores de pago y emisión de comprobantes electrónicos (por ejemplo, Flow.cl).</li>
          <li>Entidades bancarias para validar titularidad y procesar retiros.</li>
          <li>El Servicio de Impuestos Internos u otras autoridades competentes cuando sea necesario para cumplir obligaciones legales.</li>
        </ul>
      </Section>

      <Section title="6. Publicidad del ranking">
        <p>
          Los <strong>nombres de usuario y puntajes</strong> de los participantes en torneos
          son públicos y visibles en el leaderboard de cada competencia. Esto es esencial para
          garantizar la transparencia y auditoría de los resultados.
        </p>
        <p>
          El nombre real, RUT y datos bancarios nunca se publican. Si deseas cambiar tu nombre
          de usuario para preservar mayor privacidad, puedes hacerlo desde tu perfil.
        </p>
      </Section>

      <Section title="7. Retención de datos">
        <p>
          Conservamos los datos de cuenta mientras la cuenta esté activa. Los registros de
          transacciones y partidas se conservan por 6 años conforme a las obligaciones tributarias
          chilenas. Los datos de KYC se conservan por el tiempo necesario para soporte, auditoría,
          prevención de fraude y cumplimiento legal aplicable.
        </p>
      </Section>

      <Section title="8. Derechos del titular">
        <p>
          Tienes derecho a acceder, rectificar, cancelar y oponerte al tratamiento de tus datos
          (derechos ARCO). Desde la entrada en vigencia de la Ley N.º 21.719, también podrás ejercer
          los derechos adicionales que dicha ley establezca, incluyendo portabilidad, bloqueo u
          oposición cuando correspondan. Para ejercerlos, escríbenos a{' '}
          <a href="mailto:privacidad@torneosplay.cl" className="underline underline-offset-2">
            privacidad@torneosplay.cl
          </a>
          . Responderemos en un plazo máximo de 30 días hábiles.
        </p>
      </Section>

      <Section title="9. Cookies">
        <p>
          Utilizamos cookies estrictamente necesarias para la autenticación y el funcionamiento
          del sitio. No usamos cookies de seguimiento de terceros ni publicidad comportamental.
        </p>
        <p>Las marcas personales, el progreso diario y los días de juego de visitantes se conservan en el almacenamiento local del navegador. Puedes borrarlos desde sus ajustes. Las observaciones locales se exportan sólo cuando eliges descargarlas; no se convierten en personas únicas ni se vinculan retrospectivamente a una cuenta.</p>
        <p>La práctica libre también guarda su tablero, puntuación, semilla y movimientos en este navegador para continuar después de recargar. Este guardado no se sincroniza con tu cuenta ni entre dispositivos, y no se incluye en las métricas de retorno ni en la exportación de observaciones.</p>
        <p>El diagnóstico local de carga de 2048 conserva intentos, fechas, duración y resultados técnicos, con enlaces a las identidades locales de las partidas para consultar los hitos ya observados. No guarda mensajes de error originales, direcciones web, contactos, tableros o semillas. Puedes descargarlo incluso si falla la carga; no se envía automáticamente ni acredita juego o retorno. Su cobertura comienza cuando se prepara el juego en el navegador.</p>
      </Section>

      <Section title="10. Seguridad">
        <p>
          Implementamos medidas técnicas y organizativas para proteger tus datos: cifrado TLS en
          tránsito, cifrado en reposo, control de acceso por roles, y auditoría de operaciones
          sensibles. Sin embargo, ningún sistema es 100% infalible; en caso de brecha de
          seguridad que afecte tus datos, te notificaremos en el menor tiempo posible.
        </p>
      </Section>

      <div className="border-t pt-6 flex gap-6 text-sm text-muted-foreground">
        <Link href="/legal/terminos" className="hover:text-foreground underline underline-offset-2">Términos y Condiciones</Link>
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
