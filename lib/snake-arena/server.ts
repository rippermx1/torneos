import {createClient} from '@supabase/supabase-js'
import {getAppUrl,getSupabaseServerUrl,getSupabaseServiceKey} from '@/lib/env'
import type {SnakeDatabase} from './types'
export const SNAKE_PUBLIC_COLUMNS='id,name,starts_at,duration_seconds,max_players,rules_version,status,cancel_reason,created_at' as const
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function snakeAdmin(){return createClient<SnakeDatabase>(getSupabaseServerUrl()!,getSupabaseServiceKey()!,{auth:{persistSession:false,autoRefreshToken:false}})}
export function sameOrigin(req:Request){const canonical=getAppUrl();return !!canonical&&req.headers.get('origin')===new URL(canonical).origin}
export function validateCreation(body:unknown,now=Date.now()){
  if(!body||typeof body!=='object'||Array.isArray(body))return null
  const b=body as Record<string,unknown>
  // Monetary/rule inputs are never accepted by the free adapter.
  if(Object.keys(b).some(k=>!['name','starts_at','duration_seconds','max_players'].includes(k)))return null
  if(typeof b.name!=='string'||b.name.trim().length<3||b.name.trim().length>80||typeof b.starts_at!=='string')return null
  const at=Date.parse(b.starts_at)
  if(!Number.isFinite(at)||at<now+90000||at>now+30*86400000||!Number.isInteger(b.duration_seconds)||Number(b.duration_seconds)<60||Number(b.duration_seconds)>300||!Number.isInteger(b.max_players)||Number(b.max_players)<2||Number(b.max_players)>16)return null
  return {name:b.name.trim(),starts_at:new Date(at).toISOString(),duration_seconds:Number(b.duration_seconds),max_players:Number(b.max_players)}
}
