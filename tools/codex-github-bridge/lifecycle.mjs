import { randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { needsDecision } from './errors.mjs';
import {
  ACCEPTANCE_RECORD_TYPES,
  RECORD_MARKERS,
  formatRecordEnvelope,
  parseLifecycleComments,
  structurallyEqual,
  typedRecordIdentity,
  validateDecisionRecord,
  validateMechanicalRecord,
  validateReviewHandoff,
  validateFixDispatchHandoff,
} from './structured-records.mjs';

export const FAILURE_CLASS = Object.freeze({
  PRE_MUTATION_FAILURE: 'PRE_MUTATION_FAILURE',
  POST_MUTATION_UNCERTAIN: 'POST_MUTATION_UNCERTAIN',
});

export function preMutationFailure(message, details = {}) {
  return needsDecision(message, { ...details, failure_class: FAILURE_CLASS.PRE_MUTATION_FAILURE });
}

export function postMutationUncertain(boundary, message, details = {}) {
  return needsDecision(message, { ...details, boundary, failure_class: FAILURE_CLASS.POST_MUTATION_UNCERTAIN });
}

export function validatePreparedFixInput({ files, commitMessage }) {
  if (!files || typeof files !== 'object' || Array.isArray(files) || Object.keys(files).length === 0) {
    throw preMutationFailure('prepared Fix files must be a non-empty object');
  }
  for (const [path, content] of Object.entries(files)) {
    if (path.length === 0 || path.includes('\0') || path.includes('\\') || isAbsolute(path) || /^[A-Za-z]:\//.test(path)
      || path.split('/').some((component) => component === '' || component === '.' || component === '..')) {
      throw preMutationFailure(`prepared Fix path is not repository-relative POSIX: ${path}`);
    }
    if (typeof content !== 'string') throw preMutationFailure(`prepared Fix file ${path} must contain exact string bytes`);
  }
  if (typeof commitMessage !== 'string' || commitMessage.length === 0) {
    throw preMutationFailure('prepared Fix commit_message must be non-empty');
  }
}

export function failureResult(error) {
  return {
    status: error.status ?? 'blocked',
    failure_class: error.details?.failure_class ?? null,
    reason: error.message,
  };
}

export async function runObservedMutation({ boundary, observe, isApplied, mutate }) {
  let before;
  try {
    before = await observe();
  } catch (error) {
    throw preMutationFailure(`${boundary} could not be observed before mutation: ${error.message}`, { boundary });
  }
  if (isApplied(before)) return { status: 'reused', observed: before };

  try {
    await mutate();
  } catch (error) {
    let after = null;
    let observationError = null;
    try {
      after = await observe();
    } catch (nextError) {
      observationError = nextError.message;
    }
    throw postMutationUncertain(boundary, `${boundary} response was not conclusive: ${error.message}`, {
      effect_observed: after === null ? null : isApplied(after),
      observation_error: observationError,
    });
  }

  let after;
  try {
    after = await observe();
  } catch (error) {
    throw postMutationUncertain(boundary, `${boundary} succeeded but its effect could not be re-observed: ${error.message}`);
  }
  if (!isApplied(after)) throw postMutationUncertain(boundary, `${boundary} returned success without the required observable projection`);
  return { status: 'created', observed: after };
}

function nonEmpty(value, path) {
  if (typeof value !== 'string' || value.length === 0) throw preMutationFailure(`${path} must be a non-empty string`);
}

function exactKeys(value, keys, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw preMutationFailure(`${path} must be an object`);
  const missing = keys.filter((key) => !Object.hasOwn(value, key));
  const extra = Object.keys(value).filter((key) => !keys.includes(key));
  if (missing.length > 0) throw preMutationFailure(`${path} is missing fields: ${missing.join(', ')}`);
  if (extra.length > 0) throw preMutationFailure(`${path} has unknown fields: ${extra.join(', ')}`);
}

function parseScalar(raw) {
  const value = raw.trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (value === '[]') return [];
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value;
}

export function parseTaskContract(source) {
  const text = Buffer.isBuffer(source) ? source.toString('utf8') : source;
  if (typeof text !== 'string') throw preMutationFailure('Task Contract bytes are unavailable');
  const contractSection = /(?:^|\n)## Contract\s*\r?\n[\s\S]*?```ya?ml\s*\r?\n([\s\S]*?)\r?\n```/.exec(text);
  if (!contractSection) throw preMutationFailure('Task Contract has no Contract YAML block');
  const value = {};
  let listKey = null;
  for (const line of contractSection[1].split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const field = /^([a-z][a-z0-9_]*):(?:\s*(.*))?$/.exec(line);
    if (field) {
      const [, key, raw = ''] = field;
      if (Object.hasOwn(value, key)) throw preMutationFailure(`Task Contract has duplicate field ${key}`);
      if (raw === '') {
        value[key] = [];
        listKey = key;
      } else {
        value[key] = parseScalar(raw);
        listKey = null;
      }
      continue;
    }
    const item = /^\s+-\s+(.+)$/.exec(line);
    if (!item || listKey === null) throw preMutationFailure(`Task Contract Contract block has unsupported syntax: ${line.trim()}`);
    value[listKey].push(parseScalar(item[1]));
  }
  return value;
}

export function validateTaskContractBinding(task, source) {
  const contract = parseTaskContract(source);
  for (const field of ['task_id', 'dispatch_id', 'status', 'confirmed_by_user', 'task_branch', 'task_contract_path']) {
    if (!Object.hasOwn(contract, field)) throw preMutationFailure(`Task Contract is missing ${field}`, { task_id: task.task_id });
  }
  if (contract.status !== 'Accepted' || contract.confirmed_by_user !== true) {
    throw preMutationFailure(`Task Contract ${task.task_id} is not Accepted and confirmed`, { task_id: task.task_id });
  }
  for (const field of ['task_id', 'dispatch_id', 'task_branch', 'task_contract_path']) {
    if (contract[field] !== task[field]) throw preMutationFailure(`Task Contract ${field} does not match Router for ${task.task_id}`, { task_id: task.task_id });
  }
  return contract;
}

function exactMappingForTasks(tasks) {
  return Object.fromEntries(tasks.map((task) => [task.task_id, task.dispatch_id]));
}

function exactOne(values, message) {
  if (values.length !== 1) throw preMutationFailure(`${message}; found ${values.length}`);
  return values[0];
}

function findRecord(records, type, predicate, message) {
  return exactOne(records.filter((record) => record.record_type === type && predicate(record)), message);
}

export function gateDispatchBatch({ repository, router, stage, remoteStageSha, taskContractBytes, states }) {
  if (stage.lifecycle?.errors?.length > 0) {
    throw preMutationFailure(`lifecycle comments are malformed or conflicting: ${stage.lifecycle.errors.map((item) => item.message).join('; ')}`);
  }
  if (stage.eventErrors?.length > 0) throw preMutationFailure(`Bridge lifecycle comments are malformed: ${stage.eventErrors.join('; ')}`);
  if (stage.ambiguousTaskEvents?.length > 0) throw preMutationFailure(`prior Task start state is ambiguous: ${stage.ambiguousTaskEvents.join(', ')}`);
  if (router.repository !== repository || router.stage_branch !== stage.prHeadBranch) throw preMutationFailure('Router repository or Stage branch does not match the discovered PR');
  if (stage.prHeadSha !== remoteStageSha) throw preMutationFailure('remote Stage and PR heads do not match');

  const selectedTasks = router.tasks.filter((task) => (states.get(task.task_id) ?? 'not_started') === 'not_started');
  for (const task of selectedTasks) {
    const bytes = taskContractBytes.get(task.task_id);
    if (!bytes) throw preMutationFailure(`Task Contract bytes are missing for ${task.task_id}`);
    validateTaskContractBinding(task, bytes);
  }

  const records = stage.lifecycle?.records ?? [];
  const currentPreparations = records.filter((record) => record.record_type === 'FIX_PREPARED_V1' && record.prepared_stage_sha === remoteStageSha);
  if (currentPreparations.length === 0) {
    return { routerMode: 'canonical_stage_router', selectedTasks };
  }
  const preparation = exactOne(currentPreparations, 'expected exactly one current Fix preparation');
  const fixHandoffs = stage.lifecycle?.fixHandoffs ?? [];
  const currentFixHandoffs = fixHandoffs.filter((handoff) => handoff.prepared_stage_sha === remoteStageSha);
  const handoff = exactOne(currentFixHandoffs, 'expected exactly one current Fix dispatch handoff');
  validateFixDispatchHandoff(handoff);
  if (handoff.repository !== repository || handoff.pull_request_number !== stage.prNumber
    || handoff.workflow_id !== router.workflow_id || handoff.stage_id !== router.stage_id
    || handoff.stage_branch !== router.stage_branch) {
    throw preMutationFailure('Fix dispatch handoff lineage does not match Router and PR');
  }
  if (preparation.repository !== repository || preparation.pull_request_number !== stage.prNumber
    || preparation.workflow_id !== router.workflow_id || preparation.stage_id !== router.stage_id
    || preparation.stage_branch !== router.stage_branch
    || preparation.repository !== handoff.repository || preparation.pull_request_number !== handoff.pull_request_number
    || preparation.workflow_id !== handoff.workflow_id || preparation.stage_id !== handoff.stage_id
    || preparation.stage_branch !== handoff.stage_branch) {
    throw preMutationFailure('Fix preparation lineage does not match Router, PR, and Fix handoff');
  }

  if (preparation.fix_preparation_id !== handoff.fix_preparation_id) throw preMutationFailure('current Fix preparation does not match the Fix handoff identity');
  if (preparation.prepared_stage_sha !== remoteStageSha
    || preparation.fix_round_id !== handoff.fix_round_id
    || preparation.router_contract_path !== handoff.router_contract_path
    || preparation.source_review_id !== handoff.source_review_id
    || preparation.source_confirmation_id !== handoff.source_confirmation_id) {
    throw preMutationFailure('Fix preparation does not match the current Fix handoff');
  }
  const verification = findRecord(records, 'STAGE_VERIFICATION_V1', (record) => record.verification_id === handoff.verification_id, 'expected one exact Fix verification');
  if (verification.result !== 'PASS' || verification.stage_sha !== remoteStageSha
    || verification.workflow_id !== router.workflow_id || verification.stage_id !== router.stage_id) {
    throw preMutationFailure('Fix verification is not a current exact PASS');
  }
  const acceptance = findRecord(records, 'FIX_BUNDLE_ACCEPTANCE_V1', (record) => record.handoff_id === handoff.handoff_id, 'expected one exact Fix-bundle acceptance');
  const expectedMapping = exactMappingForTasks(selectedTasks);
  if (acceptance.fix_round_id !== preparation.fix_round_id
    || acceptance.fix_preparation_id !== preparation.fix_preparation_id
    || acceptance.prepared_stage_sha !== remoteStageSha
    || acceptance.router_contract_path !== preparation.router_contract_path
    || acceptance.verification_id !== verification.verification_id
    || !structurallyEqual(acceptance.task_dispatch_mapping, handoff.task_dispatch_mapping)
    || !structurallyEqual(acceptance.task_dispatch_mapping, expectedMapping)) {
    throw preMutationFailure('Fix acceptance, handoff, preparation, or Router dispatch mapping does not match');
  }

  const preparedTasks = Object.fromEntries(preparation.tasks.map((task) => [task.task_id, task]));
  if (!structurallyEqual(Object.keys(preparedTasks).sort(), selectedTasks.map((task) => task.task_id).sort())) {
    throw preMutationFailure('Fix preparation Task set does not match the selected Router Task set');
  }
  for (const task of selectedTasks) {
    const prepared = preparedTasks[task.task_id];
    if (prepared.dispatch_id !== task.dispatch_id || prepared.task_branch !== task.task_branch
      || prepared.task_contract_path !== task.task_contract_path
      || prepared.fix_round_id !== preparation.fix_round_id
      || prepared.fix_preparation_id !== preparation.fix_preparation_id) {
      throw preMutationFailure(`prepared Fix Task lineage does not match Router for ${task.task_id}`);
    }
  }
  return { routerMode: 'prepared_fix_router', selectedTasks, preparation, verification, handoff, acceptance };
}

function requireLifecycleFacts(comments) {
  const lifecycle = parseLifecycleComments(comments);
  if (lifecycle.errors.length > 0) throw preMutationFailure(`lifecycle comments are malformed or conflicting: ${lifecycle.errors.map((item) => item.message).join('; ')}`);
  return lifecycle;
}

function uniqueCurrentHandoff(handoffs, predicate, label) {
  return exactOne(handoffs.filter(predicate), `expected exactly one current ${label}`);
}

function validatePreparationBeforeMutation(value) {
  try {
    return validateMechanicalRecord(value);
  } catch (error) {
    if (error?.details?.failure_class) throw error;
    throw preMutationFailure(`Fix preparation is invalid: ${error.message}`);
  }
}

function validatePreparationFixRoundLineage(preparation, fixRound) {
  if (preparation.fix_round_id !== fixRound.fix_round_id
    || preparation.source_review_id !== fixRound.review_id
    || preparation.source_confirmation_id !== fixRound.confirmation_id
    || preparation.source_stage_sha !== fixRound.reviewed_stage_sha
    || preparation.solution_id !== fixRound.confirmed_solution_id) {
    throw preMutationFailure('Fix preparation does not bind the authoritative Fix round');
  }
}

export function mutationFailure(error, boundary, mutationObserved) {
  if (error?.details?.failure_class === FAILURE_CLASS.POST_MUTATION_UNCERTAIN) return error;
  if (error?.details?.failure_class === FAILURE_CLASS.PRE_MUTATION_FAILURE && !mutationObserved) return error;
  const { failure_class: _failureClass, boundary: reportedBoundary, ...details } = error?.details ?? {};
  return postMutationUncertain(reportedBoundary ?? boundary, error.message, details);
}

export class LifecycleController {
  constructor({ repository, github, git, createId = randomUUID, hostApproval = async () => false }) {
    this.repository = repository;
    this.github = github;
    this.git = git;
    this.createId = createId;
    this.hostApproval = hostApproval;
  }

  async facts(pullRequestNumber) {
    let comments;
    let pullRequest;
    try {
      [comments, pullRequest] = await Promise.all([
        this.github.comments(this.repository, pullRequestNumber),
        this.github.pullRequestFacts(this.repository, pullRequestNumber),
      ]);
    } catch (error) {
      throw preMutationFailure(`lifecycle discovery failed: ${error.message}`);
    }
    return { comments, pullRequest, lifecycle: requireLifecycleFacts(comments) };
  }

  async remoteHead(branch) {
    try {
      const value = await this.git.remoteBranchHead(branch);
      if (value === null) throw new Error('ref was not returned exactly');
      return value;
    } catch (error) {
      if (error instanceof Error && error.details?.failure_class) throw error;
      throw preMutationFailure(`remote ${branch} is unobservable: ${error.message}`);
    }
  }

  async recordReview(input) {
    exactKeys(input, ['pull_request_number', 'record'], '$');
    const record = validateDecisionRecord(input.record);
    if (record.record_type !== 'FORMAL_REVIEW_V1' || record.pull_request_number !== input.pull_request_number) {
      throw preMutationFailure('record-review requires one matching FORMAL_REVIEW_V1');
    }
    const facts = await this.facts(input.pull_request_number);
    const handoff = uniqueCurrentHandoff(
      facts.lifecycle.reviewHandoffs,
      (item) => item.handoff_id === record.review_handoff_id,
      'Review handoff',
    );
    validateReviewHandoff(handoff);
    const verification = findRecord(facts.lifecycle.records, 'STAGE_VERIFICATION_V1', (item) => item.verification_id === record.verification_id, 'expected one exact Stage verification');
    const remoteStageSha = await this.remoteHead(record.stage_branch);
    if (handoff.repository !== record.repository || handoff.pull_request_number !== record.pull_request_number
      || handoff.workflow_id !== record.workflow_id || handoff.stage_id !== record.stage_id
      || handoff.head_branch !== record.stage_branch || handoff.head_sha !== record.reviewed_stage_sha
      || handoff.verification_id !== record.verification_id || verification.result !== 'PASS'
      || verification.workflow_id !== record.workflow_id || verification.stage_id !== record.stage_id
      || verification.stage_sha !== record.reviewed_stage_sha || remoteStageSha !== record.reviewed_stage_sha
      || facts.pullRequest.headRefOid !== record.reviewed_stage_sha || facts.pullRequest.headRefName !== record.stage_branch) {
      throw preMutationFailure('Formal Review does not bind the current exact Review handoff, PASS, Stage, and PR head');
    }
    return this.github.publishStructuredRecord(this.repository, input.pull_request_number, record);
  }

  async prepareFix(input) {
    exactKeys(input, ['pull_request_number', 'fix_round', 'preparation', 'files', 'commit_message'], '$');
    const initialFacts = await this.facts(input.pull_request_number);
    const requestedRound = { ...input.fix_round };
    if (!Object.hasOwn(requestedRound, 'record_type')) requestedRound.record_type = 'FIX_ROUND_OPENED_V1';
    const sameConfirmation = initialFacts.lifecycle.records.filter((record) => record.record_type === 'FIX_ROUND_OPENED_V1'
      && record.confirmation_id === requestedRound.confirmation_id);
    if (sameConfirmation.length > 1) throw preMutationFailure('Fix confirmation has ambiguous round records');
    const existingRound = sameConfirmation[0] ?? null;
    if (existingRound) requestedRound.fix_round_id = existingRound.fix_round_id;
    else if (!Object.hasOwn(requestedRound, 'fix_round_id')) requestedRound.fix_round_id = this.createId();
    const fixRound = validateDecisionRecord(requestedRound);
    if (existingRound && !structurallyEqual(fixRound, existingRound)) {
      throw preMutationFailure('existing Fix confirmation conflicts with the requested decision');
    }
    const review = findRecord(initialFacts.lifecycle.records, 'FORMAL_REVIEW_V1', (record) => record.review_id === fixRound.review_id, 'expected one source Formal Review');
    if (review.decision !== 'REQUEST_CHANGES' || review.reviewed_stage_sha !== fixRound.reviewed_stage_sha
      || !fixRound.confirmed_finding_ids.every((id) => review.finding_ids.includes(id))) {
      throw preMutationFailure('confirmed Fix solution does not match a current REQUEST_CHANGES Review');
    }

    const preparationInput = { ...input.preparation, record_type: 'FIX_PREPARED_V1', fix_round_id: fixRound.fix_round_id };
    const existingPreparations = initialFacts.lifecycle.records.filter((record) => record.record_type === 'FIX_PREPARED_V1'
      && record.fix_round_id === fixRound.fix_round_id);
    if (existingPreparations.length > 1) throw preMutationFailure('Fix round has ambiguous preparation records');
    const existingPreparation = existingPreparations[0] ?? null;
    if (!Object.hasOwn(preparationInput, 'fix_preparation_id')) {
      preparationInput.fix_preparation_id = existingPreparation?.fix_preparation_id ?? this.createId();
    }
    if (!Object.hasOwn(preparationInput, 'prepared_stage_sha')) {
      preparationInput.prepared_stage_sha = existingPreparation?.prepared_stage_sha ?? '<pending>';
    }
    const validatedPreparation = validatePreparationBeforeMutation(preparationInput);
    validatePreparationFixRoundLineage(validatedPreparation, fixRound);
    validatePreparedFixInput({ files: input.files, commitMessage: input.commit_message });
    const remoteStageSha = await this.remoteHead(preparationInput.stage_branch);
    if (existingPreparation && remoteStageSha === existingPreparation.prepared_stage_sha
      && initialFacts.pullRequest.headRefOid === existingPreparation.prepared_stage_sha) {
      if (!structurallyEqual(validatedPreparation, existingPreparation)) throw preMutationFailure('existing Fix preparation conflicts with the requested bundle');
      await this.github.publishStructuredRecord(this.repository, input.pull_request_number, fixRound);
      return {
        status: 'prepared',
        fix_round_id: fixRound.fix_round_id,
        fix_preparation_id: existingPreparation.fix_preparation_id,
        prepared_stage_sha: existingPreparation.prepared_stage_sha,
      };
    }
    if (remoteStageSha !== preparationInput.source_stage_sha || initialFacts.pullRequest.headRefOid !== preparationInput.source_stage_sha) {
      throw preMutationFailure('prepare-fix source Stage or PR head is stale');
    }
    const publishedRound = await this.github.publishStructuredRecord(this.repository, input.pull_request_number, fixRound);
    let mutationObserved = publishedRound.status === 'created';

    let prepared;
    try {
      prepared = await this.git.materializePreparedFix({
        stageBranch: preparationInput.stage_branch,
        sourceStageSha: preparationInput.source_stage_sha,
        files: input.files,
        commitMessage: input.commit_message,
      });
    } catch (error) {
      throw mutationFailure(error, 'local_prepared_commit', mutationObserved);
    }
    mutationObserved ||= prepared.mutationObserved ?? prepared.status === 'created';
    preparationInput.prepared_stage_sha = prepared.preparedStageSha;
    let preparation;
    try {
      preparation = validateMechanicalRecord(preparationInput);
    } catch (error) {
      throw mutationFailure(error, 'local_prepared_commit', mutationObserved);
    }
    let publishedPreparation;
    try {
      publishedPreparation = await this.github.publishStructuredRecord(this.repository, input.pull_request_number, preparation);
    } catch (error) {
      throw mutationFailure(error, 'pr_comment', mutationObserved);
    }
    mutationObserved ||= publishedPreparation.status === 'created';
    try {
      await this.git.pushPreparedStage(preparation.stage_branch, preparation.source_stage_sha, preparation.prepared_stage_sha, prepared.worktree);
    } catch (error) {
      throw mutationFailure(error, 'prepared_stage_push', mutationObserved);
    }
    return { status: 'prepared', fix_round_id: fixRound.fix_round_id, fix_preparation_id: preparation.fix_preparation_id, prepared_stage_sha: preparation.prepared_stage_sha };
  }

  async recordAcceptance(recordType, input) {
    if (!ACCEPTANCE_RECORD_TYPES.includes(recordType)) throw preMutationFailure('record-acceptance --record-type must be FIX_BUNDLE_ACCEPTANCE_V1 or STAGE_ACCEPTANCE_V1');
    exactKeys(input, ['pull_request_number', 'record'], '$');
    const record = validateDecisionRecord(input.record);
    if (record.record_type !== recordType) throw preMutationFailure('record-acceptance record_type does not match --record-type');
    const facts = await this.facts(input.pull_request_number);
    if (recordType === 'FIX_BUNDLE_ACCEPTANCE_V1') {
      const preparation = findRecord(facts.lifecycle.records, 'FIX_PREPARED_V1', (item) => item.fix_preparation_id === record.fix_preparation_id, 'expected one exact Fix preparation');
      const verification = findRecord(facts.lifecycle.records, 'STAGE_VERIFICATION_V1', (item) => item.verification_id === record.verification_id, 'expected one exact Fix verification');
      const handoff = uniqueCurrentHandoff(facts.lifecycle.fixHandoffs, (item) => item.handoff_id === record.handoff_id, 'Fix handoff');
      const preparedMapping = Object.fromEntries(preparation.tasks.map((task) => [task.task_id, task.dispatch_id]));
      const remoteStageSha = await this.remoteHead(preparation.stage_branch);
      if (preparation.repository !== this.repository || preparation.pull_request_number !== input.pull_request_number
        || handoff.repository !== preparation.repository || handoff.pull_request_number !== preparation.pull_request_number
        || handoff.workflow_id !== preparation.workflow_id || handoff.stage_id !== preparation.stage_id
        || handoff.stage_branch !== preparation.stage_branch || handoff.fix_round_id !== preparation.fix_round_id
        || handoff.fix_preparation_id !== preparation.fix_preparation_id
        || handoff.source_review_id !== preparation.source_review_id
        || handoff.source_confirmation_id !== preparation.source_confirmation_id
        || handoff.router_contract_path !== preparation.router_contract_path
        || handoff.verification_id !== record.verification_id
        || verification.workflow_id !== preparation.workflow_id || verification.stage_id !== preparation.stage_id
        || preparation.fix_round_id !== record.fix_round_id || preparation.fix_preparation_id !== record.fix_preparation_id
        || preparation.prepared_stage_sha !== record.prepared_stage_sha
        || preparation.router_contract_path !== record.router_contract_path || verification.result !== 'PASS'
        || verification.stage_sha !== record.prepared_stage_sha || handoff.prepared_stage_sha !== record.prepared_stage_sha
        || facts.pullRequest.headRefName !== preparation.stage_branch
        || facts.pullRequest.headRefOid !== record.prepared_stage_sha || remoteStageSha !== record.prepared_stage_sha
        || !structurallyEqual(preparedMapping, record.task_dispatch_mapping)
        || !structurallyEqual(handoff.task_dispatch_mapping, record.task_dispatch_mapping)) {
        throw preMutationFailure('Fix acceptance target does not match the exact preparation, PASS, handoff, and mapping');
      }
    } else {
      const review = findRecord(facts.lifecycle.records, 'FORMAL_REVIEW_V1', (item) => item.review_id === record.review_id, 'expected one exact PASS Review');
      const verification = findRecord(facts.lifecycle.records, 'STAGE_VERIFICATION_V1', (item) => item.verification_id === record.verification_id, 'expected one exact Stage verification');
      const handoff = uniqueCurrentHandoff(facts.lifecycle.reviewHandoffs, (item) => item.handoff_id === record.handoff_id, 'Review handoff');
      const remoteStageSha = await this.remoteHead(review.stage_branch);
      if (review.decision !== 'PASS' || review.reviewed_stage_sha !== record.accepted_stage_sha
        || review.review_handoff_id !== handoff.handoff_id || review.verification_id !== verification.verification_id
        || verification.result !== 'PASS' || verification.stage_sha !== record.accepted_stage_sha
        || handoff.head_sha !== record.accepted_stage_sha || handoff.pull_request_number !== input.pull_request_number
        || handoff.repository !== this.repository || facts.pullRequest.headRefOid !== record.accepted_stage_sha
        || remoteStageSha !== record.accepted_stage_sha) {
        throw preMutationFailure('Stage acceptance target does not match the exact PASS Review, verification, handoff, and PR head');
      }
    }
    return this.github.publishStructuredRecord(this.repository, input.pull_request_number, record);
  }

  async closeStage(input) {
    exactKeys(input, ['pull_request_number', 'closure_authorization_id', 'closure_id'], '$');
    const facts = await this.facts(input.pull_request_number);
    const authorization = findRecord(facts.lifecycle.records, 'STAGE_CLOSURE_AUTHORIZATION_V1', (record) => record.closure_authorization_id === input.closure_authorization_id, 'expected one exact closure authorization');
    const acceptance = findRecord(facts.lifecycle.records, 'STAGE_ACCEPTANCE_V1', (record) => record.acceptance_id === authorization.stage_acceptance_id, 'expected one exact Stage acceptance');
    const review = findRecord(facts.lifecycle.records, 'FORMAL_REVIEW_V1', (record) => record.review_id === authorization.review_id, 'expected one exact PASS Review');
    const verification = findRecord(facts.lifecycle.records, 'STAGE_VERIFICATION_V1', (record) => record.verification_id === acceptance.verification_id, 'expected one exact Stage verification');
    const handoff = uniqueCurrentHandoff(facts.lifecycle.reviewHandoffs, (item) => item.handoff_id === acceptance.handoff_id, 'Review handoff');
    if (acceptance.review_id !== review.review_id || review.decision !== 'PASS'
      || acceptance.accepted_stage_sha !== authorization.accepted_stage_sha
      || review.reviewed_stage_sha !== authorization.accepted_stage_sha
      || review.review_handoff_id !== handoff.handoff_id
      || review.verification_id !== verification.verification_id
      || verification.result !== 'PASS' || verification.stage_sha !== authorization.accepted_stage_sha
      || handoff.head_sha !== authorization.accepted_stage_sha
      || facts.pullRequest.headRefName !== authorization.stage_branch
      || facts.pullRequest.headRefOid !== authorization.accepted_stage_sha) {
      throw preMutationFailure('closure authorization does not bind the current accepted PASS Stage and PR head');
    }
    const remoteStageSha = await this.remoteHead(authorization.stage_branch);
    if (remoteStageSha !== authorization.accepted_stage_sha) throw preMutationFailure('remote Stage no longer equals the accepted Stage SHA');
    const mainSha = await this.remoteHead('main');
    if (mainSha !== authorization.accepted_stage_sha && mainSha !== authorization.expected_main_sha) {
      throw preMutationFailure(`remote main ${mainSha} is neither the accepted Stage nor expected main baseline`);
    }

    let closed;
    try {
      closed = validateMechanicalRecord({
        record_type: 'STAGE_CLOSED_V1',
        closure_id: input.closure_id,
        closure_authorization_id: authorization.closure_authorization_id,
        review_id: authorization.review_id,
        accepted_stage_sha: authorization.accepted_stage_sha,
        observed_main_sha: authorization.accepted_stage_sha,
        pull_request_number: input.pull_request_number,
        record_authority: 'local_bridge_controller',
      });
    } catch (error) {
      throw preMutationFailure(`Stage closure record is invalid: ${error.message}`);
    }

    // 只累计本次 invocation 的 mutation；历史 projection 由各 adapter 的 read-before-write 负责复用。
    let mutationObserved = false;
    let pushed = false;
    if (mainSha === authorization.expected_main_sha) {
      let approved;
      try {
        approved = await this.hostApproval({ command: 'close-stage', authorization });
      } catch (error) {
        throw preMutationFailure(`close-stage Host approval failed: ${error.message}`);
      }
      if (!approved) throw preMutationFailure('current Host approval is required for close-stage');
      let push;
      try {
        push = await this.git.pushMain(authorization.accepted_stage_sha, authorization.expected_main_sha);
      } catch (error) {
        throw mutationFailure(error, 'main_push', false);
      }
      pushed = push.status === 'pushed';
      mutationObserved = pushed;
    }

    let publishedClosed;
    try {
      publishedClosed = await this.github.publishStructuredRecord(this.repository, input.pull_request_number, closed);
    } catch (error) {
      throw mutationFailure(error, 'pr_comment', mutationObserved);
    }
    mutationObserved ||= publishedClosed.status === 'created';

    let projectedLabels;
    try {
      projectedLabels = await this.github.projectTerminalLabels(this.repository, input.pull_request_number);
    } catch (error) {
      throw mutationFailure(error, 'terminal_label', mutationObserved);
    }
    mutationObserved ||= projectedLabels.status === 'created';

    try {
      await this.github.closePullRequest(this.repository, input.pull_request_number);
    } catch (error) {
      throw mutationFailure(error, 'pr_close', mutationObserved);
    }
    return { status: 'closed', accepted_stage_sha: authorization.accepted_stage_sha, pushed };
  }
}

export function lifecycleEnvelope(record) {
  return formatRecordEnvelope(record, record.record_type === 'STAGE_CLOSED_V1' || record.record_type === 'FIX_PREPARED_V1'
    || record.record_type === 'STAGE_VERIFICATION_V1' ? RECORD_MARKERS.mechanical : RECORD_MARKERS.decision);
}
