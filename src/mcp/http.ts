import type { Express, Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { RoomService } from '../room/room-service.ts';
import { registerClaudeTools, registerCodexTools } from './tools.ts';

// 单一 local process / 单一 RoomService 上的两个 stateless Streamable HTTP route。每个
// request 创建独立 MCP server/transport，durable state 只属于 SQLite；request 完成或
// connection 关闭后关闭 request-owned resource，不积累 session/listener/transport。

export interface RoomMcpHttpDeps {
  service: RoomService;
  projectPath: string;
  // 测试 seam：每个 request-owned server/transport 完成 idempotent cleanup 后同步回调一次。
  // 只作为同步/补充信号，不作为实际 close boundary 的 Oracle；runtime entry 不设置。
  onRequestCleanedUp?: () => void;
  // 测试 seam：request-owned server/transport 创建后、connect 前同步回调一次，供 direct
  // regression 包装实际 McpServer.close / StreamableHTTPServerTransport.close 观察真实
  // close boundary（含 server.close() 传递关闭 transport）。名称与职责只服务本 seam，
  // 不形成 generic resource framework；runtime entry 不设置，不改变 public contract。
  observeRequestResource?: (resource: {
    server: McpServer;
    transport: StreamableHTTPServerTransport;
  }) => void;
}

// server name 必须与 Runner 已冻结的 required tool prefix mcp__agent_room__ 一致。
const SERVER_NAME = 'agent_room';
const SERVER_VERSION = '0.1.0';

function newServer(): McpServer {
  return new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
}

async function handlePost(
  req: Request,
  res: Response,
  register: (server: McpServer) => void,
  onCleanedUp?: () => void,
  observeRequestResource?: (resource: {
    server: McpServer;
    transport: StreamableHTTPServerTransport;
  }) => void,
): Promise<void> {
  const server = newServer();
  register(server);
  // stateless 模式显式禁用 sessionIdGenerator，并启用 JSON response（application/json，
  // 不返回 SSE stream/session/resumability token）。GET/DELETE 不进入 transport 处理。
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  observeRequestResource?.({ server, transport });

  // 单一 idempotent cleanup owner：正常完成、connection close/abort、connect/handler 异常
  // 都收敛到 closeOnce；多个 completion signal 只关闭一次，不重复关闭 request-owned resource。
  let closed = false;
  const closeOnce = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    try {
      await transport.close();
    } catch {
      // 关闭失败不阻塞另一 resource 或 cleanup 信号。
    }
    try {
      await server.close();
    } catch {
      // 同上。
    }
    onCleanedUp?.();
  };

  // 在 handleRequest 前注册 close 监听，覆盖 client close/abort；不等待，避免 unhandled rejection。
  res.on('close', () => {
    void closeOnce();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
    await closeOnce();
    return;
  }
  // 正常完成后 request 生命周期结束，走同一 cleanup owner。
  await closeOnce();
}

function methodNotAllowed(_req: Request, res: Response): void {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed.' },
    id: null,
  });
}

export function createRoomMcpApp(deps: RoomMcpHttpDeps): Express {
  // createMcpExpressApp 对 127.0.0.1 自动启用 localhost host validation；不自行添加
  // generic auth wrapper，不直接信任 Host header。
  const app = createMcpExpressApp({ host: '127.0.0.1' });

  app.post('/mcp/codex', (req, res) =>
    void handlePost(
      req,
      res,
      (s) => registerCodexTools(s, deps),
      deps.onRequestCleanedUp,
      deps.observeRequestResource,
    ),
  );
  app.post('/mcp/claude', (req, res) =>
    void handlePost(
      req,
      res,
      (s) => registerClaudeTools(s, deps),
      deps.onRequestCleanedUp,
      deps.observeRequestResource,
    ),
  );

  app.get('/mcp/codex', methodNotAllowed);
  app.delete('/mcp/codex', methodNotAllowed);
  app.get('/mcp/claude', methodNotAllowed);
  app.delete('/mcp/claude', methodNotAllowed);

  return app;
}
