// A display deadline uses monotonic elapsed time. Replaying an old receipt or
// changing the device clock can never extend it; the database still decides end.
export class ChallengeClock {
  private deadline:number
  constructor(endsAtMs:number,serverTimeMs:number,receivedAt:number){this.deadline=receivedAt+Math.max(0,endsAtMs-serverTimeMs)}
  remaining(now:number){return Math.max(0,this.deadline-now)}
  confirm(endsAtMs:number,serverTimeMs:number,receivedAt:number){this.deadline=Math.min(this.deadline,receivedAt+Math.max(0,endsAtMs-serverTimeMs))}
}
