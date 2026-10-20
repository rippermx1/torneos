import type { CommandResult } from '../contracts.js';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string,
    public readonly result?: CommandResult, public readonly code?: string) {
    super(message);
    this.name = 'ApiError';
  }
  get terminal(): boolean {
    // Solo un recibo o conflicto de UUID propio de la API cierra la intención.
    // Los 4xx de un intermediario no prueban que la acción no se confirmó.
    return this.status >= 400 && this.status < 500
      && (!!this.result || this.status === 409 && this.code === 'idempotency_conflict');
  }
}

export class PendingStorageError extends Error {
  constructor(public readonly operation: 'read' | 'save' | 'clear' | 'corrupt') {
    const message = operation === 'corrupt'
      ? 'La acción pendiente guardada no se puede leer. No se enviarán acciones nuevas; revisa los datos del sitio.'
      : operation === 'clear'
        ? 'No pudimos limpiar una acción respondida del almacenamiento. Reinténtala con el mismo identificador.'
        : 'El almacenamiento de esta pestaña está bloqueado. Permite los datos del sitio y recarga para jugar con seguridad.';
    super(message);
    this.name = 'PendingStorageError';
  }
}
