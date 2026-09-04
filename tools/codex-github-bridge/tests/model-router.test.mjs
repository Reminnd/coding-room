import assert from 'node:assert/strict';
import test from 'node:test';
import { codexExecArgs, inspectCodexCapability, resolveModel } from '../model-router.mjs';

function fakeCodex(models = ['gpt-5.6-sol']) {
  return async (_command, args) => {
    const key = args.join(' ');
    if (key === '--version') return { exitCode: 0, stdout: 'codex-cli 1.2.3\n', stderr: '', error: null };
    if (key === '--help') return { exitCode: 0, stdout: '--ask-for-approval\n', stderr: '', error: null };
    if (key === '--ask-for-approval never exec --help') return { exitCode: 0, stdout: '--model --config --output-last-message --output-schema --sandbox\n', stderr: '', error: null };
    if (key === 'debug models --help') return { exitCode: 0, stdout: 'Print model catalog --bundled\n', stderr: '', error: null };
    if (key === 'debug models') return { exitCode: 0, stdout: JSON.stringify({ models: models.map((slug) => ({ slug, supported_reasoning_levels: [{ effort: 'low' }, { effort: 'medium' }, { effort: 'high' }] })) }), stderr: '', error: null };
    throw new Error(`unexpected command: ${key}`);
  };
}

test('inspects the actual supported CLI surface and resolves an available policy', async () => {
  const capability = await inspectCodexCapability({ run: fakeCodex() });
  const result = resolveModel({ model_policy: 'coding_strong', reasoning_effort: 'high', fallback_model_policy: null }, capability);
  assert.deepEqual(result, {
    modelPolicy: 'coding_strong', resolvedModel: 'gpt-5.6-sol', reasoningEffort: 'high', fallbackUsed: false,
  });
});

test('does not silently fall back when the requested model is unavailable', async () => {
  const capability = await inspectCodexCapability({ run: fakeCodex(['gpt-5.6-luna']) });
  assert.throws(
    () => resolveModel({ model_policy: 'coding_strong', reasoning_effort: 'high', fallback_model_policy: null }, capability),
    (error) => error.status === 'needs_decision' && /no usable fallback/.test(error.message),
  );
  assert.equal(
    resolveModel({ model_policy: 'coding_strong', reasoning_effort: 'high', fallback_model_policy: 'fast_general' }, capability).resolvedModel,
    'gpt-5.6-luna',
  );
});

test('builds only documented non-interactive model and reasoning overrides', () => {
  assert.deepEqual(codexExecArgs({
    worktree: 'C:\\work', model: 'gpt-5.6-sol', reasoningEffort: 'high', lastMessagePath: 'C:\\last.txt', outputSchemaPath: 'C:\\schema.json',
  }), [
    '--ask-for-approval', 'never', 'exec', '--cd', 'C:\\work', '--model', 'gpt-5.6-sol',
    '--config', 'model_reasoning_effort="high"', '--sandbox', 'workspace-write',
    '--output-last-message', 'C:\\last.txt', '--output-schema', 'C:\\schema.json', '-',
  ]);
});

test('missing Local Codex executable becomes needs_decision', async () => {
  await assert.rejects(
    inspectCodexCapability({ run: async () => ({ exitCode: null, stdout: '', stderr: '', error: new Error('ENOENT') }) }),
    (error) => error.status === 'needs_decision' && /inspection failed/.test(error.message),
  );
});
