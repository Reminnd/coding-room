import type {
  CodingResult,
  Question,
  Review,
  Run,
  TaskContract,
} from '../src/protocol/schema.ts';
import type { RunTerminalEvidence } from '../src/room/room-service.ts';

const T = '2026-08-23T00:00:00.000Z';

export function makeTask(overrides: Partial<TaskContract> = {}): TaskContract {
  return {
    task_id: 'task-1',
    room_id: 'room-1',
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

export function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    run_id: 'run-1',
    room_id: 'room-1',
    task_id: 'task-1',
    status: 'running',
    baseline_head: 'deadbeef',
    claude_session_id: null,
    process_exit_code: null,
    started_at: T,
    completed_at: null,
    result: null,
    git_evidence: { staged: [], unstaged: [], untracked: [] },
    artifact_refs: [],
    failure: null,
    ...overrides,
  };
}

export function makeTerminalEvidence(overrides: Partial<RunTerminalEvidence> = {}): RunTerminalEvidence {
  return {
    claude_session_id: null,
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
    decision: 'approved',
    findings: [],
    open_questions: [],
    verification_summary: 'ok',
    created_by: 'codex',
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
