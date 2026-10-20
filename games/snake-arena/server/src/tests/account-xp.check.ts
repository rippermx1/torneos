import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {PracticeSessions} from '../practice-sessions.js'
import {Room} from '../room.js'
import {defaults} from '../config.js'
import type {PracticeReward} from '../practice-store.js'
import type {PracticeTicket} from '../practice-ticket.js'
const settle=()=>new Promise(resolve=>setTimeout(resolve,20))
const ticket=(userId:string):PracticeTicket=>({purpose:'snake-practice-v1',userId,name:'Cuenta',origin:'http://practice.test',nonce:randomUUID(),issuedAt:100000,expiresAt:130000,leaseUntil:400000})
test('living missions save immediately once; new rounds reward again and confirmed account total survives new session',async()=>{
  const user=randomUUID(),ledger=new Map<string,PracticeReward>(),store={best:async()=>0,save:async()=>{},xp:async()=>[...ledger.values()].reduce((n,r)=>n+r.xp,0),saveReward:async(r:PracticeReward)=>{ledger.set(r.round_id+r.mission_id,r);return store.xp()}}
  const manager=new PracticeSessions('secret',store,()=>100000),room=new Room('room',{...defaults,practiceMissions:true},()=>.5),p=room.add('p','Cuenta'),s=manager.attach(ticket(user),room,'p',0)
  p.ordinaryPickups=5;manager.tick(()=>{});assert.equal(p.alive,true);assert.equal(s.recorded,false);assert.deepEqual(manager.progress(s),{accountXp:0,xpState:'saving',pendingXp:25})
  await settle();assert.equal(s.accountXp,25);manager.tick(()=>{});await settle();assert.equal(ledger.size,1)
  p.maxSize=24;p.rarePickups=1;manager.tick(()=>{});await settle();assert.equal(s.accountXp,120);assert.equal(ledger.size,3)
  p.alive=false;assert.ok(room.restart('p'));manager.restart(s);p.ordinaryPickups=5;manager.tick(()=>{});await settle();assert.equal(s.accountXp,145);assert.equal(ledger.size,4)
  manager.sessions.delete(user);const next=manager.attach(ticket(user),room,'p',0,await manager.xp(user));assert.equal(next.accountXp,145)
})
test('ambiguous reward retries same ID from durable outbox; late confirmation updates current owner after round restart',async()=>{
  let now=100000,available=false;const directory=mkdtempSync(join(tmpdir(),'snake-sa143-')),user=randomUUID(),writes:PracticeReward[]=[],ledger=new Map<string,PracticeReward>()
  const store={best:async()=>0,save:async()=>{},saveReward:async(r:PracticeReward)=>{writes.push(r);ledger.set(r.round_id+r.mission_id,r);if(!available)throw new Error('reply lost');return [...ledger.values()].reduce((n,r)=>n+r.xp,0)}}
  try{
    const manager=new PracticeSessions('secret',store,()=>now,()=>{},15000,directory),room=new Room('room',{...defaults,practiceMissions:true},()=>.5),p=room.add('p','Cuenta'),s=manager.attach(ticket(user),room,'p',0)
    p.ordinaryPickups=5;manager.tick(()=>{});await settle();assert.equal(manager.progress(s).xpState,'retrying');assert.equal(s.accountXp,0)
    const recovered=new PracticeSessions('secret',store,()=>now,()=>{},15000,directory),current=recovered.attach(ticket(user),room,'p',0);recovered.restart(current)
    available=true;now+=2001;recovered.flush();await settle();assert.equal(current.accountXp,25);assert.equal(recovered.progress(current).pendingXp,0);assert.equal(ledger.size,1);assert.deepEqual(writes[0],writes[1])
  }finally{rmSync(directory,{recursive:true,force:true})}
})
test('guest and tournament configuration never create account rewards',async()=>{
  let writes=0;const manager=new PracticeSessions('secret',{best:async()=>0,save:async()=>{},saveReward:async()=>{writes++;return 25}},()=>100000),room=new Room('room',defaults,()=>.5),p=room.add('p','Cuenta')
  manager.attach(ticket(randomUUID()),room,'p',0);p.ordinaryPickups=5;p.maxSize=100;p.rarePickups=1;manager.tick(()=>{});await settle();assert.equal(writes,0)
})
