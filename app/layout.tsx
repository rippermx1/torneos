import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { isLocalEnvironment } from '@/lib/dev/local-environment'
import { providerDispatchBlocked } from '@/lib/config/provider-dispatch.mjs'

const geist = Geist({
  variable: '--font-geist',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'TorneosPlay',
  description: 'Compite en torneos de 2048 y gana premios reales en pesos chilenos.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {providerDispatchBlocked() && <p className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-950">Entorno de pruebas · pagos y envíos de correo deshabilitados</p>}
        {isLocalEnvironment() && <p className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-950">Ambiente local · datos de prueba · pagos simulados sin cargos reales</p>}
        {process.env.TORNEOS_ENV === 'cloud-development' && <p className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-950">Ambiente de desarrollo · datos de prueba · sin pagos ni premios reales</p>}
        {children}
      </body>
    </html>
  )
}
