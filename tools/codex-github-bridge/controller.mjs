import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BridgeError, blocked, needsDecision } from './errors.mjs';
import { latestTaskStates } from './github.mjs';
import { loadRouter } from './router-loader.mjs';
import { resolveModel } from './model-router.mjs';
import { runOnceSchedule, runStartSchedule } from './scheduler.mjs';
import { runSupervisor } from './supervisor.mjs';
import { runVerification } from './verification.mjs';

function workerReportedStatus(result) {
  const match = /^status:\s*(candidate_ready|blocked|needs_decision)\s*$/m.exec(result.lastMessage);
  return match?.[1] ?? null;
}

function requireHandoff(handoff, repository) {
  const required = ['repository', 'workflow_id', 'stage_id', 'router_contract_path', 'contract_commit_sha', 'stage_branch', 'stage_head_sha', 'execution_surface'];
  const missing = required.filter((field) => typeof handoff[field] !== 'string' || handoff[field].length === 0);
  if (missing.length > 0) throw needsDecision(`dispatch handoff is missing: ${missing.join(', ')}`);
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

    const state = latestTaskStates(stage.events);
    for (const task of router.tasks) if (!state.states.has(task.task_id)) state.states.set(task.task_id, 'not_started');
    this.context = { stage, router, workflowId, stageWorktree, ...state };
    return this.context;
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
    }, contract);
    return { baseSha, worktree, model, contract, processResult };
  }

  async processResult(task, result) {
    if (result.preflight) {
      const status = result.preflight.status ?? 'blocked';
      await this.publish(task, status, { reason: result.preflight.message });
      return;
    }

    const reportedStatus = workerReportedStatus(result.processResult);
    if (result.processResult.error || result.processResult.exitCode !== 0) {
      await this.publish(task, 'blocked', {
        reason: result.processResult.error?.message || result.processResult.stderr.trim().slice(-2000) || `Worker exited ${result.processResult.exitCode}`,
        process_exit: result.processResult.exitCode,
      });
      return;
    }
    if (reportedStatus === 'needs_decision') {
      await this.publish(task, 'needs_decision', { reason: result.processResult.lastMessage.trim().slice(-2000), process_exit: result.processResult.exitCode });
      return;
    }
    if (reportedStatus === 'blocked') {
      await this.publish(task, 'blocked', { reason: result.processResult.lastMessage.trim().slice(-2000), process_exit: result.processResult.exitCode });
      return;
    }
    if (reportedStatus !== 'candidate_ready') {
      await this.publish(task, 'blocked', {
        reason: 'Worker completed without a valid required Coding Result status',
        process_exit: result.processResult.exitCode,
      });
      return;
    }

    let facts;
    let verification;
    try {
      facts = await this.git.collectTaskFacts(task, result.worktree, result.baseSha);
      await this.git.mechanicalGate(task, facts);
      verification = await runVerification(task.verification, result.worktree, this.git.run);
      const failed = verification.filter((item) => item.kind === 'command' && !item.passed);
      if (failed.length > 0) throw blocked(`focused verification failed: ${failed.map((item) => item.requirement).join(', ')}`);
      const postVerificationStatus = await this.git.status(result.worktree);
      if (postVerificationStatus !== '') throw blocked(`verification left the task worktree dirty: ${postVerificationStatus}`);
      await this.git.pushTask(task, result.worktree);
    } catch (error) {
      await this.publish(task, error.status ?? 'blocked', { reason: error.message, process_exit: result.processResult.exitCode });
      return;
    }

    const diff = await this.git.completeDiff(result.baseSha, facts.taskHeadSha);
    const supervisor = await runSupervisor({
      launcher: this.launcher,
      worktree: result.worktree,
      model: result.model,
      contract: result.contract,
      facts,
      dependencies: task.depends_on.map((id) => this.context.mappings.get(id)),
      verification,
      diff,
    });
    if (supervisor.status !== 'ready_to_integrate') {
      await this.publish(task, supervisor.status, { reason: supervisor.reason, source_task_sha: facts.taskHeadSha });
      return;
    }

    const missingDependencies = task.depends_on.filter((id) => !this.context.mappings.has(id));
    if (missingDependencies.length > 0) {
      await this.publish(task, 'blocked', {
        reason: `dependencies are not integrated at the integration gate: ${missingDependencies.join(', ')}`,
        source_task_sha: facts.taskHeadSha,
      });
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
      await this.publish(task, 'blocked', { reason: integration.reason, source_task_sha: facts.taskHeadSha });
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
