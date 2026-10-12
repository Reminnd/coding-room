import { RoomUiApplication } from './application.ts';
import { ProjectRegistry } from './project-registry.ts';
import { createRoomUiHttpServer } from './http-server.ts';

export async function startDesktopService(options: { registryPath: string; distDir: string }) {
  const application = new RoomUiApplication(new ProjectRegistry(options.registryPath));
  const server = createRoomUiHttpServer(application, options.distDir);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Room service did not bind a TCP port');
  return {
    application,
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await application.close();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
        server.closeIdleConnections();
      });
    },
  };
}
