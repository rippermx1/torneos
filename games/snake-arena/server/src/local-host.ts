import {networkInterfaces} from 'node:os'
import {isIP} from 'node:net'
export function resolveLocalHost(requested='127.0.0.1',assigned=Object.values(networkInterfaces()).flatMap(entries=>(entries??[]).filter(e=>!e.internal&&e.family==='IPv4').map(e=>e.address))){
  if(requested==='127.0.0.1')return requested
  const octets=requested.split('.').map(Number)
  const privateAddress=isIP(requested)===4&&(octets[0]===10||(octets[0]===172&&octets[1]>=16&&octets[1]<=31)||(octets[0]===192&&octets[1]===168))
  if(!privateAddress||!assigned.includes(requested))throw new Error('SNAKE_BIND_HOST must be loopback or an assigned private IPv4 address')
  return requested
}
export function practiceRequest(method:string|undefined,url:string|undefined){
  const path=new URL(url??'/', 'http://local.invalid').pathname
  if(method==='POST')return path==='/play/snake-arena/admission'||path==='/play/snake-arena/leaderboard'
  if(method!=='GET'&&method!=='HEAD')return false
  if(path==='/sign-in'||path==='/play/snake-arena/account'||path==='/play/snake-arena/leaderboard')return true
  return path==='/play/snake-arena'||path==='/play/snake-arena/'||path==='/favicon.ico'||path.startsWith('/_next/static/')||path.startsWith('/games/snake-arena/')
}
