import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('Increment 1 does not implement Runner, Git integration or MCP transport', () => {
  for (const name of ['runner', 'git', 'mcp', 'cli']) {
    assert.equal(
      existsSync(join(root, 'src', name)),
      false,
      `src/${name} must not exist in Increment 1`,
    );
  }
  assert.deepEqual(readdirSync(join(root, 'src')).sort(), ['protocol', 'room']);

  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['zod']);
  assert.deepEqual(Object.keys(pkg.devDependencies).sort(), ['@types/node', 'typescript']);
});
