import { needsDecision } from './errors.mjs';
import { runChecked, runProcess } from './process.mjs';

export const DISPATCH_MARKER = '<!-- LOCAL_CODEX_DISPATCH_HANDOFF_V1 -->';
export const BRIDGE_MARKER = '<!-- CODEX_LOCAL_BRIDGE_V1 -->';
export const CANDIDATE_MARKER = '<!-- CODEX_STAGE_CANDIDATE_V1 -->';

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
    let result;
    try {
      result = await this.gh(['repo', 'view', '--json', 'nameWithOwner'], { cwd });
    } catch (error) {
      throw needsDecision(`GitHub CLI discovery failed: ${error.message}`);
    }
    return JSON.parse(result.stdout).nameWithOwner;
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

export function latestTaskStates(events) {
  const states = new Map();
  const dispatches = new Map();
  const mappings = new Map();
  for (const event of events) {
    if (!event.task_id) continue;
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
