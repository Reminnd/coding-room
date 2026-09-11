import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { blocked } from './errors.mjs';
import { postMutationUncertain, preMutationFailure, validatePreparedFixInput } from './lifecycle.mjs';
import { assertOwnedFiles, safePathComponent } from './scope.mjs';
import { runChecked, runProcess } from './process.mjs';

function parseWorktrees(output) {
  const records = output.trim().split(/\r?\n\r?\n/).filter(Boolean);
  return records.map((record) => {
    const fields = Object.fromEntries(record.split(/\r?\n/).map((line) => {
      const index = line.indexOf(' ');
      return index === -1 ? [line, true] : [line.slice(0, index), line.slice(index + 1)];
    }));
    return { path: fields.worktree, head: fields.HEAD, branch: fields.branch?.replace(/^refs\/heads\//, '') ?? null };
  });
}

function parseNulPaths(output) {
  return output.split('\0').filter(Boolean);
}

function samePaths(left, right) {
  return left.length === right.length && left.every((path, index) => path === right[index]);
}

function resolvePreparedPath(worktree, path) {
  if (typeof path !== 'string' || path.length === 0 || path.includes('\\') || path.startsWith('/')
    || path.split('/').some((component) => component === '' || component === '.' || component === '..')) {
    throw preMutationFailure(`prepared Fix path is not repository-relative POSIX: ${path}`);
  }
  const target = resolve(worktree, ...path.split('/'));
  const prefix = `${resolve(worktree)}${process.platform === 'win32' ? '\\' : '/'}`;
  if (!target.startsWith(prefix)) throw preMutationFailure(`prepared Fix path escapes its Stage worktree: ${path}`);
  return target;
}

export class GitRepository {
  constructor({ repositoryRoot, worktreeRoot, run = runProcess }) {
    this.repositoryRoot = resolve(repositoryRoot);
    this.worktreeRoot = resolve(worktreeRoot);
    this.run = run;
  }

  async git(args, cwd = this.repositoryRoot) {
    return runChecked(this.run, 'git', args, { cwd });
  }

  async output(args, cwd = this.repositoryRoot) {
    return (await this.git(args, cwd)).stdout.trim();
  }

  async listWorktrees() {
    return parseWorktrees(await this.output(['worktree', 'list', '--porcelain']));
  }

  async currentBranch(cwd) {
    return this.output(['branch', '--show-current'], cwd);
  }

  async head(cwd) {
    return this.output(['rev-parse', 'HEAD'], cwd);
  }

  async status(cwd) {
    return this.output(['status', '--porcelain=v1', '--untracked-files=all'], cwd);
  }

  async paths(args, cwd) {
    return parseNulPaths((await this.git(args, cwd)).stdout).sort();
  }

  async observeWorkingTree(cwd) {
    const [head, branch, stagedPaths, trackedPaths, untrackedPaths] = await Promise.all([
      this.head(cwd),
      this.currentBranch(cwd),
      this.paths(['diff', '--cached', '--name-only', '--no-renames', '-z'], cwd),
      this.paths(['diff', '--name-only', '--no-renames', '-z'], cwd),
      this.paths(['ls-files', '--others', '--exclude-standard', '-z'], cwd),
    ]);
    return {
      head,
      branch,
      stagedPaths,
      workingPaths: [...new Set([...trackedPaths, ...untrackedPaths])].sort(),
    };
  }

  async createCandidateCommit(task, worktree, paths) {
    const expectedPaths = [...paths].sort();
    const stage = await this.run('git', ['add', '--', ...expectedPaths], { cwd: worktree });
    if (stage.exitCode !== 0 || stage.error) {
      throw blocked(`exact-path staging failed: ${stage.stderr.trim() || stage.error?.message}`);
    }

    const stagedPaths = await this.paths(['diff', '--cached', '--name-only', '--no-renames', '-z'], worktree);
    if (!samePaths(stagedPaths, expectedPaths)) {
      throw blocked(`staged paths do not match verified working paths: ${stagedPaths.join(', ')}`);
    }

    const diffCheck = await this.run('git', ['diff', '--cached', '--check'], { cwd: worktree });
    if (diffCheck.exitCode !== 0 || diffCheck.error) {
      throw blocked(`cached diff check failed: ${diffCheck.stderr.trim() || diffCheck.error?.message}`);
    }

    const commit = await this.run('git', ['commit', '-m', `chore(task): complete ${task.task_id}`], { cwd: worktree });
    if (commit.exitCode !== 0 || commit.error) {
      throw blocked(`candidate commit failed: ${commit.stderr.trim() || commit.error?.message}`);
    }
  }

  async repositoryOrigin() {
    const inside = await this.output(['rev-parse', '--is-inside-work-tree']);
    if (inside !== 'true') throw new Error(`not a Git working tree: ${this.repositoryRoot}`);
    return this.output(['remote', 'get-url', 'origin']);
  }

  async branchExists(branch) {
    const result = await this.run('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: this.repositoryRoot });
    return result.exitCode === 0;
  }

  async fetchStage(stageBranch) {
    await this.git(['fetch', 'origin', `refs/heads/${stageBranch}:refs/remotes/origin/${stageBranch}`]);
    return this.output(['rev-parse', `refs/remotes/origin/${stageBranch}`]);
  }

  async remoteBranchHead(branch, cwd = this.repositoryRoot) {
    const ref = `refs/heads/${branch}`;
    const output = await this.output(['ls-remote', '--refs', 'origin', ref], cwd);
    if (output === '') return null;
    const fields = output.split(/\s+/).filter(Boolean);
    return fields.length === 2 && fields[1] === ref ? fields[0] : null;
  }

  async commitExists(commitSha, cwd = this.repositoryRoot) {
    const result = await this.run('git', ['cat-file', '-e', `${commitSha}^{commit}`], { cwd });
    return result.exitCode === 0 && !result.error;
  }

  async readBlobAtCommit(commitSha, path, expectedBlobSha = null, cwd = this.repositoryRoot) {
    if (!await this.commitExists(commitSha, cwd)) {
      throw preMutationFailure(`accepted commit object is unavailable locally: ${commitSha}`);
    }
    const blobSha = await this.output(['rev-parse', `${commitSha}:${path}`], cwd);
    if (expectedBlobSha !== null && blobSha !== expectedBlobSha) {
      throw preMutationFailure(`Git blob ${blobSha} does not match accepted blob ${expectedBlobSha} for ${path}`);
    }
    const result = await this.git(['cat-file', 'blob', blobSha], cwd);
    return { blobSha, bytes: Buffer.from(result.stdout, 'utf8') };
  }

  async observeSupervisorOnlyCandidate(worktree, expectedParentSha) {
    const [head, branch, status, stagedPaths, unstagedPaths, untrackedPaths] = await Promise.all([
      this.head(worktree),
      this.currentBranch(worktree),
      this.status(worktree),
      this.paths(['diff', '--cached', '--name-only', '--no-renames', '-z'], worktree),
      this.paths(['diff', '--name-only', '--no-renames', '-z'], worktree),
      this.paths(['ls-files', '--others', '--exclude-standard', '-z'], worktree),
    ]);
    const commitExists = await this.commitExists(head, worktree);
    const parents = commitExists
      ? (await this.output(['rev-list', '--parents', '-n', '1', head], worktree)).split(/\s+/).slice(1)
      : [];
    const changedText = commitExists
      ? await this.output(['diff', '--name-only', '--no-renames', expectedParentSha, head], worktree)
      : '';
    const changedFiles = changedText ? changedText.split(/\r?\n/).filter(Boolean).sort() : [];
    const diffCheck = commitExists
      ? await this.run('git', ['diff', '--check', expectedParentSha, head], { cwd: worktree })
      : { exitCode: 1, error: null, stderr: 'candidate commit is unavailable' };
    return {
      head,
      branch,
      status,
      stagedPaths,
      unstagedPaths,
      untrackedPaths,
      commitExists,
      parents,
      parentSha: parents.length === 1 ? parents[0] : null,
      changedFiles,
      diffCheckPassed: diffCheck.exitCode === 0 && !diffCheck.error,
      diffCheckError: diffCheck.exitCode === 0 && !diffCheck.error
        ? ''
        : diffCheck.stderr?.trim() || diffCheck.error?.message || `exit ${diffCheck.exitCode}`,
    };
  }

  async isAncestor(ancestorSha, descendantSha, cwd = this.repositoryRoot) {
    const result = await this.run('git', ['merge-base', '--is-ancestor', ancestorSha, descendantSha], { cwd });
    return result.exitCode === 0 && !result.error;
  }

  async changedFiles(commitSha, cwd = this.repositoryRoot) {
    const output = await this.output(['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', commitSha], cwd);
    return output ? output.split(/\r?\n/).filter(Boolean) : [];
  }

  async ensureStageWorktree(stageBranch) {
    const existing = (await this.listWorktrees()).find((item) => item.branch === stageBranch);
    if (existing) return existing.path;

    await mkdir(this.worktreeRoot, { recursive: true });
    const target = join(this.worktreeRoot, `stage-${safePathComponent(stageBranch)}`);
    if (await this.branchExists(stageBranch)) {
      await this.git(['worktree', 'add', target, stageBranch]);
    } else {
      await this.git(['worktree', 'add', '-b', stageBranch, target, `refs/remotes/origin/${stageBranch}`]);
    }
    return target;
  }

  async ensureTaskWorktree(task, baseSha) {
    const existing = (await this.listWorktrees()).find((item) => item.branch === task.task_branch);
    if (existing) return existing.path;

    await mkdir(this.worktreeRoot, { recursive: true });
    const target = join(this.worktreeRoot, safePathComponent(task.task_id));
    try {
      await access(target);
      throw blocked(`task worktree path already exists but is not registered: ${target}`);
    } catch (error) {
      if (error?.status === 'blocked') throw error;
      if (error?.code !== 'ENOENT') throw error;
    }

    if (await this.branchExists(task.task_branch)) {
      await this.git(['worktree', 'add', target, task.task_branch]);
    } else {
      await this.git(['worktree', 'add', '-b', task.task_branch, target, baseSha]);
    }
    return target;
  }

  async matchesPreparedCommit(worktree, sourceStageSha, files, commitMessage) {
    const head = await this.head(worktree);
    const parents = (await this.output(['rev-list', '--parents', '-n', '1', head], worktree)).split(/\s+/).slice(1);
    if (parents.length !== 1 || parents[0] !== sourceStageSha) return false;
    const storedMessageOutput = (await this.git(['log', '-1', '--pretty=format:%B', head], worktree)).stdout;
    const storedMessage = storedMessageOutput.endsWith('\r\n')
      ? storedMessageOutput.slice(0, -2)
      : storedMessageOutput.endsWith('\n')
        ? storedMessageOutput.slice(0, -1)
        : storedMessageOutput;
    if (storedMessage !== commitMessage) return false;
    const expectedPaths = Object.keys(files).sort();
    const actualPaths = (await this.changedFiles(head, worktree)).sort();
    if (!samePaths(actualPaths, expectedPaths) || await this.status(worktree) !== '') return false;
    for (const path of expectedPaths) {
      const content = await readFile(resolvePreparedPath(worktree, path), 'utf8');
      if (content !== files[path]) return false;
    }
    return true;
  }

  async materializePreparedFix({ stageBranch, sourceStageSha, files, commitMessage }) {
    validatePreparedFixInput({ files, commitMessage });
    for (const path of Object.keys(files)) {
      resolvePreparedPath(this.repositoryRoot, path);
    }

    let worktree;
    let worktreeMutationStarted = false;
    try {
      const existing = (await this.listWorktrees()).find((item) => item.branch === stageBranch);
      if (existing) {
        worktree = existing.path;
      } else {
        worktreeMutationStarted = true;
        worktree = await this.ensureStageWorktree(stageBranch);
      }
      const branch = await this.currentBranch(worktree);
      if (branch !== stageBranch) throw preMutationFailure(`Stage worktree is on ${branch}, expected ${stageBranch}`);
      const head = await this.head(worktree);
      if (head !== sourceStageSha) {
        if (await this.matchesPreparedCommit(worktree, sourceStageSha, files, commitMessage)) {
          return { status: 'reused', worktree, preparedStageSha: head, mutationObserved: worktreeMutationStarted };
        }
        throw preMutationFailure(`Stage worktree HEAD ${head} is neither source Stage ${sourceStageSha} nor the exact prepared commit`);
      }
      if (await this.status(worktree) !== '') throw preMutationFailure(`Stage worktree is not clean: ${worktree}`);
    } catch (error) {
      if (error?.details?.failure_class === 'POST_MUTATION_UNCERTAIN') throw error;
      if (!worktreeMutationStarted && error?.details?.failure_class === 'PRE_MUTATION_FAILURE') throw error;
      if (!worktreeMutationStarted) throw preMutationFailure(`Stage worktree could not be observed before mutation: ${error.message}`);
      throw postMutationUncertain('local_prepared_commit', `Stage worktree creation outcome is uncertain: ${error.message}`);
    }

    const expectedPaths = Object.keys(files).sort();
    try {
      for (const path of expectedPaths) {
        const target = resolvePreparedPath(worktree, path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, files[path], 'utf8');
      }
      await this.git(['add', '--', ...expectedPaths], worktree);
      const stagedPaths = await this.paths(['diff', '--cached', '--name-only', '--no-renames', '-z'], worktree);
      if (!samePaths(stagedPaths, expectedPaths)) throw new Error(`staged paths do not match prepared files: ${stagedPaths.join(', ')}`);
      await this.git(['diff', '--cached', '--check'], worktree);
      await this.git(['commit', '-m', commitMessage], worktree);
    } catch (error) {
      let effectObserved = false;
      try {
        effectObserved = await this.matchesPreparedCommit(worktree, sourceStageSha, files, commitMessage);
      } catch {
        effectObserved = false;
      }
      throw postMutationUncertain('local_prepared_commit', `prepared Fix commit response was not conclusive: ${error.message}`, { effect_observed: effectObserved });
    }
    const preparedStageSha = await this.head(worktree);
    if (!await this.matchesPreparedCommit(worktree, sourceStageSha, files, commitMessage)) {
      throw postMutationUncertain('local_prepared_commit', 'prepared Fix commit did not produce the exact observable commit');
    }
    return { status: 'created', worktree, preparedStageSha, mutationObserved: true };
  }

  async pushExactRemoteRef({ branch, sourceSha, targetSha, cwd, boundary }) {
    let before;
    try {
      before = await this.remoteBranchHead(branch, cwd);
    } catch (error) {
      throw preMutationFailure(`remote ${branch} is unobservable: ${error.message}`, { boundary });
    }
    if (before === targetSha) return { status: 'reused', remoteSha: before };
    if (before === null) throw preMutationFailure(`remote ${branch} is unobservable`, { boundary });
    if (before !== sourceSha) throw preMutationFailure(`remote ${branch} is ${before}, expected ${sourceSha} before push`, { boundary });
    const refspec = `${targetSha}:refs/heads/${branch}`;
    try {
      await this.git(['push', 'origin', refspec], cwd);
    } catch (error) {
      let after = null;
      try {
        after = await this.remoteBranchHead(branch, cwd);
      } catch {
        after = null;
      }
      throw postMutationUncertain(boundary, `${boundary} response was not conclusive: ${error.message}`, { observed_remote_sha: after });
    }
    let after;
    try {
      after = await this.remoteBranchHead(branch, cwd);
    } catch (error) {
      throw postMutationUncertain(boundary, `${boundary} succeeded but remote ${branch} could not be re-observed: ${error.message}`);
    }
    if (after !== targetSha) throw postMutationUncertain(boundary, `${boundary} returned success but remote ${branch} is ${after ?? '<unobservable>'}`, { observed_remote_sha: after });
    return { status: 'pushed', refspec, remoteSha: after };
  }

  async pushPreparedStage(stageBranch, sourceStageSha, preparedStageSha, cwd = this.repositoryRoot) {
    return this.pushExactRemoteRef({
      branch: stageBranch,
      sourceSha: sourceStageSha,
      targetSha: preparedStageSha,
      cwd,
      boundary: 'prepared_stage_push',
    });
  }

  async pushMain(acceptedStageSha, expectedMainSha, cwd = this.repositoryRoot) {
    return this.pushExactRemoteRef({
      branch: 'main',
      sourceSha: expectedMainSha,
      targetSha: acceptedStageSha,
      cwd,
      boundary: 'main_push',
    });
  }

  async collectTaskFacts(task, worktree, baseSha) {
    const taskHeadSha = await this.head(worktree);
    const branch = await this.currentBranch(worktree);
    const parents = (await this.output(['rev-list', '--parents', '-n', '1', taskHeadSha], worktree)).split(/\s+/).slice(1);
    const changedText = await this.output(['diff-tree', '--no-commit-id', '--name-only', '-r', taskHeadSha], worktree);
    const actualChangedFiles = changedText ? changedText.split(/\r?\n/).filter(Boolean) : [];
    const worktreeStatus = await this.status(worktree);
    const commitExists = (await this.run('git', ['cat-file', '-e', `${taskHeadSha}^{commit}`], { cwd: worktree })).exitCode === 0;

    return {
      taskId: task.task_id,
      baseSha,
      taskHeadSha,
      parentSha: parents.length === 1 ? parents[0] : null,
      parents,
      branch,
      actualChangedFiles,
      worktreeStatus,
      commitExists,
    };
  }

  async mechanicalGate(task, facts) {
    // 单一 parent 必须是 dispatch base，避免 Worker 把其他分支历史夹入候选提交。
    if (!facts.commitExists) throw blocked(`task commit does not exist: ${facts.taskHeadSha}`);
    if (facts.parents.length !== 1 || facts.parentSha !== facts.baseSha) {
      throw blocked(`task commit parent must equal dispatch base ${facts.baseSha}`);
    }
    if (facts.branch !== task.task_branch) throw blocked(`task worktree is on ${facts.branch}, expected ${task.task_branch}`);
    if (facts.worktreeStatus !== '') throw blocked(`task worktree is not clean: ${facts.worktreeStatus}`);
    if (facts.actualChangedFiles.length === 0) throw blocked('task commit has no changed files');
    try {
      assertOwnedFiles(task, facts.actualChangedFiles);
    } catch (error) {
      throw blocked(error.message);
    }
    const diffCheck = await this.run('git', ['diff', '--check', facts.baseSha, facts.taskHeadSha], { cwd: this.repositoryRoot });
    if (diffCheck.exitCode !== 0 || diffCheck.error) throw blocked(`commit diff check failed: ${diffCheck.stderr.trim() || diffCheck.error?.message}`);
  }

  async completeDiff(baseSha, taskHeadSha) {
    return (await this.git(['diff', '--no-ext-diff', '--binary', baseSha, taskHeadSha])).stdout;
  }

  // push成功后只重读一次exact ref；不轮询，remote truth不等即阻塞交付。
  async confirmRemoteBranch(branch, expectedSha, cwd) {
    const ref = `refs/heads/${branch}`;
    const output = await this.output(['ls-remote', '--refs', 'origin', ref], cwd);
    const fields = output.split(/\s+/).filter(Boolean);
    if (fields.length !== 2 || fields[1] !== ref) throw blocked(`remote ref ${ref} was not returned exactly`);
    if (fields[0] !== expectedSha) throw blocked(`remote ref ${ref} is ${fields[0]}, expected ${expectedSha}`);
    return fields[0];
  }

  async pushTask(task, worktree, expectedSha) {
    await this.git(['push', 'origin', `${task.task_branch}:${task.task_branch}`], worktree);
    await this.confirmRemoteBranch(task.task_branch, expectedSha, worktree);
  }

  async integrate(stageWorktree, task, sourceTaskSha) {
    if (await this.status(stageWorktree)) throw blocked(`Stage integration worktree is not clean: ${stageWorktree}`);
    const branch = await this.currentBranch(stageWorktree);
    if (branch !== task.stage_branch) throw blocked(`Stage integration worktree is on ${branch}, expected ${task.stage_branch}`);

    const result = await this.run('git', ['cherry-pick', sourceTaskSha], { cwd: stageWorktree });
    if (result.exitCode !== 0 || result.error) {
      const abort = await this.run('git', ['cherry-pick', '--abort'], { cwd: stageWorktree });
      const reason = result.stderr.trim() || result.error?.message || 'cherry-pick failed';
      const abortFailure = abort.exitCode === 0 && !abort.error ? '' : `; cherry-pick --abort failed: ${abort.stderr.trim() || abort.error?.message}`;
      return { status: 'blocked', reason: `${reason}${abortFailure}` };
    }
    const stageCommitSha = await this.head(stageWorktree);
    await this.git(['push', 'origin', `${task.stage_branch}:${task.stage_branch}`], stageWorktree);
    await this.confirmRemoteBranch(task.stage_branch, stageCommitSha, stageWorktree);
    return { status: 'integrated', taskId: task.task_id, sourceTaskSha, stageCommitSha };
  }
}

export function defaultWorktreeRoot(repositoryRoot) {
  const root = resolve(repositoryRoot);
  return join(dirname(root), `${safePathComponent(root.split(/[\\/]/).at(-1))}-codex-workers`);
}
