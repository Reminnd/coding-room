import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RoomUiApplication } from './application.ts';
import { createRoomUiHttpServer } from './http-server.ts';
import { ProjectRegistry } from './project-registry.ts';

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

let values: Record<string, unknown>;
try {
  values = parseArgs({
    args: process.argv.slice(2),
    options: {
      port: { type: 'string', default: '4317' },
      config: { type: 'string', default: resolve('.agent-room', 'ui-projects.json') },
    },
    strict: true,
    allowPositionals: false,
  }).values as Record<string, unknown>;
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const port = Number(values.port);
if (!Number.isInteger(port) || port < 1 || port > 65535) fail('--port must be an integer in 1..65535');
if (typeof values.config !== 'string' || values.config === '') fail('--config <path> is required');

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const registry = new ProjectRegistry(values.config);
const application = new RoomUiApplication(registry);
const server = createRoomUiHttpServer(application, resolve(root, 'frontend', 'dist'));
server.on('error', (error) => fail(`failed to bind 127.0.0.1:${port}: ${error.message}`));
server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Room UI listening on http://127.0.0.1:${port}\n`);
});
