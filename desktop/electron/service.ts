import { resolve } from 'node:path';
import { startDesktopService } from '../../src/ui/desktop-service.ts';

const [registryPath, distDir] = process.argv.slice(2);
if (!registryPath || !distDir) throw new Error('registry and frontend paths are required');
const service = await startDesktopService({ registryPath: resolve(registryPath), distDir: resolve(distDir) });
process.stdout.write(`${JSON.stringify({ ready: true, url: service.url })}\n`);
let closing: Promise<void> | null = null;
function shutdown() {
  if (!closing) closing = (async () => {
    await service.application.stopOwnedRuns();
    await service.close();
    process.exit(0);
  })().catch((error) => { console.error(error); process.exitCode = 1; });
  return closing;
}
process.on('message', (message) => { if (message === 'shutdown') void shutdown(); });
// A lost Electron main process is not a request to keep an inaccessible service running.
process.on('disconnect', () => { void shutdown(); });
