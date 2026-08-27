import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// 测试侧 literal 声明已冻结的 Scope boundary，避免与 future implementation 同源。
const allowedTopLevelModules = new Set(['git', 'protocol', 'room', 'runner', 'mcp', 'cli']);
const allowedRunnerFiles = new Set(['claude-process.ts', 'claude-stream.ts', 'claude-runner.ts']);
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

test('Increment 7 allows exact MCP/CLI/shared-read-model files and the plugin/marketplace boundary, and keeps extra modules, tools and dependency drift rejected', () => {
  for (const name of readdirSync(join(root, 'src')).sort()) {
    assert.ok(allowedTopLevelModules.has(name), `unapproved top-level module: src/${name}`);
  }

  assertDirFiles(join(root, 'src', 'runner'), allowedRunnerFiles);
  assertDirFiles(join(root, 'src', 'mcp'), allowedMcpFiles);
  assertDirFiles(join(root, 'src', 'cli'), allowedCliFiles);
  assertDirFiles(join(root, 'src', 'room'), allowedRoomFiles);

  // Increment 7 packaging boundary：安装一次的 shared Plugin 与 repository-local
  // marketplace 是根目录唯一新增结构；plugin/skill 内部细节由 plugin-packaging.test.ts 锁定。
  assertDirEntries(join(root, 'plugins'), allowedPluginEntries);
  assertDirEntries(join(root, '.agents'), allowedAgentsEntries);
  assertDirEntries(join(root, '.agents', 'plugins'), allowedMarketplaceEntries);

  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['@modelcontextprotocol/sdk', 'zod']);
  assert.deepEqual(Object.keys(pkg.devDependencies).sort(), ['@types/express', '@types/node', 'typescript']);
});
