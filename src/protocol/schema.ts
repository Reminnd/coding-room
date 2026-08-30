import { z } from 'zod';

// 标识符是稳定的 opaque string。
const id = z.string().min(1);

// v0.3 protocol version：新 database 必须持久化并在 writable open 前校验 exact value；
// 缺失 metadata 的 v0.2 database 分类为 archive，以 protocol_version_mismatch 拒绝。
export const PROTOCOL_VERSION = '0.3-design';
export const protocolVersionSchema = z.literal(PROTOCOL_VERSION);

// 严格 UTC ISO 8601 timestamp：z.iso.datetime() 只接受以 Z 结尾的合法 UTC datetime，
// 拒绝非 ISO 8601、非 UTC offset 与无效日期（如 2026-13-45）。输出与 Date.toISOString() 一致。
export const utcTimestampSchema = z.iso.datetime();

const timestamp = utcTimestampSchema;

// ---- RoomState ----
export const roomStateSchema = z.enum([
  'DISCUSSION',
  'ARCHITECTURE_REVIEW',
  'WAITING_FOR_USER_CONFIRMATION',
  'PLAN_READY',
  'CODING',
  'NEEDS_DECISION',
  'RUN_FAILED',
  'REVIEW_REQUIRED',
  'REVIEW_DISCUSSION',
  'FIX_PLAN_READY',
  'ACCEPTED',
]);
export type RoomState = z.infer<typeof roomStateSchema>;

// ---- Role / ParticipantProfile / RoleAssignment ----
// Role 是 command authority；Participant 是 identity。v0.3 不再使用 fixed actor enum。
export const roleSchema = z.enum([
  'planner',
  'worker',
  'reviewer',
  'executor',
  'git_controller',
  'orchestrator',
]);
export type Role = z.infer<typeof roleSchema>;

export const participantKindSchema = z.enum(['human', 'agent', 'service']);

// config_ref 是 opaque local reference（如 profile/config 路径），不存储 secret 或 provider credential。
export const participantProfileSchema = z.object({
  participant_id: id,
  display_name: z.string().min(1),
  kind: participantKindSchema,
  provider: z.string().min(1),
  adapter_id: z.string().min(1),
  capabilities: z.array(z.string()),
  config_ref: z.string().nullable(),
  enabled: z.boolean(),
  created_at: timestamp,
});
export type ParticipantProfile = z.infer<typeof participantProfileSchema>;

// Stage 1 scope 收窄为 room|task（Review finding inc9-r2）：run|review scope 在出现真实
// pre-creation consumer 前不进入 schema/public command，MCP boundary 直接拒绝。
export const roleAssignmentScopeSchema = z.enum(['room', 'task']);

export const roleAssignmentSchema = z.object({
  assignment_id: id,
  room_id: id,
  scope_type: roleAssignmentScopeSchema,
  scope_id: id.nullable(),
  role: roleSchema,
  participant_id: id,
  created_at: timestamp,
});
export type RoleAssignment = z.infer<typeof roleAssignmentSchema>;

// Event 与 lifecycle entity 记录 actor 时的形状：required role + participant identity。
export const eventActorSchema = z.object({
  participant_id: id,
  actor_role: roleSchema,
});
export type EventActor = z.infer<typeof eventActorSchema>;

// ---- TaskContract ----
const verificationStepSchema = z.object({
  command: z.string(),
  detects: z.string(),
  decision_if_failed: z.string(),
});

const documentationUpdateSchema = z.object({
  path: z.string(),
  expected_change: z.string(),
});

const confirmedFindingSchema = z.object({
  finding_id: id,
  solution: z.string(),
});

export const taskContractSchema = z
  .object({
    task_id: id,
    room_id: id,
    type: z.enum(['implementation', 'fix']),
    parent_task_id: z.string().nullable(),
    based_on_review_id: z.string().nullable(),
    background: z.string(),
    goal: z.string().min(1),
    requirements: z.array(z.string()),
    non_goals: z.array(z.string()),
    architecture_decisions: z.array(z.string()),
    scope: z.array(z.string()),
    constraints: z.array(z.string()),
    acceptance_criteria: z.array(z.string()),
    verification: z.array(verificationStepSchema),
    documentation_updates: z.array(documentationUpdateSchema),
    question_policy: z.string(),
    confirmed_by_user: z.literal(true),
    created_by: z.literal('codex'),
    created_at: timestamp,
    confirmed_findings: z.array(confirmedFindingSchema).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type !== 'fix') return;
    if (!value.parent_task_id) {
      ctx.addIssue({
        code: 'custom',
        message: 'fix task requires parent_task_id',
        path: ['parent_task_id'],
      });
    }
    if (!value.based_on_review_id) {
      ctx.addIssue({
        code: 'custom',
        message: 'fix task requires based_on_review_id',
        path: ['based_on_review_id'],
      });
    }
    if (!value.confirmed_findings || value.confirmed_findings.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'fix task requires at least one confirmed_finding',
        path: ['confirmed_findings'],
      });
    }
    if (!value.scope.includes('review_fixes_only')) {
      ctx.addIssue({
        code: 'custom',
        message: 'fix task scope must include review_fixes_only',
        path: ['scope'],
      });
    }
  });
export type TaskContract = z.infer<typeof taskContractSchema>;

// 持久化 Task 在 TaskContract 基础上固化提交时 resolved 的 planner/orchestrator identity；
// 提交后 assignment 变化不改写既有 Task。
export const persistedTaskSchema = taskContractSchema.extend({
  planner_participant_id: id,
  orchestrator_participant_id: id,
});
export type PersistedTask = z.infer<typeof persistedTaskSchema>;

// ---- CodingResult ----
const changedFileSchema = z.object({
  path: z.string(),
  purpose: z.string(),
});

const deviationSchema = z.object({
  description: z.string(),
  reason: z.string(),
});

const verificationResultSchema = z.object({
  command: z.string(),
  status: z.enum(['passed', 'failed', 'not_run']),
  result: z.string(),
});

const testEntrySchema = z.object({
  path: z.string(),
  behavior: z.string(),
});

const documentationChangeSchema = z.object({
  path: z.string(),
  kind: z.enum(['implementation_fact', 'candidate_rule', 'candidate_architecture', 'candidate_adr']),
});

export const codingResultSchema = z.object({
  task_id: id,
  status: z.enum(['completed', 'blocked', 'needs_decision']),
  summary: z.string(),
  changed_files: z.array(changedFileSchema),
  deviations: z.array(deviationSchema),
  verification: z.array(verificationResultSchema),
  tests: z.array(testEntrySchema),
  documentation_changes: z.array(documentationChangeSchema),
  unresolved: z.array(z.string()),
  questions: z.array(z.string()),
});
export type CodingResult = z.infer<typeof codingResultSchema>;

// ---- Run ----
export const runStatusSchema = z.enum([
  'starting',
  'running',
  'needs_decision',
  'succeeded',
  'failed',
  'interrupted',
]);
export type RunStatus = z.infer<typeof runStatusSchema>;

const gitEvidenceSchema = z.object({
  staged: z.array(z.string()),
  unstaged: z.array(z.string()),
  untracked: z.array(z.string()),
});

const runFailureSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export const runSchema = z.object({
  run_id: id,
  room_id: id,
  task_id: id,
  status: runStatusSchema,
  baseline_head: z.string(),
  // Run claim 时固化的 worker/executor participant（来自当时 resolved assignment）。
  worker_participant_id: id,
  executor_participant_id: id,
  // opaque adapter session reference，只由 assigned WorkerAdapter 写入与解释。
  agent_session_ref: z.string().nullable(),
  process_exit_code: z.number().int().nullable(),
  started_at: timestamp,
  completed_at: timestamp.nullable(),
  result: codingResultSchema.nullable(),
  git_evidence: gitEvidenceSchema,
  artifact_refs: z.array(z.string()),
  failure: runFailureSchema.nullable(),
});
export type Run = z.infer<typeof runSchema>;

// ---- Review ----
const findingSeveritySchema = z.enum(['blocker', 'high', 'medium', 'low']);

const findingSchema = z.object({
  finding_id: id,
  severity: findingSeveritySchema,
  title: z.string(),
  file: z.string(),
  line: z.number().int().nullable(),
  trigger: z.string(),
  evidence: z.string(),
  impact: z.string(),
  requirement_relation: z.string(),
  minimal_direction: z.string(),
});

export const reviewSchema = z.object({
  review_id: id,
  room_id: id,
  task_id: id,
  run_id: id,
  decision: z.enum(['approved', 'changes_requested', 'needs_discussion']),
  findings: z.array(findingSchema),
  open_questions: z.array(z.string()),
  verification_summary: z.string(),
  // 提交 Review 时固化的 reviewer participant identity。
  reviewer_participant_id: id,
  created_at: timestamp,
});
export type Review = z.infer<typeof reviewSchema>;

// ---- Question ----
const questionOptionSchema = z.object({
  label: z.string(),
  tradeoff: z.string(),
});

export const questionSchema = z.object({
  question_id: id,
  room_id: id,
  task_id: id,
  run_id: id,
  status: z.enum(['open', 'answered', 'superseded']),
  question: z.string().min(1),
  blocking_scope: z.string(),
  options: z.array(questionOptionSchema),
  answer: z.string().nullable(),
  answer_changes_contract: z.boolean().nullable(),
  asked_at: timestamp,
  answered_at: timestamp.nullable(),
});
export type Question = z.infer<typeof questionSchema>;

// ---- Event ----
const entityTypeSchema = z.enum(['room', 'task', 'run', 'review', 'question']);

export const eventSchema = z.object({
  event_id: id,
  room_id: id,
  sequence: z.number().int().positive(),
  type: z.string().min(1),
  actor_role: roleSchema,
  participant_id: id,
  entity_type: entityTypeSchema,
  entity_id: id,
  summary: z.string(),
  created_at: timestamp,
});
export type Event = z.infer<typeof eventSchema>;
