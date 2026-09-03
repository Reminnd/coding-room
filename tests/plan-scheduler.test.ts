import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { RoomService } from '../src/room/room-service.ts';
import { getRoomStateSnapshot } from '../src/room/state-snapshot.ts';
import { assertNoUnorderedScopeOverlap, scopesOverlap, validateTaskGraphRevision, validateWriteScope } from '../src/scheduler/plan-scheduler.ts';
import {
  EXECUTOR,
  ORCHESTRATOR,
  PLANNER,
  REVIEWER,
  makeAttemptSettle,
  makeCodingResult,
  makeFinding,
  makeFixTask,
  makeParticipant,
  makeReview,
  makeRoleAssignment,
  makeTask,
} from './fixtures.ts';
import type { Approval, TaskGraphRevision, TaskSpec } from '../src/protocol/schema.ts';
import type { ClaimWorkerMessage } from './execution-core-claim-worker.ts';

const T = '2026-09-01T00:00:00.000Z';

function spec(taskId: string, runId: string): TaskSpec {
  const { confirmed_by_user: _confirmed, confirmed_findings: _findings, ...value } = makeTask({ task_id: taskId, run_id: runId, created_at: T });
  return { ...value, type: 'implementation', parent_task_id: null, based_on_review_id: null };
}

function setup(nodes?: TaskGraphRevision['nodes'], concurrencyLimit = 2): { service: RoomService; revision: TaskGraphRevision } {
  const service = new RoomService(new DatabaseSync(':memory:'));
  service.createRoom('room-1', PLANNER);
  service.createPlan({ plan_id: 'plan-1', room_id: 'room-1', created_by_participant_id: 'codex-app', created_at: T }, PLANNER);
  const worker = service.listRoleAssignments('room-1').find((assignment) => assignment.role === 'worker');
  assert.ok(worker);
  const revision: TaskGraphRevision = {
    revision_id: 'revision-1', plan_id: 'plan-1', room_id: 'room-1', revision_no: 1,
    supersedes_revision_id: null, concurrency_limit: concurrencyLimit, acceptance_policy: 'per_task',
    nodes: nodes ?? [{ node_id: 'node-a', kind: 'task', task_spec: spec('task-a', 'run-a'), dependencies: [], write_scopes: [{ path: 'src/a', kind: 'tree' }], worker_assignment_id: worker.assignment_id, priority: 1 }],
    created_by_participant_id: 'codex-app', created_at: T,
  };
  for (const node of revision.nodes) node.worker_assignment_id = worker.assignment_id;
  service.createPlanRevision(revision, PLANNER);
  return { service, revision };
}

function approve(service: RoomService, revision: TaskGraphRevision, approvalId = 'approval-1'): void {
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  service.decidePlanRevision({ approval_id: approvalId, room_id: 'room-1', target_type: 'task_graph_revision', target_id: revision.revision_id, decision: 'approved', confirmed_by_user: true, planner_participant_id: 'codex-app', created_at: T }, PLANNER);
}

test('structured scope grammar is component-aware and rejects traversal, absolute and glob inputs', () => {
  for (const path of ['', '/src', 'C:/src', 'src\\a', 'src/../a', 'src/*']) {
    assert.throws(() => validateWriteScope({ path, kind: 'tree' }), (error: unknown) => (error as { code?: string }).code === 'validation_failed');
  }
  validateWriteScope({ path: '.', kind: 'tree' });
  assert.equal(scopesOverlap([{ path: 'src/a', kind: 'tree' }], [{ path: 'src/ab', kind: 'tree' }]), false);
  assert.equal(scopesOverlap([{ path: 'src/a', kind: 'tree' }], [{ path: 'src/a/file.ts', kind: 'file' }]), true);
});

test('graph validation rejects missing dependency, cycle and unordered scope conflict', () => {
  const { revision } = setup();
  assert.throws(() => validateTaskGraphRevision({ ...revision, nodes: [{ ...revision.nodes[0], dependencies: ['missing'] }] }), (error: unknown) => (error as { code?: string }).code === 'validation_failed');
  const cyclic: TaskGraphRevision = { ...revision, nodes: [
    { ...revision.nodes[0], dependencies: ['node-b'] },
    { ...revision.nodes[0], node_id: 'node-b', task_spec: spec('task-b', 'run-b'), dependencies: ['node-a'], write_scopes: [{ path: 'src/b', kind: 'tree' }] },
  ] };
  assert.throws(() => validateTaskGraphRevision(cyclic), (error: unknown) => (error as { code?: string }).code === 'validation_failed');
  const overlap = { ...revision, nodes: [revision.nodes[0], { ...revision.nodes[0], node_id: 'node-b', task_spec: spec('task-b', 'run-b') }] };
  assert.throws(() => assertNoUnorderedScopeOverlap(overlap), (error: unknown) => (error as { code?: string }).code === 'scope_conflict');
});

test('integration_only accepts one terminal total-order lineage and rejects fan-in shapes', () => {
  const { revision } = setup();
  const componentA = revision.nodes[0];
  const componentB: TaskGraphRevision['nodes'][number] = { ...componentA, node_id: 'node-b', task_spec: spec('task-b', 'run-b'), dependencies: ['node-a'], write_scopes: [{ path: 'src/b', kind: 'tree' }] };
  const integration: TaskGraphRevision['nodes'][number] = { ...componentA, node_id: 'node-i', kind: 'integration', task_spec: spec('task-i', 'run-i'), dependencies: ['node-b'], write_scopes: [{ path: '.', kind: 'tree' }] };
  const linear: TaskGraphRevision = { ...revision, acceptance_policy: 'integration_only', nodes: [componentA, componentB, integration] };
  validateTaskGraphRevision(linear);
  assert.throws(() => validateTaskGraphRevision({ ...linear, nodes: [componentA, componentB] }), (error: unknown) => (error as { code?: string }).code === 'validation_failed');
  assert.throws(() => validateTaskGraphRevision({ ...linear, nodes: [componentA, componentB, integration, { ...integration, node_id: 'node-j', task_spec: spec('task-j', 'run-j') }] }), (error: unknown) => (error as { code?: string }).code === 'validation_failed');
  const parallelB: TaskGraphRevision['nodes'][number] = { ...componentB, dependencies: [] };
  assert.throws(() => validateTaskGraphRevision({ ...linear, nodes: [componentA, parallelB, { ...integration, dependencies: ['node-a', 'node-b'] }] }), (error: unknown) => (error as { code?: string }).code === 'validation_failed');
});

test('Draft reconcile is empty; approval materializes one Task/Run/Dispatch and retry has no duplicate', () => {
  const { service, revision } = setup();
  assert.deepEqual(service.reconcilePlan({ room_id: 'room-1', plan_id: 'plan-1', worktrees: [{ node_id: 'node-a', dispatch_id: 'dispatch-a', canonical_worktree_path: 'C:/repo-a' }] }, ORCHESTRATOR).dispatches, []);
  assert.equal(service.listTasks('room-1').length, 0);
  approve(service, revision);
  const first = service.reconcilePlan({ room_id: 'room-1', plan_id: 'plan-1', worktrees: [{ node_id: 'node-a', dispatch_id: 'dispatch-a', canonical_worktree_path: 'C:/repo-a' }] }, ORCHESTRATOR);
  const retry = service.reconcilePlan({ room_id: 'room-1', plan_id: 'plan-1', worktrees: [{ node_id: 'node-a', dispatch_id: 'dispatch-a', canonical_worktree_path: 'C:/repo-a' }] }, ORCHESTRATOR);
  assert.equal(first.dispatches.length, 1);
  assert.equal(retry.dispatches.length, 1);
  assert.equal(service.listTasks('room-1').length, 1);
  assert.equal(service.listRuns('room-1').length, 1);
  assert.equal(service.listEvents('room-1').filter((event) => event.type === 'graph_node_materialized').length, 1);
});

test('claim applies approved revision concurrency and active scope gates', () => {
  const nodes: TaskGraphRevision['nodes'] = [
    { node_id: 'node-a', kind: 'task', task_spec: spec('task-a', 'run-a'), dependencies: [], write_scopes: [{ path: 'src/a', kind: 'tree' }], worker_assignment_id: 'pending', priority: 1 },
    { node_id: 'node-b', kind: 'task', task_spec: spec('task-b', 'run-b'), dependencies: [], write_scopes: [{ path: 'src/b', kind: 'tree' }], worker_assignment_id: 'pending', priority: 1 },
  ];
  const { service, revision } = setup(nodes, 1);
  approve(service, revision);
  service.reconcilePlan({ room_id: 'room-1', plan_id: 'plan-1', worktrees: [
    { node_id: 'node-a', dispatch_id: 'dispatch-a', canonical_worktree_path: 'C:/repo-a' },
    { node_id: 'node-b', dispatch_id: 'dispatch-b', canonical_worktree_path: 'C:/repo-b' },
  ] }, ORCHESTRATOR);
  service.claimRunAttempt({ attempt_id: 'attempt-a', run_id: 'run-a', room_id: 'room-1', worktree_path: 'C:/repo-a' }, EXECUTOR);
  assert.throws(() => service.claimRunAttempt({ attempt_id: 'attempt-b', run_id: 'run-b', room_id: 'room-1', worktree_path: 'C:/repo-b' }, EXECUTOR), (error: unknown) => (error as { code?: string }).code === 'concurrency_limit_reached');
  assert.equal(service.listAttemptsByRun('run-b').length, 0);
});

test('successful out-of-scope evidence blocks the dispatch while preserving review_required', () => {
  const { service, revision } = setup();
  approve(service, revision);
  service.reconcilePlan({ room_id: 'room-1', plan_id: 'plan-1', worktrees: [
    { node_id: 'node-a', dispatch_id: 'dispatch-a', canonical_worktree_path: 'C:/repo-a' },
  ] }, ORCHESTRATOR);
  service.claimRunAttempt({ attempt_id: 'attempt-a', run_id: 'run-a', room_id: 'room-1', worktree_path: 'C:/repo-a' }, EXECUTOR);
  service.settleRunAttempt(makeAttemptSettle({
    attempt_id: 'attempt-a',
    result: makeCodingResult({ task_id: 'task-a' }),
    git_evidence: { staged: [], unstaged: [], untracked: ['src/outside.ts'] },
  }), EXECUTOR);
  assert.equal(service.getRun('run-a')?.status, 'review_required');
  assert.deepEqual(service.listNodeDispatches('room-1').map((dispatch) => ({ status: dispatch.status, scope_violated: dispatch.scope_violated })), [
    { status: 'blocked', scope_violated: true },
  ]);
  assert.equal(service.listEvents('room-1').filter((event) => event.type === 'node_scope_violated').length, 1);
});

test('per_task unlocks only accepted dependencies while an independent branch remains runnable', () => {
  const nodes: TaskGraphRevision['nodes'] = [
    { node_id: 'node-a', kind: 'task', task_spec: spec('task-a', 'run-a'), dependencies: [], write_scopes: [{ path: 'src/a', kind: 'tree' }], worker_assignment_id: 'pending', priority: 1 },
    { node_id: 'node-b', kind: 'task', task_spec: spec('task-b', 'run-b'), dependencies: ['node-a'], write_scopes: [{ path: 'src/b', kind: 'tree' }], worker_assignment_id: 'pending', priority: 1 },
    { node_id: 'node-c', kind: 'task', task_spec: spec('task-c', 'run-c'), dependencies: [], write_scopes: [{ path: 'src/c', kind: 'tree' }], worker_assignment_id: 'pending', priority: 5 },
  ];
  const { service, revision } = setup(nodes, 3);
  approve(service, revision);
  const first = service.reconcilePlan({ room_id: 'room-1', plan_id: 'plan-1', worktrees: [
    { node_id: 'node-a', dispatch_id: 'dispatch-a', canonical_worktree_path: 'C:/repo-a' },
    { node_id: 'node-b', dispatch_id: 'dispatch-b', canonical_worktree_path: 'C:/repo-b' },
    { node_id: 'node-c', dispatch_id: 'dispatch-c', canonical_worktree_path: 'C:/repo-c' },
  ] }, ORCHESTRATOR);
  assert.deepEqual(first.dispatches.map((dispatch) => dispatch.node_id), ['node-c', 'node-a']);
  service.claimRunAttempt({ attempt_id: 'attempt-a', run_id: 'run-a', room_id: 'room-1', worktree_path: 'C:/repo-a' }, EXECUTOR);
  service.claimRunAttempt({ attempt_id: 'attempt-c', run_id: 'run-c', room_id: 'room-1', worktree_path: 'C:/repo-c' }, EXECUTOR);
  service.settleRunAttempt(makeAttemptSettle({ attempt_id: 'attempt-a', result: makeCodingResult({ task_id: 'task-a' }), git_evidence: { staged: [], unstaged: ['src/a/result.ts'], untracked: [] } }), EXECUTOR);
  assert.equal(service.reconcilePlan({ room_id: 'room-1', plan_id: 'plan-1', worktrees: [{ node_id: 'node-b', dispatch_id: 'dispatch-b', canonical_worktree_path: 'C:/repo-b' }] }, ORCHESTRATOR).dispatches.some((dispatch) => dispatch.node_id === 'node-b'), false);
  service.submitReview(makeReview({ review_id: 'review-a', task_id: 'task-a', run_id: 'run-a', attempt_id: 'attempt-a' }), REVIEWER);
  service.acceptReview('review-a', true, REVIEWER);
  assert.equal(service.reconcilePlan({ room_id: 'room-1', plan_id: 'plan-1', worktrees: [{ node_id: 'node-b', dispatch_id: 'dispatch-b', canonical_worktree_path: 'C:/repo-b' }] }, ORCHESTRATOR).dispatches.some((dispatch) => dispatch.node_id === 'node-b'), true);
});

test('amendment reuses an inherited dispatch and rejects changes to its node before insert', () => {
  const { service, revision } = setup();
  approve(service, revision);
  service.reconcilePlan({ room_id: 'room-1', plan_id: 'plan-1', worktrees: [
    { node_id: 'node-a', dispatch_id: 'dispatch-a', canonical_worktree_path: 'C:/repo-a' },
  ] }, ORCHESTRATOR);
  const worker = service.listRoleAssignments('room-1').find((assignment) => assignment.role === 'worker');
  assert.ok(worker);
  const revision2: TaskGraphRevision = {
    ...revision,
    revision_id: 'revision-2',
    revision_no: 2,
    supersedes_revision_id: revision.revision_id,
    nodes: [
      revision.nodes[0],
      { node_id: 'node-b', kind: 'task', task_spec: spec('task-b', 'run-b'), dependencies: ['node-a'], write_scopes: [{ path: 'src/b', kind: 'tree' }], worker_assignment_id: worker.assignment_id, priority: 1 },
    ],
  };
  service.createPlanRevision(revision2, PLANNER);
  // latest Draft 存在时不得回退旧 approved revision（Review finding inc12-r1）：
  // reconcile 返回零 new materialization，revision-1 只是历史。
  assert.deepEqual(
    service.reconcilePlan({ room_id: 'room-1', plan_id: 'plan-1', worktrees: [] }, ORCHESTRATOR),
    { revision: null, dispatches: [] },
  );
  approve(service, revision2, 'approval-2');
  assert.equal(service.reconcilePlan({ room_id: 'room-1', plan_id: 'plan-1', worktrees: [] }, ORCHESTRATOR).dispatches[0]?.dispatch_id, 'dispatch-a');
  service.claimRunAttempt({ attempt_id: 'attempt-a', run_id: 'run-a', room_id: 'room-1', worktree_path: 'C:/repo-a' }, EXECUTOR);

  const changed: TaskGraphRevision = {
    ...revision2,
    revision_id: 'revision-3',
    revision_no: 3,
    supersedes_revision_id: revision2.revision_id,
    nodes: [{ ...revision.nodes[0], priority: 2 }, revision2.nodes[1]],
  };
  const before = service.listTaskGraphRevisions('room-1');
  assert.throws(() => service.createPlanRevision(changed, PLANNER), (error: unknown) => (error as { code?: string }).code === 'immutable_revision_violation');
  assert.deepEqual(service.listTaskGraphRevisions('room-1'), before);
});

async function concurrentGraphClaims(
  dbPath: string,
  specs: Array<{ runId: string; attemptId: string; worktree: string }>,
): Promise<ClaimWorkerMessage[]> {
  const barrier = new SharedArrayBuffer(4);
  const messages: ClaimWorkerMessage[] = [];
  return new Promise((resolve, reject) => {
    let ready = 0;
    let exited = 0;
    for (const spec of specs) {
      const worker = new Worker(new URL('./execution-core-claim-worker.ts', import.meta.url), {
        workerData: { dbPath, roomId: 'room-1', ...spec, barrier },
      });
      worker.on('message', (message: ClaimWorkerMessage) => {
        if (message.kind === 'ready') {
          ready += 1;
          if (ready === specs.length) {
            const gate = new Int32Array(barrier);
            Atomics.store(gate, 0, 1);
            Atomics.notify(gate, 0, specs.length);
          }
        } else {
          messages.push(message);
        }
      });
      worker.on('error', reject);
      worker.on('exit', () => {
        exited += 1;
        if (exited === specs.length) resolve(messages);
      });
    }
  });
}

// ---- 并发 single-winner control Oracle（Review finding inc12-fr2） ----
// race 与 control 两侧的 wall-clock created_at/updated_at 与随机 Event event_id 天然不同
// 且不参与断言语义，分别归一化为 '<ts>' 与 '<uuid>'；entity、status、Event payload、
// sequence/cursor 与数组顺序等其余字段必须完全一致。winner identity 不做归一化：control
// 按 race 后 attempts 数组（rowid 插入序 = claim 完成序）精确重放同一组 winner claims，
// loser 不得留下任何 residue。
function normalizeRaceNondeterminism(value: unknown): unknown {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value)) return '<ts>';
  if (typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) return '<uuid>';
  if (Array.isArray(value)) return value.map(normalizeRaceNondeterminism);
  if (value !== null && typeof value === 'object') {
    const normalized: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) normalized[key] = normalizeRaceNondeterminism(item);
    return normalized;
  }
  return value;
}

// race DB 的完整 public durable snapshot 必须与 otherwise identical、只执行同一 winner
// claims 的 control DB 等价；expected value 全部来自测试侧 replay，不经 production helper。
function assertRaceMatchesWinnerControl(
  raceService: RoomService,
  specs: Array<{ runId: string; attemptId: string; worktree: string }>,
  setupControl: (control: RoomService) => void,
): void {
  const winnerSpecs = raceService.listAttemptsByRoom('room-1').map((attempt) => {
    const spec = specs.find((candidate) => candidate.attemptId === attempt.attempt_id);
    assert.ok(spec, `winner attempt ${attempt.attempt_id} has a claim spec`);
    return spec;
  });
  const raceSnapshot = normalizeRaceNondeterminism(getRoomStateSnapshot(raceService, { room_id: 'room-1' }));
  const controlDb = new DatabaseSync(':memory:');
  const control = new RoomService(controlDb);
  try {
    setupControl(control);
    for (const winner of winnerSpecs) {
      control.claimRunAttempt({ attempt_id: winner.attemptId, run_id: winner.runId, room_id: 'room-1', worktree_path: winner.worktree }, EXECUTOR);
    }
    const controlSnapshot = normalizeRaceNondeterminism(getRoomStateSnapshot(control, { room_id: 'room-1' }));
    assert.deepEqual(raceSnapshot, controlSnapshot);
  } finally {
    controlDb.close();
  }
}

for (const concurrencyLimit of [1, 2, 3]) {
  test(`concurrency_limit=${concurrencyLimit} is enforced by simultaneous claims on independent SQLite connections`, async () => {
    const fixture = mkdtempSync(join(tmpdir(), `agent-room-graph-${concurrencyLimit}-`));
    const dbPath = join(fixture, 'room.db');
    const db = new DatabaseSync(dbPath);
    const service = new RoomService(db);
    const count = concurrencyLimit + 1;
    const nodes = Array.from({ length: count }, (_, index): TaskGraphRevision['nodes'][number] => ({
      node_id: `node-${index}`,
      kind: 'task',
      task_spec: spec(`task-${index}`, `run-${index}`),
      dependencies: [],
      write_scopes: [{ path: `src/${index}`, kind: 'tree' }],
      worker_assignment_id: 'pending',
      priority: count - index,
    }));
    service.createRoom('room-1', PLANNER);
    service.createPlan({ plan_id: 'plan-1', room_id: 'room-1', created_by_participant_id: 'codex-app', created_at: T }, PLANNER);
    const worker = service.listRoleAssignments('room-1').find((assignment) => assignment.role === 'worker');
    assert.ok(worker);
    for (const node of nodes) node.worker_assignment_id = worker.assignment_id;
    const revision: TaskGraphRevision = {
      revision_id: 'revision-1', plan_id: 'plan-1', room_id: 'room-1', revision_no: 1,
      supersedes_revision_id: null, concurrency_limit: concurrencyLimit, acceptance_policy: 'per_task',
      nodes, created_by_participant_id: 'codex-app', created_at: T,
    };
    service.createPlanRevision(revision, PLANNER);
    approve(service, revision);
    const mappings = nodes.map((node, index) => ({
      node_id: node.node_id,
      dispatch_id: `dispatch-${index}`,
      canonical_worktree_path: join(fixture, `repo-${index}`),
    }));
    service.reconcilePlan({ room_id: 'room-1', plan_id: 'plan-1', worktrees: mappings }, ORCHESTRATOR);
    const claimSpecs = nodes.map((node, index) => ({
      runId: node.task_spec.run_id,
      attemptId: `attempt-${index}`,
      worktree: mappings[index].canonical_worktree_path,
    }));
    const outcomes = await concurrentGraphClaims(dbPath, claimSpecs);
    const codes = outcomes
      .filter((message): message is Extract<ClaimWorkerMessage, { kind: 'outcome' }> => message.kind === 'outcome')
      .map((message) => message.result === 'success' ? 'success' : message.code);
    assert.equal(codes.filter((code) => code === 'success').length, concurrencyLimit);
    assert.equal(codes.filter((code) => code === 'concurrency_limit_reached').length, 1);
    assert.equal(service.listAttemptsByRoom('room-1').length, concurrencyLimit);
    // race 最终完整 snapshot 与只重放同一组 winner claims 的 control 等价：loser 无
    // Attempt/Event/entity/status/cursor residue
    assertRaceMatchesWinnerControl(service, claimSpecs, (control) => {
      control.createRoom('room-1', PLANNER);
      control.createPlan({ plan_id: 'plan-1', room_id: 'room-1', created_by_participant_id: 'codex-app', created_at: T }, PLANNER);
      const controlWorker = control.listRoleAssignments('room-1').find((assignment) => assignment.role === 'worker');
      assert.ok(controlWorker);
      for (const node of nodes) node.worker_assignment_id = controlWorker.assignment_id;
      control.createPlanRevision(revision, PLANNER);
      approve(control, revision);
      control.reconcilePlan({ room_id: 'room-1', plan_id: 'plan-1', worktrees: mappings }, ORCHESTRATOR);
    });
    db.close();
    rmSync(fixture, { recursive: true, force: true });
  });
}

// ---- Review finding inc12-r1 direct regressions ----

// F1：newer Draft/rejected 存在时旧 approved revision 只是历史。reconcile 返回零 new
// materialization，旧 dispatch 的 new claim 以 plan_revision_not_approved 拒绝。每个
// invalid command 前后读取同一完整 public durable snapshot（全部 entity collections、
// derived references、Events 与 cursor）并 deepEqual，逐操作证明零写入。
test('a newer Draft or rejected revision makes the old approved revision unexecutable with zero writes', () => {
  const { service, revision } = setup();
  approve(service, revision);
  service.reconcilePlan({ room_id: 'room-1', plan_id: 'plan-1', worktrees: [
    { node_id: 'node-a', dispatch_id: 'dispatch-a', canonical_worktree_path: 'C:/repo-a' },
  ] }, ORCHESTRATOR);
  const revision2: TaskGraphRevision = {
    ...revision,
    revision_id: 'revision-2',
    revision_no: 2,
    supersedes_revision_id: revision.revision_id,
  };
  service.createPlanRevision(revision2, PLANNER);
  const snapshot = () => getRoomStateSnapshot(service, { room_id: 'room-1' });
  const claim = () => service.claimRunAttempt({ attempt_id: 'attempt-a', run_id: 'run-a', room_id: 'room-1', worktree_path: 'C:/repo-a' }, EXECUTOR);
  // 最新 Draft 存在：reconcile 零物化且零写入；claim 以 plan_revision_not_approved 拒绝且零写入
  const beforeDraftReconcile = snapshot();
  assert.deepEqual(service.reconcilePlan({ room_id: 'room-1', plan_id: 'plan-1', worktrees: [] }, ORCHESTRATOR), { revision: null, dispatches: [] });
  assert.deepEqual(snapshot(), beforeDraftReconcile);
  const beforeDraftClaim = snapshot();
  assert.throws(claim, (error: unknown) => (error as { code?: string }).code === 'plan_revision_not_approved');
  assert.deepEqual(snapshot(), beforeDraftClaim);
  // 最新 rejected 存在：同样零回退、零写入
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  service.decidePlanRevision({
    approval_id: 'approval-2', room_id: 'room-1', target_type: 'task_graph_revision', target_id: 'revision-2',
    decision: 'rejected', confirmed_by_user: true, planner_participant_id: 'codex-app', created_at: T,
  }, PLANNER);
  const beforeRejectedReconcile = snapshot();
  assert.deepEqual(service.reconcilePlan({ room_id: 'room-1', plan_id: 'plan-1', worktrees: [] }, ORCHESTRATOR), { revision: null, dispatches: [] });
  assert.deepEqual(snapshot(), beforeRejectedReconcile);
  const beforeRejectedClaim = snapshot();
  assert.throws(claim, (error: unknown) => (error as { code?: string }).code === 'plan_revision_not_approved');
  assert.deepEqual(snapshot(), beforeRejectedClaim);
});

// F3：Amendment 把 concurrency_limit 从 3 收紧为 1 且保留两个已 dispatch immutable nodes 后，
// 两个独立 SQLite connection 同时 claim 恰好一个成功，loser 为 concurrency_limit_reached
// 且完整 snapshot 无 partial residue。
test('amendment-tightened concurrency_limit is enforced on simultaneous claims of inherited dispatches', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-graph-amend-'));
  const dbPath = join(fixture, 'room.db');
  const db = new DatabaseSync(dbPath);
  const service = new RoomService(db);
  const nodes: TaskGraphRevision['nodes'] = [
    { node_id: 'node-a', kind: 'task', task_spec: spec('task-a', 'run-a'), dependencies: [], write_scopes: [{ path: 'src/a', kind: 'tree' }], worker_assignment_id: 'pending', priority: 1 },
    { node_id: 'node-b', kind: 'task', task_spec: spec('task-b', 'run-b'), dependencies: [], write_scopes: [{ path: 'src/b', kind: 'tree' }], worker_assignment_id: 'pending', priority: 1 },
  ];
  service.createRoom('room-1', PLANNER);
  service.createPlan({ plan_id: 'plan-1', room_id: 'room-1', created_by_participant_id: 'codex-app', created_at: T }, PLANNER);
  const worker = service.listRoleAssignments('room-1').find((assignment) => assignment.role === 'worker');
  assert.ok(worker);
  for (const node of nodes) node.worker_assignment_id = worker.assignment_id;
  const revision: TaskGraphRevision = {
    revision_id: 'revision-1', plan_id: 'plan-1', room_id: 'room-1', revision_no: 1,
    supersedes_revision_id: null, concurrency_limit: 3, acceptance_policy: 'per_task',
    nodes, created_by_participant_id: 'codex-app', created_at: T,
  };
  service.createPlanRevision(revision, PLANNER);
  approve(service, revision);
  const mappings = [
    { node_id: 'node-a', dispatch_id: 'dispatch-a', canonical_worktree_path: join(fixture, 'repo-a') },
    { node_id: 'node-b', dispatch_id: 'dispatch-b', canonical_worktree_path: join(fixture, 'repo-b') },
  ];
  service.reconcilePlan({ room_id: 'room-1', plan_id: 'plan-1', worktrees: mappings }, ORCHESTRATOR);
  // rev2 保留 A/B 并把 limit 收紧为 1
  const revision2: TaskGraphRevision = {
    ...revision,
    revision_id: 'revision-2',
    revision_no: 2,
    supersedes_revision_id: revision.revision_id,
    concurrency_limit: 1,
  };
  service.createPlanRevision(revision2, PLANNER);
  approve(service, revision2, 'approval-2');
  const claimSpecs = [
    { runId: 'run-a', attemptId: 'attempt-a', worktree: mappings[0].canonical_worktree_path },
    { runId: 'run-b', attemptId: 'attempt-b', worktree: mappings[1].canonical_worktree_path },
  ];
  const outcomes = await concurrentGraphClaims(dbPath, claimSpecs);
  const codes = outcomes
    .filter((message): message is Extract<ClaimWorkerMessage, { kind: 'outcome' }> => message.kind === 'outcome')
    .map((message) => (message.result === 'success' ? 'success' : message.code));
  assert.equal(codes.filter((code) => code === 'success').length, 1);
  assert.equal(codes.filter((code) => code === 'concurrency_limit_reached').length, 1);
  assert.equal(service.listAttemptsByRoom('room-1').length, 1);
  // race 最终完整 snapshot 与只重放同一 winner claim 的 control 等价：loser 无
  // Attempt/Event/entity/status/cursor residue
  assertRaceMatchesWinnerControl(service, claimSpecs, (control) => {
    control.createRoom('room-1', PLANNER);
    control.createPlan({ plan_id: 'plan-1', room_id: 'room-1', created_by_participant_id: 'codex-app', created_at: T }, PLANNER);
    const controlWorker = control.listRoleAssignments('room-1').find((assignment) => assignment.role === 'worker');
    assert.ok(controlWorker);
    for (const node of nodes) node.worker_assignment_id = controlWorker.assignment_id;
    control.createPlanRevision(revision, PLANNER);
    approve(control, revision);
    control.reconcilePlan({ room_id: 'room-1', plan_id: 'plan-1', worktrees: mappings }, ORCHESTRATOR);
    control.createPlanRevision(revision2, PLANNER);
    approve(control, revision2, 'approval-2');
  });
  db.close();
  rmSync(fixture, { recursive: true, force: true });
});

// F2：blocked/scope_violated 的 NodeDispatch 不得经 acceptance 置 completed 或解锁
// descendant；failed 与仍越界的 Fix attempt 不得清除 projection；只有全部 in-scope 的
// successful Fix attempt 才恢复 dispatched，随后正常 Review + acceptance 才解锁 descendant。
test('scope violation recovery requires an in-scope fix attempt before acceptance unlocks the descendant', () => {
  const nodes: TaskGraphRevision['nodes'] = [
    { node_id: 'node-a', kind: 'task', task_spec: spec('task-a', 'run-a'), dependencies: [], write_scopes: [{ path: 'src/a', kind: 'tree' }], worker_assignment_id: 'pending', priority: 1 },
    { node_id: 'node-b', kind: 'task', task_spec: spec('task-b', 'run-b'), dependencies: ['node-a'], write_scopes: [{ path: 'src/b', kind: 'tree' }], worker_assignment_id: 'pending', priority: 1 },
  ];
  const { service, revision } = setup(nodes, 2);
  approve(service, revision);
  service.reconcilePlan({ room_id: 'room-1', plan_id: 'plan-1', worktrees: [
    { node_id: 'node-a', dispatch_id: 'dispatch-a', canonical_worktree_path: 'C:/repo-a' },
  ] }, ORCHESTRATOR);
  service.claimRunAttempt({ attempt_id: 'attempt-a', run_id: 'run-a', room_id: 'room-1', worktree_path: 'C:/repo-a' }, EXECUTOR);
  service.settleRunAttempt(makeAttemptSettle({
    attempt_id: 'attempt-a',
    result: makeCodingResult({ task_id: 'task-a' }),
    git_evidence: { staged: [], unstaged: [], untracked: ['src/outside.ts'] },
  }), EXECUTOR);
  assert.equal(service.getRun('run-a')?.status, 'review_required');
  service.submitReview(makeReview({ review_id: 'review-a', task_id: 'task-a', run_id: 'run-a', attempt_id: 'attempt-a', decision: 'changes_requested', findings: [makeFinding()] }), REVIEWER);
  const dispatchA = () => service.listNodeDispatches('room-1')[0];
  const reconcileB = () => service.reconcilePlan({ room_id: 'room-1', plan_id: 'plan-1', worktrees: [{ node_id: 'node-b', dispatch_id: 'dispatch-b', canonical_worktree_path: 'C:/repo-b' }] }, ORCHESTRATOR);

  // blocked 时 acceptance 以 validation_failed 拒绝：调用前后完整 public snapshot deepEqual
  const beforeAcceptance = getRoomStateSnapshot(service, { room_id: 'room-1' });
  assert.throws(() => service.acceptReview('review-a', true, REVIEWER), (error: unknown) => (error as { code?: string }).code === 'validation_failed');
  assert.deepEqual(getRoomStateSnapshot(service, { room_id: 'room-1' }), beforeAcceptance);
  assert.equal(service.getRun('run-a')?.status, 'review_discussion');
  assert.deepEqual({ status: dispatchA().status, scope_violated: dispatchA().scope_violated }, { status: 'blocked', scope_violated: true });
  // 拒绝后 descendant reconcile 不得 materialize，且该 reconcile 自身零 durable write
  const beforeDescendantReconcile = getRoomStateSnapshot(service, { room_id: 'room-1' });
  assert.equal(reconcileB().dispatches.some((dispatch) => dispatch.node_id === 'node-b'), false);
  assert.deepEqual(getRoomStateSnapshot(service, { room_id: 'room-1' }), beforeDescendantReconcile);

  // failed Fix attempt 不得清除 projection
  service.submitTask(makeFixTask({ task_id: 'task-a-fix-1', room_id: 'room-1', run_id: 'run-a', parent_task_id: 'task-a', based_on_review_id: 'review-a' }), PLANNER);
  service.claimRunAttempt({ attempt_id: 'attempt-a-fix-1', run_id: 'run-a', room_id: 'room-1', worktree_path: 'C:/repo-a' }, EXECUTOR);
  service.settleRunAttempt(makeAttemptSettle({ attempt_id: 'attempt-a-fix-1', status: 'failed', result: null, failure: { code: 'process_failed', message: 'boom' } }), EXECUTOR);
  assert.deepEqual({ status: dispatchA().status, scope_violated: dispatchA().scope_violated }, { status: 'blocked', scope_violated: true });
  service.retryRun('room-1', 'run-a', PLANNER);

  // 仍含 out-of-scope path 的 succeeded Fix attempt 不得清除 projection，也不追加新 Event
  service.claimRunAttempt({ attempt_id: 'attempt-a-fix-2', run_id: 'run-a', room_id: 'room-1', worktree_path: 'C:/repo-a' }, EXECUTOR);
  service.settleRunAttempt(makeAttemptSettle({
    attempt_id: 'attempt-a-fix-2',
    result: makeCodingResult({ task_id: 'task-a-fix-1' }),
    git_evidence: { staged: [], unstaged: ['src/a/ok.ts'], untracked: ['src/outside.ts'] },
  }), EXECUTOR);
  assert.deepEqual({ status: dispatchA().status, scope_violated: dispatchA().scope_violated }, { status: 'blocked', scope_violated: true });
  assert.equal(service.listEvents('room-1').filter((event) => event.type === 'node_scope_violated').length, 1);
  service.submitReview(makeReview({ review_id: 'review-b', task_id: 'task-a-fix-1', run_id: 'run-a', attempt_id: 'attempt-a-fix-2', decision: 'changes_requested', findings: [makeFinding()] }), REVIEWER);

  // 全部 in-scope 的 succeeded Fix attempt 恢复 projection 为 dispatched
  service.submitTask(makeFixTask({ task_id: 'task-a-fix-2', room_id: 'room-1', run_id: 'run-a', parent_task_id: 'task-a-fix-1', based_on_review_id: 'review-b' }), PLANNER);
  service.claimRunAttempt({ attempt_id: 'attempt-a-fix-3', run_id: 'run-a', room_id: 'room-1', worktree_path: 'C:/repo-a' }, EXECUTOR);
  service.settleRunAttempt(makeAttemptSettle({
    attempt_id: 'attempt-a-fix-3',
    result: makeCodingResult({ task_id: 'task-a-fix-2' }),
    git_evidence: { staged: ['src/a/result.ts'], unstaged: [], untracked: [] },
  }), EXECUTOR);
  assert.deepEqual({ status: dispatchA().status, scope_violated: dispatchA().scope_violated }, { status: 'dispatched', scope_violated: false });

  // 正常 Review + acceptance 才 completed 并解锁 descendant
  service.submitReview(makeReview({ review_id: 'review-c', task_id: 'task-a-fix-2', run_id: 'run-a', attempt_id: 'attempt-a-fix-3', decision: 'approved', findings: [] }), REVIEWER);
  service.acceptReview('review-c', true, REVIEWER);
  assert.equal(service.getRun('run-a')?.status, 'accepted');
  assert.equal(dispatchA().status, 'completed');
  assert.equal(reconcileB().dispatches.some((dispatch) => dispatch.node_id === 'node-b'), true);
});

// F4：worker assignment replacement 后，合法 Amendment 可保留已 dispatch node 的 old frozen
// assignment，new node 使用 replacement assignment；A/B 的 Run/Attempt worker identity 分别
// 正确且不被互换。
test('assignment replacement keeps the dispatched node worker frozen while a new node uses the replacement', () => {
  const { service, revision } = setup();
  approve(service, revision);
  service.reconcilePlan({ room_id: 'room-1', plan_id: 'plan-1', worktrees: [
    { node_id: 'node-a', dispatch_id: 'dispatch-a', canonical_worktree_path: 'C:/repo-a' },
  ] }, ORCHESTRATOR);
  // replacement worker：新 participant + 新 room-scope worker assignment（replacement 只路由
  // future materialization，不改写既有 Run 的 worker freeze）。
  service.registerParticipant(makeParticipant({
    participant_id: 'claude-code-cli-2',
    display_name: 'Claude Code CLI 2',
    kind: 'agent',
    provider: 'anthropic',
    adapter_id: 'claude_code_cli',
    capabilities: ['coding', 'questioning'],
  }), ORCHESTRATOR);
  service.createRoleAssignment(makeRoleAssignment({ assignment_id: 'worker-2', role: 'worker', participant_id: 'claude-code-cli-2' }), ORCHESTRATOR);
  const revision2: TaskGraphRevision = {
    ...revision,
    revision_id: 'revision-2',
    revision_no: 2,
    supersedes_revision_id: revision.revision_id,
    nodes: [
      revision.nodes[0],
      { node_id: 'node-b', kind: 'task', task_spec: spec('task-b', 'run-b'), dependencies: [], write_scopes: [{ path: 'src/b', kind: 'tree' }], worker_assignment_id: 'worker-2', priority: 1 },
    ],
  };
  // 已 dispatch A 保留 old frozen assignment，不再要求 active；B 使用 replacement assignment。
  service.createPlanRevision(revision2, PLANNER);
  approve(service, revision2, 'approval-2');
  const out = service.reconcilePlan({ room_id: 'room-1', plan_id: 'plan-1', worktrees: [
    { node_id: 'node-b', dispatch_id: 'dispatch-b', canonical_worktree_path: 'C:/repo-b' },
  ] }, ORCHESTRATOR);
  assert.equal(out.dispatches.some((dispatch) => dispatch.node_id === 'node-b'), true);
  assert.equal(service.getRun('run-a')?.worker_participant_id, 'claude-code-cli');
  assert.equal(service.getRun('run-b')?.worker_participant_id, 'claude-code-cli-2');
  const attemptA = service.claimRunAttempt({ attempt_id: 'attempt-a', run_id: 'run-a', room_id: 'room-1', worktree_path: 'C:/repo-a' }, EXECUTOR);
  const attemptB = service.claimRunAttempt({ attempt_id: 'attempt-b', run_id: 'run-b', room_id: 'room-1', worktree_path: 'C:/repo-b' }, EXECUTOR);
  assert.equal(attemptA.attempt.worker_participant_id, 'claude-code-cli');
  assert.equal(attemptB.attempt.worker_participant_id, 'claude-code-cli-2');
});

// F5：Plan/Revision/Approval 的 existing same-ID retry 按 stored frozen creator/planner 认证。
// same-content 返回 existing/created=false 零 Event；different content 为 id_conflict；
// replacement/disabled/wrong-role 拒绝；new entity 继续消费 current replacement assignment。
test('Plan, Revision and Approval same-ID retries follow the stored frozen identity', () => {
  const { service, revision } = setup();
  const plan = { plan_id: 'plan-1', room_id: 'room-1', created_by_participant_id: 'codex-app', created_at: T };
  const approval = { approval_id: 'approval-1', room_id: 'room-1', target_type: 'task_graph_revision', target_id: 'revision-1', decision: 'approved', confirmed_by_user: true, planner_participant_id: 'codex-app', created_at: T } satisfies Approval;
  const planEvents = () => service.listEvents('room-1').filter((event) => event.type === 'plan_created').length;
  const revisionEvents = () => service.listEvents('room-1').filter((event) => event.type === 'task_graph_revision_created').length;
  const approvalEvents = () => service.listEvents('room-1').filter((event) => event.type === 'task_graph_revision_approved').length;
  const LATER = '2026-09-01T00:00:01.000Z';
  // same-content retry：frozen identity 自持，created=false 且零 Event
  assert.equal(planEvents(), 1);
  assert.equal(service.createPlan(plan, PLANNER).created, false);
  assert.equal(planEvents(), 1);
  assert.equal(revisionEvents(), 1);
  assert.equal(service.createPlanRevision(revision, PLANNER).created, false);
  assert.equal(revisionEvents(), 1);
  // different content：id_conflict
  assert.throws(() => service.createPlan({ ...plan, created_at: LATER }, PLANNER), (error: unknown) => (error as { code?: string }).code === 'id_conflict');
  assert.throws(() => service.createPlanRevision({ ...revision, created_at: LATER }, PLANNER), (error: unknown) => (error as { code?: string }).code === 'id_conflict');
  // wrong-role：actor_not_allowed
  assert.throws(() => service.createPlan(plan, REVIEWER), (error: unknown) => (error as { code?: string }).code === 'actor_not_allowed');
  assert.throws(() => service.createPlanRevision(revision, REVIEWER), (error: unknown) => (error as { code?: string }).code === 'actor_not_allowed');
  // Approval 新创建 + same-content retry + different-content conflict（此时 codex-app 仍是 active planner）
  service.transitionToArchitectureReview('room-1', PLANNER);
  service.transitionToWaitingForUserConfirmation('room-1', PLANNER);
  service.decidePlanRevision(approval, PLANNER);
  assert.equal(service.listApprovals('room-1').length, 1);
  assert.equal(approvalEvents(), 1);
  assert.equal(service.decidePlanRevision(approval, PLANNER).created, false);
  assert.equal(approvalEvents(), 1);
  assert.throws(() => service.decidePlanRevision({ ...approval, created_at: LATER }, PLANNER), (error: unknown) => (error as { code?: string }).code === 'id_conflict');
  // wrong-role（role 层）：reviewer actor 不得重放 Approval
  assert.throws(() => service.decidePlanRevision(approval, REVIEWER), (error: unknown) => (error as { code?: string }).code === 'actor_not_allowed');
  // 第二 orchestrator（codex-app-2）承接 disable/re-enable 门禁
  service.registerParticipant(makeParticipant({
    participant_id: 'codex-app-2',
    display_name: 'Codex App 2',
    kind: 'agent',
    provider: 'codex',
    adapter_id: 'codex_app',
    capabilities: ['planning', 'reviewing', 'supervising'],
  }), ORCHESTRATOR);
  service.createRoleAssignment(makeRoleAssignment({ assignment_id: 'orchestrator-2', role: 'orchestrator', participant_id: 'codex-app-2' }), ORCHESTRATOR);
  const ORCHESTRATOR_2 = { participant_id: 'codex-app-2', actor_role: 'orchestrator' as const };
  // disabled frozen identity 拒绝；re-enable 后 same-content retry 恢复
  service.setParticipantEnabled('codex-app', false, ORCHESTRATOR_2);
  assert.throws(() => service.createPlan(plan, PLANNER), (error: unknown) => (error as { code?: string }).code === 'actor_not_allowed');
  service.setParticipantEnabled('codex-app', true, ORCHESTRATOR_2);
  assert.equal(service.createPlan(plan, PLANNER).created, false);
  assert.equal(planEvents(), 1);
  // replacement planner 不能接管旧 entity retry；frozen identity retry 不消费 current assignment
  service.createRoleAssignment(makeRoleAssignment({ assignment_id: 'planner-2', role: 'planner', participant_id: 'codex-app-2' }), ORCHESTRATOR_2);
  const replacementActor = { participant_id: 'codex-app-2', actor_role: 'planner' as const };
  assert.throws(() => service.createPlan(plan, replacementActor), (error: unknown) => (error as { code?: string }).code === 'actor_not_allowed');
  assert.throws(() => service.createPlanRevision(revision, replacementActor), (error: unknown) => (error as { code?: string }).code === 'actor_not_allowed');
  assert.throws(() => service.decidePlanRevision(approval, replacementActor), (error: unknown) => (error as { code?: string }).code === 'actor_not_allowed');
  assert.equal(service.createPlan(plan, PLANNER).created, false);
  assert.equal(service.createPlanRevision(revision, PLANNER).created, false);
  assert.equal(service.decidePlanRevision(approval, PLANNER).created, false);
  assert.equal(planEvents(), 1);
  assert.equal(revisionEvents(), 1);
  assert.equal(approvalEvents(), 1);
  // new entity 继续消费 current replacement assignment
  const revision2: TaskGraphRevision = {
    ...revision,
    revision_id: 'revision-2',
    revision_no: 2,
    supersedes_revision_id: revision.revision_id,
    created_by_participant_id: 'codex-app-2',
  };
  assert.equal(service.createPlanRevision(revision2, replacementActor).created, true);
  assert.equal(revisionEvents(), 2);
});
