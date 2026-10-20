import {communityAccount} from '@/lib/game/factory-3d-community-server'
import {challengePost,challengeRpc,challengeReply,challengeFailure} from '@/lib/game/factory-3d-challenge-server'
export const runtime='nodejs'
export async function GET(){try{const {id,admin}=await communityAccount();return challengeReply({...await challengeRpc(admin,'factory_3d_challenge_status',{p_user:id}) as object,accountId:id})}catch(e){return challengeFailure(e)}}
export const POST=challengePost
