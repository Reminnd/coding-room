import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';
import { GitController } from '../git/git-controller.ts';
import { ProtocolError } from '../protocol/errors.ts';
import type { EventActor } from '../protocol/schema.ts';
import { RoomService } from '../room/room-service.ts';

const GIT_CONTROLLER: EventActor = { participant_id: 'local-runner', actor_role: 'git_controller' };

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function required(value: unknown, name: string): string {
  if (typeof value !== 'string' || value === '') fail(`--${name} <value> is required`);
  return value;
}

function rejectUnexpectedOptions(values: Record<string, unknown>, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(values).filter((key) => !allowedSet.has(key)).sort();
  if (unexpected.length > 0) fail(`unexpected option(s): ${unexpected.map((key) => `--${key}`).join(', ')}`);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command !== 'preview' && command !== 'execute' && command !== 'reconcile') {
    fail('command must be preview, execute, or reconcile');
  }
  let values: Record<string, unknown>;
  try {
    values = parseArgs({
      args: process.argv.slice(3),
      options: {
        db: { type: 'string' }, 'git-action-id': { type: 'string' }, 'room-id': { type: 'string' },
        'revision-id': { type: 'string' }, 'node-id': { type: 'string' }, operation: { type: 'string' },
        'repository-root': { type: 'string' }, 'source-ref': { type: 'string' }, 'new-branch': { type: 'string' },
        'worktree-path': { type: 'string' }, branch: { type: 'string' }, paths: { type: 'string', multiple: true },
        'commit-message': { type: 'string' }, 'source-branch': { type: 'string' }, 'target-branch': { type: 'string' },
        'target-worktree-path': { type: 'string' },
      },
      strict: true,
      allowPositionals: false,
    }).values as Record<string, unknown>;
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  const dbPath = required(values.db, 'db');
  if (command === 'execute' || command === 'reconcile') {
    rejectUnexpectedOptions(values, ['db', 'git-action-id']);
  }
  if (!existsSync(dbPath)) fail(`database file does not exist: ${dbPath}`);
  const service = new RoomService(new DatabaseSync(dbPath));
  const controller = new GitController(service);
  const gitActionId = required(values['git-action-id'], 'git-action-id');
  try {
    let result;
    if (command === 'execute') result = await controller.execute(gitActionId, GIT_CONTROLLER);
    else if (command === 'reconcile') result = await controller.reconcile(gitActionId, GIT_CONTROLLER);
    else {
      const base = {
        git_action_id: gitActionId,
        room_id: required(values['room-id'], 'room-id'),
        revision_id: required(values['revision-id'], 'revision-id'),
        node_id: required(values['node-id'], 'node-id'),
        repository_root: required(values['repository-root'], 'repository-root'),
      };
      const operation = required(values.operation, 'operation');
      if (operation === 'create_worktree') {
        rejectUnexpectedOptions(values, ['db', 'git-action-id', 'room-id', 'revision-id', 'node-id', 'operation', 'repository-root', 'source-ref', 'new-branch', 'worktree-path']);
        result = await controller.preview({ ...base, operation, source_ref: required(values['source-ref'], 'source-ref'), new_branch: required(values['new-branch'], 'new-branch'), worktree_path: required(values['worktree-path'], 'worktree-path') }, GIT_CONTROLLER);
      } else if (operation === 'commit_paths') {
        rejectUnexpectedOptions(values, ['db', 'git-action-id', 'room-id', 'revision-id', 'node-id', 'operation', 'repository-root', 'worktree-path', 'branch', 'paths', 'commit-message']);
        result = await controller.preview({ ...base, operation, worktree_path: required(values['worktree-path'], 'worktree-path'), branch: required(values.branch, 'branch'), paths: values.paths ?? [], commit_message: required(values['commit-message'], 'commit-message') }, GIT_CONTROLLER);
      } else if (operation === 'integrate_fast_forward') {
        rejectUnexpectedOptions(values, ['db', 'git-action-id', 'room-id', 'revision-id', 'node-id', 'operation', 'repository-root', 'source-branch', 'target-branch', 'target-worktree-path']);
        result = await controller.preview({ ...base, operation, source_branch: required(values['source-branch'], 'source-branch'), target_branch: required(values['target-branch'], 'target-branch'), target_worktree_path: required(values['target-worktree-path'], 'target-worktree-path') }, GIT_CONTROLLER);
      } else {
        fail('--operation must be create_worktree, commit_paths, or integrate_fast_forward');
      }
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    if (error instanceof ProtocolError) fail(`${error.code}: ${error.message}`);
    fail(error instanceof Error ? error.message : String(error));
  }
}

void main();
