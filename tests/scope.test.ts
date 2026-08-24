import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// 测试侧 literal 声明已冻结的 Scope boundary，避免与未来 leaf implementation 同源。
const allowedTopLevelModules = new Set(['git', 'protocol', 'room', 'runner']);
const allowedRunnerFiles = new Set(['claude-process.ts', 'claude-stream.ts']);

test('Increment 3 allows only the two frozen runner leaf files and keeps MCP, CLI, extra modules and dependency drift rejected', () => {
  for (const name of ['mcp', 'cli']) {
    assert.equal(
      existsSync(join(root, 'src', name)),
      false,
      `src/${name} must not exist before Increment 4`,
    );
  }

  for (const name of readdirSync(join(root, 'src')).sort()) {
    assert.ok(
      allowedTopLevelModules.has(name),
      `unapproved top-level module: src/${name}`,
    );
  }

  const runnerDir = join(root, 'src', 'runner');
  if (existsSync(runnerDir)) {
    for (const entry of readdirSync(runnerDir, { withFileTypes: true })) {
      assert.ok(
        entry.isFile() && allowedRunnerFiles.has(entry.name),
        `unapproved entry under src/runner: ${entry.name}`,
      );
    }
  }

  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['zod']);
  assert.deepEqual(Object.keys(pkg.devDependencies).sort(), ['@types/node', 'typescript']);
});
