import assert from 'node:assert/strict';
import test from 'node:test';
import { extractProposal, assertSddReady } from '../src/ui/proposal.ts';

test('proposal keeps prose separate from validated execution details and retains invalid drafts for correction', () => {
  const details = { requirements: ['Expected behavior'], non_goals: [], architecture_decisions: [], scope: ['src/example.ts'], constraints: [], acceptance_criteria: ['The behavior is verified'], verification: [{ command: 'npm test', detects: 'Behavior regression', decision_if_failed: 'Fix before review' }], documentation_updates: [], question_policy: 'Ask before scope changes' };
  const complete = extractProposal('Readable plan\n\n```json\n' + JSON.stringify({ room_task: details }) + '\n```');
  assert.equal(complete.text, 'Readable plan');
  assert.deepEqual(complete.details, details);
  const incomplete = 'Draft\n```json\n{"room_task":{"scope":[]}}\n```';
  assert.deepEqual(extractProposal(incomplete), { text: incomplete, details: null });
});

test('SDD execution requires specification, design and implementation tasks with resolvable dependencies', () => {
  assert.throws(() => assertSddReady(undefined), /规格/);
  const sdd = { specification: 'Confirmed project behavior and acceptance scenarios', technical_design: 'Module and interface design',
    tasks: [{ id: 'behavior', title: 'Implement behavior', modules: ['src/example.ts'], dependencies: [], acceptance: ['Expected result'], tests: ['Verify the result'] }] };
  assert.doesNotThrow(() => assertSddReady(sdd));
  assert.throws(() => assertSddReady({ ...sdd, technical_design: '' }), /技术设计/);
  assert.throws(() => assertSddReady({ ...sdd, tasks: [{ ...sdd.tasks[0], dependencies: ['missing'] }] }), /依赖/);
});
