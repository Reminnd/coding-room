import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// 测试侧 literal 声明已冻结的 Scope boundary，避免与 future implementation 同源。
const allowedTopLevelModules = new Set(['git', 'protocol', 'room', 'runner', 'mcp', 'cli', 'scheduler']);
const allowedSchedulerFiles = new Set(['plan-scheduler.ts']);
// v0.4：runner 边界新增 Executor/WorkerAdapter seam 两个文件；Stage 2 只允许这两个新模块。
const allowedRunnerFiles = new Set([
  'claude-process.ts',
  'claude-stream.ts',
  'claude-runner.ts',
  'executor.ts',
  'worker-adapter.ts',
]);
const allowedMcpFiles = new Set(['http.ts', 'tools.ts', 'serve.ts']);
const allowedCliFiles = new Set(['status.ts', 'run.ts']);
const allowedRoomFiles = new Set([
  'state-machine.ts',
  'repository.ts',
  'room-service.ts',
  'state-snapshot.ts',
]);
const allowedPluginEntries = new Set(['agent-room']);
const allowedAgentsEntries = new Set(['plugins']);
const allowedMarketplaceEntries = new Set(['marketplace.json']);
// Increment 8：plugin 树恰好是 manifest + 唯一 Skill authority + setup reference + Skill-owned
// deterministic setup helper（无 package manifest、无第二 Skill、无运行时生成物）。
const allowedPluginFiles = new Set([
  '.codex-plugin/plugin.json',
  'skills/agent-room/SKILL.md',
  'skills/agent-room/references/project-setup.md',
  'skills/agent-room/scripts/setup-project.ts',
]);

// 递归收集目录下全部文件的 '/' 分隔相对路径（供精确边界断言）。
function collectRelativeFiles(dir: string): string[] {
  const files: string[] = [];
  function walk(current: string): void {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort()) {
      const p = join(current, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile()) files.push(p.slice(dir.length + 1).replaceAll('\\', '/'));
    }
  }
  walk(dir);
  return files.sort();
}

function assertDirEntries(dir: string, allowed: Set<string>): void {
  assert.equal(existsSync(dir), true, `missing scope directory: ${dir}`);
  const entries = readdirSync(dir).sort();
  assert.deepEqual(entries, [...allowed].sort(), `unapproved entries under ${dir}`);
}

function assertDirFiles(dir: string, allowed: Set<string>): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    assert.ok(
      entry.isFile() && allowed.has(entry.name),
      `unapproved entry under ${dir}: ${entry.name}`,
    );
  }
}

test('Increment 12 allows the exact Scheduler boundary and keeps extra modules, plugin files and dependency drift rejected', () => {
  for (const name of readdirSync(join(root, 'src')).sort()) {
    assert.ok(allowedTopLevelModules.has(name), `unapproved top-level module: src/${name}`);
  }

  assertDirFiles(join(root, 'src', 'runner'), allowedRunnerFiles);
  assertDirFiles(join(root, 'src', 'mcp'), allowedMcpFiles);
  assertDirFiles(join(root, 'src', 'cli'), allowedCliFiles);
  assertDirFiles(join(root, 'src', 'room'), allowedRoomFiles);
  assertDirFiles(join(root, 'src', 'scheduler'), allowedSchedulerFiles);

  // Increment 7/8 packaging boundary：安装一次的 shared Plugin 与 repository-local
  // marketplace 是根目录唯一新增结构；plugin 树恰好四个文件（Increment 8 新增
  // Skill-owned setup helper），内部措辞细节由 plugin-packaging.test.ts 锁定。
  assertDirEntries(join(root, 'plugins'), allowedPluginEntries);
  assertDirEntries(join(root, '.agents'), allowedAgentsEntries);
  assertDirEntries(join(root, '.agents', 'plugins'), allowedMarketplaceEntries);
  assert.deepEqual(
    collectRelativeFiles(join(root, 'plugins', 'agent-room')),
    [...allowedPluginFiles].sort(),
    'plugin tree must contain exactly the manifest, Skill, setup reference and setup helper',
  );

  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['@modelcontextprotocol/sdk', 'zod']);
  assert.deepEqual(Object.keys(pkg.devDependencies).sort(), ['@types/express', '@types/node', 'typescript']);
});
