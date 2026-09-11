const DECISION_MARKER = '<!-- CODEX_DECISION_RECORD_V1 -->';
const MECHANICAL_MARKER = '<!-- CODEX_GITHUB_LIFECYCLE_RECORD_V1 -->';
const REVIEW_HANDOFF_MARKER = '<!-- CHAT_REVIEW_HANDOFF_V1 -->';
const FIX_HANDOFF_MARKER = '<!-- CODEX_FIX_DISPATCH_HANDOFF_V1 -->';

export const RECORD_MARKERS = Object.freeze({
  decision: DECISION_MARKER,
  mechanical: MECHANICAL_MARKER,
  review_handoff: REVIEW_HANDOFF_MARKER,
  fix_handoff: FIX_HANDOFF_MARKER,
});

export const DECISION_RECORD_TYPES = Object.freeze([
  'FORMAL_REVIEW_V1',
  'FIX_ROUND_OPENED_V1',
  'FIX_BUNDLE_ACCEPTANCE_V1',
  'STAGE_ACCEPTANCE_V1',
  'STAGE_CLOSURE_AUTHORIZATION_V1',
]);

export const MECHANICAL_RECORD_TYPES = Object.freeze([
  'FIX_PREPARED_V1',
  'STAGE_VERIFICATION_V1',
  'STAGE_CLOSED_V1',
]);

export const ACCEPTANCE_RECORD_TYPES = Object.freeze([
  'FIX_BUNDLE_ACCEPTANCE_V1',
  'STAGE_ACCEPTANCE_V1',
]);

const DECISION_TYPES = new Set(DECISION_RECORD_TYPES);
const MECHANICAL_TYPES = new Set(MECHANICAL_RECORD_TYPES);

function fail(message) {
  throw new Error(message);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

class StrictJsonParser {
  constructor(source) {
    this.source = source;
    this.index = 0;
  }

  parse() {
    this.space();
    const value = this.value('$');
    this.space();
    if (this.index !== this.source.length) fail(`unexpected JSON token at offset ${this.index}`);
    return value;
  }

  space() {
    while (/\s/.test(this.source[this.index] ?? '')) this.index += 1;
  }

  value(path) {
    this.space();
    const char = this.source[this.index];
    if (char === '{') return this.object(path);
    if (char === '[') return this.array(path);
    if (char === '"') return this.string();
    if (char === '-' || /[0-9]/.test(char ?? '')) return this.number();
    for (const [token, value] of [['true', true], ['false', false], ['null', null]]) {
      if (this.source.startsWith(token, this.index)) {
        this.index += token.length;
        return value;
      }
    }
    fail(`invalid JSON value at ${path}`);
  }

  object(path) {
    this.index += 1;
    this.space();
    const value = {};
    const keys = new Set();
    if (this.source[this.index] === '}') {
      this.index += 1;
      return value;
    }
    while (true) {
      if (this.source[this.index] !== '"') fail(`object member name must be a string at ${path}`);
      const key = this.string();
      if (keys.has(key)) fail(`duplicate JSON member ${path}.${key}`);
      keys.add(key);
      this.space();
      if (this.source[this.index] !== ':') fail(`missing colon after ${path}.${key}`);
      this.index += 1;
      value[key] = this.value(`${path}.${key}`);
      this.space();
      if (this.source[this.index] === '}') {
        this.index += 1;
        return value;
      }
      if (this.source[this.index] !== ',') fail(`missing comma at ${path}`);
      this.index += 1;
      this.space();
    }
  }

  array(path) {
    this.index += 1;
    this.space();
    const value = [];
    if (this.source[this.index] === ']') {
      this.index += 1;
      return value;
    }
    while (true) {
      value.push(this.value(`${path}[${value.length}]`));
      this.space();
      if (this.source[this.index] === ']') {
        this.index += 1;
        return value;
      }
      if (this.source[this.index] !== ',') fail(`missing comma at ${path}`);
      this.index += 1;
      this.space();
    }
  }

  string() {
    const start = this.index;
    this.index += 1;
    while (this.index < this.source.length) {
      const char = this.source[this.index];
      if (char === '"') {
        this.index += 1;
        try {
          return JSON.parse(this.source.slice(start, this.index));
        } catch {
          fail(`invalid JSON string at offset ${start}`);
        }
      }
      if (char === '\\') {
        this.index += 1;
        const escaped = this.source[this.index];
        if (escaped === 'u') {
          const hex = this.source.slice(this.index + 1, this.index + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail(`invalid unicode escape at offset ${this.index}`);
          this.index += 5;
          continue;
        }
        if (!'"\\/bfnrt'.includes(escaped ?? '')) fail(`invalid escape at offset ${this.index}`);
      } else {
        if (char.charCodeAt(0) < 0x20) fail(`control character in JSON string at offset ${this.index}`);
      }
      this.index += 1;
    }
    fail(`unterminated JSON string at offset ${start}`);
  }

  number() {
    const match = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(this.source.slice(this.index));
    if (!match || match.index !== 0) fail(`invalid JSON number at offset ${this.index}`);
    this.index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) fail('JSON number must be finite');
    return value;
  }
}

export function parseStrictJson(source) {
  if (typeof source !== 'string') fail('JSON source must be a string');
  return new StrictJsonParser(source).parse();
}

export function parseStrictJsonObject(source) {
  const value = parseStrictJson(source);
  if (!isPlainObject(value)) fail('JSON root must be exactly one object');
  return value;
}

function countExactLine(body, marker) {
  return body.split(/\r?\n/).filter((line) => line.trim() === marker).length;
}

export function parseRecordEnvelope(body, marker) {
  if (typeof body !== 'string') fail('record envelope must be a string');
  if (countExactLine(body, marker) !== 1) fail(`record envelope must contain exactly one ${marker}`);
  const fences = [...body.matchAll(/```json\s*\r?\n([\s\S]*?)\r?\n```/g)];
  if (fences.length !== 1) fail('record envelope must contain exactly one JSON fenced block');
  const withoutEnvelope = body
    .replace(marker, '')
    .replace(fences[0][0], '')
    .trim();
  if (withoutEnvelope !== '') fail('record envelope contains content outside its marker and JSON block');
  return parseStrictJsonObject(fences[0][1]);
}

export function formatRecordEnvelope(record, marker = markerForRecord(record)) {
  return `${marker}\n\n\`\`\`json\n${JSON.stringify(record, null, 2)}\n\`\`\``;
}

function assertKeys(value, required, path) {
  if (!isPlainObject(value)) fail(`${path} must be an object`);
  const actual = Object.keys(value);
  const missing = required.filter((key) => !Object.hasOwn(value, key));
  const extra = actual.filter((key) => !required.includes(key));
  if (missing.length > 0) fail(`${path} is missing fields: ${missing.join(', ')}`);
  if (extra.length > 0) fail(`${path} has unknown fields: ${extra.join(', ')}`);
}

function assertNoNull(value, path = '$') {
  if (value === null) fail(`${path} must not be null`);
  if (Array.isArray(value)) value.forEach((item, index) => assertNoNull(item, `${path}[${index}]`));
  else if (isPlainObject(value)) Object.entries(value).forEach(([key, item]) => assertNoNull(item, `${path}.${key}`));
}

function string(value, path) {
  if (typeof value !== 'string' || value.length === 0) fail(`${path} must be a non-empty string`);
}

function integer(value, path) {
  if (!Number.isSafeInteger(value) || value <= 0) fail(`${path} must be a positive integer`);
}

function stringList(value, path, { nonEmpty = false, unique = false } = {}) {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0)) fail(`${path} must be ${nonEmpty ? 'a non-empty' : 'an'} array`);
  value.forEach((item, index) => string(item, `${path}[${index}]`));
  if (unique && new Set(value).size !== value.length) fail(`${path} must contain unique strings`);
}

function constant(value, expected, path) {
  if (value !== expected) fail(`${path} must be ${JSON.stringify(expected)}`);
}

function sourceReference(value, sourceKind, path = '$.source_reference') {
  assertKeys(value, ['source_kind', 'decision_reference'], path);
  constant(value.source_kind, sourceKind, `${path}.source_kind`);
  string(value.decision_reference, `${path}.decision_reference`);
}

const DECISION_FIELDS = {
  FORMAL_REVIEW_V1: [
    'record_type', 'review_id', 'review_handoff_id', 'verification_id', 'workflow_id', 'stage_id', 'repository',
    'pull_request_number', 'stage_branch', 'reviewed_stage_sha', 'decision', 'decision_authority', 'source_reference', 'finding_ids',
  ],
  FIX_ROUND_OPENED_V1: [
    'record_type', 'fix_round_id', 'confirmation_id', 'review_id', 'reviewed_stage_sha', 'solution_decision',
    'decision_authority', 'source_reference', 'confirmed_finding_ids', 'confirmed_solution_id', 'confirmed_solution_payload',
  ],
  FIX_BUNDLE_ACCEPTANCE_V1: [
    'record_type', 'acceptance_id', 'fix_round_id', 'fix_preparation_id', 'prepared_stage_sha', 'router_contract_path',
    'verification_id', 'handoff_id', 'task_dispatch_mapping', 'decision', 'decision_authority', 'source_reference',
  ],
  STAGE_ACCEPTANCE_V1: [
    'record_type', 'acceptance_id', 'review_id', 'handoff_id', 'verification_id', 'accepted_stage_sha',
    'decision', 'decision_authority', 'source_reference',
  ],
  STAGE_CLOSURE_AUTHORIZATION_V1: [
    'record_type', 'closure_authorization_id', 'stage_acceptance_id', 'review_id', 'repository', 'stage_branch',
    'accepted_stage_sha', 'expected_main_sha', 'exact_refspec', 'force', 'execution_semantics', 'decision',
    'decision_authority', 'source_reference',
  ],
};

function validateMapping(value, path) {
  if (!isPlainObject(value) || Object.keys(value).length === 0) fail(`${path} must be a non-empty object`);
  for (const [taskId, dispatchId] of Object.entries(value)) {
    string(taskId, `${path} key`);
    string(dispatchId, `${path}.${taskId}`);
  }
}

export function validateDecisionRecord(value) {
  if (!isPlainObject(value) || !DECISION_TYPES.has(value.record_type)) fail('record_type must be one exact supported decision record literal');
  assertKeys(value, DECISION_FIELDS[value.record_type], '$');
  assertNoNull(value);
  switch (value.record_type) {
    case 'FORMAL_REVIEW_V1':
      for (const field of ['review_id', 'review_handoff_id', 'verification_id', 'workflow_id', 'stage_id', 'repository', 'stage_branch', 'reviewed_stage_sha']) string(value[field], `$.${field}`);
      integer(value.pull_request_number, '$.pull_request_number');
      if (!['PASS', 'REQUEST_CHANGES'].includes(value.decision)) fail('$.decision must be PASS or REQUEST_CHANGES');
      constant(value.decision_authority, 'chatgpt_fixed_chat', '$.decision_authority');
      sourceReference(value.source_reference, 'fixed_chat_assistant_decision');
      stringList(value.finding_ids, '$.finding_ids', { nonEmpty: value.decision === 'REQUEST_CHANGES', unique: true });
      if (value.decision === 'PASS' && value.finding_ids.length !== 0) fail('PASS requires explicitly empty finding_ids');
      break;
    case 'FIX_ROUND_OPENED_V1':
      for (const field of ['fix_round_id', 'confirmation_id', 'review_id', 'reviewed_stage_sha', 'confirmed_solution_id']) string(value[field], `$.${field}`);
      constant(value.solution_decision, 'confirmed', '$.solution_decision');
      constant(value.decision_authority, 'user', '$.decision_authority');
      sourceReference(value.source_reference, 'fixed_chat_user_decision');
      stringList(value.confirmed_finding_ids, '$.confirmed_finding_ids', { nonEmpty: true, unique: true });
      break;
    case 'FIX_BUNDLE_ACCEPTANCE_V1':
      for (const field of ['acceptance_id', 'fix_round_id', 'fix_preparation_id', 'prepared_stage_sha', 'router_contract_path', 'verification_id', 'handoff_id']) string(value[field], `$.${field}`);
      validateMapping(value.task_dispatch_mapping, '$.task_dispatch_mapping');
      constant(value.decision, 'accepted', '$.decision');
      constant(value.decision_authority, 'user', '$.decision_authority');
      sourceReference(value.source_reference, 'fixed_chat_user_decision');
      break;
    case 'STAGE_ACCEPTANCE_V1':
      for (const field of ['acceptance_id', 'review_id', 'handoff_id', 'verification_id', 'accepted_stage_sha']) string(value[field], `$.${field}`);
      constant(value.decision, 'accepted', '$.decision');
      constant(value.decision_authority, 'user', '$.decision_authority');
      sourceReference(value.source_reference, 'fixed_chat_user_decision');
      break;
    case 'STAGE_CLOSURE_AUTHORIZATION_V1':
      for (const field of ['closure_authorization_id', 'stage_acceptance_id', 'review_id', 'repository', 'stage_branch', 'accepted_stage_sha', 'expected_main_sha']) string(value[field], `$.${field}`);
      constant(value.repository, 'Reminnd/coding-room', '$.repository');
      constant(value.stage_branch, 'stage/wf-increment-016-github-review-fix-acceptance-closure/S01-review-fix-acceptance-closure', '$.stage_branch');
      constant(value.expected_main_sha, '02ca6e1fa54c6aad2120da42f2bd951ae0e6039e', '$.expected_main_sha');
      constant(value.exact_refspec, `${value.accepted_stage_sha}:refs/heads/main`, '$.exact_refspec');
      constant(value.force, false, '$.force');
      constant(value.execution_semantics, 'non_force_fast_forward_only', '$.execution_semantics');
      constant(value.decision, 'authorized', '$.decision');
      constant(value.decision_authority, 'user', '$.decision_authority');
      sourceReference(value.source_reference, 'fixed_chat_user_decision');
      break;
  }
  return value;
}

const MECHANICAL_FIELDS = {
  FIX_PREPARED_V1: [
    'record_type', 'fix_preparation_id', 'fix_round_id', 'workflow_id', 'stage_id', 'repository', 'pull_request_number',
    'stage_branch', 'source_review_id', 'source_confirmation_id', 'source_stage_sha', 'solution_id', 'prepared_stage_sha',
    'router_contract_path', 'tasks', 'record_authority', 'source_kind',
  ],
  STAGE_VERIFICATION_V1: [
    'record_type', 'verification_id', 'event_id', 'workflow_id', 'stage_id', 'stage_sha', 'result', 'checks', 'record_authority',
  ],
  STAGE_CLOSED_V1: [
    'record_type', 'closure_id', 'closure_authorization_id', 'review_id', 'accepted_stage_sha', 'observed_main_sha',
    'pull_request_number', 'record_authority',
  ],
};

const FIX_TASK_FIELDS = [
  'task_id', 'dispatch_id', 'fix_round_id', 'fix_preparation_id', 'task_branch', 'task_contract_path', 'immutable_dispatch_facts',
];

export function validateMechanicalRecord(value) {
  if (!isPlainObject(value) || !MECHANICAL_TYPES.has(value.record_type)) fail('record_type must be one exact supported mechanical record literal');
  assertKeys(value, MECHANICAL_FIELDS[value.record_type], '$');
  assertNoNull(value);
  switch (value.record_type) {
    case 'FIX_PREPARED_V1': {
      for (const field of ['fix_preparation_id', 'fix_round_id', 'workflow_id', 'stage_id', 'repository', 'stage_branch', 'source_review_id', 'source_confirmation_id', 'source_stage_sha', 'solution_id', 'prepared_stage_sha', 'router_contract_path']) string(value[field], `$.${field}`);
      integer(value.pull_request_number, '$.pull_request_number');
      if (!Array.isArray(value.tasks) || value.tasks.length === 0) fail('$.tasks must be a non-empty array');
      const allIds = [value.fix_round_id, value.fix_preparation_id];
      const taskIds = new Set();
      for (const [index, task] of value.tasks.entries()) {
        const path = `$.tasks[${index}]`;
        assertKeys(task, FIX_TASK_FIELDS, path);
        for (const field of FIX_TASK_FIELDS.slice(0, 6)) string(task[field], `${path}.${field}`);
        if (task.fix_round_id !== value.fix_round_id || task.fix_preparation_id !== value.fix_preparation_id) fail(`${path} Fix lineage does not match its preparation`);
        if (!isPlainObject(task.immutable_dispatch_facts) || Object.keys(task.immutable_dispatch_facts).length === 0) fail(`${path}.immutable_dispatch_facts must be a non-empty object`);
        if (taskIds.has(task.task_id)) fail('$.tasks task_id values must be unique');
        taskIds.add(task.task_id);
        allIds.push(task.dispatch_id);
      }
      if (new Set(allIds).size !== allIds.length) fail('fix_round_id, fix_preparation_id, and dispatch_id values must be pairwise distinct');
      constant(value.record_authority, 'local_bridge_controller', '$.record_authority');
      constant(value.source_kind, 'git_observation', '$.source_kind');
      break;
    }
    case 'STAGE_VERIFICATION_V1':
      for (const field of ['verification_id', 'event_id', 'workflow_id', 'stage_id', 'stage_sha']) string(value[field], `$.${field}`);
      if (!['PASS', 'FAIL'].includes(value.result)) fail('$.result must be PASS or FAIL');
      if (!Array.isArray(value.checks)) fail('$.checks must be an array');
      constant(value.record_authority, 'github_actions', '$.record_authority');
      break;
    case 'STAGE_CLOSED_V1':
      for (const field of ['closure_id', 'closure_authorization_id', 'review_id', 'accepted_stage_sha', 'observed_main_sha']) string(value[field], `$.${field}`);
      integer(value.pull_request_number, '$.pull_request_number');
      constant(value.record_authority, 'local_bridge_controller', '$.record_authority');
      break;
  }
  return value;
}

const REVIEW_HANDOFF_FIELDS = [
  'status', 'repository', 'pull_request_number', 'workflow_id', 'stage_id', 'base_branch', 'base_sha', 'head_branch',
  'head_sha', 'stage_contract_path', 'router_contract_path', 'verification_id', 'review_authority', 'handoff_id',
];

export function validateReviewHandoff(value) {
  assertKeys(value, REVIEW_HANDOFF_FIELDS, '$');
  assertNoNull(value);
  constant(value.status, 'ready_for_chat_review', '$.status');
  for (const field of REVIEW_HANDOFF_FIELDS.filter((field) => !['status', 'pull_request_number', 'review_authority'].includes(field))) string(value[field], `$.${field}`);
  integer(value.pull_request_number, '$.pull_request_number');
  constant(value.review_authority, 'chatgpt_fixed_chat', '$.review_authority');
  return value;
}

const FIX_HANDOFF_FIELDS = [
  'status', 'repository', 'pull_request_number', 'workflow_id', 'stage_id', 'stage_branch', 'prepared_stage_sha',
  'router_contract_path', 'fix_round_id', 'fix_preparation_id', 'source_review_id', 'source_confirmation_id',
  'verification_id', 'handoff_id', 'task_dispatch_mapping', 'execution_surface',
];

export function validateFixDispatchHandoff(value) {
  assertKeys(value, FIX_HANDOFF_FIELDS, '$');
  assertNoNull(value);
  constant(value.status, 'ready_for_fix_dispatch', '$.status');
  for (const field of FIX_HANDOFF_FIELDS.filter((field) => !['status', 'pull_request_number', 'task_dispatch_mapping', 'execution_surface'].includes(field))) string(value[field], `$.${field}`);
  integer(value.pull_request_number, '$.pull_request_number');
  validateMapping(value.task_dispatch_mapping, '$.task_dispatch_mapping');
  constant(value.execution_surface, 'local_codex', '$.execution_surface');
  return value;
}

export function parseDecisionRecord(body) {
  return validateDecisionRecord(parseRecordEnvelope(body, DECISION_MARKER));
}

export function parseMechanicalRecord(body) {
  return validateMechanicalRecord(parseRecordEnvelope(body, MECHANICAL_MARKER));
}

export function parseReviewHandoff(body) {
  return validateReviewHandoff(parseRecordEnvelope(body, REVIEW_HANDOFF_MARKER));
}

export function parseFixDispatchHandoff(body) {
  return validateFixDispatchHandoff(parseRecordEnvelope(body, FIX_HANDOFF_MARKER));
}

export function markerForRecord(record) {
  if (DECISION_TYPES.has(record?.record_type)) return DECISION_MARKER;
  if (MECHANICAL_TYPES.has(record?.record_type)) return MECHANICAL_MARKER;
  fail('record has no supported marker');
}

export function typedRecordIdentity(record) {
  switch (record?.record_type) {
    case 'FORMAL_REVIEW_V1': return [record.record_type, record.review_id];
    case 'FIX_ROUND_OPENED_V1': return [record.record_type, record.fix_round_id];
    case 'FIX_BUNDLE_ACCEPTANCE_V1':
    case 'STAGE_ACCEPTANCE_V1': return [record.record_type, record.acceptance_id];
    case 'STAGE_CLOSURE_AUTHORIZATION_V1': return [record.record_type, record.closure_authorization_id];
    case 'FIX_PREPARED_V1': return [record.record_type, record.fix_preparation_id];
    case 'STAGE_VERIFICATION_V1': return [record.record_type, record.verification_id];
    case 'STAGE_CLOSED_V1': return [record.record_type, record.closure_id];
    default: fail('unsupported record_type identity');
  }
}

export function structurallyEqual(left, right) {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((item, index) => structurallyEqual(item, right[index]));
  }
  if (!isPlainObject(left) || !isPlainObject(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key) => Object.hasOwn(right, key) && structurallyEqual(left[key], right[key]));
}

export function reduceTypedRecords(records) {
  const byIdentity = new Map();
  for (const record of records) {
    if (DECISION_TYPES.has(record?.record_type)) validateDecisionRecord(record);
    else validateMechanicalRecord(record);
    const identity = typedRecordIdentity(record);
    const key = JSON.stringify(identity);
    const existing = byIdentity.get(key);
    if (existing && !structurallyEqual(existing, record)) fail(`conflicting record payload for ${identity.join('/')}`);
    if (!existing) byIdentity.set(key, record);
  }
  return byIdentity;
}

export function parseLifecycleComments(comments) {
  const records = [];
  const reviewHandoffs = [];
  const fixHandoffs = [];
  const errors = [];
  for (const comment of comments) {
    const body = typeof comment === 'string' ? comment : comment?.body;
    if (typeof body !== 'string') continue;
    for (const [marker, parse, target] of [
      [DECISION_MARKER, parseDecisionRecord, records],
      [MECHANICAL_MARKER, parseMechanicalRecord, records],
      [REVIEW_HANDOFF_MARKER, parseReviewHandoff, reviewHandoffs],
      [FIX_HANDOFF_MARKER, parseFixDispatchHandoff, fixHandoffs],
    ]) {
      if (!body.includes(marker)) continue;
      try {
        target.push(parse(body));
      } catch (error) {
        errors.push({ marker, message: error.message });
      }
    }
  }
  let reduced = new Map();
  try {
    reduced = reduceTypedRecords(records);
  } catch (error) {
    errors.push({ marker: null, message: error.message });
  }
  return { records, reduced, reviewHandoffs, fixHandoffs, errors };
}
