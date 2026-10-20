import {readColonyCommand,type ColonyAction,type ColonyCommand,type ColonyReceipt} from './factory-3d-domain'

export class ColonyHttpError extends Error {constructor(public status: number,public code: string){super(code)}}
export type AccountColonyReceipt=ColonyReceipt & {accountId: string}
export async function recoverAccountColony(storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>,send:(command:ColonyCommand)=>Promise<AccountColonyReceipt>){
  // Identity is unknown at boot. This key can contain only a sync, so it cannot
  // transfer a spending/mining intention between accounts. Persist its UUID to
  // recover the original offline receipt even after response loss and reload.
  const key='torneos.factory-empire.account-bootstrap-sync.v1',raw=storage.getItem(key)
  const command=raw?readColonyCommand(JSON.parse(raw)):{commandId:crypto.randomUUID(),action:{kind:'sync'} as const}
  if(!command||command.action.kind!=='sync')throw new Error('Sincronización pendiente incompatible; se conserva.')
  storage.setItem(key,JSON.stringify(command))
  const receipt=await send(command)
  if(receipt.commandId!==command.commandId||!receipt.accountId)throw new Error('Sincronización no confirmada.')
  storage.removeItem(key);return receipt
}
export class AccountColonyCommands<T extends AccountColonyReceipt=AccountColonyReceipt> {
  private key: string
  private pending: ColonyCommand | null=null
  constructor(public accountId: string,private storage: Pick<Storage,'getItem'|'setItem'|'removeItem'>,private send: (command: ColonyCommand)=>Promise<T>,namespace='account-command.v1'){
    this.key=`torneos.factory-empire.${namespace}:${accountId}`
    const raw=storage.getItem(this.key)
    if(raw){this.pending=readColonyCommand(JSON.parse(raw));if(!this.pending)throw new Error('Comando pendiente incompatible; se conserva.')}
  }
  get hasPending(){return this.pending!==null}
  async submit(action: ColonyAction){if(this.pending)throw new Error('Recupera primero la acción pendiente.');const command={commandId:crypto.randomUUID(),action};this.storage.setItem(this.key,JSON.stringify(command));this.pending=command;return this.retry()}
  async retry(){
    if(!this.pending)throw new Error('No hay acción pendiente.')
    let receipt:T
    try {receipt=await this.send(this.pending)}catch(error){
      // Only explicit validation/reuse errors are terminal. Timeouts/5xx/auth
      // changes keep the exact UUID and payload until the original account returns.
      if(error instanceof ColonyHttpError&&[400,409,413,415].includes(error.status)){this.storage.removeItem(this.key);this.pending=null}
      throw error
    }
    if(receipt.accountId!==this.accountId||receipt.commandId!==this.pending.commandId)throw new Error('Respuesta de otra cuenta o comando. Acción pendiente conservada.')
    this.storage.removeItem(this.key);this.pending=null;return receipt
  }
}
