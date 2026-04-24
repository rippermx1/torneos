import { Navbar } from '@/components/navbar'

export default function UserLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="flex-1 max-w-5xl mx-auto px-4 py-10 w-full">{children}</main>
    </>
  )
}
