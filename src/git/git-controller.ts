import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { z } from 'zod';
import { ProtocolError } from '../protocol/errors.ts';
import type { EventActor, GitAction, GitActionResult, GitEvidence } from '../protocol/schema.ts';
import type { GitActionPreviewIntent, PreviewGitActionInput } from '../room/room-service.ts';
import { RoomService } from '../room/room-service.ts';
import { collectCompletionEvidence, observeContinuation } from './git-observer.ts';
import { GitCommandError, runGit } from './git-process.ts';

const common = {
  git_action_id: z.string().min(1), room_id: z.string().min(1), revision_id: z.string().min(1), node_id: z.string().min(1),
};

export const previewGitActionInputSchema = z.discriminatedUnion('operation', [
  z.object({ ...common, operation: z.literal('create_worktree'), repository_root: z.string().min(1), source_ref: z.string().min(1), new_branch: z.string().min(1), worktree_path: z.string().min(1) }).strict(),
  z.object({ ...common, operation: z.literal('commit_paths'), repository_root: z.string().min(1), worktree_path: z.string().min(1), branch: z.string().min(1), paths: z.array(z.string().min(1)).min(1), commit_message: z.string().min(1) }).strict(),
  z.object({ ...common, operation: z.literal('integrate_fast_forward'), repository_root: z.string().min(1), source_branch: z.string().min(1), target_branch: z.string().min(1), target_worktree_path: z.string().min(1) }).strict(),
]);
export type PreviewGitActionCommand = z.infer<typeof previewGitActionInputSchema>;

type GitProcess = typeof runGit;

function validation(message: string): never {
  throw new ProtocolError('validation_failed', message);
}

function samePath(left: string, right: string): boolean {
  return resolve(left).toLowerCase() === resolve(right).toLowerCase();
}

function parseWorktreePaths(output: Buffer): string[] {
  return output.toString('utf8').split(/\r?\n/).filter((line) => line.startsWith('worktree ')).map((line) => resolve(line.slice('worktree '.length)));
}

function stableEvidence(evidence: GitEvidence): GitEvidence {
  return {
    staged: [...new Set(evidence.staged)].sort(),
    unstaged: [...new Set(evidence.unstaged)].sort(),
    untracked: [...new Set(evidence.untracked)].sort(),
  };
}

export class GitController {
  private readonly service: RoomService;
  private readonly process: GitProcess;

  constructor(
    service: RoomService,
    process: GitProcess = runGit,
  ) {
    this.service = service;
    this.process = process;
  }

  async preview(command: PreviewGitActionCommand, actor: EventActor): Promise<{ action: GitAction; created: boolean }> {
    const existing = this.service.authorizeGitActionPreview(command.room_id, command.git_action_id, actor);
    if (existing) {
      if (JSON.stringify(this.callerOwnedCommand(command)) !== JSON.stringify(this.callerOwnedAction(existing))) {
        throw new ProtocolError('id_conflict', `git action id ${command.git_action_id} already exists with different content`);
      }
      return { action: existing, created: false };
    }
    const preview = await this.observeCommand(command);
    const normalized: PreviewGitActionInput = {
      git_action_id: command.git_action_id,
      room_id: command.room_id,
      revision_id: command.revision_id,
      node_id: command.node_id,
      preview,
    };
    return this.service.previewGitAction(normalized, actor);
  }

  async execute(gitActionId: string, actor: EventActor): Promise<GitAction> {
    const action = this.service.authorizeGitAction(gitActionId, actor);
    if (action.status === 'executing' || action.status === 'succeeded' || action.status === 'failed' || action.status === 'outcome_unknown') {
      throw new ProtocolError('git_action_already_terminal', `git action ${gitActionId} cannot be executed again`);
    }
    if (action.status !== 'approved') {
      const { preview_event_sequence: _sequence, ...stored } = action.preview;
      return this.service.reserveGitAction(gitActionId, stored, actor);
    }
    const observed = await this.reobserve(action);
    const reserved = this.service.reserveGitAction(gitActionId, observed, actor);
    let result: GitActionResult;
    try {
      result = await this.executeReserved(reserved);
    } catch (error) {
      result = await this.failureResult(reserved, error);
      return this.service.settleGitAction({ git_action_id: gitActionId, status: 'failed', result }, actor);
    }
    return this.service.settleGitAction({ git_action_id: gitActionId, status: 'succeeded', result }, actor);
  }

  async reconcile(gitActionId: string, actor: EventActor): Promise<GitAction> {
    const action = this.service.authorizeGitAction(gitActionId, actor);
    if (action.status === 'succeeded' || action.status === 'failed' || action.status === 'outcome_unknown') return action;
    if (action.status !== 'executing') throw new ProtocolError('validation_failed', `git action ${gitActionId} is not executing`);
    let evidence: GitEvidence | null = null;
    try {
      const path = action.preview.operation === 'commit_paths'
        ? action.preview.worktree_path
        : action.preview.operation === 'integrate_fast_forward'
          ? action.preview.target_worktree_path
          : action.preview.worktree_path;
      if (existsSync(path)) evidence = stableEvidence(await collectCompletionEvidence(path));
    } catch {
      evidence = null;
    }
    return this.service.reconcileGitAction(gitActionId, {
      command_exit_code: null,
      resulting_commit_id: null,
      message: 'execution ownership was lost; external outcome was not inferred',
      git_evidence: evidence,
    }, actor);
  }

  private callerOwnedCommand(command: PreviewGitActionCommand): Record<string, unknown> {
    const identity = { room_id: command.room_id, revision_id: command.revision_id, node_id: command.node_id };
    if (command.operation === 'create_worktree') {
      return {
        ...identity,
        preview: {
          operation: command.operation,
          repository_root: resolve(command.repository_root).toLowerCase(),
          source_ref: command.source_ref,
          new_branch: command.new_branch,
          worktree_path: resolve(command.worktree_path).toLowerCase(),
        },
      };
    }
    if (command.operation === 'commit_paths') {
      return {
        ...identity,
        preview: {
          operation: command.operation,
          repository_root: resolve(command.repository_root).toLowerCase(),
          worktree_path: resolve(command.worktree_path).toLowerCase(),
          branch: command.branch,
          paths: [...command.paths],
          commit_message: command.commit_message,
        },
      };
    }
    return {
      ...identity,
      preview: {
        operation: command.operation,
        repository_root: resolve(command.repository_root).toLowerCase(),
        source_branch: command.source_branch,
        target_branch: command.target_branch,
        target_worktree_path: resolve(command.target_worktree_path).toLowerCase(),
      },
    };
  }

  private callerOwnedAction(action: GitAction): Record<string, unknown> {
    const preview = action.preview;
    const identity = { room_id: action.room_id, revision_id: action.revision_id, node_id: action.node_id };
    if (preview.operation === 'create_worktree') {
      return {
        ...identity,
        preview: {
          operation: preview.operation,
          repository_root: resolve(preview.repository_root).toLowerCase(),
          source_ref: preview.source_ref,
          new_branch: preview.new_branch,
          worktree_path: resolve(preview.worktree_path).toLowerCase(),
        },
      };
    }
    if (preview.operation === 'commit_paths') {
      return {
        ...identity,
        preview: {
          operation: preview.operation,
          repository_root: resolve(preview.repository_root).toLowerCase(),
          worktree_path: resolve(preview.worktree_path).toLowerCase(),
          branch: preview.branch,
          paths: [...preview.paths],
          commit_message: preview.commit_message,
        },
      };
    }
    return {
      ...identity,
      preview: {
        operation: preview.operation,
        repository_root: resolve(preview.repository_root).toLowerCase(),
        source_branch: preview.source_branch,
        target_branch: preview.target_branch,
        target_worktree_path: resolve(preview.target_worktree_path).toLowerCase(),
      },
    };
  }

  private async observeCommand(command: PreviewGitActionCommand): Promise<GitActionPreviewIntent> {
    if (!isAbsolute(command.repository_root)) validation('repository_root must be absolute');
    const repository = await observeContinuation(command.repository_root);
    if (!samePath(repository.repositoryRoot, command.repository_root)) validation('repository_root must be canonical');

    if (command.operation === 'create_worktree') {
      if (!isAbsolute(command.worktree_path)) validation('worktree_path must be absolute');
      await this.verifyRef(repository.repositoryRoot, command.source_ref);
      await this.verifyBranchName(repository.repositoryRoot, command.new_branch);
      if (existsSync(command.worktree_path)) validation('worktree path already exists');
      const worktrees = parseWorktreePaths(await this.process('worktree', ['list', '--porcelain'], repository.repositoryRoot));
      if (worktrees.some((path) => samePath(path, command.worktree_path))) validation('worktree path is already registered');
      if (await this.branchExists(repository.repositoryRoot, command.new_branch)) validation('new branch already exists');
      return { operation: 'create_worktree', repository_root: repository.repositoryRoot, source_ref: command.source_ref, new_branch: command.new_branch, worktree_path: resolve(command.worktree_path) };
    }

    const targetPath = command.operation === 'commit_paths' ? command.worktree_path : command.target_worktree_path;
    if (!isAbsolute(targetPath)) validation('worktree path must be absolute');
    const worktree = await observeContinuation(targetPath);
    if (!samePath(worktree.repositoryRoot, targetPath)) validation('worktree path must be canonical');
    const repositoryCommonDir = await this.commonGitDir(repository.repositoryRoot);
    const worktreeCommonDir = await this.commonGitDir(worktree.repositoryRoot);
    if (!samePath(repositoryCommonDir, worktreeCommonDir)) validation('repository_root and worktree belong to different repositories');
    const branch = (await this.process('symbolic-ref', ['--short', 'HEAD'], worktree.repositoryRoot)).toString('utf8').trim();

    if (command.operation === 'commit_paths') {
      if (branch !== command.branch) validation('worktree branch does not match preview');
      const paths = [...new Set(command.paths)].sort();
      if (paths.length !== command.paths.length || JSON.stringify(paths) !== JSON.stringify(command.paths)) validation('paths must be unique and sorted');
      return { operation: 'commit_paths', repository_root: repository.repositoryRoot, worktree_path: worktree.repositoryRoot, branch, paths, commit_message: command.commit_message, git_evidence: stableEvidence(worktree.evidence) };
    }

    if (branch !== command.target_branch) validation('target worktree does not have target branch checked out');
    const evidence = stableEvidence(worktree.evidence);
    if (evidence.staged.length || evidence.unstaged.length || evidence.untracked.length) throw new ProtocolError('worktree_not_clean', 'target worktree must be clean');
    await this.verifyRef(repository.repositoryRoot, command.source_branch);
    await this.verifyRef(repository.repositoryRoot, command.target_branch);
    return { operation: 'integrate_fast_forward', repository_root: repository.repositoryRoot, source_branch: command.source_branch, target_branch: command.target_branch, target_worktree_path: worktree.repositoryRoot, git_evidence: evidence };
  }

  private async reobserve(action: GitAction): Promise<GitActionPreviewIntent> {
    const preview = action.preview;
    if (preview.operation === 'create_worktree') {
      return this.observeCommand({ git_action_id: action.git_action_id, room_id: action.room_id, revision_id: action.revision_id, node_id: action.node_id, operation: preview.operation, repository_root: preview.repository_root, source_ref: preview.source_ref, new_branch: preview.new_branch, worktree_path: preview.worktree_path });
    }
    if (preview.operation === 'commit_paths') {
      return this.observeCommand({ git_action_id: action.git_action_id, room_id: action.room_id, revision_id: action.revision_id, node_id: action.node_id, operation: preview.operation, repository_root: preview.repository_root, worktree_path: preview.worktree_path, branch: preview.branch, paths: preview.paths, commit_message: preview.commit_message });
    }
    return this.observeCommand({ git_action_id: action.git_action_id, room_id: action.room_id, revision_id: action.revision_id, node_id: action.node_id, operation: preview.operation, repository_root: preview.repository_root, source_branch: preview.source_branch, target_branch: preview.target_branch, target_worktree_path: preview.target_worktree_path });
  }

  private async executeReserved(action: GitAction): Promise<GitActionResult> {
    const preview = action.preview;
    if (preview.operation === 'create_worktree') {
      await this.process('worktree', ['add', '-b', preview.new_branch, preview.worktree_path, preview.source_ref], preview.repository_root);
      const observed = await observeContinuation(preview.worktree_path);
      const branch = (await this.process('symbolic-ref', ['--short', 'HEAD'], observed.repositoryRoot)).toString('utf8').trim();
      if (!samePath(observed.repositoryRoot, preview.worktree_path) || branch !== preview.new_branch) throw new Error('created worktree does not match frozen path and branch');
      return { command_exit_code: 0, resulting_commit_id: null, message: null, git_evidence: stableEvidence(observed.evidence) };
    }
    if (preview.operation === 'commit_paths') {
      await this.process('add', ['--', ...preview.paths], preview.worktree_path);
      await this.process('commit', ['-m', preview.commit_message], preview.worktree_path);
      const evidence = stableEvidence(await collectCompletionEvidence(preview.worktree_path));
      if (evidence.staged.length || evidence.unstaged.length || evidence.untracked.length) throw new Error('commit did not leave the worktree clean');
      const head = (await this.process('rev-parse', ['HEAD'], preview.worktree_path)).toString('utf8').trim();
      return { command_exit_code: 0, resulting_commit_id: head, message: null, git_evidence: evidence };
    }
    await this.process('merge', ['--ff-only', preview.source_branch], preview.target_worktree_path);
    const evidence = stableEvidence(await collectCompletionEvidence(preview.target_worktree_path));
    const head = (await this.process('rev-parse', ['HEAD'], preview.target_worktree_path)).toString('utf8').trim();
    return { command_exit_code: 0, resulting_commit_id: head, message: null, git_evidence: evidence };
  }

  private async failureResult(action: GitAction, error: unknown): Promise<GitActionResult> {
    const path = action.preview.operation === 'commit_paths' ? action.preview.worktree_path
      : action.preview.operation === 'integrate_fast_forward' ? action.preview.target_worktree_path
        : action.preview.worktree_path;
    let evidence: GitEvidence | null = null;
    try { if (existsSync(path)) evidence = stableEvidence(await collectCompletionEvidence(path)); } catch { evidence = null; }
    const message = error instanceof Error ? error.message.slice(0, 4000) : String(error).slice(0, 4000);
    return { command_exit_code: error instanceof GitCommandError ? error.exitCode : null, resulting_commit_id: null, message, git_evidence: evidence };
  }

  private async verifyRef(repositoryRoot: string, ref: string): Promise<void> {
    try { await this.process('rev-parse', ['--verify', '--quiet', `${ref}^{commit}`], repositoryRoot); }
    catch { validation(`Git ref does not resolve: ${ref}`); }
  }

  private async verifyBranchName(repositoryRoot: string, branch: string): Promise<void> {
    try { await this.process('check-ref-format', ['--branch', branch], repositoryRoot); }
    catch { validation(`invalid branch name: ${branch}`); }
  }

  private async branchExists(repositoryRoot: string, branch: string): Promise<boolean> {
    try { await this.process('show-ref', ['--verify', '--quiet', `refs/heads/${branch}`], repositoryRoot); return true; }
    catch (error) {
      if (error instanceof GitCommandError && error.exitCode === 1) return false;
      throw error;
    }
  }

  private async commonGitDir(worktreeRoot: string): Promise<string> {
    const output = (await this.process('rev-parse', ['--git-common-dir'], worktreeRoot)).toString('utf8').trim();
    return resolve(worktreeRoot, output);
  }
}
