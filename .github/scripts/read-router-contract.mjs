import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const MARKER = '<!-- ROUTER_CONTRACT_V1 -->';
const REQUIRED = {
  contract_type: 'router',
  contract_version: 1,
  status: 'dispatch_ready',
};

function fail(message) {
  throw new Error(`invalid router contract: ${message}`);
}

function requireObject(value, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${field} must be an object`);
  return value;
}

function requireString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${field} is required`);
  return value;
}

function requireStringArray(value, field, allowEmpty = false) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) fail(`${field} must be a non-empty array`);
  for (const entry of value) requireString(entry, `${field} entry`);
  return value;
}

function requireEqual(actual, expected, field) {
  if (actual !== expected) fail(`${field} must equal ${JSON.stringify(expected)}`);
}

function requireExactArray(actual, expected, field) {
  if (!Array.isArray(actual) || actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    fail(`${field} must equal ${JSON.stringify(expected)}`);
  }
}

function validateTasks(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) fail('tasks must be a non-empty array');

  const taskIds = new Set();
  const dispatchIds = new Set();
  const ownedBy = new Map();

  for (const [index, entry] of tasks.entries()) {
    const task = requireObject(entry, `tasks[${index}]`);
    const prefix = `tasks[${index}]`;
    const taskId = requireString(task.task_id, `${prefix}.task_id`);
    const dispatchId = requireString(task.dispatch_id, `${prefix}.dispatch_id`);
    if (taskIds.has(taskId)) fail(`duplicate task_id ${JSON.stringify(taskId)}`);
    if (dispatchIds.has(dispatchId)) fail(`duplicate dispatch_id ${JSON.stringify(dispatchId)}`);
    taskIds.add(taskId);
    dispatchIds.add(dispatchId);

    requireString(task.task_contract_path, `${prefix}.task_contract_path`);
    requireString(task.task_branch, `${prefix}.task_branch`);
    requireString(task.model_policy, `${prefix}.model_policy`);
    requireString(task.reasoning_effort, `${prefix}.reasoning_effort`);
    requireStringArray(task.depends_on, `${prefix}.depends_on`, true);
    requireStringArray(task.verification, `${prefix}.verification`);

    for (const ownedPath of requireStringArray(task.owns, `${prefix}.owns`)) {
      const previousOwner = ownedBy.get(ownedPath);
      if (previousOwner && previousOwner !== taskId) {
        fail(`owned path ${JSON.stringify(ownedPath)} overlaps tasks ${JSON.stringify(previousOwner)} and ${JSON.stringify(taskId)}`);
      }
      ownedBy.set(ownedPath, taskId);
    }

    if (task.fallback_model_policy !== null && task.fallback_model_policy !== undefined) {
      requireString(task.fallback_model_policy, `${prefix}.fallback_model_policy`);
    }
  }

  for (const task of tasks) {
    for (const dependency of task.depends_on) {
      if (!taskIds.has(dependency)) fail(`task ${JSON.stringify(task.task_id)} depends on unknown task_id ${JSON.stringify(dependency)}`);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const byId = new Map(tasks.map((task) => [task.task_id, task]));
  function visit(taskId) {
    if (visiting.has(taskId)) fail(`dependency cycle includes task_id ${JSON.stringify(taskId)}`);
    if (visited.has(taskId)) return;
    visiting.add(taskId);
    for (const dependency of byId.get(taskId).depends_on) visit(dependency);
    visiting.delete(taskId);
    visited.add(taskId);
  }
  for (const taskId of taskIds) visit(taskId);
}

export function readRouterContract(source) {
  const markerCount = source.split(MARKER).length - 1;
  if (markerCount !== 1) fail(`expected exactly one ${MARKER} marker`);

  const fenceLines = [...source.matchAll(/^[ \t]*(?:`{3,}|~{3,})[^\r\n]*\r?$/gm)];
  const blocks = [...source.matchAll(/^[ \t]*```([^\r\n]*)\r?\n([\s\S]*?)\r?\n[ \t]*```[ \t]*\r?$/gm)];
  if (fenceLines.length !== 2 || blocks.length !== 1 || blocks[0][1].trim() !== 'json') {
    fail('expected exactly one JSON fenced block');
  }

  let value;
  try {
    value = JSON.parse(blocks[0][2]);
  } catch (error) {
    fail(`malformed JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  requireObject(value, 'root');
  for (const [field, expected] of Object.entries(REQUIRED)) requireEqual(value[field], expected, field);
  for (const field of ['repository', 'workflow_id', 'stage_id', 'stage_branch']) requireString(value[field], field);

  const scheduler = requireObject(value.scheduler, 'scheduler');
  requireEqual(scheduler.mode, 'dependency_dag', 'scheduler.mode');
  requireEqual(scheduler.primary_objective, 'minimize_wall_clock_time', 'scheduler.primary_objective');
  requireEqual(scheduler.safe_parallelism_first, true, 'scheduler.safe_parallelism_first');
  requireEqual(scheduler.ready_set, 'all_dependencies_integrated_and_owned_paths_non_overlapping', 'scheduler.ready_set');
  requireExactArray(
    scheduler.integration_order_when_simultaneously_eligible,
    ['topological_priority', 'task_id'],
    'scheduler.integration_order_when_simultaneously_eligible',
  );

  validateTasks(value.tasks);

  const integration = requireObject(value.integration, 'integration');
  requireEqual(integration.task_to_stage, 'controlled_cherry_pick', 'integration.task_to_stage');
  requireExactArray(integration.record_mapping, ['task_id', 'source_task_sha', 'stage_commit_sha'], 'integration.record_mapping');
  requireEqual(integration.automatic_rebase, false, 'integration.automatic_rebase');
  requireEqual(integration.automatic_conflict_resolution, false, 'integration.automatic_conflict_resolution');
  requireEqual(integration.force, false, 'integration.force');

  const review = requireObject(value.review, 'review');
  requireEqual(review.authority, 'chatgpt_fixed_chat', 'review.authority');
  requireEqual(review.transport, 'github_pull_request', 'review.transport');
  requireEqual(review.supervisor_may_approve, false, 'review.supervisor_may_approve');
  requireEqual(review.supervisor_may_merge, false, 'review.supervisor_may_merge');

  const fixPolicy = requireObject(value.fix_policy, 'fix_policy');
  requireEqual(fixPolicy.mode, 'always_confirm', 'fix_policy.mode');

  const execution = requireObject(value.execution, 'execution');
  requireEqual(execution.primary_surface, 'local_codex', 'execution.primary_surface');
  requireEqual(execution.cloud_primary, false, 'execution.cloud_primary');
  requireEqual(execution.work, 'removed', 'execution.work');
  requireEqual(execution.local_state_database, false, 'execution.local_state_database');

  // 只输出Supervisor调度所需的已验证字段；runtime Git事实和其它外来字段不会穿过边界。
  return {
    contract_type: value.contract_type,
    contract_version: value.contract_version,
    status: value.status,
    workflow_id: value.workflow_id,
    stage_id: value.stage_id,
    repository: value.repository,
    stage_branch: value.stage_branch,
    scheduler: {
      mode: scheduler.mode,
      primary_objective: scheduler.primary_objective,
      safe_parallelism_first: scheduler.safe_parallelism_first,
      ready_set: scheduler.ready_set,
      integration_order_when_simultaneously_eligible: scheduler.integration_order_when_simultaneously_eligible,
    },
    tasks: value.tasks.map((task) => ({
      task_id: task.task_id,
      dispatch_id: task.dispatch_id,
      task_contract_path: task.task_contract_path,
      task_branch: task.task_branch,
      depends_on: task.depends_on,
      owns: task.owns,
      model_policy: task.model_policy,
      reasoning_effort: task.reasoning_effort,
      fallback_model_policy: task.fallback_model_policy ?? null,
      verification: task.verification,
    })),
    integration: {
      task_to_stage: integration.task_to_stage,
      record_mapping: integration.record_mapping,
      automatic_rebase: integration.automatic_rebase,
      automatic_conflict_resolution: integration.automatic_conflict_resolution,
      force: integration.force,
    },
    review: {
      authority: review.authority,
      transport: review.transport,
      supervisor_may_approve: review.supervisor_may_approve,
      supervisor_may_merge: review.supervisor_may_merge,
    },
    fix_policy: { mode: fixPolicy.mode },
    execution: {
      primary_surface: execution.primary_surface,
      cloud_primary: execution.cloud_primary,
      work: execution.work,
      local_state_database: execution.local_state_database,
    },
  };
}

async function main() {
  const path = process.argv[2];
  if (!path || process.argv.length !== 3) fail('usage: node .github/scripts/read-router-contract.mjs <path>');
  process.stdout.write(`${JSON.stringify(readRouterContract(await readFile(path, 'utf8')))}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
