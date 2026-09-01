// execution-core.test.ts 的真实并发 claim 回归（Review finding inc10-r1）使用的 Worker
// entry。worker_threads 需要独立 entry 文件；每个 Worker 打开自己的 DatabaseSync 连接并
// 构造自己的 RoomService，模拟两个并发 Executor process。主线程经 SharedArrayBuffer
// barrier 同步双方 start（test-side barrier，不是 production test hook），随后双方同时
// 调用公开 claimRunAttempt；outcome 以 message 回传主线程断言。文件名不含 .test，不进入
// `tests/**/*.test.ts` 测试 glob。
import { DatabaseSync } from 'node:sqlite';
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { ProtocolError } from '../src/protocol/errors.ts';
import { RoomService } from '../src/room/room-service.ts';

// v0.4 actor literal：与 bootstrap assignment 一致（测试侧独立 literal）。
const EXECUTOR = { participant_id: 'local-runner', actor_role: 'executor' as const };

export interface ClaimWorkerData {
  dbPath: string;
  roomId: string;
  runId: string;
  attemptId: string;
  worktree: string;
  barrier: SharedArrayBuffer;
}

export type ClaimWorkerMessage =
  | { kind: 'ready' }
  | { kind: 'outcome'; result: 'success'; created: boolean }
  | { kind: 'outcome'; result: 'error'; code: string | null; isProtocolError: boolean };

if (!isMainThread) {
  const data = workerData as ClaimWorkerData;
  const port = parentPort!;
  const db = new DatabaseSync(data.dbPath);
  const service = new RoomService(db);
  const barrier = new Int32Array(data.barrier);
  port.postMessage({ kind: 'ready' } satisfies ClaimWorkerMessage);
  // 主线程在双方 ready 后 notify 并同时释放；timeout 保护避免任一 Worker 故障时挂死。
  const notified = Atomics.wait(barrier, 0, 0, 10_000);
  if (notified === 'timed-out') {
    port.postMessage({
      kind: 'outcome',
      result: 'error',
      code: 'barrier_timeout',
      isProtocolError: false,
    } satisfies ClaimWorkerMessage);
  } else {
    try {
      const out = service.claimRunAttempt(
        {
          attempt_id: data.attemptId,
          run_id: data.runId,
          room_id: data.roomId,
          worktree_path: data.worktree,
        },
        EXECUTOR,
      );
      port.postMessage({ kind: 'outcome', result: 'success', created: out.created } satisfies ClaimWorkerMessage);
    } catch (err) {
      // loser 必须是 domain ProtocolError（run_already_active / worktree_already_owned），
      // raw SQLite error（database is locked 等）由 isProtocolError=false 暴露给断言。
      port.postMessage({
        kind: 'outcome',
        result: 'error',
        code: (err as { code?: string }).code ?? null,
        isProtocolError: err instanceof ProtocolError,
      } satisfies ClaimWorkerMessage);
    }
  }
  db.close();
}
