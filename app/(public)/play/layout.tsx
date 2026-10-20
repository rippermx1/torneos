import { Suspense } from 'react'
import { PracticeNavigation } from '@/components/game/practice-navigation'

export default function PracticeLayout({ children }: { children: React.ReactNode }) {
  return <><Suspense fallback={null}><PracticeNavigation /></Suspense>{children}</>
}
