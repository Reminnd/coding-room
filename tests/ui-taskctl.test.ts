import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import { RoomUiApplication } from '../src/ui/application.ts';
import { createRoomUiHttpServer } from '../src/ui/http-server.ts';
import { ProjectRegistry } from '../src/ui/project-registry.ts';
import { RoomService } from '../src/room/room-service.ts';
import { PLANNER } from './fixtures.ts';

const execFileAsync = promisify(execFile);

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => { server.listen(0, '127.0.0.1', resolve); server.once('error', reject); });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test('taskctl drives projects, state, actions, events, export and VS Code APIs', async () => {
  const root = mkdtempSync(join(tmpdir(), 'room-ui-taskctl-'));
  const project = join(root, 'project with spaces');
  mkdirSync(project);
  const dbPath = join(root, 'room.sqlite');
  const db = new DatabaseSync(dbPath);
  new RoomService(db).createRoom('room-cli', PLANNER);
  db.close();
  const registry = new ProjectRegistry(join(root, 'registry.json'));
  registry.add({ project_id: 'cli', name: 'CLI', project_path: project, database_path: dbPath, room_id: 'room-cli', control_participant_id: 'codex-app', port: 4318 });
  const opened: string[] = [];
  const server = createRoomUiHttpServer(new RoomUiApplication(registry, { openVscode: async (target) => { opened.push(target); } }), join(root, 'missing-dist'));
  const base = await listen(server);
  const cli = join(process.cwd(), 'tools', 'taskctl.mjs');
  const run = async (...args: string[]) => execFileAsync(process.execPath, [cli, '--url', base, '--json', ...args], { cwd: process.cwd() });
  try {
    const projects = JSON.parse((await run('projects', 'list')).stdout);
    assert.equal(projects.projects[0].project_id, 'cli');
    const initial = JSON.parse((await run('state', 'cli')).stdout);
    assert.equal(initial.room.state, 'DISCUSSION');

    await assert.rejects(run('action', 'cli', 'begin-architecture-review', '--data', '{}', '--unexpected'));
    assert.equal(JSON.parse((await run('state', 'cli')).stdout).room.state, 'DISCUSSION');
    await run('--help');

    await run('action', 'cli', 'begin-architecture-review', '--data', '{}');
    const events = JSON.parse((await run('events', 'cli', '--type', 'state_transition')).stdout);
    assert.equal(events.events.length, 1);
    assert.equal(events.events[0].type, 'state_transition');

    const archivePath = join(root, 'archive.json');
    await run('export', 'cli', '--out', archivePath);
    const archive = JSON.parse(readFileSync(archivePath, 'utf8'));
    assert.equal(archive.snapshot.room.state, 'ARCHITECTURE_REVIEW');

    await run('open', 'cli');
    assert.deepEqual(opened, [project]);
  } finally {
    await close(server);
    rmSync(root, { recursive: true, force: true });
  }
});
