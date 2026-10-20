import {SnakeTournament} from '@/components/tournament/snake-tournament'
export const metadata={title:'Torneo de Snake Arena — TorneosPlay'}
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <SnakeTournament id={id}/>}
