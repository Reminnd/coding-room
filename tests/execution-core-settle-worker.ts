// settleRunAttempt 的独立连接并发回归入口：每个 Worker 打开自己的 file-backed
// DatabaseSync 与 RoomService，在 test-only barrier 同时释放后调用同一 public command。
import { DatabaseSync } from 'node:sqlite';
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { ProtocolError } from '../src/protocol/errors.ts';
import { RoomService, type SettleAttemptInput } from '../src/room/room-service.ts';

const EXECUTOR = { participant_id: 'local-runner', actor_role: 'executor' as const };

export interface SettlementWorkerData {
  dbPath: string;
  payload: SettleAttemptInput;
  barrier: SharedArrayBuffer;
}

export type SettlementWorkerMessage =
  | { kind: 'ready' }
  | { kind: 'outcome'; result: 'success' }
  | { kind: 'outcome'; result: 'error'; code: string | null; isProtocolError: boolean };

if (!isMainThread) {
  const data = workerData as SettlementWorkerData;
  const port = parentPort!;
  const db = new DatabaseSync(data.dbPath);
  try {
    const service = new RoomService(db);
    const barrier = new Int32Array(data.barrier);
    port.postMessage({ kind: 'ready' } satisfies SettlementWorkerMessage);
    const notified = Atomics.wait(barrier, 0, 0, 10_000);
    if (notified === 'timed-out') {
      port.postMessage({
        kind: 'outcome',
        result: 'error',
        code: 'barrier_timeout',
        isProtocolError: false,
      } satisfies SettlementWorkerMessage);
    } else {
      try {
        service.settleRunAttempt(data.payload, EXECUTOR);
        port.postMessage({ kind: 'outcome', result: 'success' } satisfies SettlementWorkerMessage);
      } catch (err) {
        port.postMessage({
          kind: 'outcome',
          result: 'error',
          code: (err as { code?: string }).code ?? null,
          isProtocolError: err instanceof ProtocolError,
        } satisfies SettlementWorkerMessage);
      }
    }
  } finally {
    db.close();
  }
}
