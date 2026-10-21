import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { isLocalEnvironment } from '@/lib/dev/local-environment'

const geist = Geist({
  variable: '--font-geist',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'TorneosPlay',
  description: 'Juega 2048 gratis, supera el desafío diario y sigue tu progreso. Entrenamiento en demostración y torneos con ticket sólo informativo.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {isLocalEnvironment() && <p className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-950">Ambiente local · datos de prueba · pagos simulados sin cargos reales</p>}
        {process.env.TORNEOS_ENV === 'cloud-development' && <p className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-950">Ambiente de desarrollo · datos de prueba · sin pagos ni premios reales</p>}
        {children}
      </body>
    </html>
  )
}
