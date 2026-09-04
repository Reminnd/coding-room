import { needsDecision } from './errors.mjs';
import { runChecked, runProcess } from './process.mjs';

export const DISPATCH_MARKER = '<!-- LOCAL_CODEX_DISPATCH_HANDOFF_V1 -->';
export const BRIDGE_MARKER = '<!-- CODEX_LOCAL_BRIDGE_V1 -->';
export const CANDIDATE_MARKER = '<!-- CODEX_STAGE_CANDIDATE_V1 -->';

const BRIDGE_LIFECYCLE_STATUSES = new Set(['task_dispatched', 'task_integrated', 'blocked', 'needs_decision']);

function parseKeyValues(body) {
  const values = {};
  for (const line of body.split(/\r?\n/)) {
    const match = /^([a-z][a-z0-9_]*):\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

function hasExactMarker(body, marker) {
  return body.split(/\r?\n/).some((line) => line.trim() === marker);
}

function parseBridgeEvent(body) {
  if (!body.includes(BRIDGE_MARKER)) return null;
  const match = /```json\s*\n([\s\S]*?)\n```/.exec(body);
  if (!match) return null;
  try {
    const value = JSON.parse(match[1]);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
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
      const handoffComment = [...comments].reverse().find((comment) => hasExactMarker(comment.body, DISPATCH_MARKER));
      if (!handoffComment) continue;
      const handoff = parseKeyValues(handoffComment.body);
      if (handoff.status !== 'dispatch_ready') continue;
      const events = comments.map((comment) => parseBridgeEvent(comment.body)).filter(Boolean);
      dispatches.push({ prNumber: pr.number, prUrl: pr.url, prHeadSha: pr.headRefOid, prHeadBranch: pr.headRefName, handoff, events });
    }
    return dispatches;
  }

  async readRepositoryFile(repository, path, ref) {
    const result = await this.gh(['api', '--method', 'GET', `repos/${repository}/contents/${path}`, '-f', `ref=${ref}`]);
    const value = JSON.parse(result.stdout);
    if (value.encoding !== 'base64' || typeof value.content !== 'string') {
      throw needsDecision(`GitHub content response is not base64 for ${path}@${ref}`);
    }
    return Buffer.from(value.content.replace(/\s/g, ''), 'base64').toString('utf8');
  }

  async publishEvent(repository, prNumber, event) {
    const body = `${BRIDGE_MARKER}\n\n\`\`\`json\n${JSON.stringify(event, null, 2)}\n\`\`\``;
    await this.gh(['pr', 'comment', String(prNumber), '--repo', repository, '--body', body]);
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
    await this.gh(['pr', 'comment', String(prNumber), '--repo', repository, '--body', lines.join('\n')]);
    await this.gh(['label', 'create', 'codex-stage-candidate', '--repo', repository, '--color', '0E8A16', '--description', 'Local Codex Bridge integrated Stage candidate', '--force']);
    await this.gh(['pr', 'edit', String(prNumber), '--repo', repository, '--add-label', 'codex-stage-candidate']);
    await this.gh(['pr', 'edit', String(prNumber), '--repo', repository, '--remove-label', 'codex-dispatch-ready']);
    // durable candidate facts先落到PR，再发布S02+机械验证事件；API失败直接向上层传播。
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
  }
}

export function latestTaskStates(events, context) {
  const states = new Map();
  const dispatches = new Map();
  const mappings = new Map();
  const tasks = new Map(context.tasks.map((task) => [task.task_id, task]));
  for (const event of events) {
    const task = tasks.get(event.task_id);
    if (!task
      || event.dispatch_id !== task.dispatch_id
      || event.repository !== context.repository
      || event.workflow_id !== context.workflow_id
      || event.stage_id !== context.stage_id
      || event.stage_branch !== context.stage_branch
      || !BRIDGE_LIFECYCLE_STATUSES.has(event.status)) continue;
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
  return { states, dispatches, mappings };
}
