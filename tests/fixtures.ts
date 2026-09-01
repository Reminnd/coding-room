import type {
  CodingResult,
  ParticipantProfile,
  Question,
  Review,
  Role,
  RoleAssignment,
  Run,
  RunAttempt,
  TaskContract,
} from '../src/protocol/schema.ts';

// v0.4 默认 bootstrap identity：与 room-service BOOTSTRAP_* 常量一致，测试 fixture 用
// 独立 literal（Oracle 不导入被测实现）。
export const BOOTSTRAP_PARTICIPANT_IDS = [
  'operator',
  'codex-app',
  'claude-code-cli',
  'local-runner',
] as const;
export const ROOM_SCOPE_DEFAULT_ROLES = [
  'orchestrator',
  'planner',
  'reviewer',
  'worker',
  'executor',
] as const;

// 独立 literal 的默认 actor：与 bootstrap assignment 一致。
export const PLANNER = { participant_id: 'codex-app', actor_role: 'planner' as const };
export const REVIEWER = { participant_id: 'codex-app', actor_role: 'reviewer' as const };
export const WORKER = { participant_id: 'claude-code-cli', actor_role: 'worker' as const };
export const EXECUTOR = { participant_id: 'local-runner', actor_role: 'executor' as const };
export const ORCHESTRATOR = { participant_id: 'codex-app', actor_role: 'orchestrator' as const };

const T = '2026-08-23T00:00:00.000Z';

export function makeTask(overrides: Partial<TaskContract> = {}): TaskContract {
  return {
    task_id: 'task-1',
    room_id: 'room-1',
    run_id: 'run-1',
    type: 'implementation',
    parent_task_id: null,
    based_on_review_id: null,
    background: 'background',
    goal: 'goal',
    requirements: ['req-1'],
    non_goals: ['non-goal-1'],
    architecture_decisions: ['arch-1'],
    scope: ['scope-1'],
    constraints: ['constraint-1'],
    acceptance_criteria: ['ac-1'],
    verification: [{ command: 'npm test', detects: 'x', decision_if_failed: 'y' }],
    documentation_updates: [{ path: 'DEVELOPMENT_LOG.md', expected_change: 'x' }],
    question_policy: 'ask on scope change',
    confirmed_by_user: true,
    created_by: 'codex',
    created_at: T,
    ...overrides,
  };
}

export function makeFixTask(overrides: Partial<TaskContract> = {}): TaskContract {
  return makeTask({
    type: 'fix',
    parent_task_id: 'task-1',
    based_on_review_id: 'review-1',
    confirmed_findings: [{ finding_id: 'f-1', solution: 'apply the fix' }],
    scope: ['review_fixes_only'],
    ...overrides,
  });
}

// v0.4 Run：稳定 logical lineage；canonical worktree 由首 attempt claim 冻结。
export function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    run_id: 'run-1',
    room_id: 'room-1',
    root_task_id: 'task-1',
    status: 'ready',
    worker_participant_id: 'claude-code-cli',
    worktree_path: null,
    created_at: T,
    updated_at: T,
    accepted_at: null,
    ...overrides,
  };
}

// v0.4 RunAttempt：单次 process invocation 与 terminal evidence。
export function makeAttempt(overrides: Partial<RunAttempt> = {}): RunAttempt {
  return {
    attempt_id: 'attempt-1',
    run_id: 'run-1',
    room_id: 'room-1',
    task_id: 'task-1',
    attempt_no: 1,
    status: 'running',
    worker_participant_id: 'claude-code-cli',
    executor_participant_id: 'local-runner',
    worktree_path: 'D:\\agent\\case\\project',
    agent_session_ref: null,
    process_exit_code: null,
    started_at: T,
    settled_at: null,
    result: null,
    git_evidence: { staged: [], unstaged: [], untracked: [] },
    artifact_refs: [],
    failure: null,
    ...overrides,
  };
}

// settleRunAttempt 的 caller-owned terminal input（独立 literal，不导入 service schema）。
export interface AttemptSettleInput {
  attempt_id: string;
  status: 'succeeded' | 'failed' | 'needs_decision' | 'canceled' | 'interrupted';
  result: CodingResult | null;
  failure: { code: string; message: string } | null;
  agent_session_ref: string | null;
  process_exit_code: number | null;
  git_evidence: { staged: string[]; unstaged: string[]; untracked: string[] };
  artifact_refs: string[];
}

export function makeAttemptSettle(overrides: Partial<AttemptSettleInput> = {}): AttemptSettleInput {
  return {
    attempt_id: 'attempt-1',
    status: 'succeeded',
    result: makeCodingResult(),
    failure: null,
    agent_session_ref: 'session-1',
    process_exit_code: 0,
    git_evidence: { staged: [], unstaged: [], untracked: [] },
    artifact_refs: [],
    ...overrides,
  };
}

export function makeCodingResult(overrides: Partial<CodingResult> = {}): CodingResult {
  return {
    task_id: 'task-1',
    status: 'completed',
    summary: 'done',
    changed_files: [{ path: 'src/a.ts', purpose: 'impl' }],
    deviations: [],
    verification: [{ command: 'npm test', status: 'passed', result: 'ok' }],
    tests: [{ path: 'tests/a.test.ts', behavior: 'covered' }],
    documentation_changes: [{ path: 'DEVELOPMENT_LOG.md', kind: 'implementation_fact' }],
    unresolved: [],
    questions: [],
    ...overrides,
  };
}

export function makeReview(overrides: Partial<Review> = {}): Review {
  return {
    review_id: 'review-1',
    room_id: 'room-1',
    task_id: 'task-1',
    run_id: 'run-1',
    attempt_id: 'attempt-1',
    decision: 'approved',
    findings: [],
    open_questions: [],
    verification_summary: 'ok',
    // 提交时固化的 resolved reviewer（codex-app 同时持 planner/reviewer）。
    reviewer_participant_id: 'codex-app',
    created_at: T,
    ...overrides,
  };
}

export function makeParticipant(overrides: Partial<ParticipantProfile> = {}): ParticipantProfile {
  return {
    participant_id: 'operator',
    display_name: 'Operator',
    kind: 'human',
    provider: 'local',
    adapter_id: 'human',
    capabilities: ['supervising'],
    config_ref: null,
    enabled: true,
    created_at: T,
    ...overrides,
  };
}

export function makeRoleAssignment(overrides: Partial<RoleAssignment> = {}): RoleAssignment {
  return {
    assignment_id: 'assignment-1',
    room_id: 'room-1',
    scope_type: 'room',
    scope_id: null,
    role: 'planner' satisfies Role,
    participant_id: 'codex-app',
    created_at: T,
    ...overrides,
  };
}

export function makeFinding(overrides: Partial<Review['findings'][number]> = {}): Review['findings'][number] {
  return {
    finding_id: 'f-1',
    severity: 'high',
    title: 'stale run accepted',
    file: 'src/room/room-service.ts',
    line: null,
    trigger: 'completeRun on a stale run',
    evidence: 'in-memory reproduction',
    impact: 'stale run advances room state',
    requirement_relation: 'active-entity',
    minimal_direction: 'validate run status',
    ...overrides,
  };
}

export function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    question_id: 'question-1',
    room_id: 'room-1',
    task_id: 'task-1',
    run_id: 'run-1',
    attempt_id: 'attempt-1',
    status: 'open',
    question: 'need a decision',
    blocking_scope: 'scope',
    options: [{ label: 'opt-a', tradeoff: 'a' }],
    answer: null,
    answer_changes_contract: null,
    asked_at: T,
    answered_at: null,
    ...overrides,
  };
}
