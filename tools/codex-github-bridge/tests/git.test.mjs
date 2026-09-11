import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { GitRepository } from '../git.mjs';
import { runProcess } from '../process.mjs';

function gitRaw(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
}

function git(cwd, ...args) {
  return gitRaw(cwd, ...args).trim();
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
    const remoteReads = [];
    const candidateWrites = [];
    const run = async (command, args, options) => {
      if (command === 'git' && args[0] === 'ls-remote') remoteReads.push(args);
      if (command === 'git' && (args[0] === 'add' || args[0] === 'commit')) candidateWrites.push(args);
      return runProcess(command, args, options);
    };
    const repository = new GitRepository({ repositoryRoot: data.repository, worktreeRoot: data.worktrees, run });
    assert.equal(await repository.repositoryOrigin(), data.remote);
    const selected = task('A', 'task/test/A');
    const worktree = await repository.ensureTaskWorktree(selected, data.baseSha);
    git(worktree, 'config', 'user.email', 'bridge@example.test');
    git(worktree, 'config', 'user.name', 'Bridge Test');
    await mkdir(join(worktree, 'owned'));
    await writeFile(join(worktree, 'owned', 'result.txt'), 'candidate\n');
    const working = await repository.observeWorkingTree(worktree);
    assert.equal(working.head, data.baseSha);
    assert.equal(working.branch, 'task/test/A');
    assert.deepEqual(working.stagedPaths, []);
    assert.deepEqual(working.workingPaths, ['owned/result.txt']);
    await repository.createCandidateCommit(selected, worktree, working.workingPaths);
    assert.equal(git(worktree, 'log', '-1', '--pretty=%s'), 'chore(task): complete A');

    const facts = await repository.collectTaskFacts(selected, worktree, data.baseSha);
    await repository.mechanicalGate(selected, facts);
    assert.equal(facts.parentSha, data.baseSha);
    assert.deepEqual(facts.actualChangedFiles, ['owned/result.txt']);
    assert.equal(facts.worktreeStatus, '');
    assert.deepEqual(candidateWrites, [
      ['add', '--', 'owned/result.txt'],
      ['commit', '-m', 'chore(task): complete A'],
    ]);

    await repository.pushTask(selected, worktree, facts.taskHeadSha);
    const integration = await repository.integrate(data.repository, selected, facts.taskHeadSha);
    assert.equal(integration.status, 'integrated');
    assert.equal(integration.sourceTaskSha, facts.taskHeadSha);
    assert.equal(git(data.repository, 'rev-parse', 'HEAD'), integration.stageCommitSha);
    assert.equal(git(data.repository, 'rev-parse', `${integration.stageCommitSha}^`), data.baseSha);
    assert.equal(git(data.owner, '--git-dir', data.remote, 'rev-parse', 'refs/heads/task/test/A'), facts.taskHeadSha);
    assert.equal(git(data.owner, '--git-dir', data.remote, 'rev-parse', 'refs/heads/stage/test'), integration.stageCommitSha);
    assert.equal(await repository.remoteBranchHead('task/test/A'), facts.taskHeadSha);
    assert.equal(await repository.commitExists(integration.stageCommitSha), true);
    assert.equal(await repository.commitExists('0000000000000000000000000000000000000000'), false);
    assert.equal(await repository.isAncestor(integration.stageCommitSha, integration.stageCommitSha), true);
    assert.deepEqual(await repository.changedFiles(integration.stageCommitSha), ['owned/result.txt']);
    assert.deepEqual(remoteReads, [
      ['ls-remote', '--refs', 'origin', 'refs/heads/task/test/A'],
      ['ls-remote', '--refs', 'origin', 'refs/heads/stage/test'],
      ['ls-remote', '--refs', 'origin', 'refs/heads/task/test/A'],
    ]);
  } finally {
    await rm(data.owner, { recursive: true, force: true });
  }
});

test('observes tracked unstaged and ordinary untracked paths as one working set', async () => {
  const data = await fixture();
  try {
    const repository = new GitRepository({ repositoryRoot: data.repository, worktreeRoot: data.worktrees });
    const selected = task('A', 'task/test/A', ['shared.txt', 'owned/**']);
    const worktree = await repository.ensureTaskWorktree(selected, data.baseSha);
    await writeFile(join(worktree, 'shared.txt'), 'changed\n');
    await mkdir(join(worktree, 'owned'));
    await writeFile(join(worktree, 'owned', 'new.txt'), 'new\n');

    const observed = await repository.observeWorkingTree(worktree);
    assert.deepEqual(observed.stagedPaths, []);
    assert.deepEqual(observed.workingPaths, ['owned/new.txt', 'shared.txt']);
  } finally {
    await rm(data.owner, { recursive: true, force: true });
  }
});

test('blocks Controller commit when staged paths do not exactly match verified paths', async () => {
  const data = await fixture();
  try {
    const repository = new GitRepository({ repositoryRoot: data.repository, worktreeRoot: data.worktrees });
    const selected = task('A', 'task/test/A', ['shared.txt', 'owned/**']);
    const worktree = await repository.ensureTaskWorktree(selected, data.baseSha);
    git(worktree, 'config', 'user.email', 'bridge@example.test');
    git(worktree, 'config', 'user.name', 'Bridge Test');
    await writeFile(join(worktree, 'shared.txt'), 'staged elsewhere\n');
    git(worktree, 'add', 'shared.txt');
    await mkdir(join(worktree, 'owned'));
    await writeFile(join(worktree, 'owned', 'result.txt'), 'candidate\n');

    await assert.rejects(
      repository.createCandidateCommit(selected, worktree, ['owned/result.txt']),
      (error) => error.status === 'blocked' && /staged paths do not match/.test(error.message),
    );
    assert.equal(git(worktree, 'rev-parse', 'HEAD'), data.baseSha);
  } finally {
    await rm(data.owner, { recursive: true, force: true });
  }
});

test('cached diff check failure blocks before commit', async () => {
  const data = await fixture();
  try {
    const repository = new GitRepository({ repositoryRoot: data.repository, worktreeRoot: data.worktrees });
    const selected = task('A', 'task/test/A');
    const worktree = await repository.ensureTaskWorktree(selected, data.baseSha);
    git(worktree, 'config', 'user.email', 'bridge@example.test');
    git(worktree, 'config', 'user.name', 'Bridge Test');
    await mkdir(join(worktree, 'owned'));
    await writeFile(join(worktree, 'owned', 'result.txt'), 'trailing whitespace  \n');

    await assert.rejects(
      repository.createCandidateCommit(selected, worktree, ['owned/result.txt']),
      (error) => error.status === 'blocked' && /cached diff check failed/.test(error.message),
    );
    assert.equal(git(worktree, 'rev-parse', 'HEAD'), data.baseSha);
  } finally {
    await rm(data.owner, { recursive: true, force: true });
  }
});

test('candidate commit failure is attempted exactly once without retry', async () => {
  const data = await fixture();
  try {
    let commitCalls = 0;
    const run = async (command, args, options) => {
      if (command === 'git' && args[0] === 'commit') {
        commitCalls += 1;
        return { command, args, exitCode: 1, signal: null, stdout: '', stderr: 'commit rejected', error: null };
      }
      return runProcess(command, args, options);
    };
    const repository = new GitRepository({ repositoryRoot: data.repository, worktreeRoot: data.worktrees, run });
    const selected = task('A', 'task/test/A');
    const worktree = await repository.ensureTaskWorktree(selected, data.baseSha);
    await mkdir(join(worktree, 'owned'));
    await writeFile(join(worktree, 'owned', 'result.txt'), 'candidate\n');

    await assert.rejects(
      repository.createCandidateCommit(selected, worktree, ['owned/result.txt']),
      (error) => error.status === 'blocked' && /candidate commit failed: commit rejected/.test(error.message),
    );
    assert.equal(commitCalls, 1);
    assert.equal(git(worktree, 'rev-parse', 'HEAD'), data.baseSha);
  } finally {
    await rm(data.owner, { recursive: true, force: true });
  }
});

test('blocks a task delivery when the exact remote ref does not equal the pushed candidate', async () => {
  const data = await fixture();
  try {
    const remoteReads = [];
    const run = async (command, args, options) => {
      const result = await runProcess(command, args, options);
      if (command === 'git' && args[0] === 'push' && args.at(-1) === 'task/test/A:task/test/A' && result.exitCode === 0) {
        git(data.owner, '--git-dir', data.remote, 'update-ref', 'refs/heads/task/test/A', data.baseSha);
      }
      if (command === 'git' && args[0] === 'ls-remote') remoteReads.push(args);
      return result;
    };
    const repository = new GitRepository({ repositoryRoot: data.repository, worktreeRoot: data.worktrees, run });
    const selected = task('A', 'task/test/A');
    const worktree = await repository.ensureTaskWorktree(selected, data.baseSha);
    git(worktree, 'config', 'user.email', 'bridge@example.test');
    git(worktree, 'config', 'user.name', 'Bridge Test');
    await mkdir(join(worktree, 'owned'));
    await writeFile(join(worktree, 'owned', 'result.txt'), 'candidate\n');
    git(worktree, 'add', 'owned/result.txt');
    git(worktree, 'commit', '-m', 'feat(bridge): add candidate');
    const taskHeadSha = git(worktree, 'rev-parse', 'HEAD');

    await assert.rejects(
      repository.pushTask(selected, worktree, taskHeadSha),
      (error) => error.status === 'blocked' && error.message.includes(`expected ${taskHeadSha}`),
    );
    assert.deepEqual(remoteReads, [['ls-remote', '--refs', 'origin', 'refs/heads/task/test/A']]);
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

test('reads exact accepted blob bytes and observes an existing candidate with read-only Git commands', async () => {
  const data = await fixture();
  try {
    const commands = [];
    const run = async (command, args, options) => {
      commands.push(args);
      return runProcess(command, args, options);
    };
    const repository = new GitRepository({ repositoryRoot: data.repository, worktreeRoot: data.worktrees, run });
    const blobSha = git(data.repository, 'rev-parse', `${data.baseSha}:shared.txt`);
    const blob = await repository.readBlobAtCommit(data.baseSha, 'shared.txt', blobSha);
    assert.equal(blob.blobSha, blobSha);
    assert.equal(blob.bytes.toString('utf8'), 'base\n');
    await assert.rejects(
      repository.readBlobAtCommit(data.baseSha, 'shared.txt', '0000000000000000000000000000000000000000'),
      (error) => error.status === 'needs_decision' && error.details.failure_class === 'PRE_MUTATION_FAILURE',
    );

    await writeFile(join(data.repository, 'shared.txt'), 'candidate\n');
    git(data.repository, 'add', 'shared.txt');
    git(data.repository, 'commit', '-m', 'test: create candidate');
    const candidateSha = git(data.repository, 'rev-parse', 'HEAD');
    commands.length = 0;
    const observed = await repository.observeSupervisorOnlyCandidate(data.repository, data.baseSha);
    assert.equal(observed.head, candidateSha);
    assert.equal(observed.branch, 'stage/test');
    assert.equal(observed.status, '');
    assert.equal(observed.commitExists, true);
    assert.deepEqual(observed.parents, [data.baseSha]);
    assert.deepEqual(observed.stagedPaths, []);
    assert.deepEqual(observed.unstagedPaths, []);
    assert.deepEqual(observed.untrackedPaths, []);
    assert.deepEqual(observed.changedFiles, ['shared.txt']);
    assert.equal(observed.diffCheckPassed, true);
    assert.equal(commands.some((args) => ['fetch', 'add', 'commit', 'amend', 'push'].includes(args[0])), false);
  } finally {
    await rm(data.owner, { recursive: true, force: true });
  }
});

for (const [messageCase, commitMessage] of [
  ['subject only', 'chore(fix): prepare round-1'],
  ['one-line body', 'chore(fix): prepare round-1\n\nPrepared fix body.'],
  ['multiline body', 'chore(fix): prepare round-1\n\nFirst body line.\nSecond body line.'],
]) {
  test(`materializes and recovers one exact prepared Fix commit with ${messageCase}`, async () => {
    const data = await fixture();
    try {
      const repository = new GitRepository({ repositoryRoot: data.repository, worktreeRoot: data.worktrees });
      const files = { 'prepared/router.md': 'exact router bytes\n', 'prepared/task.md': 'exact task bytes\n' };
      const created = await repository.materializePreparedFix({
        stageBranch: 'stage/test', sourceStageSha: data.baseSha, files, commitMessage,
      });
      assert.equal(created.status, 'created');
      assert.notEqual(created.preparedStageSha, data.baseSha);
      assert.equal(gitRaw(data.repository, 'log', '-1', '--pretty=format:%B', created.preparedStageSha), `${commitMessage}\n`);
      assert.equal(git(data.repository, 'rev-parse', `${created.preparedStageSha}^`), data.baseSha);
      assert.deepEqual(git(data.repository, 'diff-tree', '--no-commit-id', '--name-only', '-r', created.preparedStageSha).split(/\r?\n/).sort(), Object.keys(files).sort());

      const freshRepository = new GitRepository({ repositoryRoot: data.repository, worktreeRoot: data.worktrees });
      const reused = await freshRepository.materializePreparedFix({
        stageBranch: 'stage/test', sourceStageSha: data.baseSha, files, commitMessage,
      });
      assert.equal(reused.status, 'reused');
      assert.equal(reused.preparedStageSha, created.preparedStageSha);
      assert.equal(git(data.repository, 'rev-parse', 'HEAD'), created.preparedStageSha);
      assert.equal(git(data.repository, 'rev-list', '--count', `${data.baseSha}..HEAD`), '1');
    } finally {
      await rm(data.owner, { recursive: true, force: true });
    }
  });
}

test('rejects prepared Fix recovery when the complete commit message differs', async () => {
  const data = await fixture();
  try {
    const files = { 'prepared/router.md': 'exact router bytes\n' };
    const storedMessage = 'chore(fix): prepare round-1\n\nBody A';
    const repository = new GitRepository({ repositoryRoot: data.repository, worktreeRoot: data.worktrees });
    const created = await repository.materializePreparedFix({
      stageBranch: 'stage/test', sourceStageSha: data.baseSha, files, commitMessage: storedMessage,
    });

    for (const commitMessage of [
      'fix(fix): prepare round-1\n\nBody A',
      'chore(fix): prepare round-1\n\nBody B',
    ]) {
      const freshRepository = new GitRepository({ repositoryRoot: data.repository, worktreeRoot: data.worktrees });
      await assert.rejects(
        freshRepository.materializePreparedFix({
          stageBranch: 'stage/test', sourceStageSha: data.baseSha, files, commitMessage,
        }),
        (error) => error.details.failure_class === 'PRE_MUTATION_FAILURE'
          && /neither source Stage .* nor the exact prepared commit/.test(error.message),
      );
      assert.equal(git(data.repository, 'rev-parse', 'HEAD'), created.preparedStageSha);
      assert.equal(git(data.repository, 'rev-parse', `${created.preparedStageSha}^`), data.baseSha);
      assert.equal(gitRaw(data.repository, 'log', '-1', '--pretty=format:%B', created.preparedStageSha), `${storedMessage}\n`);
      assert.equal(git(data.repository, 'rev-list', '--count', `${data.baseSha}..HEAD`), '1');
      assert.equal(git(data.repository, 'status', '--porcelain'), '');
    }
  } finally {
    await rm(data.owner, { recursive: true, force: true });
  }
});

test('recovers a prepared Fix commit after the commit response is lost', async () => {
  const data = await fixture();
  try {
    const files = { 'prepared/router.md': 'exact router bytes\n' };
    const commitMessage = 'chore(fix): prepare round-1\n\nPrepared fix body.';
    let commitCalls = 0;
    const uncertainRepository = new GitRepository({
      repositoryRoot: data.repository,
      worktreeRoot: data.worktrees,
      run: async (command, args, options) => {
        const result = await runProcess(command, args, options);
        if (command === 'git' && args[0] === 'commit' && result.exitCode === 0) {
          commitCalls += 1;
          return { ...result, exitCode: 1, stderr: 'response lost' };
        }
        return result;
      },
    });
    await assert.rejects(
      uncertainRepository.materializePreparedFix({
        stageBranch: 'stage/test', sourceStageSha: data.baseSha, files, commitMessage,
      }),
      (error) => error.details.failure_class === 'POST_MUTATION_UNCERTAIN'
        && error.details.boundary === 'local_prepared_commit'
        && error.details.effect_observed === true,
    );
    const preparedStageSha = git(data.repository, 'rev-parse', 'HEAD');

    const freshRepository = new GitRepository({ repositoryRoot: data.repository, worktreeRoot: data.worktrees });
    const recovered = await freshRepository.materializePreparedFix({
      stageBranch: 'stage/test', sourceStageSha: data.baseSha, files, commitMessage,
    });
    assert.equal(recovered.status, 'reused');
    assert.equal(recovered.preparedStageSha, preparedStageSha);
    assert.equal(commitCalls, 1);
    assert.equal(git(data.repository, 'rev-list', '--count', `${data.baseSha}..HEAD`), '1');
  } finally {
    await rm(data.owner, { recursive: true, force: true });
  }
});

test('classifies failures after Stage worktree creation starts as local commit uncertainty', async () => {
  const data = await fixture();
  try {
    git(data.repository, 'branch', 'stage/other', data.baseSha);
    const repository = new GitRepository({ repositoryRoot: data.repository, worktreeRoot: data.worktrees });
    await assert.rejects(
      repository.materializePreparedFix({
        stageBranch: 'stage/other',
        sourceStageSha: 'different-source-sha',
        files: { 'prepared/router.md': 'exact router bytes\n' },
        commitMessage: 'chore(fix): prepare round-1',
      }),
      (error) => error.details.failure_class === 'POST_MUTATION_UNCERTAIN'
        && error.details.boundary === 'local_prepared_commit',
    );
    assert.equal((await repository.listWorktrees()).some((item) => item.branch === 'stage/other'), true);
  } finally {
    await rm(data.owner, { recursive: true, force: true });
  }
});

test('main push uses one exact non-force SHA refspec and enforces the three-way remote state', async () => {
  const expected = '1111111111111111111111111111111111111111';
  const accepted = '2222222222222222222222222222222222222222';
  let remote = expected;
  const pushes = [];
  const run = async (_command, args) => {
    if (args[0] === 'ls-remote') return { exitCode: 0, stdout: `${remote}\trefs/heads/main\n`, stderr: '', error: null };
    if (args[0] === 'push') {
      pushes.push(args);
      remote = accepted;
      return { exitCode: 0, stdout: '', stderr: '', error: null };
    }
    throw new Error(`unexpected Git command: ${args.join(' ')}`);
  };
  const repository = new GitRepository({ repositoryRoot: '.', worktreeRoot: '.', run });
  const pushed = await repository.pushMain(accepted, expected);
  assert.equal(pushed.status, 'pushed');
  assert.deepEqual(pushes, [['push', 'origin', `${accepted}:refs/heads/main`]]);
  assert.equal(pushes[0].some((arg) => arg.includes('force') || arg.startsWith('+')), false);

  const reused = await repository.pushMain(accepted, expected);
  assert.equal(reused.status, 'reused');
  assert.equal(pushes.length, 1);

  remote = '3333333333333333333333333333333333333333';
  await assert.rejects(
    repository.pushMain(accepted, expected),
    (error) => error.details.failure_class === 'PRE_MUTATION_FAILURE',
  );
  assert.equal(pushes.length, 1);
});

test('push response loss is POST_MUTATION_UNCERTAIN even when the exact ref is re-observed', async () => {
  const expected = '1111111111111111111111111111111111111111';
  const accepted = '2222222222222222222222222222222222222222';
  let remote = expected;
  const repository = new GitRepository({
    repositoryRoot: '.', worktreeRoot: '.',
    run: async (_command, args) => {
      if (args[0] === 'ls-remote') return { exitCode: 0, stdout: `${remote}\trefs/heads/main\n`, stderr: '', error: null };
      if (args[0] === 'push') {
        remote = accepted;
        return { exitCode: 1, stdout: '', stderr: 'response lost', error: null };
      }
      throw new Error(`unexpected Git command: ${args.join(' ')}`);
    },
  });
  await assert.rejects(
    repository.pushMain(accepted, expected),
    (error) => error.details.failure_class === 'POST_MUTATION_UNCERTAIN' && error.details.observed_remote_sha === accepted,
  );
});
