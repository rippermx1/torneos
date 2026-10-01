import { redirect } from 'next/navigation'
export const metadata = { title: '2048 Unity — TorneosPlay', description: 'Práctica de 2048 con el nuevo cliente Unity.' }
export default function UnityPracticePage() {
  redirect('/play')
}
