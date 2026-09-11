import { needsDecision } from './errors.mjs';
import { mutationFailure, postMutationUncertain, preMutationFailure, runObservedMutation } from './lifecycle.mjs';
import { runChecked, runProcess } from './process.mjs';
import {
  RECORD_MARKERS,
  formatRecordEnvelope,
  parseLifecycleComments,
  parseRecordEnvelope,
  structurallyEqual,
  typedRecordIdentity,
} from './structured-records.mjs';

export const DISPATCH_MARKER = '<!-- LOCAL_CODEX_DISPATCH_HANDOFF_V1 -->';
export const BRIDGE_MARKER = '<!-- CODEX_LOCAL_BRIDGE_V1 -->';
export const CANDIDATE_MARKER = '<!-- CODEX_STAGE_CANDIDATE_V1 -->';
export const FIX_DISPATCH_MARKER = RECORD_MARKERS.fix_handoff;

const BRIDGE_LIFECYCLE_STATUSES = new Set(['task_dispatched', 'task_integrated', 'blocked', 'needs_decision']);

function parseKeyValues(body) {
  const values = {};
  for (const line of body.split(/\r?\n/)) {
    const match = /^([a-z][a-z0-9_]*):\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    if (Object.hasOwn(values, match[1])) throw new Error(`duplicate handoff field ${match[1]}`);
    values[match[1]] = match[2];
  }
  return values;
}

function hasExactMarker(body, marker) {
  return body.split(/\r?\n/).some((line) => line.trim() === marker);
}

function parseBridgeEvent(body) {
  if (!body.includes(BRIDGE_MARKER)) return null;
  return parseRecordEnvelope(body, BRIDGE_MARKER);
}

function bridgeIdentity(event) {
  return [event.repository, event.workflow_id, event.stage_id, event.stage_branch, event.task_id, event.dispatch_id, event.status];
}

function sameIdentity(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export class GitHubClient {
  constructor({ ghBin = 'gh', run = runProcess } = {}) {
    this.ghBin = ghBin;
    this.run = run;
  }

  async gh(args, options = {}) {
    return runChecked(this.run, this.ghBin, args, options);
  }

  async currentRepository(cwd) {
    try {
      const result = await this.gh(['repo', 'view', '--json', 'nameWithOwner'], { cwd });
      const repository = JSON.parse(result.stdout).nameWithOwner;
      if (typeof repository !== 'string' || repository.length === 0) {
        throw new Error('response is missing nameWithOwner');
      }
      return repository;
    } catch (error) {
      throw needsDecision(`GitHub CLI discovery failed: ${error.message}`);
    }
  }

  async assertRepositoryAccess(repository, cwd) {
    let originRepository;
    try {
      originRepository = JSON.parse((await this.gh(['repo', 'view', '--json', 'nameWithOwner'], { cwd })).stdout).nameWithOwner;
    } catch (error) {
      throw needsDecision(`GitHub repository access check failed: ${error.message}`);
    }
    if (typeof originRepository !== 'string' || originRepository !== repository) {
      throw needsDecision(`origin repository ${originRepository} does not match requested repository ${repository}`);
    }
  }

  async readActionsEnabled(repository) {
    let value;
    try {
      value = JSON.parse((await this.gh(['api', '--method', 'GET', `repos/${repository}/actions/permissions`])).stdout);
    } catch (error) {
      throw needsDecision(`GitHub Actions permission read failed: ${error.message}`);
    }
    if (typeof value.enabled !== 'boolean') throw needsDecision('GitHub Actions permission response is missing enabled');
    return value.enabled;
  }

  async readWorkflowPermissions(repository) {
    let value;
    try {
      value = JSON.parse((await this.gh(['api', '--method', 'GET', `repos/${repository}/actions/permissions/workflow`])).stdout);
    } catch (error) {
      throw needsDecision(`GitHub workflow permission read failed: ${error.message}`);
    }
    if (!['read', 'write'].includes(value.default_workflow_permissions) || typeof value.can_approve_pull_request_reviews !== 'boolean') {
      throw needsDecision('GitHub workflow permission response is invalid');
    }
    return value;
  }

  async enableActions(repository) {
    try {
      await this.gh(['api', '--method', 'PUT', `repos/${repository}/actions/permissions`, '--input', '-'], {
        input: JSON.stringify({ enabled: true }),
      });
    } catch (error) {
      throw needsDecision(`GitHub Actions enable failed: ${error.message}`);
    }
  }

  async enablePullRequestApproval(repository, defaultWorkflowPermissions) {
    try {
      await this.gh(['api', '--method', 'PUT', `repos/${repository}/actions/permissions/workflow`, '--input', '-'], {
        input: JSON.stringify({
          default_workflow_permissions: defaultWorkflowPermissions,
          can_approve_pull_request_reviews: true,
        }),
      });
    } catch (error) {
      throw needsDecision(`GitHub workflow permission update failed: ${error.message}`);
    }
  }

  async assertActionsReady(repository) {
    if (!await this.readActionsEnabled(repository)) throw needsDecision('GitHub Actions are disabled for the requested repository');
    const workflow = await this.readWorkflowPermissions(repository);
    if (!workflow.can_approve_pull_request_reviews) {
      throw needsDecision('GitHub Actions cannot create or approve pull requests for the requested repository');
    }
    return {
      github_actions_enabled: true,
      actions_can_create_or_approve_pull_requests: true,
      default_workflow_permissions: workflow.default_workflow_permissions,
    };
  }

  async bootstrapActions(repository) {
    let mutationPerformed = false;
    let actionsEnabled = await this.readActionsEnabled(repository);
    if (!actionsEnabled) {
      await this.enableActions(repository);
      mutationPerformed = true;
      actionsEnabled = await this.readActionsEnabled(repository);
      if (!actionsEnabled) throw needsDecision('GitHub Actions remain disabled after bootstrap update');
    }

    let workflow = await this.readWorkflowPermissions(repository);
    if (!workflow.can_approve_pull_request_reviews) {
      const preservedPermission = workflow.default_workflow_permissions;
      await this.enablePullRequestApproval(repository, preservedPermission);
      mutationPerformed = true;
      workflow = await this.readWorkflowPermissions(repository);
      if (!workflow.can_approve_pull_request_reviews || workflow.default_workflow_permissions !== preservedPermission) {
        throw needsDecision('GitHub workflow permissions do not match the required bootstrap result');
      }
    }

    return {
      status: 'ready',
      repository,
      github_actions_enabled: true,
      actions_can_create_or_approve_pull_requests: true,
      default_workflow_permissions: workflow.default_workflow_permissions,
      mutation_performed: mutationPerformed,
    };
  }

  async comments(repository, prNumber) {
    const result = await this.gh(['api', '--paginate', '--slurp', `repos/${repository}/issues/${prNumber}/comments`]);
    return JSON.parse(result.stdout).flat();
  }

  async pullRequestFacts(repository, prNumber) {
    let value;
    try {
      value = JSON.parse((await this.gh([
        'pr', 'view', String(prNumber), '--repo', repository,
        '--json', 'number,state,isDraft,headRefName,headRefOid,baseRefName,baseRefOid,labels',
      ])).stdout);
    } catch (error) {
      throw needsDecision(`GitHub pull request observation failed: ${error.message}`);
    }
    if (value.number !== Number(prNumber) || !['OPEN', 'CLOSED', 'MERGED'].includes(value.state)
      || typeof value.isDraft !== 'boolean' || typeof value.headRefName !== 'string'
      || typeof value.headRefOid !== 'string' || typeof value.baseRefName !== 'string'
      || typeof value.baseRefOid !== 'string' || !Array.isArray(value.labels)) {
      throw needsDecision('GitHub pull request observation is invalid');
    }
    return value;
  }

  async discover(repository) {
    let result;
    try {
      result = await this.gh([
        'pr', 'list', '--repo', repository, '--state', 'open', '--label', 'codex-dispatch-ready',
        '--limit', '100', '--json', 'number,headRefName,headRefOid,url,labels',
      ]);
    } catch (error) {
      throw needsDecision(`GitHub dispatch discovery failed: ${error.message}`);
    }

    const prs = JSON.parse(result.stdout);
    const dispatches = [];
    for (const pr of prs) {
      const comments = await this.comments(repository, pr.number);
      const handoffComments = comments.filter((comment) => hasExactMarker(comment.body, DISPATCH_MARKER));
      const handoffErrors = [];
      const handoffs = [];
      for (const comment of handoffComments) {
        try {
          handoffs.push(parseKeyValues(comment.body));
        } catch (error) {
          handoffErrors.push(error.message);
        }
      }
      const handoff = [...handoffs].reverse().find((item) => item.status === 'dispatch_ready');
      const lifecycle = parseLifecycleComments(comments);
      if (!handoff && lifecycle.fixHandoffs.length === 0 && handoffErrors.length === 0 && lifecycle.errors.length === 0) continue;
      const events = [];
      const eventErrors = [];
      for (const comment of comments) {
        if (!comment.body?.includes(BRIDGE_MARKER)) continue;
        try {
          events.push(parseBridgeEvent(comment.body));
        } catch (error) {
          eventErrors.push(error.message);
        }
      }
      dispatches.push({
        prNumber: pr.number,
        prUrl: pr.url,
        prHeadSha: pr.headRefOid,
        prHeadBranch: pr.headRefName,
        handoff,
        handoffs,
        handoffErrors,
        events,
        eventErrors,
        comments,
        lifecycle,
      });
    }
    return dispatches;
  }

  async readRepositoryFileBytes(repository, path, ref) {
    const result = await this.gh(['api', '--method', 'GET', `repos/${repository}/contents/${path}`, '-f', `ref=${ref}`]);
    const value = JSON.parse(result.stdout);
    if (value.encoding !== 'base64' || typeof value.content !== 'string') {
      throw needsDecision(`GitHub content response is not base64 for ${path}@${ref}`);
    }
    return Buffer.from(value.content.replace(/\s/g, ''), 'base64');
  }

  async readRepositoryFile(repository, path, ref) {
    return (await this.readRepositoryFileBytes(repository, path, ref)).toString('utf8');
  }

  async publishEvent(repository, prNumber, event) {
    const body = `${BRIDGE_MARKER}\n\n\`\`\`json\n${JSON.stringify(event, null, 2)}\n\`\`\``;
    const identity = bridgeIdentity(event);
    return runObservedMutation({
      boundary: 'pr_comment',
      observe: async () => {
        const matching = [];
        for (const comment of await this.comments(repository, prNumber)) {
          if (!comment.body?.includes(BRIDGE_MARKER)) continue;
          let parsed;
          try {
            parsed = parseBridgeEvent(comment.body);
          } catch (error) {
            throw preMutationFailure(`Bridge event comment is malformed: ${error.message}`);
          }
          if (sameIdentity(bridgeIdentity(parsed), identity)) matching.push(parsed);
        }
        if (matching.some((item) => !structurallyEqual(item, event))) throw preMutationFailure('Bridge event identity has a conflicting payload');
        return matching;
      },
      isApplied: (matching) => matching.length > 0,
      mutate: () => this.gh(['pr', 'comment', String(prNumber), '--repo', repository, '--body', body]),
    });
  }

  async publishStructuredRecord(repository, prNumber, record) {
    const identity = typedRecordIdentity(record);
    const body = formatRecordEnvelope(record);
    return runObservedMutation({
      boundary: 'pr_comment',
      observe: async () => {
        const lifecycle = parseLifecycleComments(await this.comments(repository, prNumber));
        if (lifecycle.errors.length > 0) throw preMutationFailure(`lifecycle comments are malformed or conflicting: ${lifecycle.errors.map((item) => item.message).join('; ')}`);
        const matches = lifecycle.records.filter((item) => sameIdentity(typedRecordIdentity(item), identity));
        if (matches.some((item) => !structurallyEqual(item, record))) throw preMutationFailure(`record ${identity.join('/')} has a conflicting payload`);
        return matches;
      },
      isApplied: (matches) => matches.length > 0,
      mutate: () => this.gh(['pr', 'comment', String(prNumber), '--repo', repository, '--body', body]),
    });
  }

  async projectTerminalLabels(repository, prNumber) {
    const wanted = 'codex-stage-closed';
    const removed = new Set(['chat-review', 'codex-stage-candidate', 'codex-dispatch-ready']);
    const repositoryLabel = await runObservedMutation({
      boundary: 'terminal_label',
      observe: async () => {
        const value = JSON.parse((await this.gh(['label', 'list', '--repo', repository, '--limit', '100', '--json', 'name'])).stdout);
        if (!Array.isArray(value)) throw new Error('repository label response is invalid');
        return value.map((label) => label.name);
      },
      isApplied: (labels) => labels.includes(wanted),
      mutate: () => this.gh([
        'label', 'create', wanted, '--repo', repository, '--color', '0E8A16',
        '--description', 'Stage accepted and closed by Local Codex Bridge',
      ]),
    });
    // 两段 label projection 共用同一 failure boundary；首段写入后不得再声称本次调用零写。
    let mutationObserved = repositoryLabel.status === 'created';
    try {
      const currentLabels = (await this.pullRequestFacts(repository, prNumber)).labels
        .map((label) => typeof label === 'string' ? label : label.name);
      const presentRemoved = [...removed].filter((label) => currentLabels.includes(label));
      const pullRequestLabels = await runObservedMutation({
        boundary: 'terminal_label',
        observe: async () => {
          const facts = await this.pullRequestFacts(repository, prNumber);
          return facts.labels.map((label) => typeof label === 'string' ? label : label.name);
        },
        isApplied: (labels) => labels.includes(wanted) && [...removed].every((label) => !labels.includes(label)),
        mutate: () => this.gh([
          'pr', 'edit', String(prNumber), '--repo', repository,
          '--add-label', wanted,
          ...presentRemoved.flatMap((label) => ['--remove-label', label]),
        ]),
      });
      mutationObserved ||= pullRequestLabels.status === 'created';
      return { ...pullRequestLabels, status: mutationObserved ? 'created' : 'reused' };
    } catch (error) {
      const classified = error?.details?.failure_class
        ? error
        : preMutationFailure(`terminal_label could not be observed before mutation: ${error.message}`, { boundary: 'terminal_label' });
      throw mutationFailure(classified, 'terminal_label', mutationObserved);
    }
  }

  async projectPullRequestReady(repository, prNumber, ready) {
    if (typeof ready !== 'boolean') throw preMutationFailure('ready projection requires a boolean target');
    return runObservedMutation({
      boundary: 'ready_projection',
      observe: () => this.pullRequestFacts(repository, prNumber),
      isApplied: (facts) => facts.isDraft === !ready,
      mutate: () => this.gh([
        'pr', 'ready', String(prNumber), '--repo', repository,
        ...(ready ? [] : ['--undo']),
      ]),
    });
  }

  async closePullRequest(repository, prNumber) {
    return runObservedMutation({
      boundary: 'pr_close',
      observe: () => this.pullRequestFacts(repository, prNumber),
      isApplied: (facts) => facts.state === 'CLOSED',
      mutate: () => this.gh(['pr', 'close', String(prNumber), '--repo', repository]),
    });
  }

  async publishCandidate(repository, prNumber, facts) {
    const lines = [
      CANDIDATE_MARKER,
      '',
      'status: candidate_ready',
      `repository: ${repository}`,
      `workflow_id: ${facts.workflow_id}`,
      `stage_id: ${facts.stage_id}`,
      `stage_branch: ${facts.stage_branch}`,
      `stage_head_sha: ${facts.stage_head_sha}`,
      `router_contract_path: ${facts.router_contract_path}`,
      `mapping_count: ${facts.mappings.length}`,
      `task_mappings_json: ${JSON.stringify(facts.mappings.map((item) => ({ task_id: item.task_id, source_task_sha: item.source_task_sha, stage_commit_sha: item.stage_commit_sha })))}`,
    ];
    const body = lines.join('\n');
    const commentProjection = await runObservedMutation({
      boundary: 'pr_comment',
      observe: async () => (await this.comments(repository, prNumber)).filter((comment) => comment.body === body),
      isApplied: (comments) => comments.length > 0,
      mutate: () => this.gh(['pr', 'comment', String(prNumber), '--repo', repository, '--body', body]),
    });
    // candidate publication 的所有 external boundary 共享本次 invocation 的 mutation state。
    let mutationObserved = commentProjection.status === 'created';
    let repositoryLabelProjection;
    try {
      repositoryLabelProjection = await runObservedMutation({
        boundary: 'label_projection',
        observe: async () => {
          const value = JSON.parse((await this.gh(['label', 'list', '--repo', repository, '--limit', '100', '--json', 'name'])).stdout);
          if (!Array.isArray(value)) throw new Error('repository label response is invalid');
          return value.map((label) => label.name);
        },
        isApplied: (labels) => labels.includes('codex-stage-candidate'),
        mutate: () => this.gh([
          'label', 'create', 'codex-stage-candidate', '--repo', repository, '--color', '0E8A16',
          '--description', 'Local Codex Bridge integrated Stage candidate', '--force',
        ]),
      });
    } catch (error) {
      throw mutationFailure(error, 'label_projection', mutationObserved);
    }
    mutationObserved ||= repositoryLabelProjection.status === 'created';

    let pullRequestLabelProjection;
    try {
      pullRequestLabelProjection = await runObservedMutation({
        boundary: 'label_projection',
        observe: async () => (await this.pullRequestFacts(repository, prNumber)).labels.map((label) => typeof label === 'string' ? label : label.name),
        isApplied: (labels) => labels.includes('codex-stage-candidate') && !labels.includes('codex-dispatch-ready'),
        mutate: () => this.gh([
          'pr', 'edit', String(prNumber), '--repo', repository,
          '--add-label', 'codex-stage-candidate', '--remove-label', 'codex-dispatch-ready',
        ]),
      });
    } catch (error) {
      throw mutationFailure(error, 'label_projection', mutationObserved);
    }
    mutationObserved ||= pullRequestLabelProjection.status === 'created';

    let downstreamObserved;
    try {
      const lifecycle = parseLifecycleComments(await this.comments(repository, prNumber));
      if (lifecycle.errors.length > 0) throw preMutationFailure(`candidate downstream facts are malformed: ${lifecycle.errors.map((item) => item.message).join('; ')}`, { boundary: 'repository_dispatch' });
      downstreamObserved = lifecycle.records.some((record) => record.record_type === 'STAGE_VERIFICATION_V1'
        && record.stage_sha === facts.stage_head_sha)
        || lifecycle.reviewHandoffs.some((handoff) => handoff.head_sha === facts.stage_head_sha);
    } catch (error) {
      const classified = error?.details?.failure_class
        ? error
        : preMutationFailure(`repository_dispatch could not be observed before mutation: ${error.message}`, { boundary: 'repository_dispatch' });
      throw mutationFailure(classified, 'repository_dispatch', mutationObserved);
    }
    if (downstreamObserved) return { status: 'reused' };
    if (commentProjection.status === 'reused') {
      throw mutationFailure(
        preMutationFailure('repository_dispatch prior-start state is unobservable; refusing to dispatch again', { boundary: 'repository_dispatch' }),
        'repository_dispatch',
        mutationObserved,
      );
    }
    try {
      await this.gh(['api', '--method', 'POST', `repos/${repository}/dispatches`, '--input', '-'], {
        input: JSON.stringify({
          event_type: 'stage_candidate_ready',
          client_payload: {
            status: 'candidate_ready',
            repository,
            pr_number: prNumber,
            workflow_id: facts.workflow_id,
            stage_id: facts.stage_id,
            router_contract_path: facts.router_contract_path,
            stage_branch: facts.stage_branch,
            stage_head_sha: facts.stage_head_sha,
          },
        }),
      });
    } catch (error) {
      throw postMutationUncertain('repository_dispatch', `repository_dispatch outcome is uncertain: ${error.message}`);
    }
  }
}

export function latestTaskStates(events, context) {
  const states = new Map();
  const dispatches = new Map();
  const mappings = new Map();
  const ambiguousTaskEvents = [];
  const seen = new Map();
  const tasks = new Map(context.tasks.map((task) => [task.task_id, task]));
  for (const event of events) {
    const task = tasks.get(event.task_id);
    if (!task) continue;
    const sameLineage = event.repository === context.repository
      && event.workflow_id === context.workflow_id
      && event.stage_id === context.stage_id
      && event.stage_branch === context.stage_branch;
    if (!sameLineage) continue;
    if (event.dispatch_id !== task.dispatch_id || !BRIDGE_LIFECYCLE_STATUSES.has(event.status)) {
      ambiguousTaskEvents.push(`${event.task_id}:${event.dispatch_id ?? '<missing>'}:${event.status ?? '<missing>'}`);
      continue;
    }
    const key = JSON.stringify(bridgeIdentity(event));
    const prior = seen.get(key);
    if (prior && !structurallyEqual(prior, event)) {
      ambiguousTaskEvents.push(`${event.task_id}:${event.dispatch_id}:${event.status}`);
      continue;
    }
    if (prior) continue;
    seen.set(key, event);
    if (event.status === 'task_dispatched') {
      states.set(event.task_id, 'dispatched');
      dispatches.set(event.task_id, event);
    } else if (event.status === 'task_integrated') {
      states.set(event.task_id, 'integrated');
      mappings.set(event.task_id, event);
    } else if (event.status === 'blocked' || event.status === 'needs_decision') {
      states.set(event.task_id, event.status);
    }
  }
  return { states, dispatches, mappings, ambiguousTaskEvents };
}
