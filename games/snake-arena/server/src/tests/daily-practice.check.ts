import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdtempSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {DailyPractice} from '../daily-practice.js'
import {dailyProgress,dailyWindow} from '../daily-missions.js'
import {Room} from '../room.js'
import {defaults} from '../config.js'
import type {DailyContribution} from '../practice-store.js'
const settle=()=>new Promise(resolve=>setTimeout(resolve,20))
test('daily progress accumulates different lives and saves once, without counting unchanged snapshots',async()=>{
  const now=Date.parse('2026-10-02T12:00:00Z'),user=randomUUID(),ledger=new Map<string,DailyContribution>(),totals: number[]=[]
  let writes=0
  const tracker=new DailyPractice({best:async()=>0,save:async()=>{},saveDaily:async v=>{writes++;ledger.set(v.round_id,v);const counts=[...ledger.values()].reduce((n,r)=>({lights:n.lights+r.lights,growth:n.growth+r.growth,stars:n.stars+r.stars}),{lights:0,growth:0,stars:0}),daily=dailyProgress(now,counts);return {xp:daily.earned,daily}}},()=>now,(_user,xp)=>totals.push(xp))
  const p=new Room('room',defaults,()=>.5).add('p','Cuenta')
  for(let i=0;i<3;i++){const round=randomUUID();Object.assign(p,{ordinaryPickups:10,rarePickups:i===0?2:0,maxSize:24});tracker.observe(round,user,p);tracker.flush();await settle();tracker.observe(round,user,p);tracker.flush();await settle();tracker.forget(round)}
  assert.equal(writes,3);assert.equal(tracker.progress(user).daily.earned,235);assert.equal(totals.at(-1),235);assert.equal(tracker.pendingCount,0)
})
test('midnight splits pickups by day, preserves old checkpoint, and never reuses a completed growth in the same life',async()=>{
  let now=Date.parse('2026-10-03T02:59:59Z');const user=randomUUID(),round=randomUUID(),writes:DailyContribution[]=[]
  const tracker=new DailyPractice({best:async()=>0,save:async()=>{},saveDaily:async v=>{writes.push(v);return {xp:0,daily:dailyProgress(now)}}},()=>now,()=>{})
  const p=new Room('room',defaults,()=>.5).add('p','Cuenta');Object.assign(p,{ordinaryPickups:4,rarePickups:1,maxSize:24});tracker.observe(round,user,p)
  now+=2000;Object.assign(p,{ordinaryPickups:6,rarePickups:2});tracker.observe(round,user,p);tracker.flush();await settle()
  assert.equal(writes.length,2);assert.equal(writes[0].day,'2026-10-02');assert.equal(writes[0].lights,4);assert.equal(writes[0].growth,1);assert.equal(writes[1].day,'2026-10-03');assert.equal(writes[1].lights,2);assert.equal(writes[1].stars,1);assert.equal(writes[1].growth,0)
})
test('durable checkpoint retries after reconstruction and retains its original day',async()=>{
  let now=Date.parse('2026-10-03T02:59:59Z'),available=false;const directory=mkdtempSync(join(tmpdir(),'snake-daily-')),user=randomUUID(),writes:DailyContribution[]=[]
  const store={best:async()=>0,save:async()=>{},saveDaily:async(v:DailyContribution)=>{writes.push(v);if(!available)throw new Error('offline');return {xp:60,daily:dailyProgress(now)}}}
  try{const tracker=new DailyPractice(store,()=>now,()=>{},directory),p=new Room('room',defaults,()=>.5).add('p','Cuenta');p.ordinaryPickups=30;tracker.observe(randomUUID(),user,p);tracker.flush();await settle();assert.equal(tracker.progress(user).dailyState,'retrying')
    now+=3000;available=true;const recovered=new DailyPractice(store,()=>now,()=>{},directory);recovered.flush();await settle();assert.equal(recovered.pendingCount,0);assert.deepEqual(writes[0],writes[1]);assert.notEqual(writes[1].day,dailyWindow(now).day)
  }finally{rmSync(directory,{recursive:true,force:true})}
})
test('a pickup arriving during an in-flight write remains queued until its newer checkpoint confirms',async()=>{
  let now=Date.parse('2026-10-02T12:00:00Z'),resolve:((v:{xp:number;daily:ReturnType<typeof dailyProgress>})=>void)|undefined;const writes:DailyContribution[]=[],user=randomUUID(),round=randomUUID(),tracker=new DailyPractice({best:async()=>0,save:async()=>{},saveDaily:async v=>{writes.push(v);return new Promise(r=>{resolve=r})}},()=>now,()=>{})
  const p=new Room('room',defaults,()=>.5).add('p','Cuenta');p.ordinaryPickups=3;tracker.observe(round,user,p);tracker.flush();p.ordinaryPickups=5;tracker.observe(round,user,p);resolve!({xp:0,daily:dailyProgress(now,{lights:3,growth:0,stars:0})});await settle();assert.equal(tracker.pendingCount,1)
  now+=1001;tracker.flush();assert.equal(writes[1].lights,5);resolve!({xp:0,daily:dailyProgress(now,{lights:5,growth:0,stars:0})});await settle();assert.equal(tracker.pendingCount,0)
})
