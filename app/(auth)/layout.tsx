import { connection } from 'next/server'

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // El CSP usa un nonce distinto por request. Forzar render dinámico permite
  // que Next adjunte ese nonce a todos los scripts del flujo de autenticación.
  await connection()

  return children
}
