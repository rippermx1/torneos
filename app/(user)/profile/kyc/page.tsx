import Link from 'next/link'

// Defense in depth: never render the historical document-upload form.
export default function KycPage() {
  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-2xl font-bold">Juega sin verificación financiera</h1>
      <p>2048 gratuito no solicita RUT, documentos de identidad ni datos bancarios.</p>
      <Link href="/play" className="underline underline-offset-2">Volver a 2048</Link>
    </div>
  )
}
