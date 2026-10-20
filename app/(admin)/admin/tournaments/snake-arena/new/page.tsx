import {requireAdminMfa} from '@/lib/supabase/admin-mfa'
import {CreateSnakeTournament} from '@/components/tournament/create-snake-tournament'
export default async function Page(){await requireAdminMfa();return <main className="space-y-6 p-6"><h1 className="text-2xl font-bold">Nuevo torneo de Snake Arena</h1><CreateSnakeTournament/></main>}
