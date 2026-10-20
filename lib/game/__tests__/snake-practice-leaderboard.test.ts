import {describe,it,expect} from 'vitest'
import {readPracticeLeaderboard} from '../snake-practice-leaderboard'
describe('practice leaderboard validation',()=>{
  const tied={players:3,entries:[{name:'Aurora',score:200,position:1,isMe:false},{name:'Solar',score:200,position:1,isMe:true},{name:'Nebulosa',score:100,position:3,isMe:false}],mine:{participating:true,best:200,position:1}}
  it('accepts shared positions for ties and private owner identification',()=>{expect(readPracticeLeaderboard(tied)).toEqual(tied)})
  it('accepts empty/private profiles and owners beyond the displayed top 20',()=>{
    expect(readPracticeLeaderboard({players:0,entries:[],mine:{participating:false,best:460,position:null}})).not.toBeNull()
    const entries=Array.from({length:20},(_,i)=>({name:'Jugador '+i,score:100-i,position:i+1,isMe:false}))
    expect(readPracticeLeaderboard({players:25,entries,mine:{participating:true,best:40,position:25}})).not.toBeNull()
  })
  it('rejects reversed scores, incompatible ties and inconsistent owner details',()=>{
    expect(readPracticeLeaderboard({...tied,entries:[...tied.entries].reverse()})).toBeNull()
    expect(readPracticeLeaderboard({...tied,entries:tied.entries.map((e,i)=>i===1?{...e,position:2}:e)})).toBeNull()
    expect(readPracticeLeaderboard({...tied,mine:{participating:false,best:200,position:1}})).toBeNull()
    expect(readPracticeLeaderboard({...tied,mine:null})).toBeNull()
    expect(readPracticeLeaderboard({...tied,mine:{participating:true,best:999,position:1}})).toBeNull()
  })
  it('rejects malformed or oversized public rows without inventing empty data',()=>{
    for(const name of ['','<script>','A'.repeat(21)])expect(readPracticeLeaderboard({...tied,entries:tied.entries.map((e,i)=>i===0?{...e,name}:e)})).toBeNull()
    expect(readPracticeLeaderboard({...tied,players:0})).toBeNull()
    expect(readPracticeLeaderboard({error:'unavailable'})).toBeNull()
  })
})
