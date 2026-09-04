import { needsDecision } from './errors.mjs';
import { runChecked, runProcess } from './process.mjs';

const MODEL_POLICIES = Object.freeze({
  coding_strong: 'gpt-5.6-sol',
  fast_general: 'gpt-5.6-luna',
});

const SUPPORTED_EFFORTS = new Set(['low', 'medium', 'high']);

function allStrings(value, result = new Set()) {
  if (typeof value === 'string') result.add(value);
  else if (Array.isArray(value)) value.forEach((item) => allStrings(item, result));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => allStrings(item, result));
  return result;
}

export async function inspectCodexCapability({ codexBin = 'codex', run = runProcess } = {}) {
  let version;
  let rootHelp;
  let execHelp;
  let modelsHelp;
  let catalogResult;
  try {
    version = await runChecked(run, codexBin, ['--version']);
    rootHelp = await runChecked(run, codexBin, ['--help']);
    execHelp = await runChecked(run, codexBin, ['--ask-for-approval', 'never', 'exec', '--help']);
    modelsHelp = await runChecked(run, codexBin, ['debug', 'models', '--help']);
    catalogResult = await runChecked(run, codexBin, ['debug', 'models']);
  } catch (error) {
    throw needsDecision(`Local Codex capability inspection failed: ${error.message}`);
  }

  const requiredExecFlags = ['--model', '--config', '--output-last-message', '--output-schema', '--sandbox'];
  const missingFlags = requiredExecFlags.filter((flag) => !execHelp.stdout.includes(flag));
  if (missingFlags.length > 0) {
    throw needsDecision(`Local Codex exec is missing required supported flags: ${missingFlags.join(', ')}`);
  }
  if (!modelsHelp.stdout.includes('--bundled') && !modelsHelp.stdout.includes('model catalog')) {
    throw needsDecision('Local Codex does not expose the supported model catalog inspection command');
  }
  if (!rootHelp.stdout.includes('--ask-for-approval')) {
    throw needsDecision('Local Codex root command does not support the non-interactive approval policy flag');
  }

  let catalog;
  try {
    catalog = JSON.parse(catalogResult.stdout);
  } catch (error) {
    throw needsDecision(`Local Codex model catalog is not valid JSON: ${error.message}`);
  }

  return {
    inspected: true,
    version: version.stdout.trim(),
    models: allStrings(catalog),
    modelEfforts: new Map((catalog.models ?? []).filter((item) => typeof item?.slug === 'string').map((item) => [
      item.slug,
      new Set((item.supported_reasoning_levels ?? []).map((level) => level?.effort).filter((effort) => typeof effort === 'string')),
    ])),
  };
}

function modelForPolicy(policy) {
  return MODEL_POLICIES[policy] ?? null;
}

export function resolveModel(task, capability) {
  if (!SUPPORTED_EFFORTS.has(task.reasoning_effort)) {
    throw needsDecision(`unsupported reasoning effort: ${task.reasoning_effort}`);
  }

  const primary = modelForPolicy(task.model_policy);
  if (!primary) throw needsDecision(`unknown model policy: ${task.model_policy}`);
  if (capability.models.has(primary)) {
    const efforts = capability.modelEfforts?.get(primary);
    if (efforts?.size > 0 && !efforts.has(task.reasoning_effort)) {
      throw needsDecision(`model ${primary} does not support reasoning effort ${task.reasoning_effort}`);
    }
    return { modelPolicy: task.model_policy, resolvedModel: primary, reasoningEffort: task.reasoning_effort, fallbackUsed: false };
  }

  const fallbackPolicy = task.fallback_model_policy;
  if (typeof fallbackPolicy === 'string' && fallbackPolicy.length > 0) {
    const fallback = modelForPolicy(fallbackPolicy);
    if (!fallback) throw needsDecision(`unknown fallback model policy: ${fallbackPolicy}`);
    if (capability.models.has(fallback)) {
      const efforts = capability.modelEfforts?.get(fallback);
      if (efforts?.size > 0 && !efforts.has(task.reasoning_effort)) {
        throw needsDecision(`fallback model ${fallback} does not support reasoning effort ${task.reasoning_effort}`);
      }
      return { modelPolicy: fallbackPolicy, resolvedModel: fallback, reasoningEffort: task.reasoning_effort, fallbackUsed: true };
    }
  }

  throw needsDecision(`model policy ${task.model_policy} cannot resolve to an available Local Codex model and no usable fallback is declared`);
}

export function codexExecArgs({ worktree, model, reasoningEffort, lastMessagePath, outputSchemaPath = null, sandbox = 'workspace-write' }) {
  const args = [
    '--ask-for-approval', 'never',
    'exec',
    '--cd', worktree,
    '--model', model,
    '--config', `model_reasoning_effort="${reasoningEffort}"`,
    '--sandbox', sandbox,
    '--output-last-message', lastMessagePath,
  ];
  if (outputSchemaPath) args.push('--output-schema', outputSchemaPath);
  args.push('-');
  return args;
}
