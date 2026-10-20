import {createHmac,timingSafeEqual} from 'node:crypto'
export type ArenaTicket={user:string;tournament:string;exp:number;version:1}
export function signTicket(payload:ArenaTicket,secret:string){
  if(secret.length<32)throw new Error('Arena secret must have at least 32 characters')
  const body=Buffer.from(JSON.stringify(payload)).toString('base64url')
  return body+'.'+createHmac('sha256',secret).update(body).digest('base64url')
}
export function verifyTicket(token:unknown,secret:string,now=Date.now()):ArenaTicket|null{
  if(typeof token!=='string'||token.length>1024||secret.length<32)return null
  const [body,signature,...extra]=token.split('.');if(!body||!signature||extra.length)return null
  const expected=createHmac('sha256',secret).update(body).digest(),actual=Buffer.from(signature,'base64url')
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null
  try{
    const p=JSON.parse(Buffer.from(body,'base64url').toString()) as ArenaTicket
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    return p.version===1&&uuid.test(p.user)&&uuid.test(p.tournament)&&Number.isSafeInteger(p.exp)&&p.exp>now&&p.exp<=now+120000?p:null
  }catch{return null}
}
