#!/usr/bin/env node
import { access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CodexLauncher } from './codex.mjs';
import { BridgeController } from './controller.mjs';
import { BridgeError } from './errors.mjs';
import { GitRepository, defaultWorktreeRoot } from './git.mjs';
import { GitHubClient } from './github.mjs';
import { inspectCodexCapability } from './model-router.mjs';

function usage() {
  return 'usage: node tools/codex-github-bridge/cli.mjs <start|run-once> [--repository OWNER/REPO] [--repository-path PATH] [--worktree-root PATH] [--gh-bin PATH] [--codex-bin PATH]';
}

export function parseArgs(argv) {
  const [mode, ...rest] = argv;
  if (!['start', 'run-once'].includes(mode)) throw new Error(usage());
  const options = { mode };
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    const field = {
      '--repository': 'repository',
      '--repository-path': 'repositoryPath',
      '--worktree-root': 'worktreeRoot',
      '--gh-bin': 'ghBin',
      '--codex-bin': 'codexBin',
    }[key];
    if (!field || index + 1 >= rest.length) throw new Error(usage());
    options[field] = rest[++index];
  }
  return options;
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
  const repository = options.repository ?? await github.currentRepository(repositoryRoot);
  const codexBin = await resolveCodexExecutable(options.codexBin);
  const capability = dependencies.capability ?? await inspectCodexCapability({ codexBin });
  const git = dependencies.git ?? new GitRepository({ repositoryRoot, worktreeRoot });
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
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    const status = error instanceof BridgeError ? error.status : 'blocked';
    process.stderr.write(`${JSON.stringify({ status, error: error.message })}\n`);
    process.exitCode = status === 'needs_decision' ? 2 : 1;
  }
}
