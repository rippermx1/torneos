import type { Action, Command, CommandResult } from '../contracts.js';
import { ApiError, PendingStorageError } from './errors';

export interface PendingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type Transport = (command: Command) => Promise<CommandResult>;

/** Una sola acción en vuelo. Guarda únicamente la intención, nunca el saldo.
 * Reintenta el mismo UUID tras un timeout o recarga de la misma pestaña.
 */
export class ReliableCommands {
  private pending: Command | undefined;
  private readonly key: string;
  busy = false;

  constructor(userId: string, private readonly storage: PendingStorage,
    private readonly transport: Transport) {
    this.key = `fe:pending:${userId}`;
    let raw: string | null;
    try { raw = storage.getItem(this.key); }
    catch { throw new PendingStorageError('read'); }
    if (raw) {
      let value: unknown;
      try { value = JSON.parse(raw); }
      catch { throw new PendingStorageError('corrupt'); }
      if (!value || typeof value !== 'object' || !('command_id' in value)
        || typeof value.command_id !== 'string' || !('kind' in value)) {
        throw new PendingStorageError('corrupt');
      }
      this.pending = value as Command; // La API vuelve a validar todo el payload.
    }
  }

  get hasPending(): boolean { return !!this.pending; }

  async submit(action: Action): Promise<CommandResult> {
    if (this.busy || this.pending) throw new Error('Resuelve primero la acción pendiente.');
    const command = { ...action, command_id: crypto.randomUUID() } as Command;
    // Sin almacenamiento no se envía: perder el identificador impediría un reintento seguro.
    try { this.storage.setItem(this.key, JSON.stringify(command)); }
    catch { throw new PendingStorageError('save'); }
    this.pending = command;
    return this.retry();
  }

  async retry(): Promise<CommandResult> {
    if (this.busy || !this.pending) throw new Error('No hay una acción disponible para reintentar.');
    this.busy = true;
    try {
      const result = await this.transport(this.pending);
      this.clear();
      return result;
    } catch (error) {
      // Red y rechazos ambiguos conservan el UUID; un rechazo definitivo lo libera.
      if (error instanceof ApiError && error.terminal) this.clear();
      throw error;
    } finally {
      this.busy = false;
    }
  }

  private clear(): void {
    try { this.storage.removeItem(this.key); }
    catch { throw new PendingStorageError('clear'); }
    this.pending = undefined;
  }
}
