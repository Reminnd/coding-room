// Git Controller concurrent-execute regression 的 test-only Worker entry。每个 Worker
// 打开自己的 DatabaseSync connection，并经 public GitController.execute 进入 reservation。
// reservation barrier 只在本测试 subclass 中同步双方，随后原样调用 super；不提供任何
// production hook，也不属于 `tests/**/*.test.ts` glob。
import { DatabaseSync } from 'node:sqlite';
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { ProtocolError } from '../src/protocol/errors.ts';
import { GitController } from '../src/git/git-controller.ts';
import { runGit } from '../src/git/git-process.ts';
import type { EventActor, GitAction } from '../src/protocol/schema.ts';
import { RoomService, type GitActionPreviewIntent } from '../src/room/room-service.ts';

const GIT_CONTROLLER = { participant_id: 'local-runner', actor_role: 'git_controller' } as const;

export interface GitExecuteWorkerData {
  dbPath: string;
  gitActionId: string;
  startBarrier: SharedArrayBuffer;
  reservationBarrier: SharedArrayBuffer;
  barrierTimeoutMs: number;
}

export interface GitExecuteWorkerError {
  code: string | null;
  isProtocolError: boolean;
  message: string;
}

export type GitExecuteWorkerMessage =
  | { kind: 'ready' }
  | {
    kind: 'result';
    status: GitAction['status'] | null;
    error: GitExecuteWorkerError | null;
    mutationProcessCount: number;
    reservationBarrierArrivals: number;
  };

class ReservationBarrierRoomService extends RoomService {
  private readonly barrier: Int32Array;
  private readonly timeoutMs: number;

  constructor(db: DatabaseSync, barrier: SharedArrayBuffer, timeoutMs: number) {
    super(db);
    this.barrier = new Int32Array(barrier);
    this.timeoutMs = timeoutMs;
  }

  override reserveGitAction(gitActionId: string, observedPreview: GitActionPreviewIntent, actor: EventActor): GitAction {
    const arrivals = Atomics.add(this.barrier, 0, 1) + 1;
    if (arrivals === 2) {
      Atomics.store(this.barrier, 1, 1);
      Atomics.notify(this.barrier, 1, 2);
    } else if (Atomics.wait(this.barrier, 1, 0, this.timeoutMs) === 'timed-out') {
      Atomics.store(this.barrier, 2, 1);
      Atomics.store(this.barrier, 1, 1);
      Atomics.notify(this.barrier, 1, 2);
    }
    if (Atomics.load(this.barrier, 2) !== 0) {
      throw new Error('reservation barrier timeout');
    }
    return super.reserveGitAction(gitActionId, observedPreview, actor);
  }
}

function workerError(error: unknown, fallbackCode: string | null = null): GitExecuteWorkerError {
  return {
    code: (error as { code?: string }).code ?? fallbackCode,
    isProtocolError: error instanceof ProtocolError,
    message: error instanceof Error ? error.message : String(error),
  };
}

if (!isMainThread) {
  const data = workerData as GitExecuteWorkerData;
  const port = parentPort!;
  const db = new DatabaseSync(data.dbPath);
  const service = new ReservationBarrierRoomService(db, data.reservationBarrier, data.barrierTimeoutMs);
  let mutationProcessCount = 0;
  const controller = new GitController(service, async (command, args, cwd) => {
    if (command === 'worktree' && args[0] === 'add') mutationProcessCount += 1;
    return runGit(command, args, cwd);
  });
  const reservationBarrier = new Int32Array(data.reservationBarrier);
  const postResult = (status: GitAction['status'] | null, error: GitExecuteWorkerError | null): void => {
    port.postMessage({
      kind: 'result',
      status,
      error,
      mutationProcessCount,
      reservationBarrierArrivals: Atomics.load(reservationBarrier, 0),
    } satisfies GitExecuteWorkerMessage);
  };

  port.postMessage({ kind: 'ready' } satisfies GitExecuteWorkerMessage);
  const started = Atomics.wait(new Int32Array(data.startBarrier), 0, 0, data.barrierTimeoutMs);
  if (started === 'timed-out') {
    postResult(null, workerError(new Error('start barrier timeout'), 'start_barrier_timeout'));
    db.close();
  } else {
    try {
      const action = await controller.execute(data.gitActionId, GIT_CONTROLLER);
      postResult(action.status, null);
    } catch (error) {
      postResult(null, workerError(error));
    } finally {
      db.close();
    }
  }
}
