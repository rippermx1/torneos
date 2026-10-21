import type { Metadata } from 'next'
import Link from 'next/link'
import { CURRENT_TERMS_VERSION } from '@/lib/legal/terms'

export const metadata: Metadata = {
  title: 'Términos y Condiciones — TorneosPlay',
  description: 'Condiciones del servicio gratuito de 2048, entrenamiento de demostración y ticket informativo.',
}

export default function TerminosPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">
      <div>
        <Link href="/play" className="text-sm text-muted-foreground hover:text-foreground">← Práctica gratuita</Link>
        <h1 className="text-3xl font-bold mt-4">Términos y Condiciones</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Versión {CURRENT_TERMS_VERSION} · Servicio gratuito de 2048 · 21 de octubre de 2026
        </p>
      </div>

      <Section title="1. Servicio disponible">
        <p>
          Esta versión regula la práctica gratuita de 2048, el desafío diario gratuito y los
          retos comunitarios gratuitos que se publiquen. No ofrece premios en dinero ni cobra
          por jugar. Puedes practicar y jugar el diario sin crear una cuenta.
        </p>
        <p>
          Las decisiones del jugador y la generación de nuevas fichas influyen en cada partida.
          El resultado local de práctica o diario no es un resultado oficial de torneo.
          No se garantizan ganancias, una posición en un ranking ni la disponibilidad permanente del servicio.
        </p>
      </Section>

      <Section title="2. Cuenta opcional y participación">
        <p>
          El registro de cuenta es para personas de al menos 18 años. Pide confirmar el correo,
          elegir un nombre de usuario, indicar la fecha de nacimiento y aceptar esta versión
          y la Política de Privacidad. El nombre completo es opcional.
          La práctica gratuita no requiere KYC, RUT, cédula ni datos bancarios.
        </p>
        <p>
          Al jugar con una cuenta iniciada se observan los días con movimientos válidos de
          práctica o diario. Tener cuenta no sincroniza el tablero ni las marcas locales entre dispositivos.
          Si se publica un reto comunitario gratuito, su ficha informa los requisitos de cuenta,
          inscripción, horario, duración e intentos antes de participar.
        </p>
        <p>
          Usa datos de cuenta propios y protege tus credenciales. Elige un nombre de usuario que
          no revele información privada si vas a participar en una clasificación pública.
        </p>
      </Section>

      <Section title="3. Práctica, diario y retos comunitarios">
        <p>
          La práctica permite guardar una marca personal y retomar una partida normal en este
          navegador cuando el guardado esté disponible. El diario propone una meta por fecha
          de Chile y admite reintentos. Ninguno entrega dinero, saldo o una inscripción pagada.
        </p>
        <p>
          En un reto comunitario publicado, el servidor valida el resultado según las reglas
          de su ficha. Su clasificación puede mostrar nombre de usuario, posición, puntaje y
          ficha máxima. No hay una promesa de calendario ni de cupos antes de publicar el reto.
        </p>
        <p>
          No se permite suplantar a otras personas, alterar resultados competitivos o usar
          automatización para falsear una clasificación. Una revisión o restricción de cuenta
          no convierte datos locales en resultados oficiales ni extingue derechos de operaciones anteriores.
        </p>
      </Section>

      <Section title="4. Entrenamiento de demostración">
        <p>
          Al terminar una práctica normal, cuando existe una alternativa útil, puedes solicitar
          una demostración para probar otra jugada desde el estado previo al último movimiento válido.
          El panel permite continuar o cancelar y no reproduce un anuncio real.
        </p>
        <p>
          Hay una continuación por práctica y hasta dos aplicaciones por día de Chile en este
          navegador, sujetas a disponibilidad del almacenamiento y a los controles del panel.
          Cancelar no consume una aplicación. La continuación queda marcada como partida asistida:
          conserva el resultado original y no mejora la marca personal, el diario, el registro
          de retorno ni un resultado de torneo. No se ofrece dentro del diario ni de torneos.
        </p>
        <p>
          La demostración no entrega dinero, saldo, descuentos, entradas ni ventajas competitivas.
          No supone aceptar publicidad ni habilitar un proveedor de anuncios.
        </p>
      </Section>

      <Section title="5. Ticket informativo y servicios financieros anteriores">
        <p>
          Los torneos con ticket están <strong>todavía no disponibles</strong>. La ficha muestra
          condiciones propuestas para evaluar el producto; no permite reservar, inscribirse ni pagar.
          Consultarla o iniciar sesión para leerla no crea una compra, una deuda ni un derecho a premios.
          No hay fecha de lanzamiento ni cupos disponibles anunciados.
        </p>
        <p>
          En este servicio gratuito no se habilitan checkout, depósitos, retiros, pagos de premios,
          participaciones canjeables ni anuncios reales. Cualquier futura oferta de pago requerirá
          condiciones y habilitaciones propias antes de aceptar una operación.
        </p>
        <p>
          Las referencias financieras de versiones anteriores, de la Política de Reembolso o
          de la Política AML no habilitan nuevas operaciones en este servicio.
          Esta versión no borra registros ni modifica derechos u obligaciones de operaciones
          anteriores que pudieran existir. Para consultar un caso anterior, contacta al operador.
        </p>
      </Section>

      <Section title="6. Privacidad y conservación">
        <p>
          Antes de crear una cuenta se informa el uso de los datos de acceso. La aceptación
          versionada de estas condiciones se registra al completar la cuenta.
          No es una autorización para publicidad ni para usar datos bancarios.
          El alcance de los datos locales, de cuenta, técnicos y de soporte se explica en la{' '}
          <Link href="/legal/privacidad" className="underline underline-offset-2">Política de Privacidad</Link>.
        </p>
        <p>
          Los guardados locales dependen del navegador y pueden perderse al borrar sus datos.
          Descarga las observaciones que decidas conservar. Esa descarga no envía el archivo al
          operador ni acredita personas únicas, interés de compra o retención comercial.
        </p>
      </Section>

      <Section title="7. Operación y contacto">
        <p>
          TorneosPlay es el nombre del servicio administrado por su equipo operador.
        </p>
        <p>
          Para consultas sobre el servicio o un caso anterior utiliza{' '}
          <a href="mailto:contacto@torneosplay.cl" className="underline underline-offset-2">contacto@torneosplay.cl</a>.
          No envíes contraseñas, documentos de identidad ni datos bancarios por este canal.
        </p>
      </Section>

      <Section title="8. Cambios e interrupciones">
        <p>
          La plataforma puede interrumpir una función para corregir fallos o proteger cuentas
          y resultados. Los cambios se informarán en la plataforma; una nueva versión de las
          condiciones puede requerir una aceptación expresa al volver a usar las funciones de cuenta.
          Continuar practicando sin cuenta no se presenta como aceptación de nuevas operaciones financieras.
        </p>
        <p>
          Estas condiciones se interpretan conforme a la normativa chilena aplicable y no
          limitan los derechos que esa normativa reconozca.
        </p>
      </Section>

      <div className="border-t pt-6 flex flex-wrap gap-6 text-sm text-muted-foreground">
        <Link href="/legal/privacidad" className="underline underline-offset-2">Política de Privacidad</Link>
        <Link href="/play" className="underline underline-offset-2">Jugar gratis</Link>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="space-y-2 text-sm text-muted-foreground leading-relaxed [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  )
}
