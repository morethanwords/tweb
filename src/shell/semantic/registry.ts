import {SemanticLimits, DomainError, requireThat, hash, bytes, handle, checkHandle, freeze} from './common';
import type {Principal} from './contracts';

export interface Operation {id: string; key: string; requestHash: string; principalId: string; botId: string; status: 'pending' | 'committed' | 'rejected' | 'cancelled'; controller: AbortController; result: unknown; error: string | null; createdAt: number}
/** Receipts are retained for the entire epoch. No eviction can make a key execute twice. */
export class OperationRegistry {
  private records = new Map<string, Operation>();
  private ids = new Map<string, Operation>();
  constructor(readonly epoch: string, readonly now: () => number = Date.now, private ensureCapacity:(extra:number)=>void=()=>{}) {}
  claim(principal: Principal, botId: string, method: string, requestKey: string, request: unknown): {operation: Operation; fresh: boolean} {
    requireThat(requestKey.length > 0 && requestKey.length <= 128, 'INVALID_REQUEST_KEY');
    const key = JSON.stringify([this.epoch, principal.id, botId, method, requestKey]);
    const requestHash = hash(request); const previous = this.records.get(key);
    if(previous) {requireThat(previous.requestHash === requestHash, 'IDEMPOTENCY_KEY_REUSED'); return {operation: previous, fresh: false};}
    requireThat(this.records.size < SemanticLimits.receiptEntries, 'RECEIPT_LIMIT');
    const operation: Operation = {id: handle(this.epoch, 'operation'), key, requestHash, principalId: principal.id, botId, status: 'pending', controller: new AbortController(), result: null, error: null, createdAt: this.now()};
    this.ensureRoom(operation);
    this.records.set(key, operation); this.ids.set(operation.id, operation);
    return {operation, fresh: true};
  }
  private serialized(operation: Operation) {const {controller: _controller, ...rest} = operation; return rest;}
  // Terminal status/error must fit even when the allocation itself filled the
  // budget. Error codes are bounded ASCII; a rejection never needs more space.
  private allocatedBytes(operation:Operation):number {return bytes({...this.serialized(operation),status:'cancelled',error:null})+80;}
  retainedBytes(): number {return [...this.records.values()].reduce((sum, item) => sum + this.allocatedBytes(item), 0);}
  private ensureRoom(operation: Operation,additionalBytes=0): void {
    const previous = this.records.get(operation.key);
    const growth=this.allocatedBytes(operation)-(previous?this.allocatedBytes(previous):0);
    requireThat(this.retainedBytes()+growth<=SemanticLimits.receiptBytes, 'RECEIPT_LIMIT');
    this.ensureCapacity(Math.max(0,growth)+Math.max(0,additionalBytes));
  }
  checkCommit(operation: Operation, result: unknown,additionalBytes=0): void {
    requireThat(this.ids.get(operation.id) === operation && operation.status === 'pending' && !operation.controller.signal.aborted, 'CANCELLED');
    this.ensureRoom({...operation, status: 'committed', result},additionalBytes);
  }
  commit(operation: Operation, result: unknown): void {
    this.checkCommit(operation, result); operation.result = freeze(structuredClone(result)); operation.status = 'committed';
  }
  retainTerminalResult(operation: Operation, result: unknown): void {
    requireThat(operation.status === 'cancelled' || operation.status === 'rejected', 'OPERATION_NOT_TERMINAL');
    this.ensureRoom({...operation, result}); operation.result = freeze(structuredClone(result));
  }
  reject(operation: Operation, code: string): void {
    if(operation.status !== 'pending') return;
    operation.status = code === 'CANCELLED' ? 'cancelled' : 'rejected'; operation.error = /^[A-Z][A-Z0-9_]{0,79}$/.test(code)?code:'INTERNAL_ERROR';
  }
  replay(operation: Operation): unknown {
    if(operation.status === 'pending') return {operationId: operation.id, executionStatus: 'running', complete: false};
    if(operation.error) throw new DomainError(operation.error, operation.error, {operationId: operation.id, resultAvailable: operation.result !== null});
    return structuredClone(operation.result);
  }
  get(id: string, principal: Principal): Operation {
    checkHandle(this.epoch, id); const operation = this.ids.get(id);
    requireThat(operation && operation.principalId === principal.id && principal.botIds.includes(operation.botId), 'NOT_FOUND');
    return operation;
  }
  cancel(id: string, principal: Principal): unknown {
    const operation = this.get(id, principal);
    if(operation.status === 'pending') {operation.status = 'cancelled'; operation.error = 'CANCELLED'; operation.controller.abort();}
    return {operationId: operation.id, executionStatus: operation.status};
  }
}
