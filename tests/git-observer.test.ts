import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collectCompletionEvidence,
  establishCleanBaseline,
  observeContinuation,
} from '../src/git/git-observer.ts';
import { GitCommandError } from '../src/git/git-process.ts';

const srcGitDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'git');

// 测试侧 fixture 隔离在 OS temporary directory；fixture 内的 init/config/add/commit 等
// 写操作只允许出现在 test code，product Git Observer 不得包含任何 mutation command。
function makeFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agent-room-git-'));
  return dir;
}

// 用独立 git CLI 调用设置 fixture。env 关闭 commit 签名与换行转换，保证跨机器可重复。
function git(fixture: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd: fixture,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@example.com',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@example.com',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
    },
  });
}

function gitConfigLocal(fixture: string, key: string, value: string): void {
  git(fixture, 'config', '--local', key, value);
}

// merge 冲突是预期失败（exit 1）；普通 git() 会在非零退出时抛错，这里捕获预期失败并返回
// 输出，供 fixture 制造真实 unmerged index 以证明 dedup。
function gitAllowConflict(fixture: string, ...args: string[]): string {
  try {
    return git(fixture, ...args);
  } catch (err) {
    const e = err as { stdout?: unknown };
    if (typeof e.stdout === 'string') {
      return e.stdout;
    }
    throw err;
  }
}

function initRepo(fixture: string): void {
  git(fixture, 'init', '-q', '-b', 'main');
  gitConfigLocal(fixture, 'commit.gpgsign', 'false');
  gitConfigLocal(fixture, 'core.autocrlf', 'false');
  git(fixture, 'commit', '--allow-empty', '-q', '-m', 'base');
}

function writeFile(fixture: string, relPath: string, content: string): void {
  const full = join(fixture, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

// 用垃圾字节覆盖 .git/index，使所有读取 index 的 evidence command（diff/ls-files）以
// exit 128 失败，复现 Review 的 fault injection。repository/HEAD 解析不读取 index，
// 因此合法 HEAD 仍保留，使本 fixture 精确覆盖 evidence fatal-failure path。
function corruptIndex(fixture: string): void {
  writeFileSync(join(fixture, '.git', 'index'), 'corrupt-index-bytes');
}

// 独立 oracle：baseline_head 期望来自测试侧直接调用 git rev-parse，不 import 实现。
function revParseHead(fixture: string): string {
  return git(fixture, 'rev-parse', 'HEAD').trim();
}

function statusSnapshot(fixture: string): { head: string; status: string } {
  return { head: revParseHead(fixture), status: git(fixture, 'status', '--porcelain').trim() };
}

function assertSortedUnique(paths: string[]): void {
  const sorted = [...paths].sort();
  assert.deepEqual(paths, sorted, 'evidence path array must be stable-sorted');
  assert.equal(new Set(paths).size, paths.length, 'evidence path array must be de-duplicated');
}

test('clean-baseline rejects non-repository and non-existent target paths', async () => {
  const nonRepo = makeFixture();
  const nonexistentParent = makeFixture();
  const nonexistent = join(nonexistentParent, 'does-not-exist');
  try {
    for (const target of [nonRepo, nonexistent]) {
      assert.equal(
        await errorCodeAsync(() => establishCleanBaseline(target)),
        'git_repository_missing',
      );
    }
  } finally {
    rmSync(nonRepo, { recursive: true, force: true });
    rmSync(nonexistentParent, { recursive: true, force: true });
  }
});

test('clean-baseline returns git_head_missing for a worktree with no commit', async () => {
  const fixture = makeFixture();
  git(fixture, 'init', '-q', '-b', 'main');
  try {
    assert.equal(
      await errorCodeAsync(() => establishCleanBaseline(fixture)),
      'git_head_missing',
      'a committed-less worktree must not be misreported as clean baseline',
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('clean repository returns full baseline_head, repository root and empty evidence', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  try {
    const baseline = await establishCleanBaseline(fixture);
    assert.equal(baseline.baselineHead, revParseHead(fixture));
    assert.match(baseline.baselineHead, /^[0-9a-f]{40}$/);
    assert.equal(resolve(baseline.repositoryRoot), resolve(fixture));
    assert.deepEqual(baseline.evidence, { staged: [], unstaged: [], untracked: [] });
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('staged-only, unstaged-only and untracked-only worktrees each return worktree_not_clean', async () => {
  const stagedOnly = makeFixture();
  initRepo(stagedOnly);
  writeFile(stagedOnly, 'a.txt', 'staged');
  git(stagedOnly, 'add', 'a.txt');

  const unstagedOnly = makeFixture();
  initRepo(unstagedOnly);
  writeFile(unstagedOnly, 'a.txt', 'unstaged');

  const untrackedOnly = makeFixture();
  initRepo(untrackedOnly);
  writeFile(untrackedOnly, 'a.txt', 'untracked');

  try {
    for (const fixture of [stagedOnly, unstagedOnly, untrackedOnly]) {
      assert.equal(
        await errorCodeAsync(() => establishCleanBaseline(fixture)),
        'worktree_not_clean',
      );
    }
  } finally {
    for (const fixture of [stagedOnly, unstagedOnly, untrackedOnly]) {
      rmSync(fixture, { recursive: true, force: true });
    }
  }
});

test('establishCleanBaseline rejects fatal evidence failure instead of returning clean baseline', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  corruptIndex(fixture);
  try {
    await assertFatalEvidenceFailure(() => establishCleanBaseline(fixture), fixture);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('collectCompletionEvidence rejects fatal evidence failure instead of returning empty evidence', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  corruptIndex(fixture);
  try {
    await assertFatalEvidenceFailure(() => collectCompletionEvidence(fixture), fixture);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('observeContinuation returns full HEAD, root and dirty evidence without requiring clean', async () => {
  const { fixture } = buildCombinedFixture();
  try {
    const observation = await observeContinuation(fixture);
    assert.equal(observation.head, revParseHead(fixture));
    assert.match(observation.head, /^[0-9a-f]{40}$/);
    assert.equal(resolve(observation.repositoryRoot), resolve(fixture));
    assert.deepEqual(observation.evidence.staged, ['both.txt', 'staged.txt']);
    assert.deepEqual(observation.evidence.unstaged, ['both.txt', 'unstaged.txt']);
    assert.deepEqual(observation.evidence.untracked, ['untracked-plain.txt', '带 空格.txt']);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('observeContinuation resolves the owning worktree root from a subdirectory', async () => {
  const { fixture, subdir } = buildCombinedFixture();
  try {
    const observation = await observeContinuation(subdir);
    assert.equal(resolve(observation.repositoryRoot), resolve(fixture));
    assert.deepEqual(observation.evidence.staged, ['both.txt', 'staged.txt']);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('observeContinuation rejects fatal evidence failure instead of returning empty evidence', async () => {
  const fixture = makeFixture();
  initRepo(fixture);
  corruptIndex(fixture);
  try {
    await assertFatalEvidenceFailure(() => observeContinuation(fixture), fixture);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('observeContinuation rejects a non-repository target with git_repository_missing', async () => {
  const fixture = makeFixture(); // 未 initRepo：非 git 目录
  try {
    assert.equal(await errorCodeAsync(() => observeContinuation(fixture)), 'git_repository_missing');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('observeContinuation returns git_head_missing for a worktree with no commit', async () => {
  const fixture = makeFixture();
  git(fixture, 'init', '-q', '-b', 'main'); // 无 commit → unborn HEAD
  try {
    assert.equal(await errorCodeAsync(() => observeContinuation(fixture)), 'git_head_missing');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

// 组合 fixture 覆盖 staged-only、unstaged-only、同一 path 同时 staged/unstaged、
// 带空格 untracked path 与 ignored path，证明 completion evidence 的精确分类。
function buildCombinedFixture(): { fixture: string; subdir: string } {
  const fixture = makeFixture();
  initRepo(fixture);

  writeFile(fixture, 'staged.txt', 'base');
  writeFile(fixture, 'unstaged.txt', 'base');
  writeFile(fixture, 'both.txt', 'base\n');
  writeFile(fixture, '.gitignore', 'ignored/\n');
  git(fixture, 'add', '.');
  git(fixture, 'commit', '-q', '-m', 'seed');

  // staged-only
  writeFile(fixture, 'staged.txt', 'changed');
  git(fixture, 'add', 'staged.txt');

  // unstaged-only
  writeFile(fixture, 'unstaged.txt', 'changed');

  // 同一 path 同时 staged 与 unstaged：先把 base 改 A 并 stage，再改 B 不 stage。
  writeFile(fixture, 'both.txt', 'A\n');
  git(fixture, 'add', 'both.txt');
  writeFile(fixture, 'both.txt', 'B\n');

  // untracked，其中一个带空格以证明 NUL parser 不拆分。
  writeFile(fixture, 'untracked-plain.txt', 'x');
  writeFile(fixture, '带 空格.txt', 'x');

  // ignored：--exclude-standard 下不得进入 untracked。
  writeFile(fixture, 'ignored/hidden.txt', 'x');

  const subdir = join(fixture, 'sub');
  mkdirSync(subdir);
  return { fixture, subdir };
}

test('completion evidence classifies staged/unstaged/untracked, with spaces and ignored paths', async () => {
  const { fixture } = buildCombinedFixture();
  try {
    const evidence = await collectCompletionEvidence(fixture);
    assert.deepEqual(evidence.staged, ['both.txt', 'staged.txt']);
    assert.deepEqual(evidence.unstaged, ['both.txt', 'unstaged.txt']);
    assert.deepEqual(evidence.untracked, ['untracked-plain.txt', '带 空格.txt']);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('completion evidence observes the whole worktree from a subdirectory, root-relative', async () => {
  const { fixture, subdir } = buildCombinedFixture();
  try {
    const evidence = await collectCompletionEvidence(subdir);
    assert.deepEqual(evidence.staged, ['both.txt', 'staged.txt']);
    assert.deepEqual(evidence.unstaged, ['both.txt', 'unstaged.txt']);
    assert.deepEqual(evidence.untracked, ['untracked-plain.txt', '带 空格.txt']);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('evidence arrays are de-duplicated and stable-sorted', async () => {
  // 未合并冲突使 git diff --name-only 对同一 path 输出两次；observer 必须去重。
  const fixture = makeFixture();
  initRepo(fixture);
  writeFile(fixture, 'f.txt', 'base');
  git(fixture, 'add', 'f.txt');
  git(fixture, 'commit', '-q', '-m', 'c1');
  git(fixture, 'checkout', '-q', '-b', 'side');
  writeFile(fixture, 'f.txt', 'side');
  git(fixture, 'add', 'f.txt');
  git(fixture, 'commit', '-q', '-m', 'side');
  git(fixture, 'checkout', '-q', 'main');
  writeFile(fixture, 'f.txt', 'main');
  git(fixture, 'add', 'f.txt');
  git(fixture, 'commit', '-q', '-m', 'main');
  gitAllowConflict(fixture, 'merge', 'side');
  // 确认已进入真实 conflict：merge conflict 下 git diff --name-only（worktree 侧）
  // 会对同一 path 输出多次，这是 observer 必须去重的真实来源。
  assert.ok(git(fixture, 'diff', '--name-only').split('\n').filter((l) => l !== '').length >= 2);

  try {
    const evidence = await collectCompletionEvidence(fixture);
    assert.deepEqual(evidence.unstaged, ['f.txt']);
    assert.deepEqual(evidence.staged, ['f.txt']);
    assertSortedUnique(evidence.unstaged);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('clean-baseline and completion-evidence do not mutate HEAD or worktree', async () => {
  const clean = makeFixture();
  initRepo(clean);
  const dirty = makeFixture();
  initRepo(dirty);
  writeFile(dirty, 'a.txt', 'dirty');
  try {
    for (const fixture of [clean, dirty]) {
      const before = statusSnapshot(fixture);
      await collectCompletionEvidence(fixture);
      await errorCodeAsync(() => establishCleanBaseline(fixture));
      const after = statusSnapshot(fixture);
      assert.deepEqual(after, before, 'Observer must not change HEAD, index or worktree');
    }
  } finally {
    rmSync(clean, { recursive: true, force: true });
    rmSync(dirty, { recursive: true, force: true });
  }
});

test('product Git Observer contains no git mutation command', () => {
  const mutationCommands = [
    'add', 'commit', 'checkout', 'switch', 'reset', 'restore', 'clean', 'stash',
    'merge', 'rebase', 'cherry-pick', 'push', 'branch', 'worktree', 'config', 'rm', 'mv',
  ];
  const readOnlyCommands = ['rev-parse', 'diff', 'ls-files'];

  const tokens = new Set<string>();
  for (const file of ['git-process.ts', 'git-observer.ts']) {
    const source = readFileSync(join(srcGitDir, file), 'utf8');
    for (const match of source.matchAll(/'([^']*)'/g)) {
      tokens.add(match[1]);
    }
  }

  for (const cmd of mutationCommands) {
    assert.ok(!tokens.has(cmd), `product source must not call git ${cmd}`);
  }
  for (const cmd of readOnlyCommands) {
    assert.ok(tokens.has(cmd), `product source should call git ${cmd}`);
  }
});

// 断言 public operation 对损坏 index 的 fatal evidence failure 以携带完整 process
// context 与真实 stderr 的 GitCommandError 拒绝，而不是返回 clean/empty evidence。
// 首个 evidence command 是 staged 的 diff --cached；不匹配平台相关的完整英文错误文本。
async function assertFatalEvidenceFailure(op: () => Promise<unknown>, fixture: string): Promise<void> {
  let caught: unknown;
  try {
    await op();
  } catch (err) {
    caught = err;
  }
  assert.ok(caught instanceof GitCommandError, 'fatal evidence failure must throw GitCommandError');
  const e = caught as GitCommandError;
  assert.equal(e.command, 'diff');
  assert.deepEqual(e.args, ['--cached', '--name-only', '-z']);
  assert.equal(resolve(e.cwd), resolve(fixture));
  assert.equal(e.exitCode, 128);
  assert.ok(e.stderr.trim().length > 0, 'GitCommandError must carry non-empty git stderr');
}

async function errorCodeAsync(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (err) {
    return (err as { code?: string }).code ?? null;
  }
}
