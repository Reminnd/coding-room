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

function assertDirFiles(dir: string, allowed: Set<string>): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    assert.ok(
      entry.isFile() && allowed.has(entry.name),
      `unapproved entry under ${dir}: ${entry.name}`,
    );
  }
}

test('Increment 6 allows exact MCP/CLI/shared-read-model files and keeps extra modules, tools and dependency drift rejected', () => {
  for (const name of readdirSync(join(root, 'src')).sort()) {
    assert.ok(allowedTopLevelModules.has(name), `unapproved top-level module: src/${name}`);
  }

  assertDirFiles(join(root, 'src', 'runner'), allowedRunnerFiles);
  assertDirFiles(join(root, 'src', 'mcp'), allowedMcpFiles);
  assertDirFiles(join(root, 'src', 'cli'), allowedCliFiles);
  assertDirFiles(join(root, 'src', 'room'), allowedRoomFiles);

  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['@modelcontextprotocol/sdk', 'zod']);
  assert.deepEqual(Object.keys(pkg.devDependencies).sort(), ['@types/express', '@types/node', 'typescript']);
});
