import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BridgeError, blocked, needsDecision } from './errors.mjs';
import { latestTaskStates } from './github.mjs';
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
  'reported_task_head_sha',
  'status',
]);
const WORKER_RESULT_LISTS = new Set(['changed_files', 'deviations', 'unresolved', 'questions']);
const WORKER_RESULT_MAPS = {
  native_backend: new Set([
    'interface',
    'worker_mode',
    'explicit_thread_cwd',
    'explicit_turn_cwd',
    'terminal_event',
    'silent_fallback',
  ]),
  verification: new Set(['bridge_tests', 'typecheck', 'full_tests', 'diff_check']),
};

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

// Worker final messages use the exact small YAML subset in the T05 Contract.
// This parser deliberately does not become a generic YAML or cross-Task schema layer.
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
      } else if (WORKER_RESULT_LISTS.has(key)) {
        if (raw !== '' && raw !== '[]') throw new Error(`${key} must be a list`);
        setWorkerField(result, key, [], key);
        if (raw === '') section = { kind: 'list', key };
      } else if (Object.hasOwn(WORKER_RESULT_MAPS, key)) {
        if (raw !== '') throw new Error(`${key} must be a mapping`);
        setWorkerField(result, key, {}, key);
        section = { kind: 'map', key };
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

    if (section?.kind === 'map') {
      const field = /^  ([a-z_]+):(?:\s*(.*))?$/.exec(line);
      if (!field || !WORKER_RESULT_MAPS[section.key].has(field[1])) continue;
      const [, key, raw = ''] = field;
      if (section.key === 'native_backend' && key === 'silent_fallback') {
        if (raw !== 'false') throw new Error('native_backend.silent_fallback must be boolean false');
        setWorkerField(result[section.key], key, false, `${section.key}.${key}`);
      } else {
        const value = parseWorkerString(raw);
        if (value === null) throw new Error(`${section.key}.${key} must be a non-empty string`);
        setWorkerField(result[section.key], key, value, `${section.key}.${key}`);
      }
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
  for (const [section, required] of Object.entries(WORKER_RESULT_MAPS)) {
    if (typeof result[section] !== 'object' || result[section] === null || Array.isArray(result[section])) {
      throw new Error(`missing field ${section}`);
    }
    for (const key of required) {
      if (!Object.hasOwn(result[section], key)) throw new Error(`missing field ${section}.${key}`);
    }
  }

  if (result.task_id !== task.task_id) throw new Error('task_id does not match the current Task');
  if (result.dispatch_id !== task.dispatch_id) throw new Error('dispatch_id does not match the current dispatch');
  if (result.reported_base_sha !== baseSha) throw new Error('reported_base_sha does not match the original dispatch base');
  if (!/^[0-9a-f]{40}$/i.test(result.reported_task_head_sha)) throw new Error('reported_task_head_sha must be a Git SHA');
  if (result.status !== 'candidate_ready') throw new Error('status must be candidate_ready');
  if (result.native_backend.worker_mode !== 'one_thread_per_task') {
    throw new Error('native_backend.worker_mode must be one_thread_per_task');
  }
  if (result.native_backend.silent_fallback !== false) throw new Error('native_backend.silent_fallback must be false');
  for (const key of ['explicit_thread_cwd', 'explicit_turn_cwd']) {
    if (result.native_backend[key] !== 'pass') {
      throw new Error(`native_backend.${key} must report semantic pass`);
    }
  }
  for (const key of ['bridge_tests', 'typecheck', 'diff_check']) {
    const value = result.verification[key];
    const outcome = /^(pass-under-accepted-amendment|pass|fail)\b/i.exec(value);
    if (!outcome || value.replace(outcome[0], '').replace(/[\s`():+\-—]/g, '').length === 0) {
      throw new Error(`verification.${key} must contain a semantic outcome and command`);
    }
    if (outcome[1].toLowerCase() !== 'pass') {
      throw new Error(`verification.${key} must report ordinary pass`);
    }
  }

  const fullTests = result.verification.full_tests;
  const fullTestsOutcome = /^(pass-under-accepted-amendment|pass|fail)\b/i.exec(fullTests);
  if (!fullTestsOutcome || fullTests.replace(fullTestsOutcome[0], '').replace(/[\s`():+\-—]/g, '').length === 0) {
    throw new Error('verification.full_tests must contain a semantic outcome and command');
  }
  if (!['pass', 'pass-under-accepted-amendment'].includes(fullTestsOutcome[1].toLowerCase())) {
    throw new Error('verification.full_tests must report semantic pass');
  }
  if (result.changed_files.length === 0) {
    throw new Error('changed_files must not be empty for candidate_ready');
  }
  if (result.changed_files.some((path) => !/^tools\/codex-github-bridge\/\S+$/.test(path))) {
    throw new Error('changed_files must contain T05-owned paths');
  }
  return result;
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

export class BridgeController {
  constructor({ repository, repositoryRoot, worktreeRoot, github, git, launcher, capability, log = console.log }) {
    this.repository = repository;
    this.repositoryRoot = resolve(repositoryRoot);
    this.worktreeRoot = resolve(worktreeRoot);
    this.github = github;
    this.git = git;
    this.launcher = launcher;
    this.capability = capability;
    this.log = log;
  }

  async load() {
    const discovered = await this.github.discover(this.repository);
    if (discovered.length !== 1) throw needsDecision(`expected exactly one codex-dispatch-ready Stage PR, found ${discovered.length}`);
    const stage = discovered[0];
    requireHandoff(stage.handoff, this.repository);

    const actualStageSha = await this.git.fetchStage(stage.handoff.stage_branch);
    if (stage.handoff.stage_head_sha !== actualStageSha) {
      throw needsDecision(`dispatch handoff Stage head ${stage.handoff.stage_head_sha} does not match actual remote Stage ${actualStageSha}`);
    }
    if (stage.prHeadSha !== actualStageSha) {
      throw needsDecision(`Stage PR head ${stage.prHeadSha} does not match actual remote Stage ${actualStageSha}`);
    }
    const stageWorktree = await this.git.ensureStageWorktree(stage.handoff.stage_branch);
    const localStageSha = await this.git.head(stageWorktree);
    if (localStageSha !== actualStageSha) {
      throw needsDecision(`Stage integration worktree HEAD ${localStageSha} does not match actual remote Stage ${actualStageSha}`);
    }
    if (await this.git.status(stageWorktree)) throw blocked(`Stage integration worktree is not clean: ${stageWorktree}`);

    const source = await this.github.readRepositoryFile(
      this.repository,
      stage.handoff.router_contract_path,
      stage.handoff.contract_commit_sha,
    );
    const router = await loadRouter({ repositoryRoot: stageWorktree, source });
    const workflowId = validateRouterHandoff(router, stage.handoff);
    if (stage.prHeadBranch !== router.stage_branch) throw needsDecision('Stage PR head branch does not match Router stage_branch');

    const state = latestTaskStates(stage.events, {
      repository: this.repository,
      workflow_id: workflowId,
      stage_id: router.stage_id,
      stage_branch: router.stage_branch,
      tasks: router.tasks,
    });
    for (const task of router.tasks) if (!state.states.has(task.task_id)) state.states.set(task.task_id, 'not_started');
    for (const task of router.tasks) {
      if (state.states.get(task.task_id) !== 'integrated') continue;
      await this.revalidateRecoveredIntegration(task, state.mappings.get(task.task_id), actualStageSha, stageWorktree);
    }
    this.context = { stage, router, workflowId, stageWorktree, ...state };
    return this.context;
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

    const baseSha = await this.git.head(this.context.stageWorktree);
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
    const contract = await readFile(resolve(worktree, task.task_contract_path), 'utf8');
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
    let facts;
    let verification;
    try {
      facts = await this.git.collectTaskFacts(task, result.worktree, result.baseSha);
      if (codingResult.reported_task_head_sha !== facts.taskHeadSha) {
        throw blocked('reported_task_head_sha does not match the independent Git task head');
      }
      await this.git.mechanicalGate(task, facts);
      verification = await runVerification(task.verification, result.worktree, this.git.run);
      const failed = verification.filter((item) => item.kind === 'command' && !item.passed);
      if (failed.length > 0) throw blocked(`focused verification failed: ${failed.map((item) => item.requirement).join(', ')}`);
      const postVerificationStatus = await this.git.status(result.worktree);
      if (postVerificationStatus !== '') throw blocked(`verification left the task worktree dirty: ${postVerificationStatus}`);
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
    await this.load();
    const tasks = this.context.router.tasks;
    const statuses = this.context.states;

    if ([...statuses.values()].some((status) => status === 'dispatched')) {
      throw needsDecision('a prior task_dispatched event has no terminal Bridge event; inspect its task branch/worktree before a new launch');
    }

    const schedule = mode === 'run-once' ? runOnceSchedule : runStartSchedule;
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
  }
}
