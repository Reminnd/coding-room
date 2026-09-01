import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { ProtocolError } from '../protocol/errors.ts';
import { GIT_FATAL_EXIT_CODE, GitCommandError, runGit } from './git-process.ts';

// ROOM_PROTOCOL.md 第 6 节 Run.git_evidence 的 shape：三类 path set 均为去重、稳定
// 排序、repository-root-relative 的 path array。字段名与协议一致，便于后续增量直接把
// 本类型的结果写入 Run record，不复制第二套 authority。
export interface GitEvidence {
  staged: string[];
  unstaged: string[];
  untracked: string[];
}

// clean-worktree operation 的返回值：canonical repository root 来自 Git CLI，三类
// evidence 全空。
export interface CleanWorktree {
  repositoryRoot: string;
  evidence: GitEvidence;
}

// 把 NUL 分隔、带 -z 的输出解析为去重且按字节序稳定排序的 path array。-z 关闭
// core.quotePath 引用，path 原样（含空格、非 ASCII）以 UTF-8 字节输出，因此按 '\0'
// 分割不会把带空格 path 拆开；空输出解析为 []。
function parseNulPaths(buffer: Buffer): string[] {
  return [...new Set(buffer.toString('utf8').split('\0').filter((p) => p !== ''))].sort();
}

// 确认 target 属于 non-bare Git worktree 并解析其 root。git 的 fatal 失败（not a git
// repository、bare 仓库无 work tree）以 exit 128 退出，在此 semantic boundary 统一映射为
// git_repository_missing；其它 process 失败由 runGit 以 GitCommandError 带 command
// context 抛出，不在此降级。
async function resolveWorktreeRoot(targetPath: string): Promise<string> {
  let stat;
  try {
    stat = statSync(targetPath);
  } catch {
    stat = null;
  }
  if (!stat || !stat.isDirectory()) {
    throw new ProtocolError(
      'git_repository_missing',
      `target path is not an existing directory: ${targetPath}`,
    );
  }

  try {
    const root = await runGit('rev-parse', ['--show-toplevel'], targetPath);
    return resolve(root.toString('utf8').trim());
  } catch (err) {
    if (err instanceof GitCommandError && err.exitCode === GIT_FATAL_EXIT_CODE) {
      throw new ProtocolError(
        'git_repository_missing',
        `target path is not a non-bare git worktree: ${targetPath}`,
      );
    }
    throw err;
  }
}

// 从解析出的 repository root 执行三类 evidence command。命令串行执行以避免多个 git
// process 并发刷新 index stat cache 时争抢 .git/index.lock；该刷新只更新缓存，不改变
// commit/index/worktree 内容，因此不影响只读 invariant。任一 command 失败（含损坏
// index 导致的 exit 128）都以 GitCommandError 向上抛出，绝不把失败解释为空 evidence。
async function collectEvidence(root: string): Promise<GitEvidence> {
  const staged = await runGit('diff', ['--cached', '--name-only', '-z'], root);
  const unstaged = await runGit('diff', ['--name-only', '-z'], root);
  const untracked = await runGit('ls-files', ['--others', '--exclude-standard', '--full-name', '-z'], root);
  return {
    staged: parseNulPaths(staged),
    unstaged: parseNulPaths(unstaged),
    untracked: parseNulPaths(untracked),
  };
}

// clean-worktree operation：一次明确的 application precondition check。worktree 有任一
// staged/unstaged/untracked 变更时返回 worktree_not_clean；全空时返回 root 与 empty
// evidence。任一 evidence command 失败都会向上抛出，不会返回 clean observation。
// 只读，不修改 commit/index/worktree。
export async function establishCleanWorktree(targetPath: string): Promise<CleanWorktree> {
  const repositoryRoot = await resolveWorktreeRoot(targetPath);
  const evidence = await collectEvidence(repositoryRoot);

  const dirty = evidence.staged.length > 0 || evidence.unstaged.length > 0 || evidence.untracked.length > 0;
  if (dirty) {
    throw new ProtocolError('worktree_not_clean', 'worktree has staged, unstaged or untracked changes');
  }

  return { repositoryRoot, evidence };
}

// completion-evidence operation：在 dirty worktree 中也能返回三类 evidence。它不要求
// worktree clean，也不生成或保存 patch；任一 evidence command 失败都会向上抛出，
// 不会返回 empty evidence。
export async function collectCompletionEvidence(targetPath: string): Promise<GitEvidence> {
  const repositoryRoot = await resolveWorktreeRoot(targetPath);
  return collectEvidence(repositoryRoot);
}

// continuation observation 的返回值：canonical repository root 与三类 live evidence。
export interface ContinuationObservation {
  repositoryRoot: string;
  evidence: GitEvidence;
}

// continuation observation：Decision/Fix resume 的只读 worktree 观察。与 clean-worktree check 相同，
// 解析 owning worktree root 与 staged/unstaged/untracked evidence，但不要求 evidence
// 为空——lineage 的 staged/unstaged/untracked 变更是应保留的 work，不能作为新 Implementation 的
// dirty 拒绝。任一 observation 失败（missing repo、evidence command fatal）都沿调用链抛出，
// 绝不降级为空 evidence。
export async function observeContinuation(targetPath: string): Promise<ContinuationObservation> {
  const repositoryRoot = await resolveWorktreeRoot(targetPath);
  const evidence = await collectEvidence(repositoryRoot);
  return { repositoryRoot, evidence };
}
