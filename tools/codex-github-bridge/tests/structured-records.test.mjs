import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RECORD_MARKERS,
  formatRecordEnvelope,
  parseDecisionRecord,
  parseFixDispatchHandoff,
  parseLifecycleComments,
  parseMechanicalRecord,
  parseReviewHandoff,
  parseStrictJsonObject,
  reduceTypedRecords,
  structurallyEqual,
  typedRecordIdentity,
  validateDecisionRecord,
  validateMechanicalRecord,
} from '../structured-records.mjs';

const sourceReference = (kind) => ({ source_kind: kind, decision_reference: 'fixed-chat-message-17' });

function formalReview(overrides = {}) {
  return {
    record_type: 'FORMAL_REVIEW_V1',
    review_id: 'review-1',
    review_handoff_id: 'handoff-review-1',
    verification_id: 'verification-1',
    workflow_id: 'wf',
    stage_id: 'S01',
    repository: 'owner/repo',
    pull_request_number: 7,
    stage_branch: 'stage/wf/S01',
    reviewed_stage_sha: 'stage-sha',
    decision: 'PASS',
    decision_authority: 'chatgpt_fixed_chat',
    source_reference: sourceReference('fixed_chat_assistant_decision'),
    finding_ids: [],
    ...overrides,
  };
}

function fixPreparation(overrides = {}) {
  return {
    record_type: 'FIX_PREPARED_V1',
    fix_preparation_id: 'preparation-1',
    fix_round_id: 'round-1',
    workflow_id: 'wf',
    stage_id: 'S01',
    repository: 'owner/repo',
    pull_request_number: 7,
    stage_branch: 'stage/wf/S01',
    source_review_id: 'review-1',
    source_confirmation_id: 'confirmation-1',
    source_stage_sha: 'source-sha',
    solution_id: 'solution-1',
    prepared_stage_sha: 'prepared-sha',
    router_contract_path: 'docs/router.md',
    tasks: [{
      task_id: 'T01F01',
      dispatch_id: 'dispatch-1',
      fix_round_id: 'round-1',
      fix_preparation_id: 'preparation-1',
      task_branch: 'task/wf/T01F01',
      task_contract_path: 'docs/T01F01.md',
      immutable_dispatch_facts: { base_sha: 'source-sha', model_policy: 'coding_strong' },
    }],
    record_authority: 'local_bridge_controller',
    source_kind: 'git_observation',
    ...overrides,
  };
}

test('strict JSON rejects duplicate members at every nesting level and non-object roots', () => {
  assert.throws(() => parseStrictJsonObject('{"a":{"b":1,"b":2}}'), /duplicate JSON member/);
  assert.throws(() => parseStrictJsonObject('[1]'), /root/);
  assert.deepEqual(parseStrictJsonObject('{"a":{"b":1},"c":["x",2]}'), { a: { b: 1 }, c: ['x', 2] });
});

test('record envelope requires one exact marker, one JSON fence, and no surrounding payload', () => {
  const body = formatRecordEnvelope(formalReview());
  assert.deepEqual(parseDecisionRecord(body), formalReview());
  assert.throws(() => parseDecisionRecord(`${body}\n${RECORD_MARKERS.decision}`), /exactly one/);
  assert.throws(() => parseDecisionRecord(`${body}\noutside`), /outside/);
  assert.throws(() => parseDecisionRecord(body.replace('"review_id": "review-1"', '"review_id": "review-1",\n  "review_id": "review-2"')), /duplicate/);
});

test('Formal Review decision rules and authority are exact', () => {
  assert.equal(validateDecisionRecord(formalReview()).decision, 'PASS');
  assert.equal(validateDecisionRecord(formalReview({ decision: 'REQUEST_CHANGES', finding_ids: ['F-1', 'F-2'] })).finding_ids.length, 2);
  assert.throws(() => validateDecisionRecord(formalReview({ finding_ids: ['F-1'] })), /PASS requires/);
  assert.throws(() => validateDecisionRecord(formalReview({ decision: 'REQUEST_CHANGES', finding_ids: [] })), /non-empty/);
  assert.throws(() => validateDecisionRecord(formalReview({ decision: 'REQUEST_CHANGES', finding_ids: ['F-1', 'F-1'] })), /unique/);
  assert.throws(() => validateDecisionRecord(formalReview({ decision_authority: 'github_actions' })), /chatgpt_fixed_chat/);
  assert.throws(() => validateDecisionRecord({ ...formalReview(), extra: true }), /unknown fields/);
  assert.throws(() => validateDecisionRecord({ ...formalReview(), review_id: null }), /must not be null/);
});

test('all user decision records enforce closed authority and preserve opaque solution payload', () => {
  const payload = { text: '保留 原文 ', ordered: ['B', 'A'], nested: { exact: true } };
  const round = validateDecisionRecord({
    record_type: 'FIX_ROUND_OPENED_V1', fix_round_id: 'round-1', confirmation_id: 'confirmation-1', review_id: 'review-1',
    reviewed_stage_sha: 'stage-sha', solution_decision: 'confirmed', decision_authority: 'user',
    source_reference: sourceReference('fixed_chat_user_decision'), confirmed_finding_ids: ['F-1'],
    confirmed_solution_id: 'solution-1', confirmed_solution_payload: payload,
  });
  assert.strictEqual(round.confirmed_solution_payload, payload);

  validateDecisionRecord({
    record_type: 'FIX_BUNDLE_ACCEPTANCE_V1', acceptance_id: 'acceptance-1', fix_round_id: 'round-1',
    fix_preparation_id: 'preparation-1', prepared_stage_sha: 'prepared-sha', router_contract_path: 'docs/router.md',
    verification_id: 'verification-1', handoff_id: 'fix-handoff-1', task_dispatch_mapping: { T01F01: 'dispatch-1' },
    decision: 'accepted', decision_authority: 'user', source_reference: sourceReference('fixed_chat_user_decision'),
  });
  validateDecisionRecord({
    record_type: 'STAGE_ACCEPTANCE_V1', acceptance_id: 'acceptance-1', review_id: 'review-1', handoff_id: 'review-handoff-1',
    verification_id: 'verification-1', accepted_stage_sha: 'stage-sha', decision: 'accepted', decision_authority: 'user',
    source_reference: sourceReference('fixed_chat_user_decision'),
  });
  validateDecisionRecord({
    record_type: 'STAGE_CLOSURE_AUTHORIZATION_V1', closure_authorization_id: 'closure-auth-1', stage_acceptance_id: 'acceptance-1',
    review_id: 'review-1', repository: 'Reminnd/coding-room',
    stage_branch: 'stage/wf-increment-016-github-review-fix-acceptance-closure/S01-review-fix-acceptance-closure',
    accepted_stage_sha: 'accepted-sha', expected_main_sha: '02ca6e1fa54c6aad2120da42f2bd951ae0e6039e',
    exact_refspec: 'accepted-sha:refs/heads/main', force: false, execution_semantics: 'non_force_fast_forward_only',
    decision: 'authorized', decision_authority: 'user', source_reference: sourceReference('fixed_chat_user_decision'),
  });
});

test('mechanical records are closed and cannot substitute decision authority', () => {
  assert.deepEqual(parseMechanicalRecord(formatRecordEnvelope(fixPreparation())), fixPreparation());
  assert.throws(() => validateMechanicalRecord({ ...fixPreparation(), decision: 'accepted' }), /unknown fields/);
  assert.throws(() => validateMechanicalRecord({ ...fixPreparation(), record_authority: 'user' }), /local_bridge_controller/);
  assert.throws(() => validateMechanicalRecord({ ...fixPreparation(), tasks: [{ ...fixPreparation().tasks[0], dispatch_id: 'round-1' }] }), /pairwise distinct/);
  validateMechanicalRecord({
    record_type: 'STAGE_VERIFICATION_V1', verification_id: 'verification-1', event_id: 'event-1', workflow_id: 'wf',
    stage_id: 'S01', stage_sha: 'stage-sha', result: 'PASS', checks: [{ name: 'test', result: 'PASS' }],
    record_authority: 'github_actions',
  });
  validateMechanicalRecord({
    record_type: 'STAGE_CLOSED_V1', closure_id: 'closure-1', closure_authorization_id: 'authorization-1', review_id: 'review-1',
    accepted_stage_sha: 'stage-sha', observed_main_sha: 'stage-sha', pull_request_number: 7,
    record_authority: 'local_bridge_controller',
  });
});

test('typed identity and structural comparison preserve arrays and strings while ignoring object member order', () => {
  const left = { a: 1, b: { x: ' exact ', y: ['B', 'A'] } };
  const right = { b: { y: ['B', 'A'], x: ' exact ' }, a: 1 };
  assert.equal(structurallyEqual(left, right), true);
  assert.equal(structurallyEqual(left, { ...right, b: { ...right.b, y: ['A', 'B'] } }), false);

  const fixAcceptance = { record_type: 'FIX_BUNDLE_ACCEPTANCE_V1', acceptance_id: 'same' };
  const stageAcceptance = { record_type: 'STAGE_ACCEPTANCE_V1', acceptance_id: 'same' };
  assert.deepEqual(typedRecordIdentity(fixAcceptance), ['FIX_BUNDLE_ACCEPTANCE_V1', 'same']);
  assert.deepEqual(typedRecordIdentity(stageAcceptance), ['STAGE_ACCEPTANCE_V1', 'same']);
});

test('same typed identity and payload reduces once; conflict is never overwritten', () => {
  const a = formalReview();
  const reordered = Object.fromEntries(Object.entries(a).reverse());
  assert.equal(reduceTypedRecords([a, reordered]).size, 1);
  assert.throws(() => reduceTypedRecords([a, { ...a, reviewed_stage_sha: 'other' }]), /conflicting/);
});

test('review and Fix handoff grammars are closed and non-substitutable', () => {
  const review = {
    status: 'ready_for_chat_review', repository: 'owner/repo', pull_request_number: 7, workflow_id: 'wf', stage_id: 'S01',
    base_branch: 'main', base_sha: 'base', head_branch: 'stage/wf/S01', head_sha: 'stage-sha',
    stage_contract_path: 'docs/stage.md', router_contract_path: 'docs/router.md', verification_id: 'verification-1',
    review_authority: 'chatgpt_fixed_chat', handoff_id: 'review-handoff-1',
  };
  const fix = {
    status: 'ready_for_fix_dispatch', repository: 'owner/repo', pull_request_number: 7, workflow_id: 'wf', stage_id: 'S01',
    stage_branch: 'stage/wf/S01', prepared_stage_sha: 'prepared-sha', router_contract_path: 'docs/router.md',
    fix_round_id: 'round-1', fix_preparation_id: 'preparation-1', source_review_id: 'review-1',
    source_confirmation_id: 'confirmation-1', verification_id: 'verification-1', handoff_id: 'fix-handoff-1',
    task_dispatch_mapping: { T01F01: 'dispatch-1' }, execution_surface: 'local_codex',
  };
  assert.deepEqual(parseReviewHandoff(formatRecordEnvelope(review, RECORD_MARKERS.review_handoff)), review);
  assert.deepEqual(parseFixDispatchHandoff(formatRecordEnvelope(fix, RECORD_MARKERS.fix_handoff)), fix);
  assert.throws(() => parseReviewHandoff(formatRecordEnvelope(fix, RECORD_MARKERS.fix_handoff)), /CHAT_REVIEW/);
});

test('malformed lifecycle facts remain explicit and cannot reduce to absence', () => {
  const malformed = `${RECORD_MARKERS.decision}\n\n\`\`\`json\n{"record_type":"FORMAL_REVIEW_V1","review_id":"a","review_id":"b"}\n\`\`\``;
  const parsed = parseLifecycleComments([{ body: malformed }]);
  assert.equal(parsed.records.length, 0);
  assert.equal(parsed.errors.length, 1);
});
