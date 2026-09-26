import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { ProtocolError } from '../protocol/errors.ts';
import { ZodError } from 'zod';
import { RoomUiApplication } from './application.ts';

const JSON_LIMIT = 2 * 1024 * 1024;
const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost)(:\d+)?$/i;

const MIME: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function json(res: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}): void {
  const body = JSON.stringify(value, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(body);
}

function errorResponse(res: ServerResponse, error: unknown): void {
  if (error instanceof ProtocolError) {
    json(res, 409, { error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof ZodError) {
    json(res, 400, { error: { code: 'validation_failed', message: error.message } });
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  const missing = /not found|does not exist|不存在/.test(message);
  json(res, missing ? 404 : 400, { error: { code: missing ? 'entity_not_found' : 'configuration_error', message } });
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > JSON_LIMIT) throw new Error('request body exceeds 2 MiB');
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('request body must be valid JSON');
  }
}

function assertLocalRequest(req: IncomingMessage): void {
  const host = req.headers.host;
  if (!host || !LOOPBACK_HOST.test(host)) throw new Error('Host must be loopback');
  const origin = req.headers.origin;
  if (!origin) return;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error('Origin must be a valid loopback URL');
  }
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname)) throw new Error('Origin must be loopback');
  if (parsed.host.toLowerCase() !== host.toLowerCase()) throw new Error('Origin must match the Room UI origin');
}

function projectRoute(pathname: string): { projectId: string; tail: string[] } | null {
  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] !== 'api' || parts[1] !== 'projects' || !parts[2]) return null;
  return { projectId: parts[2], tail: parts.slice(3) };
}

function serveStatic(distDir: string, pathname: string, res: ServerResponse): void {
  const root = resolve(distDir);
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  let target = resolve(root, requested);
  if (!target.toLowerCase().startsWith(`${root.toLowerCase()}${sep}`) && target.toLowerCase() !== root.toLowerCase()) {
    json(res, 404, { error: { code: 'not_found', message: 'Not found' } });
    return;
  }
  if (!existsSync(target) || !statSync(target).isFile()) target = resolve(root, 'index.html');
  if (!existsSync(target)) {
    json(res, 503, { error: { code: 'frontend_not_built', message: 'frontend/dist is missing; run npm --prefix frontend run build' } });
    return;
  }
  const stat = statSync(target);
  res.writeHead(200, {
    'content-type': MIME[extname(target)] ?? 'application/octet-stream',
    'content-length': stat.size,
    'cache-control': target.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  createReadStream(target).pipe(res);
}

export function createRoomUiHttpServer(application: RoomUiApplication, distDir: string): Server {
  return createServer(async (req, res) => {
    try {
      assertLocalRequest(req);
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
      const method = req.method ?? 'GET';
      if (method === 'OPTIONS') {
        res.writeHead(204, { allow: 'GET, POST, DELETE, OPTIONS' });
        res.end();
        return;
      }
      if (url.pathname === '/api/health' && method === 'GET') {
        json(res, 200, { status: 'ok' });
        return;
      }
      if (url.pathname === '/api/projects' && method === 'GET') {
        json(res, 200, { projects: application.listProjects() });
        return;
      }
      if (url.pathname === '/api/projects' && method === 'POST') {
        json(res, 201, { project: application.addProject(await readBody(req)) });
        return;
      }
      if (url.pathname === '/api/projects/import-runtime' && method === 'POST') {
        json(res, 201, { project: application.importRuntime(await readBody(req)) });
        return;
      }
      const route = projectRoute(url.pathname);
      if (route) {
        const [resource, subresource] = route.tail;
        if (!resource && method === 'DELETE') {
          application.removeProject(route.projectId);
          json(res, 200, { removed: true });
          return;
        }
        if (resource === 'create-room' && method === 'POST') {
          json(res, 201, application.createRoom(route.projectId, await readBody(req)));
          return;
        }
        if (resource === 'state' && method === 'GET') {
          const raw = url.searchParams.get('after_sequence');
          const after = raw === null ? undefined : Number(raw);
          if (after !== undefined && (!Number.isInteger(after) || after < 0)) throw new Error('after_sequence must be a non-negative integer');
          json(res, 200, application.getState(route.projectId, after));
          return;
        }
        if (resource === 'events' && method === 'GET') {
          const state = application.getState(route.projectId) as { events: Array<{ type: string; sequence: number }> };
          const after = Number(url.searchParams.get('after_sequence') ?? 0);
          if (!Number.isInteger(after) || after < 0) throw new Error('after_sequence must be a non-negative integer');
          const type = url.searchParams.get('type');
          const events = state.events.filter((event) => event.sequence > after && (type === null || event.type === type));
          json(res, 200, { events });
          return;
        }
        if (resource === 'actions' && subresource && method === 'POST') {
          json(res, 200, await application.action(route.projectId, subresource, await readBody(req)));
          return;
        }
        if (resource === 'runs' && subresource === 'start' && method === 'POST') {
          json(res, 202, { launch: application.startRun(route.projectId, await readBody(req)) });
          return;
        }
        if (resource === 'launches' && method === 'GET') {
          json(res, 200, { launches: application.listLaunches(route.projectId) });
          return;
        }
        if (resource === 'git' && method === 'GET') {
          json(res, 200, await application.gitState(route.projectId));
          return;
        }
        if (resource === 'open-vscode' && method === 'POST') {
          json(res, 202, await application.openVscode(route.projectId, await readBody(req)));
          return;
        }
        if (resource === 'export' && method === 'GET') {
          json(res, 200, application.exportArchive(route.projectId), {
            'content-disposition': `attachment; filename="agent-room-${route.projectId}.json"`,
          });
          return;
        }
      }
      if (url.pathname.startsWith('/api/')) {
        json(res, 404, { error: { code: 'not_found', message: 'API route not found' } });
        return;
      }
      if (method !== 'GET' && method !== 'HEAD') {
        json(res, 405, { error: { code: 'method_not_allowed', message: 'Method not allowed' } });
        return;
      }
      serveStatic(distDir, url.pathname, res);
    } catch (error) {
      errorResponse(res, error);
    }
  });
}
