export type Point={x:number;y:number}
export class Grid<T extends Point> {
  private cells=new Map<string,T[]>()
  constructor(private size:number) {}
  private key(x:number,y:number){return `${Math.floor(x/this.size)},${Math.floor(y/this.size)}`}
  add(value:T){const key=this.key(value.x,value.y);const cell=this.cells.get(key);if(cell) cell.push(value);else this.cells.set(key,[value])}
  near(x:number,y:number,radius:number):T[]{
    const found:T[]=[]
    for(let cx=Math.floor((x-radius)/this.size);cx<=Math.floor((x+radius)/this.size);cx++)
      for(let cy=Math.floor((y-radius)/this.size);cy<=Math.floor((y+radius)/this.size);cy++) found.push(...(this.cells.get(`${cx},${cy}`)??[]))
    return found
  }
}
export const distanceSquared=(a:Point,b:Point)=>(a.x-b.x)**2+(a.y-b.y)**2
