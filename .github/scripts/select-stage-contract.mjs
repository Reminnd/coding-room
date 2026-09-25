import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { readRouterContract } from './read-router-contract.mjs';
import {
  formatRecordEnvelope,
  parseMechanicalRecord,
  RECORD_MARKERS,
  reduceTypedRecords,
  validateFixDispatchHandoff,
  validateMechanicalRecord,
  validateReviewHandoff,
} from '../../tools/codex-github-bridge/structured-records.mjs';

const FIX_PREPARED_PATTERN = /"record_type"\s*:\s*"FIX_PREPARED_V1"/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const VERIFICATION_CHECKS = Object.freeze([
  'node --test tests/router-contract-reader.test.ts',
  'node --test tools/codex-github-bridge/tests/*.test.mjs',
  'npm run typecheck',
  'npm test',
  'git diff --check',
]);

function needsDecision(message) {
  const error = new Error(`needs_decision: ${message}`);
  error.code = 'needs_decision';
  return error;
}

function requireString(value, field) {
  if (typeof value !== 'string' || value.length === 0) throw needsDecision(`${field} is required`);
  return value;
}

function requireInteger(value, field) {
  if (!Number.isInteger(value) || value <= 0) throw needsDecision(`${field} must be a positive integer`);
  return value;
}

function requireSha(value, field) {
  requireString(value, field);
  if (!SHA_PATTERN.test(value)) throw needsDecision(`${field} must be an exact lowercase Git SHA`);
  return value;
}

function requireRouterFacts(router, facts) {
  const expected = {
    repository: facts.repository,
    workflow_id: facts.workflowId,
    stage_id: facts.stageId,
    stage_branch: facts.stageBranch,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (router[field] !== value) throw needsDecision(`Router ${field} does not match the current Stage event`);
  }
}

function commentBodies(comments) {
  if (!Array.isArray(comments)) throw needsDecision('comments must be an array');
  return comments.map((comment) => (typeof comment === 'string' ? comment : comment?.body)).filter((body) => typeof body === 'string');
}

function preparedShaHint(body) {
  const match = body.match(/"prepared_stage_sha"\s*:\s*"([0-9a-f]{40})"/);
  return match?.[1] ?? null;
}

function currentPreparations(comments, stageHeadSha) {
  const current = [];
  for (const body of commentBodies(comments)) {
    if (!body.includes(RECORD_MARKERS.mechanical) || !FIX_PREPARED_PATTERN.test(body)) continue;
    let record;
    try {
      record = parseMechanicalRecord(body);
    } catch (error) {
      const hintedSha = preparedShaHint(body);
      if (hintedSha === null || hintedSha === stageHeadSha) {
        throw needsDecision(`current Fix preparation is malformed: ${error.message}`);
      }
      continue;
    }
    if (record.record_type === 'FIX_PREPARED_V1' && record.prepared_stage_sha === stageHeadSha) current.push(record);
  }

  let reduced;
  try {
    reduced = reduceTypedRecords(current);
  } catch (error) {
    throw needsDecision(`current Fix preparation conflicts: ${error.message}`);
  }
  const logical = [...reduced.values()];
  if (logical.length > 1) throw needsDecision('multiple current Fix preparations are ambiguous');
  return logical;
}

function mappingFromPreparation(preparation) {
  return Object.fromEntries(preparation.tasks.map((task) => [task.task_id, task.dispatch_id]));
}

function verificationRecord({ kind, workflowId, stageId, stageSha, fixPreparationId = null }) {
  const identity = kind === 'fix'
    ? `fix-${fixPreparationId}-${stageSha}`
    : `stage-${workflowId}-${stageId}-${stageSha}`;
  return validateMechanicalRecord({
    record_type: 'STAGE_VERIFICATION_V1',
    verification_id: `${identity}-verification`,
    event_id: `${identity}-event`,
    workflow_id: workflowId,
    stage_id: stageId,
    stage_sha: stageSha,
    result: 'PASS',
    checks: [...VERIFICATION_CHECKS],
    record_authority: 'github_actions',
  });
}

export function selectStageContract({
  router,
  comments,
  repository,
  pullRequestNumber,
  workflowId,
  stageId,
  stageBranch,
  stageHeadSha,
  routerContractPath,
}) {
  requireString(repository, 'repository');
  requireInteger(pullRequestNumber, 'pullRequestNumber');
  requireString(workflowId, 'workflowId');
  requireString(stageId, 'stageId');
  requireString(stageBranch, 'stageBranch');
  requireSha(stageHeadSha, 'stageHeadSha');
  requireString(routerContractPath, 'routerContractPath');
  requireRouterFacts(router, { repository, workflowId, stageId, stageBranch });

  const preparations = currentPreparations(comments, stageHeadSha);
  if (preparations.length === 0) return { mode: 'canonical_stage_router', router };

  const preparation = preparations[0];
  const lineage = {
    repository,
    pull_request_number: pullRequestNumber,
    workflow_id: workflowId,
    stage_id: stageId,
    stage_branch: stageBranch,
    prepared_stage_sha: stageHeadSha,
    router_contract_path: routerContractPath,
  };
  for (const [field, value] of Object.entries(lineage)) {
    if (preparation[field] !== value) throw needsDecision(`Fix preparation ${field} does not match the current Stage event`);
  }

  const verification = verificationRecord({
    kind: 'fix',
    workflowId,
    stageId,
    stageSha: stageHeadSha,
    fixPreparationId: preparation.fix_preparation_id,
  });
  const taskDispatchMapping = mappingFromPreparation(preparation);
  const fixHandoff = validateFixDispatchHandoff({
    status: 'ready_for_fix_dispatch',
    repository,
    pull_request_number: pullRequestNumber,
    workflow_id: workflowId,
    stage_id: stageId,
    stage_branch: stageBranch,
    prepared_stage_sha: stageHeadSha,
    router_contract_path: routerContractPath,
    fix_round_id: preparation.fix_round_id,
    fix_preparation_id: preparation.fix_preparation_id,
    source_review_id: preparation.source_review_id,
    source_confirmation_id: preparation.source_confirmation_id,
    verification_id: verification.verification_id,
    handoff_id: `fix-${preparation.fix_preparation_id}-${stageHeadSha}-handoff`,
    task_dispatch_mapping: taskDispatchMapping,
    execution_surface: 'local_codex',
  });

  return {
    mode: 'prepared_fix_router',
    router,
    preparation,
    task_dispatch_mapping: taskDispatchMapping,
    verification,
    verification_comment: formatRecordEnvelope(verification, RECORD_MARKERS.mechanical),
    fix_handoff: fixHandoff,
    fix_handoff_comment: formatRecordEnvelope(fixHandoff, RECORD_MARKERS.fix_handoff),
  };
}

export function buildReviewArtifacts({
  router,
  repository,
  pullRequestNumber,
  workflowId,
  stageId,
  baseBranch,
  baseSha,
  headBranch,
  headSha,
  stageContractPath,
  routerContractPath,
}) {
  requireInteger(pullRequestNumber, 'pullRequestNumber');
  requireSha(baseSha, 'baseSha');
  requireSha(headSha, 'headSha');
  requireString(baseBranch, 'baseBranch');
  requireString(stageContractPath, 'stageContractPath');
  requireString(routerContractPath, 'routerContractPath');
  requireRouterFacts(router, { repository, workflowId, stageId, stageBranch: headBranch });
  const verification = verificationRecord({ kind: 'stage', workflowId, stageId, stageSha: headSha });
  const handoff = validateReviewHandoff({
    status: 'ready_for_chat_review',
    repository,
    pull_request_number: pullRequestNumber,
    workflow_id: workflowId,
    stage_id: stageId,
    base_branch: baseBranch,
    base_sha: baseSha,
    head_branch: headBranch,
    head_sha: headSha,
    stage_contract_path: stageContractPath,
    router_contract_path: routerContractPath,
    verification_id: verification.verification_id,
    review_authority: 'chatgpt_fixed_chat',
    handoff_id: `review-${workflowId}-${stageId}-${headSha}-handoff`,
  });
  return {
    verification,
    verification_comment: formatRecordEnvelope(verification, RECORD_MARKERS.mechanical),
    review_handoff: handoff,
    review_handoff_comment: formatRecordEnvelope(handoff, RECORD_MARKERS.review_handoff),
  };
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'select' && args.length === 8) {
    const [routerPath, commentsPath, repository, pr, workflowId, stageId, stageBranch, stageHeadSha] = args;
    const result = selectStageContract({
      router: readRouterContract(await readFile(routerPath, 'utf8')),
      comments: JSON.parse(await readFile(commentsPath, 'utf8')),
      repository,
      pullRequestNumber: Number(pr),
      workflowId,
      stageId,
      stageBranch,
      stageHeadSha,
      routerContractPath: routerPath.replaceAll('\\', '/'),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (command === 'review' && args.length === 10) {
    const [routerPath, repository, pr, workflowId, stageId, baseBranch, baseSha, headBranch, headSha, stageContractPath] = args;
    const result = buildReviewArtifacts({
      router: readRouterContract(await readFile(routerPath, 'utf8')),
      repository,
      pullRequestNumber: Number(pr),
      workflowId,
      stageId,
      baseBranch,
      baseSha,
      headBranch,
      headSha,
      stageContractPath,
      routerContractPath: routerPath.replaceAll('\\', '/'),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  throw needsDecision('usage: select-stage-contract.mjs select <router> <comments.json> <repository> <pr> <workflow> <stage> <branch> <sha> | review <router> <repository> <pr> <workflow> <stage> <base-branch> <base-sha> <head-branch> <head-sha> <stage-contract>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
