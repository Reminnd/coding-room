import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { BridgeError, blocked, needsDecision } from './errors.mjs';
import {
  SUPERVISOR_ONLY_CODEX_EXECUTABLE,
  SUPERVISOR_ONLY_ENV_ALLOWLIST,
  SUPERVISOR_ONLY_MODEL,
  supervisorOnlyArgvTemplate,
  supervisorOnlyEnvironment,
} from './codex.mjs';
import { latestTaskStates } from './github.mjs';
import { failureResult, gateDispatchBatch, preMutationFailure } from './lifecycle.mjs';
import { loadRouter } from './router-loader.mjs';
import { resolveModel } from './model-router.mjs';
import { runOnceSchedule, runStartSchedule } from './scheduler.mjs';
import { assertOwnedFiles } from './scope.mjs';
import { runSupervisor } from './supervisor.mjs';
import { runVerification } from './verification.mjs';

const WORKER_RESULT_SCALARS = new Set([
  'task_id',
  'dispatch_id',
  'reported_base_sha',
  'status',
]);
const WORKER_RESULT_LISTS = new Set(['deviations', 'unresolved', 'questions']);
const WORKER_IMPLEMENTATION_LISTS = new Set(['changed_files']);

export const SUPERVISOR_ONLY_BINDING = Object.freeze({
  repository: 'Reminnd/coding-room',
  workflow_id: 'wf-increment-016-github-review-fix-acceptance-closure',
  stage_id: 'S01-review-fix-acceptance-closure',
  task_id: 'T01-review-fix-lifecycle-core',
  dispatch_id: 'wf16-s01-t01-review-fix-lifecycle-core-001',
  candidate_parent_sha: 'd4f09e920e783a6b789a8d744e2ff648f1cc5535',
  task_branch: 'task/wf-increment-016-github-review-fix-acceptance-closure/T01-review-fix-lifecycle-core',
  task_contract_path: 'docs/work/wf-increment-016-github-review-fix-acceptance-closure/stages/S01-review-fix-acceptance-closure/tasks/T01-review-fix-lifecycle-core/TASK_CONTRACT.md',
  router_contract_path: 'docs/work/wf-increment-016-github-review-fix-acceptance-closure/stages/S01-review-fix-acceptance-closure/ROUTER_CONTRACT.md',
  remote_stage_branch: 'stage/wf-increment-016-github-review-fix-acceptance-closure/S01-review-fix-acceptance-closure',
  pull_request_number: 8,
});

const REQUEST_KEYS = Object.freeze([
  ...Object.keys(SUPERVISOR_ONLY_BINDING),
  'accepted_stage_sha',
  'task_contract_blob_sha',
  'candidate_sha',
  'canonical_task_worktree',
  'verification_evidence',
]);
const VERIFICATION_KEYS = Object.freeze([
  'task_id', 'dispatch_id', 'candidate_sha', 'dispatch_base_sha',
  'focused', 'bridge', 'typecheck', 'diff_check', 'full_suite', 'baseline',
  'failure_sets_identical', 'failure_evidence_identical', 'classification', 'new_regressions',
]);
const EXECUTION_PLAN_KEYS = Object.freeze([
  'repository', 'workflow_id', 'stage_id', 'task_id', 'dispatch_id',
  'candidate_sha', 'candidate_parent_sha', 'task_branch', 'canonical_task_worktree',
  'accepted_stage_sha', 'task_contract_path', 'task_contract_blob_sha', 'router_contract_path',
  'remote_stage_branch', 'pull_request_number',
  'pr_state', 'pr_draft', 'pr_head_branch', 'pr_head_sha', 'pr_base_branch', 'pr_base_sha',
  'exact_changed_files', 'ownership', 'mechanical_gate_facts', 'verification_evidence',
  'canonical_codex_executable', 'model', 'reasoning_effort', 'cwd', 'argv_template',
  'temp_output_path_pattern', 'environment_policy', 'proxy_configuration',
  'provider_and_destination', 'host_approval_residuals', 'payload_classes',
  'retry_policy', 'child_process_policy', 'complete_diff',
]);

function assertPlainObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw needsDecision(`${label} must be an object`);
}

function assertExactKeys(value, expected, label) {
  assertPlainObject(value, label);
  if (!isDeepStrictEqual(Object.keys(value).sort(), [...expected].sort())) throw needsDecision(`${label} fields are not exact`);
}

function sameStringSet(left, right) {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.length === sortedRight.length && sortedLeft.every((value, index) => value === sortedRight[index]);
}

function parsePassCount(value) {
  if (typeof value !== 'string' || !/^[0-9]+\/[0-9]+$/.test(value)) {
    throw needsDecision('verification evidence count must use passed/total decimal grammar');
  }
  const [passedText, totalText] = value.split('/');
  const passed = BigInt(passedText);
  const total = BigInt(totalText);
  if (total <= 0n || passed > total) {
    throw needsDecision('verification evidence count is semantically invalid');
  }
  return { passed, total };
}

function validateVerificationEvidence(evidence, request) {
  assertExactKeys(evidence, VERIFICATION_KEYS, 'verification_evidence');
  const identityBindings = {
    task_id: request.task_id,
    dispatch_id: request.dispatch_id,
    candidate_sha: request.candidate_sha,
    dispatch_base_sha: request.candidate_parent_sha,
  };
  for (const [key, expected] of Object.entries(identityBindings)) {
    if (evidence[key] !== expected) throw needsDecision(`verification_evidence ${key} does not match its request binding`);
  }

  const focused = parsePassCount(evidence.focused);
  const bridge = parsePassCount(evidence.bridge);
  const fullSuite = parsePassCount(evidence.full_suite);
  const baseline = parsePassCount(evidence.baseline);
  if (focused.passed !== focused.total || bridge.passed !== bridge.total) {
    throw needsDecision('focused and bridge verification evidence must fully pass');
  }
  if (fullSuite.passed !== baseline.passed || fullSuite.total !== baseline.total) {
    throw needsDecision('full_suite verification evidence must equal baseline');
  }
  if (
    evidence.typecheck !== 'pass'
    || evidence.diff_check !== 'pass'
    || evidence.failure_sets_identical !== true
    || evidence.failure_evidence_identical !== true
    || evidence.classification !== 'baseline_equivalent_no_new_regression'
    || evidence.new_regressions !== 0
  ) {
    throw needsDecision('verification_evidence does not satisfy baseline-equivalence semantics');
  }
}

export function validateSupervisorOnlyRequest(request) {
  assertExactKeys(request, REQUEST_KEYS, 'Supervisor-only request');
  for (const [key, expected] of Object.entries(SUPERVISOR_ONLY_BINDING)) {
    if (!isDeepStrictEqual(request[key], expected)) throw needsDecision(`Supervisor-only request ${key} does not match its accepted binding`);
  }
  for (const key of ['accepted_stage_sha', 'task_contract_blob_sha']) {
    if (typeof request[key] !== 'string' || !/^[0-9a-f]{40}$/.test(request[key])) {
      throw needsDecision(`Supervisor-only request ${key} must be an exact SHA`);
    }
  }
  if (typeof request.candidate_sha !== 'string' || !/^[0-9a-f]{40}$/.test(request.candidate_sha)) {
    throw needsDecision('Supervisor-only request candidate_sha must be an exact SHA');
  }
  if (typeof request.canonical_task_worktree !== 'string' || request.canonical_task_worktree.length === 0) {
    throw needsDecision('Supervisor-only request canonical_task_worktree must be a non-empty string');
  }
  validateVerificationEvidence(request.verification_evidence, request);
  return request;
}

function supervisorOnlyFailure(reason) {
  return {
    status: 'needs_decision',
    reason,
    external_supervisor_started: false,
    git_mutation: false,
    github_mutation: false,
  };
}

function requestFromApprovedPlan(value) {
  assertExactKeys(value, ['status', 'execution_plan'], 'approved Supervisor-only plan');
  if (value.status !== 'supervisor_only_plan_ready') throw needsDecision('approved Supervisor-only plan status is invalid');
  assertExactKeys(value.execution_plan, EXECUTION_PLAN_KEYS, 'approved execution_plan');
  return Object.fromEntries(REQUEST_KEYS.map((key) => [key, value.execution_plan[key]]));
}

function parseWorkerString(raw) {
  const value = raw.trim();
  if (value.length === 0 || /^(?:null|~|true|false|-?\d+(?:\.\d+)?|\[.*\]|\{.*\})$/i.test(value)) return null;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    const unquoted = value.slice(1, -1);
    return unquoted.length > 0 ? unquoted : null;
  }
  return value;
}

function setWorkerField(target, key, value, path) {
  if (Object.hasOwn(target, key)) throw new Error(`duplicate field ${path}`);
  target[key] = value;
}

// Worker final messages use a small task-generic YAML subset.
// This parser deliberately does not become a generic YAML or Task-specific schema layer.
function parseWorkerCodingResult(lastMessage) {
  if (typeof lastMessage !== 'string' || lastMessage.trim().length === 0) {
    throw new Error('result is empty');
  }

  const result = {};
  let section = null;
  for (const line of lastMessage.replaceAll('\r\n', '\n').split('\n')) {
    if (line.trim().length === 0 || /^```(?:ya?ml)?\s*$/i.test(line.trim())) continue;

    const topLevel = /^([a-z_]+):(?:\s*(.*))?$/.exec(line);
    if (topLevel) {
      const [, key, raw = ''] = topLevel;
      section = null;
      if (WORKER_RESULT_SCALARS.has(key)) {
        const value = parseWorkerString(raw);
        if (value === null) throw new Error(`${key} must be a non-empty string`);
        setWorkerField(result, key, value, key);
      } else if (WORKER_RESULT_LISTS.has(key) || WORKER_IMPLEMENTATION_LISTS.has(key)) {
        if (raw !== '' && raw !== '[]') throw new Error(`${key} must be a list`);
        setWorkerField(result, key, [], key);
        if (raw === '') section = { kind: 'list', key };
      }
      continue;
    }

    if (section?.kind === 'list') {
      const item = /^  -\s+(.+)$/.exec(line);
      if (item) {
        const value = parseWorkerString(item[1]);
        if (value === null) throw new Error(`${section.key} items must be non-empty strings`);
        result[section.key].push(value);
      }
      continue;
    }
  }
  return result;
}

function validateWorkerCodingResult(processResult, task, baseSha) {
  const result = parseWorkerCodingResult(processResult.lastMessage);
  for (const key of WORKER_RESULT_SCALARS) {
    if (!Object.hasOwn(result, key)) throw new Error(`missing field ${key}`);
  }
  for (const key of WORKER_RESULT_LISTS) {
    if (!Array.isArray(result[key])) throw new Error(`missing field ${key}`);
  }
  if (result.task_id !== task.task_id) throw new Error('task_id does not match the current Task');
  if (result.dispatch_id !== task.dispatch_id) throw new Error('dispatch_id does not match the current dispatch');
  if (result.reported_base_sha !== baseSha) throw new Error('reported_base_sha does not match the original dispatch base');
  if (!['implementation_ready', 'blocked', 'needs_decision'].includes(result.status)) {
    throw new Error('status must be implementation_ready, blocked, or needs_decision');
  }
  if (result.status !== 'implementation_ready') return result;

  if (!Array.isArray(result.changed_files) || result.changed_files.length === 0) {
    throw new Error('changed_files must not be empty for implementation_ready');
  }
  return result;
}

function samePathSet(left, right) {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.length === sortedRight.length
    && sortedLeft.every((path, index) => path === sortedRight[index]);
}

function validateWorkingTreeObservation(observation, task, baseSha, expectedPaths = null) {
  if (observation.head !== baseSha) throw blocked(`task HEAD must equal dispatch base ${baseSha}`);
  if (observation.branch !== task.task_branch) {
    throw blocked(`task worktree is on ${observation.branch}, expected ${task.task_branch}`);
  }
  if (observation.stagedPaths.length > 0) {
    throw blocked(`task worktree has preexisting staged paths: ${observation.stagedPaths.join(', ')}`);
  }
  if (observation.workingPaths.length === 0) throw blocked('task working tree has no changed files');
  try {
    assertOwnedFiles(task, observation.workingPaths);
  } catch (error) {
    throw blocked(error.message);
  }
  if (expectedPaths !== null && !samePathSet(observation.workingPaths, expectedPaths)) {
    throw blocked('actual working-tree changed files do not match the expected path set');
  }
}

function nativeFacts(processResult) {
  const facts = {};
  if (typeof processResult.native?.threadId === 'string') facts.native_thread_id = processResult.native.threadId;
  if (typeof processResult.native?.turnId === 'string') facts.native_turn_id = processResult.native.turnId;
  if (typeof processResult.native?.status === 'string') facts.native_turn_status = processResult.native.status;
  return facts;
}

function requireHandoff(handoff, repository) {
  const required = ['status', 'repository', 'workflow_id', 'stage_id', 'router_contract_path', 'contract_commit_sha', 'stage_branch', 'stage_head_sha', 'execution_surface'];
  const missing = required.filter((field) => typeof handoff[field] !== 'string' || handoff[field].length === 0);
  if (missing.length > 0) throw needsDecision(`dispatch handoff is missing: ${missing.join(', ')}`);
  if (handoff.status !== 'dispatch_ready') throw needsDecision(`dispatch handoff status must be dispatch_ready, got ${handoff.status}`);
  if (handoff.repository !== repository) throw needsDecision(`dispatch repository ${handoff.repository} does not match ${repository}`);
  if (handoff.execution_surface !== 'local_codex') {
    throw needsDecision(`dispatch execution_surface must be local_codex, got ${handoff.execution_surface}`);
  }
}

function validateRouterHandoff(router, handoff) {
  const workflowId = router.workflow_id;
  if (workflowId !== handoff.workflow_id) throw needsDecision('Router workflow_id does not match GitHub handoff');
  if (router.stage_id !== handoff.stage_id) throw needsDecision('Router stage_id does not match GitHub handoff');
  if (router.repository !== handoff.repository) throw needsDecision('Router repository does not match GitHub handoff');
  if (router.stage_branch !== handoff.stage_branch) throw needsDecision('Router stage_branch does not match GitHub handoff');
  if (!Array.isArray(router.tasks) || router.tasks.length === 0) throw needsDecision('normalized Router has no tasks');
  return workflowId;
}

function taskEvent(base, task, status, facts = {}) {
  return {
    contract_type: 'local_codex_bridge_event',
    contract_version: 1,
    repository: base.repository,
    workflow_id: base.workflowId,
    stage_id: base.router.stage_id,
    stage_branch: base.router.stage_branch,
    task_id: task.task_id,
    dispatch_id: task.dispatch_id,
    status,
    ...facts,
  };
}

export class SupervisorOnlyController {
  constructor({
    repository,
    repositoryRoot,
    github,
    git,
    launcher,
    canonicalCodexExecutable,
    environmentSource = process.env,
    routerLoader,
    supervisorRunner = runSupervisor,
  }) {
    this.repository = repository;
    this.repositoryRoot = resolve(repositoryRoot);
    this.github = github;
    this.git = git;
    this.launcher = launcher;
    this.canonicalCodexExecutable = canonicalCodexExecutable;
    this.environmentSource = environmentSource;
    this.routerLoader = routerLoader ?? ((source) => loadRouter({ repositoryRoot: this.repositoryRoot, source }));
    this.supervisorRunner = supervisorRunner;
    this.current = null;
  }

  async buildPlan(rawRequest) {
    const request = validateSupervisorOnlyRequest(rawRequest);
    if (this.repository !== request.repository) throw needsDecision('repository does not match the Supervisor-only request');
    if (this.repositoryRoot !== request.canonical_task_worktree) {
      throw needsDecision('current repository path does not match canonical_task_worktree');
    }
    if (this.canonicalCodexExecutable !== SUPERVISOR_ONLY_CODEX_EXECUTABLE) {
      throw needsDecision('canonical Codex executable does not match the accepted one-time path');
    }

    const remoteStageSha = await this.git.remoteBranchHead(request.remote_stage_branch, this.repositoryRoot);
    if (remoteStageSha !== request.accepted_stage_sha) throw needsDecision('remote Stage head has drifted');
    const pr = await this.github.pullRequestFacts(request.repository, request.pull_request_number);
    if (pr.number !== request.pull_request_number || pr.state !== 'OPEN' || pr.isDraft !== true
      || pr.headRefName !== request.remote_stage_branch || pr.headRefOid !== request.accepted_stage_sha
      || pr.baseRefName !== 'main') {
      throw needsDecision('pull request state, draft, head, or base binding has drifted');
    }

    const contractObject = await this.git.readBlobAtCommit(
      request.accepted_stage_sha,
      request.task_contract_path,
      request.task_contract_blob_sha,
    );
    if (contractObject.blobSha !== request.task_contract_blob_sha) throw needsDecision('accepted Task Contract blob has drifted');
    const routerObject = await this.git.readBlobAtCommit(
      request.accepted_stage_sha,
      request.router_contract_path,
    );
    const router = await this.routerLoader(routerObject.bytes.toString('utf8'));
    if (router.repository !== request.repository || router.workflow_id !== request.workflow_id
      || router.stage_id !== request.stage_id || router.stage_branch !== request.remote_stage_branch) {
      throw needsDecision('accepted Router identity does not match the Supervisor-only request');
    }
    const matchingTasks = router.tasks.filter((task) => task.task_id === request.task_id);
    if (matchingTasks.length !== 1) throw needsDecision('accepted Router does not contain exactly one requested Task');
    const task = matchingTasks[0];
    if (task.dispatch_id !== request.dispatch_id || task.task_branch !== request.task_branch
      || task.task_contract_path !== request.task_contract_path || task.model_policy !== 'coding_strong'
      || task.reasoning_effort !== SUPERVISOR_ONLY_MODEL.reasoningEffort
      || task.fallback_model_policy !== null) {
      throw needsDecision('accepted Router Task binding does not match Supervisor-only authority');
    }

    const registered = (await this.git.listWorktrees()).filter((entry) => resolve(entry.path) === this.repositoryRoot);
    if (registered.length !== 1 || registered[0].head !== request.candidate_sha || registered[0].branch !== request.task_branch) {
      throw needsDecision('canonical Task worktree registration does not match candidate and branch');
    }
    const candidate = await this.git.observeSupervisorOnlyCandidate(this.repositoryRoot, request.candidate_parent_sha);
    if (!candidate.commitExists || candidate.head !== request.candidate_sha) throw needsDecision('candidate SHA is unavailable or mismatched');
    if (candidate.parents.length !== 1 || candidate.parentSha !== request.candidate_parent_sha) {
      throw needsDecision('candidate parent does not match the exact dispatch base');
    }
    if (candidate.branch !== request.task_branch) throw needsDecision('candidate branch does not match the exact Task branch');
    if (candidate.status !== '' || candidate.stagedPaths.length > 0 || candidate.unstagedPaths.length > 0
      || candidate.untrackedPaths.length > 0) {
      throw needsDecision('candidate worktree is not clean with zero staged, unstaged, and untracked paths');
    }
    if (candidate.changedFiles.length !== 15 || !sameStringSet(candidate.changedFiles, task.owns)) {
      throw needsDecision('candidate changed paths do not equal the exact Router-owned 15-path set');
    }
    try {
      assertOwnedFiles(task, candidate.changedFiles);
    } catch (error) {
      throw needsDecision(`candidate ownership validation failed: ${error.message}`);
    }
    if (!candidate.diffCheckPassed) throw needsDecision(`candidate diff check failed: ${candidate.diffCheckError}`);
    try {
      await this.git.mechanicalGate(task, {
        taskId: request.task_id,
        baseSha: request.candidate_parent_sha,
        taskHeadSha: request.candidate_sha,
        parentSha: candidate.parentSha,
        parents: candidate.parents,
        branch: candidate.branch,
        actualChangedFiles: candidate.changedFiles,
        worktreeStatus: candidate.status,
        commitExists: candidate.commitExists,
      });
    } catch (error) {
      throw needsDecision(`candidate mechanical gate failed: ${error.message}`);
    }

    const remoteTaskSha = await this.git.remoteBranchHead(request.task_branch, this.repositoryRoot);
    if (remoteTaskSha !== null) throw needsDecision('remote Task branch must remain absent');

    const completeDiff = await this.git.completeDiff(request.candidate_parent_sha, request.candidate_sha);
    const executionPlan = {
      repository: request.repository,
      workflow_id: request.workflow_id,
      stage_id: request.stage_id,
      task_id: request.task_id,
      dispatch_id: request.dispatch_id,
      candidate_sha: request.candidate_sha,
      candidate_parent_sha: request.candidate_parent_sha,
      task_branch: request.task_branch,
      canonical_task_worktree: this.repositoryRoot,
      accepted_stage_sha: request.accepted_stage_sha,
      task_contract_path: request.task_contract_path,
      task_contract_blob_sha: contractObject.blobSha,
      router_contract_path: request.router_contract_path,
      remote_stage_branch: request.remote_stage_branch,
      pull_request_number: request.pull_request_number,
      pr_state: pr.state,
      pr_draft: pr.isDraft,
      pr_head_branch: pr.headRefName,
      pr_head_sha: pr.headRefOid,
      pr_base_branch: pr.baseRefName,
      pr_base_sha: pr.baseRefOid,
      exact_changed_files: [...candidate.changedFiles],
      ownership: {
        router_owned_paths: [...task.owns],
        changed_paths_equal_router_owned_paths: true,
      },
      mechanical_gate_facts: {
        candidate_commit_exists: true,
        exactly_one_parent: true,
        parent_matches_dispatch_base: true,
        branch_matches_task_branch: true,
        worktree_clean: true,
        staged_empty: true,
        unstaged_empty: true,
        untracked_empty: true,
        changed_path_count: candidate.changedFiles.length,
        changed_paths_match: true,
        ownership_valid: true,
        diff_check_passed: true,
        remote_task_branch_absent: true,
        remote_stage_matches: true,
        pull_request_matches: true,
        accepted_contract_blob_matches: true,
        router_contract_blob_sha: routerObject.blobSha,
      },
      verification_evidence: request.verification_evidence,
      canonical_codex_executable: this.canonicalCodexExecutable,
      model: SUPERVISOR_ONLY_MODEL.resolvedModel,
      reasoning_effort: SUPERVISOR_ONLY_MODEL.reasoningEffort,
      cwd: this.repositoryRoot,
      argv_template: supervisorOnlyArgvTemplate(this.repositoryRoot),
      temp_output_path_pattern: 'codex-github-bridge-*/{output-schema.json,last-message.txt}',
      environment_policy: {
        inheritance: 'explicit_allowlist',
        allowed_names: [...SUPERVISOR_ONLY_ENV_ALLOWLIST],
        effective_environment: supervisorOnlyEnvironment(this.environmentSource),
        excluded_names: ['CODEX_HOME', 'CODEX_CLI_PATH', 'OPENAI_API_KEY'],
        secret_token_password_auth_values: 'excluded',
      },
      proxy_configuration: {
        HTTP_PROXY: 'http://127.0.0.1:7890',
        HTTPS_PROXY: 'http://127.0.0.1:7890',
      },
      provider_and_destination: {
        provider: 'OpenAI Codex via ChatGPT auth',
        destination_family: 'chatgpt.com:443',
        exact_upstream_endpoint: 'runtime-resolved residual',
      },
      host_approval_residuals: [
        'Host approval binds the provider and destination family, not an exact runtime-resolved request path.',
        'One codex.exe launch may perform internal transport retry; the Bridge performs no retry, fallback, or automatic second Supervisor launch.',
        'The read-only Supervisor may start necessary local read-only shell or Git children; MCP, node_repl, computer-use, and completion notifier integrations are disabled.',
      ],
      payload_classes: {
        sent_to_provider: ['accepted_task_contract', 'candidate_git_facts', 'verification_evidence', 'complete_diff'],
        not_sent: ['environment_values', 'authentication_tokens', 'mutable_worktree_contract'],
      },
      retry_policy: {
        bridge_retry: 'none',
        fallback_provider_or_model: 'none',
        automatic_second_supervisor: false,
        codex_internal_transport_retry: 'possible residual',
      },
      child_process_policy: {
        worker_launch: false,
        repository_child_network: 'disabled',
        mcp_network: 'disabled',
        necessary_read_only_shell_or_git_children: true,
      },
      complete_diff: completeDiff,
    };
    this.current = { request, contractBytes: contractObject.bytes, candidate, completeDiff };
    return { status: 'supervisor_only_plan_ready', execution_plan: executionPlan };
  }

  async plan(request) {
    try {
      return await this.buildPlan(request);
    } catch (error) {
      return supervisorOnlyFailure(error.message);
    }
  }

  async execute(approvedPlan) {
    let request;
    try {
      request = requestFromApprovedPlan(approvedPlan);
    } catch (error) {
      return supervisorOnlyFailure(error.message);
    }
    const freshPlan = await this.plan(request);
    if (freshPlan.status !== 'supervisor_only_plan_ready') return freshPlan;
    if (!isDeepStrictEqual(freshPlan, approvedPlan)) {
      return supervisorOnlyFailure('approved execution plan does not directly equal fresh read-only facts');
    }

    let supervisor;
    try {
      supervisor = await this.supervisorRunner({
        launcher: this.launcher,
        worktree: request.canonical_task_worktree,
        model: SUPERVISOR_ONLY_MODEL,
        contract: this.current.contractBytes.toString('utf8'),
        facts: {
          task_id: request.task_id,
          dispatch_id: request.dispatch_id,
          base_sha: request.candidate_parent_sha,
          task_head_sha: request.candidate_sha,
          parent_sha: request.candidate_parent_sha,
          task_branch: request.task_branch,
          actual_changed_files: [...this.current.candidate.changedFiles],
        },
        native: {},
        dependencies: [],
        verification: request.verification_evidence,
        diff: this.current.completeDiff,
      });
    } catch (error) {
      return supervisorOnlyFailure(error.message);
    }
    if (typeof supervisor?.reason !== 'string' || supervisor.reason === '') {
      return { ...supervisorOnlyFailure('supervisor_reason_lost'), external_supervisor_started: true };
    }
    return {
      status: supervisor.status,
      reason: supervisor.reason,
      external_supervisor_started: true,
      git_mutation: false,
      github_mutation: false,
    };
  }
}

export class BridgeController {
  constructor({
    repository,
    repositoryRoot,
    worktreeRoot,
    github,
    git,
    launcher,
    capability,
    log = console.log,
    schedules = { 'run-once': runOnceSchedule, start: runStartSchedule },
  }) {
    this.repository = repository;
    this.repositoryRoot = resolve(repositoryRoot);
    this.worktreeRoot = resolve(worktreeRoot);
    this.github = github;
    this.git = git;
    this.launcher = launcher;
    this.capability = capability;
    this.log = log;
    this.schedules = schedules;
  }

  async load() {
    const discovered = await this.github.discover(this.repository);
    if (discovered.length !== 1) throw needsDecision(`expected exactly one codex-dispatch-ready Stage PR, found ${discovered.length}`);
    const stage = discovered[0];
    if (stage.handoffErrors?.length > 0) throw preMutationFailure(`dispatch handoff is malformed: ${stage.handoffErrors.join('; ')}`);
    if (stage.eventErrors?.length > 0) throw preMutationFailure(`Bridge event is malformed: ${stage.eventErrors.join('; ')}`);
    if (stage.lifecycle?.errors?.length > 0) throw preMutationFailure(`lifecycle comments are malformed or conflicting: ${stage.lifecycle.errors.map((item) => item.message).join('; ')}`);
    const currentPreparations = (stage.lifecycle?.records ?? []).filter((record) => record.record_type === 'FIX_PREPARED_V1'
      && record.prepared_stage_sha === stage.prHeadSha);
    if (currentPreparations.length > 1) throw preMutationFailure(`expected at most one current Fix preparation, found ${currentPreparations.length}`);
    const currentPreparation = currentPreparations[0] ?? null;
    const currentFixHandoffs = (stage.lifecycle?.fixHandoffs ?? []).filter((handoff) => handoff.prepared_stage_sha === stage.prHeadSha);
    if (currentFixHandoffs.length > 1) throw preMutationFailure(`expected at most one current Fix handoff, found ${currentFixHandoffs.length}`);
    if (!currentPreparation) requireHandoff(stage.handoff, this.repository);

    const stageBranch = currentPreparation?.stage_branch ?? stage.handoff.stage_branch;
    let actualStageSha;
    try {
      actualStageSha = await this.git.remoteBranchHead(stageBranch);
    } catch (error) {
      throw preMutationFailure(`remote Stage head is unobservable: ${error.message}`);
    }
    if (actualStageSha === null) throw preMutationFailure('remote Stage head is unobservable');
    if (!currentPreparation && stage.handoff.stage_head_sha !== actualStageSha) {
      throw preMutationFailure(`dispatch handoff Stage head ${stage.handoff.stage_head_sha} does not match actual remote Stage ${actualStageSha}`);
    }
    if (stage.prHeadSha !== actualStageSha) {
      throw preMutationFailure(`Stage PR head ${stage.prHeadSha} does not match actual remote Stage ${actualStageSha}`);
    }

    const routerPath = currentPreparation?.router_contract_path ?? stage.handoff.router_contract_path;
    const contractRef = currentPreparation?.prepared_stage_sha ?? stage.handoff.contract_commit_sha;
    const readBytes = async (path) => {
      if (typeof this.github.readRepositoryFileBytes === 'function') {
        const bytes = await this.github.readRepositoryFileBytes(this.repository, path, contractRef);
        return Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
      }
      return Buffer.from(await this.github.readRepositoryFile(this.repository, path, contractRef), 'utf8');
    };
    let routerBytes;
    let router;
    try {
      routerBytes = await readBytes(routerPath);
      router = await loadRouter({ repositoryRoot: this.repositoryRoot, source: routerBytes.toString('utf8') });
    } catch (error) {
      if (error instanceof BridgeError) throw error;
      throw preMutationFailure(`Router strict read failed: ${error.message}`);
    }
    const workflowId = currentPreparation ? router.workflow_id : validateRouterHandoff(router, stage.handoff);
    if (stage.prHeadBranch !== router.stage_branch) throw preMutationFailure('Stage PR head branch does not match Router stage_branch');

    const state = latestTaskStates(stage.events, {
      repository: this.repository,
      workflow_id: workflowId,
      stage_id: router.stage_id,
      stage_branch: router.stage_branch,
      tasks: router.tasks,
    });
    for (const task of router.tasks) if (!state.states.has(task.task_id)) state.states.set(task.task_id, 'not_started');
    if ([...state.states.values()].some((status) => status === 'dispatched')) {
      throw preMutationFailure('a prior task_dispatched event has no terminal Bridge event; Worker start state is unknown');
    }
    const taskContractBytes = new Map();
    try {
      await Promise.all(router.tasks.map(async (task) => {
        taskContractBytes.set(task.task_id, await readBytes(task.task_contract_path));
      }));
    } catch (error) {
      if (error instanceof BridgeError) throw error;
      throw preMutationFailure(`Task Contract strict read failed: ${error.message}`);
    }
    stage.lifecycle ??= { records: [], reviewHandoffs: [], fixHandoffs: [], errors: [] };
    stage.ambiguousTaskEvents = state.ambiguousTaskEvents ?? [];
    const gate = gateDispatchBatch({
      repository: this.repository,
      router,
      stage,
      remoteStageSha: actualStageSha,
      taskContractBytes,
      states: state.states,
    });
    this.context = {
      stage,
      router,
      routerBytes,
      workflowId,
      actualStageSha,
      taskContractBytes,
      gate,
      ...state,
    };
    return this.context;
  }

  async prepareExecution() {
    const fetchedStageSha = await this.git.fetchStage(this.context.router.stage_branch);
    if (fetchedStageSha !== this.context.actualStageSha) {
      throw needsDecision(`fetched Stage ${fetchedStageSha} does not match gated remote Stage ${this.context.actualStageSha}`);
    }
    const stageWorktree = await this.git.ensureStageWorktree(this.context.router.stage_branch);
    const localStageSha = await this.git.head(stageWorktree);
    if (localStageSha !== this.context.actualStageSha) {
      throw needsDecision(`Stage integration worktree HEAD ${localStageSha} does not match actual remote Stage ${this.context.actualStageSha}`);
    }
    if (await this.git.status(stageWorktree)) throw blocked(`Stage integration worktree is not clean: ${stageWorktree}`);
    for (const task of this.context.router.tasks) {
      if (this.context.states.get(task.task_id) !== 'integrated') continue;
      await this.revalidateRecoveredIntegration(task, this.context.mappings.get(task.task_id), this.context.actualStageSha, stageWorktree);
    }
    this.context.stageWorktree = stageWorktree;
    return stageWorktree;
  }

  async revalidateRecoveredIntegration(task, mapping, actualStageSha, stageWorktree) {
    try {
      if (typeof mapping?.source_task_sha !== 'string' || mapping.source_task_sha.length === 0
        || typeof mapping?.stage_commit_sha !== 'string' || mapping.stage_commit_sha.length === 0) {
        throw new Error('recorded source_task_sha or stage_commit_sha is missing');
      }
      const remoteTaskSha = await this.git.remoteBranchHead(task.task_branch, stageWorktree);
      if (remoteTaskSha !== mapping?.source_task_sha) {
        throw new Error(`remote Task head ${remoteTaskSha ?? '<missing>'} does not match recorded source ${mapping?.source_task_sha ?? '<missing>'}`);
      }
      if (!await this.git.commitExists(mapping.stage_commit_sha, stageWorktree)) {
        throw new Error(`recorded Stage commit does not exist: ${mapping.stage_commit_sha}`);
      }
      if (!await this.git.isAncestor(mapping.stage_commit_sha, actualStageSha, stageWorktree)) {
        throw new Error(`recorded Stage commit ${mapping.stage_commit_sha} is not an ancestor of ${actualStageSha}`);
      }
      const changedFiles = await this.git.changedFiles(mapping.stage_commit_sha, stageWorktree);
      assertOwnedFiles(task, changedFiles);
    } catch (error) {
      throw needsDecision(`recovered integration for ${task.task_id} does not match current Git facts: ${error.message}`);
    }
  }

  async publish(task, status, facts = {}) {
    const event = taskEvent({ repository: this.repository, ...this.context }, task, status, facts);
    await this.github.publishEvent(this.repository, this.context.stage.prNumber, event);
    if (status === 'task_dispatched') this.context.dispatches.set(task.task_id, event);
    if (status === 'task_integrated') this.context.mappings.set(task.task_id, event);
    this.context.states.set(task.task_id, status === 'task_integrated' ? 'integrated' : status === 'task_dispatched' ? 'running' : status);
    this.log(`${task.task_id}: ${status}${facts.stage_commit_sha ? ` ${facts.stage_commit_sha}` : ''}`);
  }

  async launch(task) {
    let model;
    try {
      model = resolveModel(task, this.capability);
    } catch (error) {
      if (error instanceof BridgeError) return { preflight: error };
      throw error;
    }

    const baseSha = this.context.actualStageSha;
    let worktree;
    try {
      worktree = await this.git.ensureTaskWorktree(task, baseSha);
      const worktreeHead = await this.git.head(worktree);
      const worktreeBranch = await this.git.currentBranch(worktree);
      const worktreeStatus = await this.git.status(worktree);
      if (worktreeHead !== baseSha || worktreeBranch !== task.task_branch || worktreeStatus !== '') {
        throw blocked(`task worktree is not a clean dispatch base: ${worktree}`);
      }
    } catch (error) {
      return { preflight: error instanceof BridgeError ? error : blocked(error.message) };
    }

    await this.publish(task, 'task_dispatched', {
      base_sha: baseSha,
      worktree,
      task_branch: task.task_branch,
      model_policy: model.modelPolicy,
      resolved_model: model.resolvedModel,
      reasoning_effort: model.reasoningEffort,
    });
    const contractBytes = this.context.taskContractBytes.get(task.task_id);
    if (!contractBytes) throw preMutationFailure(`cached Task Contract bytes are missing for ${task.task_id}`);
    const contract = contractBytes.toString('utf8');
    const processResult = await this.launcher.launchWorker({
      repository: this.repository,
      task,
      baseSha,
      stageBranch: this.context.router.stage_branch,
      worktree,
      model,
      dependencies: task.depends_on.map((id) => this.context.mappings.get(id)),
    }, contract);
    return { baseSha, worktree, model, contract, processResult };
  }

  async processResult(task, result) {
    if (result.preflight) {
      const status = result.preflight.status ?? 'blocked';
      await this.publish(task, status, { reason: result.preflight.message });
      return;
    }

    const workerNativeFacts = nativeFacts(result.processResult);
    if (result.processResult.error?.details?.failure_class === 'POST_MUTATION_UNCERTAIN') {
      throw result.processResult.error;
    }
    if (result.processResult.error || result.processResult.exitCode !== 0) {
      await this.publish(task, result.processResult.error?.status ?? 'blocked', {
        reason: result.processResult.error?.message || result.processResult.stderr.trim().slice(-2000) || `Worker exited ${result.processResult.exitCode}`,
        process_exit: result.processResult.exitCode,
        ...workerNativeFacts,
      });
      return;
    }
    let codingResult;
    try {
      codingResult = validateWorkerCodingResult(result.processResult, task, result.baseSha);
    } catch (error) {
      await this.publish(task, 'blocked', {
        reason: `Worker completed with invalid required Coding Result: ${error.message}`,
        process_exit: result.processResult.exitCode,
        ...workerNativeFacts,
      });
      return;
    }
    if (codingResult.status !== 'implementation_ready') {
      const details = [...codingResult.unresolved, ...codingResult.questions];
      await this.publish(task, codingResult.status, {
        reason: details.join('; ') || `Worker reported ${codingResult.status}`,
        process_exit: result.processResult.exitCode,
        ...workerNativeFacts,
      });
      return;
    }
    let facts;
    let verification;
    try {
      const beforeVerification = await this.git.observeWorkingTree(result.worktree);
      validateWorkingTreeObservation(beforeVerification, task, result.baseSha, codingResult.changed_files);
      verification = await runVerification(task.verification, result.worktree, this.git.run);
      const failed = verification.filter((item) => item.kind === 'command' && !item.passed);
      if (failed.length > 0) throw blocked(`focused verification failed: ${failed.map((item) => item.requirement).join(', ')}`);
      const afterVerification = await this.git.observeWorkingTree(result.worktree);
      validateWorkingTreeObservation(afterVerification, task, result.baseSha, beforeVerification.workingPaths);

      await this.git.createCandidateCommit(task, result.worktree, beforeVerification.workingPaths);
      facts = await this.git.collectTaskFacts(task, result.worktree, result.baseSha);
      if (facts.taskHeadSha === facts.baseSha) throw blocked('Controller did not create a candidate commit');
      if (!samePathSet(facts.actualChangedFiles, beforeVerification.workingPaths)) {
        throw blocked('candidate commit changed files do not match the verified working-tree path set');
      }
      await this.git.mechanicalGate(task, facts);
    } catch (error) {
      await this.publish(task, error.status ?? 'blocked', { reason: error.message, process_exit: result.processResult.exitCode, ...workerNativeFacts });
      return;
    }

    const diff = await this.git.completeDiff(result.baseSha, facts.taskHeadSha);
    const supervisor = await runSupervisor({
      launcher: this.launcher,
      worktree: result.worktree,
      model: result.model,
      contract: result.contract,
      facts,
      native: workerNativeFacts,
      dependencies: task.depends_on.map((id) => this.context.mappings.get(id)),
      verification,
      diff,
    });
    if (supervisor.status !== 'ready_to_integrate') {
      await this.publish(task, supervisor.status, { reason: supervisor.reason, source_task_sha: facts.taskHeadSha, ...workerNativeFacts });
      return;
    }

    const missingDependencies = task.depends_on.filter((id) => !this.context.mappings.has(id));
    if (missingDependencies.length > 0) {
      await this.publish(task, 'blocked', {
        reason: `dependencies are not integrated at the integration gate: ${missingDependencies.join(', ')}`,
        source_task_sha: facts.taskHeadSha,
        ...workerNativeFacts,
      });
      return;
    }

    // Supervisor与dependency gate通过前不得把候选推到远端。
    try {
      await this.git.pushTask(task, result.worktree, facts.taskHeadSha);
    } catch (error) {
      await this.publish(task, error.status ?? 'blocked', { reason: error.message, process_exit: result.processResult.exitCode, ...workerNativeFacts });
      return;
    }

    const integrationTask = { ...task, stage_branch: this.context.router.stage_branch };
    let integration;
    try {
      integration = await this.git.integrate(this.context.stageWorktree, integrationTask, facts.taskHeadSha);
    } catch (error) {
      integration = { status: 'blocked', reason: error.message };
    }
    if (integration.status === 'blocked') {
      await this.publish(task, 'blocked', { reason: integration.reason, source_task_sha: facts.taskHeadSha, ...workerNativeFacts });
      return;
    }
    await this.publish(task, 'task_integrated', {
      base_sha: facts.baseSha,
      source_task_sha: integration.sourceTaskSha,
      stage_commit_sha: integration.stageCommitSha,
      parent_sha: facts.parentSha,
      actual_changed_files: facts.actualChangedFiles,
      verification,
      process_exit: result.processResult.exitCode,
      ...workerNativeFacts,
    });
  }

  terminal() {
    const values = [...this.context.states.values()];
    return values.every((status) => status === 'integrated') || values.some((status) => status === 'blocked' || status === 'needs_decision');
  }

  async finishIfComplete() {
    if (![...this.context.states.values()].every((status) => status === 'integrated')) return false;
    const stageHeadSha = await this.git.head(this.context.stageWorktree);
    await this.github.publishCandidate(this.repository, this.context.stage.prNumber, {
      workflow_id: this.context.workflowId,
      stage_id: this.context.router.stage_id,
      stage_branch: this.context.router.stage_branch,
      stage_head_sha: stageHeadSha,
      router_contract_path: this.context.stage.handoff.router_contract_path,
      mappings: [...this.context.mappings.values()],
    });
    this.log(`Stage candidate_ready: ${stageHeadSha}`);
    return true;
  }

  async run(mode) {
    try {
      await this.load();
    } catch (error) {
      const failure = error instanceof BridgeError ? error : preMutationFailure(error.message);
      return { launched: [], ...failureResult(failure) };
    }
    const tasks = this.context.router.tasks;
    const statuses = this.context.states;
    try {
      await this.prepareExecution();
      const schedule = this.schedules[mode];
      if (typeof schedule !== 'function') throw blocked(`unsupported execution mode: ${mode}`);
      const result = await schedule({
        tasks,
        statuses,
        launch: (task) => this.launch(task),
        processResult: (task, workerResult) => this.processResult(task, workerResult),
        terminal: () => this.terminal(),
      });
      await this.finishIfComplete();
      const values = [...statuses.values()];
      const status = values.every((value) => value === 'integrated')
        ? 'candidate_ready'
        : values.some((value) => value === 'needs_decision')
          ? 'needs_decision'
          : values.some((value) => value === 'blocked')
            ? 'blocked'
            : 'idle';
      return { ...result, status };
    } catch (error) {
      if (error instanceof BridgeError && error.details?.failure_class === 'POST_MUTATION_UNCERTAIN') {
        return failureResult(error);
      }
      throw error;
    }
  }
}
