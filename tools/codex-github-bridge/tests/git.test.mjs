import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { GitRepository } from '../git.mjs';

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();
}

async function fixture() {
  const owner = await mkdtemp(join(tmpdir(), 'codex-bridge-git-'));
  const remote = join(owner, 'remote.git');
  const repository = join(owner, 'repository');
  const worktrees = join(owner, 'worktrees');
  await mkdir(repository);
  git(owner, 'init', '--bare', remote);
  git(repository, 'init', '-b', 'stage/test');
  git(repository, 'config', 'user.email', 'bridge@example.test');
  git(repository, 'config', 'user.name', 'Bridge Test');
  await writeFile(join(repository, 'shared.txt'), 'base\n');
  git(repository, 'add', 'shared.txt');
  git(repository, 'commit', '-m', 'chore: establish baseline');
  git(repository, 'remote', 'add', 'origin', remote);
  git(repository, 'push', '-u', 'origin', 'stage/test');
  return { owner, remote, repository, worktrees, baseSha: git(repository, 'rev-parse', 'HEAD') };
}

const task = (id, branch, owns = ['owned/**']) => ({
  task_id: id,
  task_branch: branch,
  stage_branch: 'stage/test',
  owns,
});

test('creates isolated task worktrees from one immutable Stage base', async () => {
  const data = await fixture();
  try {
    const repository = new GitRepository({ repositoryRoot: data.repository, worktreeRoot: data.worktrees });
    const a = await repository.ensureTaskWorktree(task('A', 'task/test/A'), data.baseSha);
    const b = await repository.ensureTaskWorktree(task('B', 'task/test/B'), data.baseSha);
    assert.notEqual(a, b);
    assert.equal(await repository.head(a), data.baseSha);
    assert.equal(await repository.head(b), data.baseSha);
    assert.equal(await repository.currentBranch(a), 'task/test/A');
    assert.equal(await repository.currentBranch(b), 'task/test/B');
  } finally {
    await rm(data.owner, { recursive: true, force: true });
  }
});

test('collects actual Git facts, gates owned files, and records cherry-pick mapping', async () => {
  const data = await fixture();
  try {
    const repository = new GitRepository({ repositoryRoot: data.repository, worktreeRoot: data.worktrees });
    const selected = task('A', 'task/test/A');
    const worktree = await repository.ensureTaskWorktree(selected, data.baseSha);
    git(worktree, 'config', 'user.email', 'bridge@example.test');
    git(worktree, 'config', 'user.name', 'Bridge Test');
    await mkdir(join(worktree, 'owned'));
    await writeFile(join(worktree, 'owned', 'result.txt'), 'candidate\n');
    git(worktree, 'add', 'owned/result.txt');
    git(worktree, 'commit', '-m', 'feat(bridge): add candidate');

    const facts = await repository.collectTaskFacts(selected, worktree, data.baseSha);
    await repository.mechanicalGate(selected, facts);
    assert.equal(facts.parentSha, data.baseSha);
    assert.deepEqual(facts.actualChangedFiles, ['owned/result.txt']);

    await repository.pushTask(selected, worktree);
    const integration = await repository.integrate(data.repository, selected, facts.taskHeadSha);
    assert.equal(integration.status, 'integrated');
    assert.equal(integration.sourceTaskSha, facts.taskHeadSha);
    assert.equal(git(data.repository, 'rev-parse', 'HEAD'), integration.stageCommitSha);
    assert.equal(git(data.repository, 'rev-parse', `${integration.stageCommitSha}^`), data.baseSha);
  } finally {
    await rm(data.owner, { recursive: true, force: true });
  }
});

test('aborts a conflicting cherry-pick and returns blocked with a clean Stage worktree', async () => {
  const data = await fixture();
  try {
    const repository = new GitRepository({ repositoryRoot: data.repository, worktreeRoot: data.worktrees });
    const selected = task('A', 'task/test/A', ['shared.txt']);
    const worktree = await repository.ensureTaskWorktree(selected, data.baseSha);
    git(worktree, 'config', 'user.email', 'bridge@example.test');
    git(worktree, 'config', 'user.name', 'Bridge Test');
    await writeFile(join(worktree, 'shared.txt'), 'task\n');
    git(worktree, 'add', 'shared.txt');
    git(worktree, 'commit', '-m', 'fix(bridge): change task side');
    const sourceTaskSha = git(worktree, 'rev-parse', 'HEAD');

    await writeFile(join(data.repository, 'shared.txt'), 'stage\n');
    git(data.repository, 'add', 'shared.txt');
    git(data.repository, 'commit', '-m', 'fix(stage): change stage side');
    const stageBefore = git(data.repository, 'rev-parse', 'HEAD');

    const integration = await repository.integrate(data.repository, selected, sourceTaskSha);
    assert.equal(integration.status, 'blocked');
    assert.equal(git(data.repository, 'rev-parse', 'HEAD'), stageBefore);
    assert.equal(git(data.repository, 'status', '--porcelain'), '');
  } finally {
    await rm(data.owner, { recursive: true, force: true });
  }
});
