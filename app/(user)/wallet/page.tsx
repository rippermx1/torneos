import { redirect } from 'next/navigation'

// La ruta /wallet fue eliminada como concepto: la plataforma no mantiene saldos
// de usuarios. Los premios y recompensas viven en /premios.
export default function WalletRedirect() {
  redirect('/premios')
}
