export interface GameRandomSource {
  next(): number
  spawnValue(): 2 | 4
}
