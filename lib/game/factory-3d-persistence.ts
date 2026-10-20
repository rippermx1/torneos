import {createHash, randomUUID} from 'node:crypto'
import {applyColonyCommand, newColony, type ColonyCommand, type ColonyState, type ColonyReceipt} from './factory-3d-domain'

export interface ColonyStore {
  load(userId: string,commandId: string,hash: string): Promise<{state?: ColonyState | null; revision?: number; serverTimeMs?: number; receipt?: ColonyReceipt}>
  commit(userId: string,commandId: string,hash: string,revision: number,receipt: ColonyReceipt): Promise<{conflict?: boolean; receipt?: ColonyReceipt}>
}
export class ColonyPersistenceError extends Error {constructor(public code: string) {super(code)}}
export async function persistColony(store: ColonyStore,userId: string,command: ColonyCommand) {
  // Canonical key order avoids false UUID conflicts after JSON object reordering.
  const action=Object.fromEntries(Object.entries(command.action).sort(([a],[b])=>a.localeCompare(b)))
  const hash=createHash('sha256').update(JSON.stringify(action)).digest('hex')
  for(let attempt=0;attempt<6;attempt++) {
    const loaded=await store.load(userId,command.commandId,hash)
    if(loaded.receipt)return loaded.receipt
    const now=Number(loaded.serverTimeMs),revision=Number(loaded.revision)
    if(!Number.isSafeInteger(now)||!Number.isSafeInteger(revision))throw new ColonyPersistenceError('storage_unavailable')
    const source=loaded.state??newColony(now,randomUUID().replaceAll('-',''))
    if(source.revision!==revision)throw new ColonyPersistenceError('storage_corrupt')
    const receipt=applyColonyCommand(source,command,now,randomUUID().replaceAll('-',''))
    const committed=await store.commit(userId,command.commandId,hash,revision,receipt)
    if(committed.receipt)return committed.receipt
    if(!committed.conflict)throw new ColonyPersistenceError('storage_unavailable')
  }
  throw new ColonyPersistenceError('colony_busy')
}
