import {createHmac,timingSafeEqual} from 'node:crypto'
export type PracticeTicket={purpose:'snake-practice-v1';userId:string;name:string;origin:string;nonce:string;issuedAt:number;expiresAt:number;leaseUntil:number}
export const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function signPracticeTicket(payload:PracticeTicket,secret:string){
  if(secret.length<32)throw new Error('Practice signing secret is required')
  const body=Buffer.from(JSON.stringify(payload)).toString('base64url')
  return body+'.'+createHmac('sha256',secret).update('snake-practice-v1:'+body).digest('base64url')
}
export function verifyPracticeTicket(value:unknown,secret:string,origin:string,now=Date.now()):PracticeTicket|null{
  if(typeof value!=='string'||value.length>900||secret.length<32)return null
  const [body,sig,...extra]=value.split('.');if(!body||!sig||extra.length)return null
  const expected=createHmac('sha256',secret).update('snake-practice-v1:'+body).digest(),actual=Buffer.from(sig,'base64url')
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null
  try{
    const p=JSON.parse(Buffer.from(body,'base64url').toString('utf8')) as PracticeTicket
    return p.purpose==='snake-practice-v1'&&uuid.test(p.userId)&&uuid.test(p.nonce)&&p.origin===origin&&typeof p.name==='string'&&p.name.length>0&&p.name.length<=20&&
      [p.issuedAt,p.expiresAt,p.leaseUntil].every(Number.isSafeInteger)&&p.issuedAt<=now&&p.issuedAt>=now-30000&&p.expiresAt>now&&p.expiresAt<=p.issuedAt+30000&&p.leaseUntil>now&&p.leaseUntil<=p.issuedAt+300000?p:null
  }catch{return null}
}
