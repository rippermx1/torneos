import { redirect } from 'next/navigation'

// No existen cargas de saldo: cada participación se compra al momento en el
// checkout del torneo.
export default function DepositRedirect() {
  redirect('/tournaments')
}
