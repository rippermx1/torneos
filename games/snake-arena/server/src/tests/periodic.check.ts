import {test} from 'node:test'
import assert from 'node:assert/strict'
import {periodic} from '../periodic.js'
test('deadline scheduler absorbs timer rounding and bounds catch-up after a stall',()=>{
  let now=0,ticks=0,pending:{callback:()=>void;delay:number;cancelled:boolean}|undefined
  const clock={now:()=>now,schedule:(callback:()=>void,delay:number)=>{const task={callback,delay,cancelled:false};pending=task;return()=>{task.cancelled=true}}}
  const stop=periodic(40,()=>{ticks++;now+=2},clock)
  for(let i=0;i<20;i++){const task=pending!;assert.equal(task.cancelled,false);now+=task.delay+15;task.callback()}
  assert.equal(ticks,20);assert.ok(now<840,`timer rounding drifted to ${now}ms`)
  now+=1000;pending!.callback();assert.equal(ticks,21);assert.equal(pending!.delay,40)
  stop();assert.equal(pending!.cancelled,true);pending!.callback();assert.equal(ticks,21)
})
