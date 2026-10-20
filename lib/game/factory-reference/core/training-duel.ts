import type { FleetView } from '../contracts';

export type DuelMove = 'attack' | 'guard' | 'repair';
export interface DuelState {
  turn: number;
  playerHull: number;
  playerMaxHull: number;
  enemyHull: number;
  enemyMaxHull: number;
  result: 'playing' | 'victory' | 'defeat' | 'draw';
  log: string[];
}

const ENEMY_HULL = 80;
const MAX_TURNS = 24;

export function startTrainingDuel(fleet: FleetView): DuelState {
  if (!fleet.unlocked || fleet.ships.length === 0) {
    throw new Error('Se necesita al menos una nave para entrenar.');
  }
  const hull = 100 + fleet.totals.shield * 2;
  return {turn: 0, playerHull: hull, playerMaxHull: hull,
    enemyHull: ENEMY_HULL, enemyMaxHull: ENEMY_HULL,
    result: 'playing', log: ['Dron de entrenamiento desplegado. Elige una maniobra.']};
}

/** Simulación determinista del navegador: no envía comandos ni concede recompensas. */
export function advanceTrainingDuel(state: DuelState, fleet: FleetView,
    move: DuelMove): DuelState {
  if (state.result !== 'playing') return state;
  const turn = state.turn + 1;
  const enemyGuards = turn % 4 === 0;
  let playerHull = state.playerHull;
  let enemyHull = state.enemyHull;
  const lines = [`Turno ${turn}:`];
  if (move === 'attack') {
    const raw = Math.max(5, fleet.totals.attack);
    const damage = enemyGuards ? Math.max(1, Math.ceil(raw / 2)) : raw;
    enemyHull = Math.max(0, enemyHull - damage);
    lines.push(`Tu flota impacta por ${damage} de daño${enemyGuards ? ' contra el escudo rival' : ''}.`);
  } else if (move === 'repair') {
    const repair = Math.max(4, fleet.totals.repair);
    const recovered = Math.min(repair, state.playerMaxHull - playerHull);
    playerHull += recovered;
    lines.push(`Reparas ${recovered} puntos de casco.`);
  } else {
    lines.push('Tu flota refuerza el escudo.');
  }
  if (enemyHull > 0) {
    const raw = enemyGuards ? 5 : 9;
    const damage = move === 'guard' ? Math.max(1, Math.ceil(raw / 3)) : raw;
    playerHull = Math.max(0, playerHull - damage);
    lines.push(`El dron responde por ${damage} de daño.`);
  }
  const result = enemyHull === 0 ? 'victory' : playerHull === 0 ? 'defeat'
    : turn >= MAX_TURNS ? 'draw' : 'playing';
  if (result !== 'playing') lines.push(result === 'victory' ? 'Victoria de entrenamiento.'
    : result === 'defeat' ? 'Tu flota fue retirada del simulador.' : 'Entrenamiento terminado en empate.');
  return {turn, playerHull, playerMaxHull: state.playerMaxHull,
    enemyHull, enemyMaxHull: state.enemyMaxHull, result,
    log: [...state.log, ...lines]};
}
