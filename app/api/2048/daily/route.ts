import { getDaily2048Challenge } from '@/lib/game/daily-2048'

export const dynamic = 'force-dynamic'
export function GET() {
  return Response.json(getDaily2048Challenge(Date.now()), { headers: { 'Cache-Control': 'no-store' } })
}
