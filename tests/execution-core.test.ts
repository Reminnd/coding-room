import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Worker } from 'node:worker_threads';
import { ProtocolError } from '../src/protocol/errors.ts';
import { RoomRepository } from '../src/room/repository.ts';
import { RoomService } from '../src/room/room-service.ts';
import { getRoomStateSnapshot } from '../src/room/state-snapshot.ts';
import type { ClaimWorkerMessage } from './execution-core-claim-worker.ts';
import {
  makeAttempt,
  makeAttemptSettle,
  makeCodingResult,
  makeReview,
  makeTask,
} from './fixtures.ts';

// Stage 2 Execution Core 的并发/隔离测试矩阵（Contract verification 指定的 focused suite）：
// same-Run double claim、same-worktree double Run、different-worktree 并发、partial unique
// index → domain error 映射与 terminal race。多连接场景用同一 file-backed database 的两个
// SQLite connection 模拟两个 Runner/Executor process；行为 Oracle 来自 Contract 文本与
// 测试侧独立 literal，不导入被测实现的 allowed table/transition helper。
// claim/settle 在单 transaction 内完成；跨连接写竞争由 busy_timeout 串行化，loser 在
// winner commit 后以 fresh state 走 guard 或 partial unique index 路径。

// v0.4 actor literal：与 bootstrap assignment 一致（测试侧独立 literal）。
const PLANNER = { participant_id: 'codex-app', actor_role: 'planner' as const };
const REVIEWER = { participant_id: 'codex-app', actor_role: 'reviewer' as const };
const EXECUTOR = { participant_id: 'local-runner', actor_role: 'executor' as const };

function makeFixture(): { fixture: string; repo: string; head: string } {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-core-'));
  const repo = join(fixture, 'repo');
  execFileSync('git', ['init', '-q', '-b', 'main', repo]);
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@example.com',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@example.com',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  };
  execFileSync('git', ['config', '--local', 'commit.gpgsign', 'false'], { cwd: repo, env });
  execFileSync('git', ['config', '--local', 'core.autocrlf', 'false'], { cwd: repo, env });
  execFileSync('git', ['commit', '--allow-empty', '-q', '-m', 'base'], { cwd: repo, env });
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8', env }).trim();
  return { fixture, repo, head };
}

// 同一 database 的两个独立连接：模拟两个 Executor process 的并发事实。
// Windows 下 file-backed database 未关闭时 rmSync 会 EPERM，close() 必须在 cleanup 前调用。
function makeServices(fixture: string): {
  a: RoomService;
  b: RoomService;
  close: () => void;
} {
  const dbPath = join(fixture, 'room.db');
  const dbA = new DatabaseSync(dbPath);
  const dbB = new DatabaseSync(dbPath);
  return {
    a: new RoomService(dbA),
    b: new RoomService(dbB),
    close: () => {
      dbA.close();
      dbB.close();
    },
  };
}

// 完整 planning gate + 提交一个 implementation Task（返回 ready Run）。
function submitFirstTask(service: RoomService, taskId = 'task-1', runId = 'run-1'): void {
  service.createRoom('room-1', PLANNER);
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  service.submitTask(makeTask({ task_id: taskId, run_id: runId }), PLANNER);
}

function claimIn(
  service: RoomService,
  input: { attempt_id: string; run_id: string; room_id: string; worktree_path: string },
): {
  created: boolean;
  attempt: { attempt_id: string; attempt_no: number; worktree_path: string };
} {
  const out = service.claimRunAttempt(input, EXECUTOR);
  return {
    created: out.created,
    attempt: {
      attempt_id: out.attempt.attempt_id,
      attempt_no: out.attempt.attempt_no,
      worktree_path: out.attempt.worktree_path,
    },
  };
}

function errCode(fn: () => void): string {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof ProtocolError, `expected ProtocolError, got ${String(err)}`);
    return err.code;
  }
  assert.fail('expected the call to throw a ProtocolError');
}

test('same-Run double claim across two connections yields exactly one winner with zero residue', async () => {
  const { fixture, repo, head } = makeFixture();
  const { a, b, close } = makeServices(fixture);
  submitFirstTask(a);
  const winner = claimIn(a, { attempt_id: 'attempt-a', run_id: 'run-1', room_id: 'room-1', worktree_path: repo });
  assert.equal(winner.created, true);
  assert.equal(winner.attempt.attempt_no, 1);
  assert.equal(a.getRun('run-1')!.status, 'running');

  // 第二个连接以 fresh state 观察 winner 已 commit 的 active attempt：guard 拒绝，零残留。
  const loserCode = errCode(() =>
    claimIn(b, { attempt_id: 'attempt-b', run_id: 'run-1', room_id: 'room-1', worktree_path: repo }),
  );
  assert.equal(loserCode, 'run_already_active');
  assert.equal(b.getAttempt('attempt-b'), null, 'loser claim must leave no attempt row');
  assert.equal(a.getRun('run-1')!.status, 'running', 'loser must not disturb the winner Run');
  assert.equal(a.getAttempt('attempt-a')!.status, 'running');

  // loser 不产生 Event：cursor 停在 claim 之后。
  assert.equal(a.listEvents('room-1').length, 6);
  a.settleRunAttempt(makeAttemptSettle({ attempt_id: 'attempt-a' }), EXECUTOR);
  assert.equal(a.getAttempt('attempt-b'), null);
  close();
  rmSync(fixture, { recursive: true, force: true });
});

// Review finding inc10-r1 的真实并发 claim 回归：两个 Worker 各持独立 SQLite 连接，经
// SharedArrayBuffer barrier 同步 start 后同时调用公开 claimRunAttempt（不用 sequential
// call、repository 直写或 production test hook）。双方 outcome 集合与 zero-residue 检查由
// 主线程在 worker exit 后进行。
function runConcurrentClaims(
  dbPath: string,
  specs: Array<{ runId: string; attemptId: string }>,
  worktree: string,
): Promise<Array<ClaimWorkerMessage>> {
  const barrier = new SharedArrayBuffer(4);
  const messages: ClaimWorkerMessage[] = [];
  return new Promise((resolve, reject) => {
    let readyCount = 0;
    let exitCount = 0;
    for (const spec of specs) {
      const worker = new Worker(new URL('./execution-core-claim-worker.ts', import.meta.url), {
        workerData: {
          dbPath,
          roomId: 'room-1',
          runId: spec.runId,
          attemptId: spec.attemptId,
          worktree,
          barrier,
        },
      });
      worker.on('message', (msg: ClaimWorkerMessage) => {
        if (msg.kind === 'ready') {
          readyCount += 1;
          if (readyCount === specs.length) {
            // 双方 ready：同一时刻释放 barrier，两个 claim 真正并发进入。
            const int32 = new Int32Array(barrier);
            Atomics.store(int32, 0, 1);
            Atomics.notify(int32, 0, specs.length);
          }
        } else {
          messages.push(msg);
        }
      });
      worker.on('error', reject);
      worker.on('exit', () => {
        exitCount += 1;
        if (exitCount === specs.length) resolve(messages);
      });
    }
  });
}

test('concurrent same-Run claims across two Workers yield exactly one winner and run_already_active with zero residue', async () => {
  const { fixture, repo, head } = makeFixture();
  const { a, close } = makeServices(fixture);
  submitFirstTask(a);
  const messages = await runConcurrentClaims(
    join(fixture, 'room.db'),
    [
      { runId: 'run-1', attemptId: 'attempt-a' },
      { runId: 'run-1', attemptId: 'attempt-b' },
    ],
    repo,
  );
  // 恰好一个 winner + 一个 run_already_active；不允许 raw SQLite error（database is
  // locked 等），loser 必须是 domain ProtocolError。
  const results = messages
    .filter((m): m is Extract<ClaimWorkerMessage, { kind: 'outcome' }> => m.kind === 'outcome')
    .map((m) => (m.result === 'success' ? 'success' : m.code))
    .sort();
  assert.deepEqual(results, ['run_already_active', 'success']);
  const errorOutcome = messages.find(
    (m): m is Extract<ClaimWorkerMessage, { kind: 'outcome'; result: 'error' }> =>
      m.kind === 'outcome' && m.result === 'error',
  )!;
  assert.equal(errorOutcome.isProtocolError, true, 'loser must surface a domain ProtocolError, not a raw SQLite error');
  // loser 零残留：恰好一个 attempt 行、Run running、恰好一个 run_attempt_claimed Event。
  assert.equal(a.listAttemptsByRun('run-1').length, 1);
  assert.equal(a.getRun('run-1')!.status, 'running');
  assert.equal(a.listEvents('room-1').filter((e) => e.type === 'run_attempt_claimed').length, 1);
  close();
  rmSync(fixture, { recursive: true, force: true });
});

test('concurrent claims for two ready Runs on the same worktree yield worktree_already_owned for the loser with zero residue', async () => {
  const { fixture, repo, head } = makeFixture();
  const { a, close } = makeServices(fixture);
  submitFirstTask(a);
  a.transitionToArchitectureReview('room-1', PLANNER);
  a.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  a.submitTask(makeTask({ task_id: 'task-2', run_id: 'run-2' }), PLANNER);
  const messages = await runConcurrentClaims(
    join(fixture, 'room.db'),
    [
      { runId: 'run-1', attemptId: 'attempt-1' },
      { runId: 'run-2', attemptId: 'attempt-2' },
    ],
    repo,
  );
  const results = messages
    .filter((m): m is Extract<ClaimWorkerMessage, { kind: 'outcome' }> => m.kind === 'outcome')
    .map((m) => (m.result === 'success' ? 'success' : m.code))
    .sort();
  assert.deepEqual(results, ['success', 'worktree_already_owned']);
  const errorOutcome = messages.find(
    (m): m is Extract<ClaimWorkerMessage, { kind: 'outcome'; result: 'error' }> =>
      m.kind === 'outcome' && m.result === 'error',
  )!;
  assert.equal(errorOutcome.isProtocolError, true, 'loser must surface a domain ProtocolError, not a raw SQLite error');
  // 恰好一个 Run running（winner 非确定），loser Run 保持 ready 且 worktree 冻结回滚；
  // loser 无 attempt 行；恰好一个 run_attempt_claimed Event。
  const run1 = a.getRun('run-1')!;
  const run2 = a.getRun('run-2')!;
  assert.deepEqual([run1.status, run2.status].sort(), ['ready', 'running']);
  const loserRun = run1.status === 'ready' ? run1 : run2;
  const winnerRun = run1.status === 'ready' ? run2 : run1;
  assert.equal(loserRun.worktree_path, null, 'loser worktree freeze must roll back');
  assert.equal(winnerRun.worktree_path, repo);
  assert.equal(a.listAttemptsByRoom('room-1').length, 1, 'exactly one attempt row survives');
  assert.equal(a.listEvents('room-1').filter((e) => e.type === 'run_attempt_claimed').length, 1);
  close();
  rmSync(fixture, { recursive: true, force: true });
});

test('the active-attempt partial unique index maps a second active row to run_already_active', async () => {
  const { fixture, repo, head } = makeFixture();
  const { a, close } = makeServices(fixture);
  submitFirstTask(a);
  claimIn(a, { attempt_id: 'attempt-1', run_id: 'run-1', room_id: 'room-1', worktree_path: repo });

  // repository 直写第二个 active attempt（绕过 service guard，模拟两个 claim 同时通过 guard
  // 读、再并发 insert 的窗口）：partial unique index 是最终 backstop，映射为 domain error。
  const db3 = new DatabaseSync(join(fixture, 'room.db'));
  const repository = new RoomRepository(db3);
  const second = makeAttempt({
    attempt_id: 'attempt-2',
    run_id: 'run-1',
    room_id: 'room-1',
    task_id: 'task-1',
    attempt_no: 2,
    status: 'running',
    worktree_path: repo,
  });
  const code = errCode(() => repository.insertAttempt(second));
  assert.equal(code, 'run_already_active');
  assert.equal(a.getAttempt('attempt-2'), null, 'index loser must leave no attempt row');
  db3.close();
  close();
  rmSync(fixture, { recursive: true, force: true });
});

test('same canonical worktree double Run maps the loser to worktree_already_owned and the lease releases on acceptance', async () => {
  const { fixture, repo, head } = makeFixture();
  const { a, close } = makeServices(fixture);
  submitFirstTask(a);
  // 第二个 planning cycle 提交 task-2/run-2：两个 ready Run 并存，worktree 均未冻结。
  a.transitionToArchitectureReview('room-1', PLANNER);
  a.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  a.submitTask(makeTask({ task_id: 'task-2', run_id: 'run-2' }), PLANNER);

  const first = claimIn(a, { attempt_id: 'attempt-1', run_id: 'run-1', room_id: 'room-1', worktree_path: repo });
  assert.equal(first.created, true);

  // run-1 未 accepted：canonical worktree 被 partial unique index 占用，run-2 的 claim 整体回滚。
  const loserCode = errCode(() =>
    claimIn(a, { attempt_id: 'attempt-2', run_id: 'run-2', room_id: 'room-1', worktree_path: repo }),
  );
  assert.equal(loserCode, 'worktree_already_owned');
  assert.equal(a.getRun('run-2')!.status, 'ready', 'loser Run must stay ready');
  assert.equal(a.getRun('run-2')!.worktree_path, null, 'loser worktree freeze must roll back');
  assert.equal(a.getAttempt('attempt-2'), null, 'loser claim must leave no attempt row');

  // run-1 走完 Review/accept 后 lease 释放，run-2 以同一 worktree 正常 claim。
  a.settleRunAttempt(makeAttemptSettle({ attempt_id: 'attempt-1' }), EXECUTOR);
  a.submitReview(makeReview({ attempt_id: 'attempt-1', decision: 'approved' }), REVIEWER);
  a.acceptReview('review-1', true, REVIEWER);
  assert.equal(a.getRun('run-1')!.status, 'accepted');

  const second = claimIn(a, { attempt_id: 'attempt-2', run_id: 'run-2', room_id: 'room-1', worktree_path: repo });
  assert.equal(second.created, true);
  assert.equal(second.attempt.attempt_no, 1);
  assert.equal(a.getRun('run-2')!.status, 'running');
  close();
  rmSync(fixture, { recursive: true, force: true });
});

test('two Runs on different canonical worktrees run and settle independently', async () => {
  const { fixture, repo } = makeFixture();
  const repoB = join(fixture, 'repo-b');
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@example.com',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@example.com',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  };
  execFileSync('git', ['init', '-q', '-b', 'main', repoB]);
  execFileSync('git', ['config', '--local', 'commit.gpgsign', 'false'], { cwd: repoB, env });
  execFileSync('git', ['commit', '--allow-empty', '-q', '-m', 'base'], { cwd: repoB, env });
  const headB = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoB, encoding: 'utf8', env }).trim();

  const { a, close } = makeServices(fixture);
  submitFirstTask(a);
  a.transitionToArchitectureReview('room-1', PLANNER);
  a.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  a.submitTask(makeTask({ task_id: 'task-2', run_id: 'run-2' }), PLANNER);

  const headA = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8', env }).trim();
  claimIn(a, { attempt_id: 'attempt-a', run_id: 'run-1', room_id: 'room-1', worktree_path: repo });
  claimIn(a, { attempt_id: 'attempt-b', run_id: 'run-2', room_id: 'room-1', worktree_path: repoB });
  // 两个 Run 同时 running：不同 worktree 互不占用。
  assert.equal(a.getRun('run-1')!.status, 'running');
  assert.equal(a.getRun('run-2')!.status, 'running');
  assert.equal(a.getAttempt('attempt-a')!.status, 'running');
  assert.equal(a.getAttempt('attempt-b')!.status, 'running');

  // 独立 settle：run-1 failed 不改变 run-2 running；随后 run-2 succeeded 不改变 run-1 failed。
  a.settleRunAttempt(
    makeAttemptSettle({ attempt_id: 'attempt-a', status: 'failed', result: null, failure: { code: 'claude_exit_failed', message: 'boom' }, agent_session_ref: null, process_exit_code: 1, git_evidence: { staged: [], unstaged: [], untracked: ['a.txt'] } }),
    EXECUTOR,
  );
  assert.equal(a.getRun('run-1')!.status, 'failed');
  assert.equal(a.getRun('run-2')!.status, 'running', 'run-1 settle must not touch run-2');
  assert.equal(a.getAttempt('attempt-b')!.status, 'running');

  a.settleRunAttempt(makeAttemptSettle({ attempt_id: 'attempt-b', result: makeCodingResult({ task_id: 'task-2' }), git_evidence: { staged: [], unstaged: [], untracked: ['b.txt'] } }), EXECUTOR);
  assert.equal(a.getRun('run-2')!.status, 'review_required');
  assert.equal(a.getRun('run-1')!.status, 'failed', 'run-2 settle must not touch run-1');
  assert.deepEqual(a.getAttempt('attempt-a')!.git_evidence, { staged: [], unstaged: [], untracked: ['a.txt'] });
  assert.deepEqual(a.getAttempt('attempt-b')!.git_evidence, { staged: [], unstaged: [], untracked: ['b.txt'] });

  // snapshot 两个 work item 各指向自己的 attempt；Event 恰好两条 claim + 两条 terminal。
  const events = a.listEvents('room-1');
  assert.equal(events.filter((e) => e.type === 'run_attempt_claimed').length, 2);
  assert.equal(events.filter((e) => e.type === 'run_attempt_failed').length, 1);
  assert.equal(events.filter((e) => e.type === 'run_attempt_succeeded').length, 1);
  const snapshot = getRoomStateSnapshot(a, { room_id: 'room-1' });
  const items = snapshot.run_work_items as {
    run_id: string;
    run_status: string;
    current_attempt_id: string | null;
  }[];
  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map((i) => [i.run_id, i.run_status, i.current_attempt_id]),
    [['run-1', 'failed', 'attempt-a'], ['run-2', 'review_required', 'attempt-b']],
  );
  close();
  rmSync(fixture, { recursive: true, force: true });
});

test('terminal settlement is first-writer-wins: idempotent retry, id_conflict and exactly one terminal Event', async () => {
  const { fixture, repo, head } = makeFixture();
  const { a, close } = makeServices(fixture);
  submitFirstTask(a);
  claimIn(a, { attempt_id: 'attempt-1', run_id: 'run-1', room_id: 'room-1', worktree_path: repo });

  a.settleRunAttempt(makeAttemptSettle({ attempt_id: 'attempt-1' }), EXECUTOR);
  const settledAt = a.getAttempt('attempt-1')!.settled_at;
  assert.equal(a.getRun('run-1')!.status, 'review_required');
  assert.equal(a.listEvents('room-1').filter((e) => e.type === 'run_attempt_succeeded').length, 1);
  const cursorAfterWin = a.listEvents('room-1').length;

  // 相同 payload retry：幂等返回既有 terminal attempt，零 Event、settled_at 不变。
  a.settleRunAttempt(makeAttemptSettle({ attempt_id: 'attempt-1' }), EXECUTOR);
  assert.equal(a.listEvents('room-1').length, cursorAfterWin, 'idempotent retry must append no Event');
  assert.equal(a.getAttempt('attempt-1')!.settled_at, settledAt);

  // 不同 payload：id_conflict，terminal 不变，Event 不变。
  const code = errCode(() =>
    a.settleRunAttempt(makeAttemptSettle({ attempt_id: 'attempt-1', status: 'failed', result: null, failure: { code: 'x', message: 'y' } }), EXECUTOR),
  );
  assert.equal(code, 'id_conflict');
  assert.equal(a.getAttempt('attempt-1')!.status, 'succeeded', 'first writer outcome must be immutable');
  assert.equal(a.listEvents('room-1').length, cursorAfterWin);

  // cancel intent 与 terminal settle 的竞争：planner 先行 cancel_requested 后，Executor 的
  // success/decision 分类作废，唯一合法 terminal 是 canceled。
  // 先 accept run-1 释放 canonical worktree lease，run-2 才能以同一 worktree claim。
  a.submitReview(makeReview({ attempt_id: 'attempt-1', decision: 'approved' }), REVIEWER);
  a.acceptReview('review-1', true, REVIEWER);
  a.transitionToArchitectureReview('room-1', PLANNER);
  a.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  a.submitTask(makeTask({ task_id: 'task-2', run_id: 'run-2' }), PLANNER);
  claimIn(a, { attempt_id: 'attempt-2', run_id: 'run-2', room_id: 'room-1', worktree_path: repo });
  a.cancelRun({ room_id: 'room-1', run_id: 'run-2', reason: 'stop', confirmed_by_user: true }, PLANNER);
  // Executor 即使带着 success classification settle，也按 planner 意图落 canceled（classification
  // 作废），且恰好一个 terminal Event、没有 succeeded Event。
  a.settleRunAttempt(
    makeAttemptSettle({ attempt_id: 'attempt-2', status: 'succeeded', result: makeCodingResult({ task_id: 'task-2' }) }),
    EXECUTOR,
  );
  assert.equal(a.getAttempt('attempt-2')!.status, 'canceled', 'planner cancel intent must win the terminal race');
  assert.equal(a.getRun('run-2')!.status, 'canceled');
  // canonical canceled payload：caller 的 succeeded classification 与 result 作废。
  assert.equal(a.getAttempt('attempt-2')!.result, null);
  assert.equal(a.getAttempt('attempt-2')!.failure, null);
  assert.equal(a.listEvents('room-1').filter((e) => e.type === 'run_attempt_canceled').length, 1);
  assert.equal(a.listEvents('room-1').filter((e) => e.type === 'run_attempt_succeeded').length, 1, 'run-1 的 succeeded 保持；run-2 无 succeeded');
  // 相同原始 payload retry：按 canonical payload 比较，幂等零 Event。
  const canceledEvents = a.listEvents('room-1').filter((e) => e.type === 'run_attempt_canceled').length;
  a.settleRunAttempt(
    makeAttemptSettle({ attempt_id: 'attempt-2', status: 'succeeded', result: makeCodingResult({ task_id: 'task-2' }) }),
    EXECUTOR,
  );
  assert.equal(
    a.listEvents('room-1').filter((e) => e.type === 'run_attempt_canceled').length,
    canceledEvents,
    'canonical canceled retry must be idempotent',
  );
  close();
  rmSync(fixture, { recursive: true, force: true });
});

test('cancel/retry round-trip preserves lineage freeze and attempt numbering', async () => {
  const { fixture, repo, head } = makeFixture();
  const { a, close } = makeServices(fixture);
  submitFirstTask(a);
  const first = claimIn(a, { attempt_id: 'attempt-1', run_id: 'run-1', room_id: 'room-1', worktree_path: repo });
  assert.equal(first.attempt.attempt_no, 1);
  assert.equal(a.getRun('run-1')!.worktree_path, repo);

  a.cancelRun({ room_id: 'room-1', run_id: 'run-1', reason: 'stop', confirmed_by_user: true }, PLANNER);
  a.settleRunAttempt(makeAttemptSettle({ attempt_id: 'attempt-1', status: 'canceled', result: null, failure: null, agent_session_ref: null, process_exit_code: null }), EXECUTOR);
  assert.equal(a.getRun('run-1')!.status, 'canceled');

  a.retryRun('room-1', 'run-1', PLANNER);
  assert.equal(a.getRun('run-1')!.status, 'ready');

  // 下一 attempt 继承同一 canonical worktree；改用不同 worktree 被 lineage gate 拒绝。
  const wrongWorktree = errCode(() =>
    claimIn(a, { attempt_id: 'attempt-2', run_id: 'run-1', room_id: 'room-1', worktree_path: join(repo, 'other') }),
  );
  assert.equal(wrongWorktree, 'validation_failed');
  assert.equal(a.getAttempt('attempt-2'), null);

  const second = claimIn(a, { attempt_id: 'attempt-2', run_id: 'run-1', room_id: 'room-1', worktree_path: repo });
  assert.equal(second.created, true);
  assert.equal(second.attempt.attempt_no, 2);
  assert.equal(second.attempt.worktree_path, repo);
  a.settleRunAttempt(makeAttemptSettle({ attempt_id: 'attempt-2' }), EXECUTOR);
  assert.equal(a.getRun('run-1')!.status, 'review_required');
  close();
  rmSync(fixture, { recursive: true, force: true });
});

test('guidance is consumed by exactly the next attempt and never twice', async () => {
  const { fixture, repo, head } = makeFixture();
  const { a, close } = makeServices(fixture);
  submitFirstTask(a);
  a.addRunGuidance({ guidance_id: 'g-1', room_id: 'room-1', run_id: 'run-1', text: 'first' }, PLANNER);
  a.addRunGuidance({ guidance_id: 'g-2', room_id: 'room-1', run_id: 'run-1', text: 'second' }, PLANNER);

  const first = a.claimRunAttempt(
    { attempt_id: 'attempt-1', run_id: 'run-1', room_id: 'room-1', worktree_path: repo },
    EXECUTOR,
  );
  assert.equal(first.created, true);
  assert.deepEqual(first.guidance.map((g) => g.guidance_id), ['g-1', 'g-2']);
  assert.equal(a.getGuidance('g-1')!.consumed_by_attempt_id, 'attempt-1');
  assert.equal(a.getGuidance('g-2')!.consumed_by_attempt_id, 'attempt-1');

  // 下一 attempt 的 claim 不再消费：每一条至多被一个 attempt 消费。
  a.settleRunAttempt(makeAttemptSettle({ attempt_id: 'attempt-1', status: 'failed', result: null, failure: { code: 'x', message: 'y' }, agent_session_ref: null, process_exit_code: 1 }), EXECUTOR);
  a.retryRun('room-1', 'run-1', PLANNER);
  const second = a.claimRunAttempt(
    { attempt_id: 'attempt-2', run_id: 'run-1', room_id: 'room-1', worktree_path: repo },
    EXECUTOR,
  );
  assert.equal(second.created, true);
  assert.equal(second.guidance.length, 0, 'consumed guidance must never be delivered twice');
  close();
  rmSync(fixture, { recursive: true, force: true });
});
