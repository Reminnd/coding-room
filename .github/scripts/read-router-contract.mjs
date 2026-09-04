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

export function readRouterContract(source) {
  const markerCount = source.split(MARKER).length - 1;
  if (markerCount !== 1) fail(`expected exactly one ${MARKER} marker`);

  const blocks = [...source.matchAll(/```json\s*\n([\s\S]*?)\n```/g)];
  if (blocks.length !== 1) fail('expected exactly one JSON fenced block');

  let value;
  try {
    value = JSON.parse(blocks[0][1]);
  } catch (error) {
    fail(`malformed JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('root must be an object');
  for (const [field, expected] of Object.entries(REQUIRED)) {
    if (value[field] !== expected) fail(`${field} must equal ${JSON.stringify(expected)}`);
  }
  for (const field of ['work_id', 'stage_id', 'task_id', 'dispatch_id', 'repository', 'stage_branch', 'task_branch']) {
    if (typeof value[field] !== 'string' || value[field].length === 0) fail(`${field} is required`);
  }
  if (value.review?.authority !== 'chatgpt_fixed_chat') fail('review.authority must equal chatgpt_fixed_chat');
  if (value.review?.transport !== 'github_pull_request') fail('review.transport must equal github_pull_request');
  if (value.review?.work_event_task !== 'notification_only') fail('review.work_event_task must equal notification_only');
  if (value.review?.supervisor_may_approve !== false) fail('review.supervisor_may_approve must equal false');
  if (value.review?.supervisor_may_merge !== false) fail('review.supervisor_may_merge must equal false');
  if (value.fix_policy?.mode !== 'always_confirm') fail('fix_policy.mode must equal always_confirm');

  const { contract_commit_sha: _contractCommitSha, base_sha: _baseSha, head_sha: _headSha, ...normalized } = value;
  return normalized;
}

async function main() {
  const path = process.argv[2];
  if (!path || process.argv.length !== 3) fail('usage: node .github/scripts/read-router-contract.mjs <path>');
  process.stdout.write(`${JSON.stringify(readRouterContract(await readFile(path, 'utf8')))}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
