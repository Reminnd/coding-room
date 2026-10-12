import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startDesktopService } from '../src/ui/desktop-service.ts';

test('desktop service binds an available port and shuts down without a source-directory cwd', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'room-desktop-service-'));
  const handle = await startDesktopService({ registryPath: join(directory, 'projects.json'), distDir: resolve('frontend/dist') });
  try {
    const response = await fetch(`${handle.url}/api/projects`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { projects: [] });
  } finally {
    await handle.close();
    await rm(directory, { recursive: true, force: true });
  }
  await assert.rejects(fetch(`${handle.url}/api/projects`));
});
