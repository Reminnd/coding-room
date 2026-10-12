import { DatabaseSync } from 'node:sqlite';
import type { Server } from 'node:http';
import { createRoomMcpApp } from '../mcp/http.ts';
import { RoomService } from '../room/room-service.ts';
import { VerificationRunner } from '../runner/verification.ts';
import type { UiProject } from './project-registry.ts';

export class ManagedMcp {
  private readonly servers = new Map<string, Promise<{ server: Server; db: DatabaseSync; verifier: VerificationRunner; port: number }>>();
  async port(project: UiProject): Promise<number> {
    let pending = this.servers.get(project.project_id);
    if (!pending) {
      pending = this.start(project);
      this.servers.set(project.project_id, pending);
      void pending.catch(() => this.servers.delete(project.project_id));
    }
    return (await pending).port;
  }
  private async start(project: UiProject) {
    const db = new DatabaseSync(project.database_path);
    try {
      const service = new RoomService(db);
      service.assertRoomParticipant(project.room_id, project.control_participant_id);
      const verifier = new VerificationRunner(db, service);
      const app = createRoomMcpApp({ service, projectPath: project.project_path,
        runVerification: (participantId, input) => verifier.run(participantId, input) });
      const server = await new Promise<Server>((resolve, reject) => {
        const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
        listener.once('error', reject);
      });
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Room MCP did not bind a port');
      return { server, db, verifier, port: address.port };
    } catch (error) { db.close(); throw error; }
  }
  async verifier(project: UiProject): Promise<VerificationRunner> {
    await this.port(project);
    return (await this.servers.get(project.project_id)!).verifier;
  }
  async close(): Promise<void> {
    for (const pending of this.servers.values()) {
      const runtime = await pending.catch(() => null);
      if (!runtime) continue;
      await runtime.verifier.close();
      await new Promise<void>((resolve) => { runtime.server.close(() => resolve()); runtime.server.closeIdleConnections(); });
      runtime.db.close();
    }
    this.servers.clear();
  }
  async activeVerifications(): Promise<Array<{ project_id: string; run_id: string }>> {
    const active: Array<{ project_id: string; run_id: string }> = [];
    for (const [projectId, pending] of this.servers) {
      const runtime = await pending.catch(() => null);
      if (runtime) active.push(...runtime.verifier.activeRunIds().map((runId) => ({ project_id: projectId, run_id: runId })));
    }
    return active;
  }
  async stopVerifications(): Promise<void> {
    for (const pending of this.servers.values()) {
      const runtime = await pending.catch(() => null);
      if (runtime) await runtime.verifier.close();
    }
  }
}
