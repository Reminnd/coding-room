#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CodexLauncher, SupervisorOnlyLauncher } from './codex.mjs';
import { BridgeController, SupervisorOnlyController } from './controller.mjs';
import { BridgeError, needsDecision } from './errors.mjs';
import { GitRepository, defaultWorktreeRoot } from './git.mjs';
import { GitHubClient } from './github.mjs';
import { LifecycleController, preMutationFailure } from './lifecycle.mjs';
import { inspectCodexCapability } from './model-router.mjs';
import { ACCEPTANCE_RECORD_TYPES, parseStrictJsonObject } from './structured-records.mjs';

const EXECUTION_MODES = new Set(['bootstrap', 'start', 'run-once']);
const LIFECYCLE_MODES = new Set(['record-review', 'prepare-fix', 'record-acceptance', 'close-stage']);
const SUPERVISOR_ONLY_MODE = 'supervise-only';

function usage() {
  return 'usage: node tools/codex-github-bridge/cli.mjs <bootstrap|start|run-once|supervise-only|record-review|prepare-fix|record-acceptance|close-stage> [--phase plan|execute] [--request-file PATH|-] [--approved-plan-file PATH|-] [--repository OWNER/REPO] [--repository-path PATH] [--worktree-root PATH] [--gh-bin PATH] [--codex-bin PATH] [--input PATH|-] [--record-type FIX_BUNDLE_ACCEPTANCE_V1|STAGE_ACCEPTANCE_V1]';
}

export function parseArgs(argv) {
  const [mode, ...rest] = argv;
  if (!EXECUTION_MODES.has(mode) && !LIFECYCLE_MODES.has(mode) && mode !== SUPERVISOR_ONLY_MODE) throw new Error(usage());
  const options = { mode };
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    const field = {
      '--repository': 'repository',
      '--repository-path': 'repositoryPath',
      '--worktree-root': 'worktreeRoot',
      '--gh-bin': 'ghBin',
      '--codex-bin': 'codexBin',
      '--input': 'inputPath',
      '--record-type': 'recordType',
      '--phase': 'phase',
      '--request-file': 'requestFile',
      '--approved-plan-file': 'approvedPlanFile',
    }[key];
    if (!field || index + 1 >= rest.length) throw new Error(usage());
    options[field] = rest[++index];
  }
  if (LIFECYCLE_MODES.has(mode) && !options.inputPath) throw preMutationFailure(`${mode} requires --input PATH|-`);
  if (mode === 'record-acceptance' && !ACCEPTANCE_RECORD_TYPES.includes(options.recordType)) {
    throw preMutationFailure('record-acceptance requires --record-type FIX_BUNDLE_ACCEPTANCE_V1 or STAGE_ACCEPTANCE_V1');
  }
  if (mode !== 'record-acceptance' && options.recordType !== undefined) throw preMutationFailure('--record-type is valid only for record-acceptance');
  if (mode === SUPERVISOR_ONLY_MODE) {
    if (!['plan', 'execute'].includes(options.phase)) throw preMutationFailure('supervise-only requires --phase plan or execute');
    if (!options.codexBin || !isAbsolute(options.codexBin)) throw preMutationFailure('supervise-only requires an explicit absolute --codex-bin');
    if (options.phase === 'plan' && (!options.requestFile || options.approvedPlanFile !== undefined)) {
      throw preMutationFailure('supervise-only plan requires --request-file PATH|- only');
    }
    if (options.phase === 'execute' && (!options.approvedPlanFile || options.requestFile !== undefined)) {
      throw preMutationFailure('supervise-only execute requires --approved-plan-file PATH|- only');
    }
    if (options.inputPath !== undefined || options.recordType !== undefined) {
      throw preMutationFailure('--input and --record-type are not valid for supervise-only');
    }
  } else if (options.phase !== undefined || options.requestFile !== undefined || options.approvedPlanFile !== undefined) {
    throw preMutationFailure('--phase, --request-file, and --approved-plan-file are valid only for supervise-only');
  }
  return options;
}

async function readStandardInput() {
  let value = '';
  for await (const chunk of process.stdin) value += chunk;
  return value;
}

async function readInputPath(path, dependencies) {
  if (dependencies.readInput) return dependencies.readInput(path);
  return path === '-' ? readStandardInput() : readFile(resolve(path), 'utf8');
}

async function readStrictInput(path, dependencies, label) {
  try {
    return parseStrictJsonObject(await readInputPath(path, dependencies));
  } catch (error) {
    throw preMutationFailure(`${label} is invalid: ${error.message}`);
  }
}

export async function resolveCodexExecutable(explicitPath) {
  if (explicitPath) return explicitPath;
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    const installed = join(process.env.LOCALAPPDATA, 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe');
    try {
      await access(installed);
      return installed;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return 'codex';
}

export async function main(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseArgs(argv);
  const repositoryRoot = resolve(options.repositoryPath ?? process.cwd());
  const worktreeRoot = resolve(options.worktreeRoot ?? defaultWorktreeRoot(repositoryRoot));
  const github = dependencies.github ?? new GitHubClient({ ghBin: options.ghBin ?? 'gh' });
  const writeOutput = dependencies.writeOutput ?? ((value) => process.stdout.write(value));
  const git = dependencies.git ?? new GitRepository({ repositoryRoot, worktreeRoot });
  try {
    await git.repositoryOrigin();
  } catch (error) {
    throw needsDecision(`local repository/origin prerequisite failed: ${error.message}`);
  }
  const repository = options.repository ?? await github.currentRepository(repositoryRoot);
  if (options.repository) await github.assertRepositoryAccess(repository, repositoryRoot);

  if (options.mode === 'bootstrap') {
    const result = await github.bootstrapActions(repository);
    writeOutput(`${JSON.stringify(result)}\n`);
    return result;
  }

  if (options.mode === SUPERVISOR_ONLY_MODE) {
    const inputPath = options.phase === 'plan' ? options.requestFile : options.approvedPlanFile;
    const input = await readStrictInput(inputPath, dependencies, `supervise-only ${options.phase} input`);
    let canonicalCodexExecutable;
    try {
      const canonicalize = dependencies.canonicalizeCodexExecutable ?? (async (path) => {
        await access(path);
        return path;
      });
      canonicalCodexExecutable = await canonicalize(resolve(options.codexBin));
    } catch (error) {
      throw preMutationFailure(`supervise-only Codex executable is unavailable: ${error.message}`);
    }
    const baseLauncher = dependencies.launcher ?? new CodexLauncher({ codexBin: canonicalCodexExecutable });
    const launcher = dependencies.supervisorOnlyLauncher ?? new SupervisorOnlyLauncher({
      launcher: baseLauncher,
      canonicalCodexExecutable,
      worktree: repositoryRoot,
    });
    const controller = dependencies.supervisorOnlyController ?? new SupervisorOnlyController({
      repository,
      repositoryRoot,
      github,
      git,
      launcher,
      canonicalCodexExecutable,
    });
    const result = options.phase === 'plan' ? await controller.plan(input) : await controller.execute(input);
    writeOutput(`${JSON.stringify(result)}\n`);
    return result;
  }

  if (LIFECYCLE_MODES.has(options.mode)) {
    const inputText = await readInputPath(options.inputPath, dependencies);
    let input;
    try {
      input = parseStrictJsonObject(inputText);
    } catch (error) {
      throw preMutationFailure(`lifecycle command input is invalid: ${error.message}`);
    }
    const lifecycle = dependencies.lifecycle ?? new LifecycleController({
      repository,
      github,
      git,
      hostApproval: dependencies.hostApproval,
    });
    const result = options.mode === 'record-review'
      ? await lifecycle.recordReview(input)
      : options.mode === 'prepare-fix'
        ? await lifecycle.prepareFix(input)
        : options.mode === 'record-acceptance'
          ? await lifecycle.recordAcceptance(options.recordType, input)
          : await lifecycle.closeStage(input);
    writeOutput(`${JSON.stringify(result)}\n`);
    return result;
  }

  await github.assertActionsReady(repository);
  const codexBin = await resolveCodexExecutable(options.codexBin);
  const capability = dependencies.capability ?? await inspectCodexCapability({ codexBin });
  const launcher = dependencies.launcher ?? new CodexLauncher({ codexBin });
  const controller = dependencies.controller ?? new BridgeController({
    repository,
    repositoryRoot,
    worktreeRoot,
    github,
    git,
    launcher,
    capability,
  });
  const result = await controller.run(options.mode);
  writeOutput(`${JSON.stringify(result)}\n`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    const status = error instanceof BridgeError ? error.status : 'blocked';
    process.stderr.write(`${JSON.stringify({ status, error: error.message, ...(error.details ?? {}) })}\n`);
    process.exitCode = status === 'needs_decision' ? 2 : 1;
  }
}
