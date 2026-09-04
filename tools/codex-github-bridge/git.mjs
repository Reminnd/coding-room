import { access, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { blocked } from './errors.mjs';
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
