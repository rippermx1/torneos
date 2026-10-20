import {describe,it,expect} from 'vitest'
import {readCompetitiveBoard,type CompetitiveEntry} from '../leaderboard'
const row=(points=100,wins=1,position=1):CompetitiveEntry=>({name:'Aurora',points,wins,tournaments:2,position,isMe:false})
const board=(entries:unknown[]=[row()])=>({rules:'snake-league-v1',players:entries.length,entries,mine:null})
describe('competitive projection',()=>{
  it('accepts guests, zero-point last place and shared ranks with wins breaking ties',()=>{
    for(const value of [board(),board([]),board([row(0,0)]),board([row(),row(),row(67,0,3)]),board([row(100,1),row(100,0,2)])])expect(readCompetitiveBoard(value)).toEqual(value)
  })
  it('validates own private totals and consistent personal position inside and beyond top20',()=>{
    const privateBoard={...board([]),mine:{points:200,wins:2,tournaments:2,position:null,participating:false}}
    expect(readCompetitiveBoard(privateBoard)).toEqual(privateBoard)
    const entries=Array.from({length:20},()=>row()),outside={...board(entries),players:25,mine:{points:0,wins:0,tournaments:1,position:25,participating:true}}
    expect(readCompetitiveBoard(outside)).toEqual(outside)
    expect(readCompetitiveBoard({...outside,mine:{points:100,wins:1,tournaments:2,position:1,participating:true}})).not.toBeNull()
    expect(readCompetitiveBoard({...board([{...row(),isMe:true}]),mine:{points:100,wins:1,tournaments:2,position:1,participating:true}})).not.toBeNull()
  })
  it('rejects corrupt ranks, ordering, totals, identity and partial snapshots',()=>{
    for(const bad of [null,{}, {...board(),rules:'practice'}, {...board(),players:2},board([row(100,0),row(100,1,2)]),board([row(),row(67,0,1)]),board([row(),row(100,1,2)]),board([row(50,1)]),board([{...row(),points:Infinity}]),board([{...row(),name:'<script>'}]),board([{...row(),isMe:true}]),board([{...row(),user_id:'private'}]),{...board(),mine:{participating:false,points:100,wins:1,tournaments:1,position:1}}])expect(readCompetitiveBoard(bad)).toBeNull()
  })
})
