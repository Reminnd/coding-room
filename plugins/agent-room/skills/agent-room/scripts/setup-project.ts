// setup-project.ts — Agent Room Skill 的确定性项目 setup helper。
//
// 只使用 Node.js standard library。职责边界（Increment 8 Accepted Contract）：
//   - 输入校验、现有 binding 分类、port/UUID 生成与三份文件的计划/写入；
//   - 不写 SQLite schema（database schema 只由现有 room:serve 初始化）；
//   - 不调用 Room MCP（reload 后的 Room 创建/读取由 Skill 拥有）；
//   - 不启动 one-shot launcher/Claude process、不执行任何 Git mutation。
//
// 安全顺序：先读取并验证全部相关现有文件（含 conflict/mismatch 判定），全部通过后才
// mkdir/write；任何 invalid/conflict 都零写入并以非零 exit 报告。fresh binding 的 port
// 在 127.0.0.1 上请求 OS 分配 ephemeral port（probe socket 使用后关闭）；本 helper 不为
// probe 与 service bind 之间的理论 race 增加 reservation 机制（Contract 明确排除）。

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { isAbsolute, join, resolve } from 'node:path';

const RUNTIME_DIR = '.agent-room';
const CONFIG_DIR = '.codex';
const CONFIG_SECTION = '[mcp_servers.agent_room]';
// .gitignore 必须补齐的 local runtime 条目（Contract 冻结顺序）。
const GITIGNORE_ENTRIES = [
  '.agent-room/runtime.json',
  '.agent-room/room.sqlite',
  '.agent-room/room.sqlite-*',
  '.agent-room/artifacts/',
];

interface RuntimeBinding {
  agent_room_root: string;
  database_path: string;
  project_path: string;
  port: number;
  room_id: string;
}

interface SetupSummary {
  mode: 'created' | 'reused';
  runtime: RuntimeBinding;
  config: { action: 'created' | 'appended' | 'unchanged' };
  gitignore: { action: 'created' | 'appended' | 'unchanged'; added: string[] };
  serve_command: string;
  reload_required: boolean;
}

function usageError(message: string): never {
  console.error(`setup-project: ${message}`);
  console.error('usage: setup-project.ts [--agent-room-root <path>] | --probe');
  process.exit(2);
}

function fail(reason: string): never {
  console.error(`setup-project: ${reason}`);
  process.exit(1);
}

function parseArgs(argv: string[]): { mode: 'setup'; agentRoomRoot?: string } | { mode: 'probe' } {
  let agentRoomRoot: string | undefined;
  let probe = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--probe') {
      probe = true;
    } else if (arg === '--agent-room-root') {
      if (i + 1 >= argv.length) usageError('--agent-room-root requires a value');
      agentRoomRoot = argv[++i];
    } else {
      usageError(`unknown argument: ${arg}`);
    }
  }
  if (probe && agentRoomRoot !== undefined) {
    usageError('--probe and --agent-room-root are mutually exclusive');
  }
  if (probe) return { mode: 'probe' };
  return { mode: 'setup', agentRoomRoot };
}

// agent_room_root 必须解析为 absolute path，且其 package.json 同时定义 room:serve 与 room:run。
function validateAgentRoomRoot(rootInput: string): string {
  const root = resolve(rootInput);
  if (!existsSync(root)) fail(`agent_room_root is not an existing directory: ${root}`);
  const pkgPath = join(root, 'package.json');
  if (!existsSync(pkgPath)) fail(`agent_room_root has no package.json: ${root}`);
  let pkg: unknown;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch {
    fail(`agent_room_root package.json is not valid JSON: ${pkgPath}`);
  }
  const scripts = (pkg as { scripts?: unknown }).scripts;
  const isString = (v: unknown): v is string => typeof v === 'string';
  if (
    typeof scripts !== 'object' ||
    scripts === null ||
    !isString((scripts as Record<string, unknown>)['room:serve']) ||
    !isString((scripts as Record<string, unknown>)['room:run'])
  ) {
    fail(`agent_room_root package.json must define both room:serve and room:run scripts: ${pkgPath}`);
  }
  return root;
}

// runtime.json 读取与严格分类：missing / valid / invalid（invalid 带具体 reason，任何
// 越界形态都零写入停止）。valid 要求恰好五个字段、三个 absolute path、port 为 1..65535
// JSON integer、room_id 非空，且 project_path 经 host normal path resolution 等于当前项目。
type RuntimeParse =
  | { kind: 'missing' }
  | { kind: 'valid'; binding: RuntimeBinding }
  | { kind: 'invalid'; reason: string };

function readRuntime(projectPath: string): RuntimeParse {
  const path = join(projectPath, RUNTIME_DIR, 'runtime.json');
  if (!existsSync(path)) return { kind: 'missing' };
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return { kind: 'invalid', reason: 'cannot read .agent-room/runtime.json' };
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { kind: 'invalid', reason: 'runtime.json is not valid JSON' };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { kind: 'invalid', reason: 'runtime.json must be a JSON object' };
  }
  const obj = data as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const expected = ['agent_room_root', 'database_path', 'port', 'project_path', 'room_id'].sort();
  if (keys.join(',') !== expected.join(',')) {
    return { kind: 'invalid', reason: `runtime.json must contain exactly the five required fields (found: ${keys.join(', ')})` };
  }
  const stringField = (name: string): string | null => {
    const v = obj[name];
    return typeof v === 'string' ? v : null;
  };
  const agentRoomRoot = stringField('agent_room_root');
  const databasePath = stringField('database_path');
  const projectPathStored = stringField('project_path');
  const roomId = stringField('room_id');
  if (agentRoomRoot === null || !isAbsolute(agentRoomRoot)) {
    return { kind: 'invalid', reason: 'agent_room_root must be an absolute path string' };
  }
  if (databasePath === null || !isAbsolute(databasePath)) {
    return { kind: 'invalid', reason: 'database_path must be an absolute path string' };
  }
  if (projectPathStored === null || !isAbsolute(projectPathStored)) {
    return { kind: 'invalid', reason: 'project_path must be an absolute path string' };
  }
  if (resolve(projectPathStored) !== projectPath) {
    return { kind: 'invalid', reason: `project_path does not resolve to the current project (${projectPath})` };
  }
  const port = obj.port;
  if (!Number.isInteger(port) || (port as number) < 1 || (port as number) > 65535) {
    return { kind: 'invalid', reason: 'port must be a JSON integer in 1..65535' };
  }
  if (roomId === null || roomId.length === 0) {
    return { kind: 'invalid', reason: 'room_id must be a non-empty string' };
  }
  return {
    kind: 'valid',
    binding: {
      agent_room_root: agentRoomRoot,
      database_path: databasePath,
      project_path: projectPathStored,
      port: port as number,
      room_id: roomId,
    },
  };
}

// 定位 [mcp_servers.agent_room] section header（含 TOML 合法 quoted table 名形态）。
function findAgentRoomSection(lines: string[]): number {
  return lines.findIndex(
    (t) => t === CONFIG_SECTION || t === '[mcp_servers."agent_room"]' || t === "[mcp_servers.'agent_room']",
  );
}

// Review finding inc8-r1：冻结的 agent_room direct dotted URL assignment grammar。只识别
// 这三种 server-name 表示（bare、double-quoted、single-quoted）且 URL 为 double-quoted
// scalar；不解析任意 quoted key、multiline value、array/table AST 或 general TOML
// normalization。其它 server 的 direct dotted URL assignment 只接受 TOML bare key 形态。
const AGENT_ROOM_DOTTED_URL_PATTERNS: RegExp[] = [
  /^mcp_servers\.agent_room\.url\s*=\s*"([^"]*)"\s*$/,
  /^mcp_servers\."agent_room"\.url\s*=\s*"([^"]*)"\s*$/,
  /^mcp_servers\.'agent_room'\.url\s*=\s*"([^"]*)"\s*$/,
];
const OTHER_SERVER_DOTTED_URL_PATTERN = /^mcp_servers\.([A-Za-z0-9_-]+)\.url\s*=\s*"([^"]*)"\s*$/;

// 返回第一个 active table header 之前的行；table header 之后的 key 属于该 table，不得按
// top-level 分类（Review finding inc8-r2）。header 判定与既有 section 扫描一致（以 `[`
// 开头并以 `]` 结尾的行，含 `[[...]]` array-of-tables 形态）。
function topLevelPrefix(lines: string[]): string[] {
  const prefix: string[] = [];
  for (const t of lines) {
    if (t.startsWith('[') && t.endsWith(']')) break;
    prefix.push(t);
  }
  return prefix;
}

// 收集全部 top-level 冻结 agent_room dotted URL assignment 的 URL；不存在任何形态时返回
// 空数组。table header 后的嵌套同名 dotted key 属于该 table，不作为 project binding。
function findAgentRoomDottedUrls(lines: string[]): string[] {
  const urls: string[] = [];
  for (const t of topLevelPrefix(lines)) {
    for (const pattern of AGENT_ROOM_DOTTED_URL_PATTERNS) {
      const m = pattern.exec(t);
      if (m) urls.push(m[1]);
    }
  }
  return urls;
}

function detectEol(text: string): string {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

// .codex/config.toml 的保守计划：只识别 agent_room section header、冻结的 top-level
// agent_room direct dotted URL assignment（含 quoted server-name 表示）、active url 行与
// inline agent_room 形态；不通用解析 TOML。dotted key 只有位于第一个 active table header
// 之前才按 top-level 分类，table header 后的嵌套同名 key 属于该 table（Review finding
// inc8-r2）。已有 top-level agent_room 定义（section 或 dotted key）且 URL 不一致、无法
// 保守判定、或相同 URL 被其它 server 占用时 fail（零写入）。追加时逐字保留原内容。
type ConfigPlan = { action: 'created' | 'appended' | 'unchanged'; content: string | null };

function planConfig(text: string | null, expectedUrl: string): ConfigPlan {
  const urlLine = `url = "${expectedUrl}"`;
  if (text === null) {
    return { action: 'created', content: `${CONFIG_SECTION}\n${urlLine}\n` };
  }
  const eol = detectEol(text);
  const lines = text.split(/\r?\n/);
  const trimmed = lines.map((l) => l.trim());
  const sectionIndex = findAgentRoomSection(trimmed);
  const dottedAgentRoomUrls = findAgentRoomDottedUrls(trimmed);
  if (sectionIndex >= 0 && dottedAgentRoomUrls.length > 0) {
    // 同一 server 同时用 [table] header 与 dotted key 定义是合法 TOML 不允许的重复定义；
    // 无法保守判定，fail closed（Review finding inc8-r1 零写入 invariant）。
    fail('config conflict: cannot conservatively determine the [mcp_servers.agent_room] url (mixed section and dotted-key definition)');
  }
  if (sectionIndex >= 0) {
    // 只在该 section 内（下一 table header 前）收集 active url 行。
    const sectionUrls: string[] = [];
    for (let i = sectionIndex + 1; i < lines.length; i++) {
      const t = trimmed[i];
      if (t.startsWith('[') && t.endsWith(']')) break;
      const m = /^url\s*=\s*"([^"]*)"\s*$/.exec(t);
      if (m) sectionUrls.push(m[1]);
    }
    if (sectionUrls.length === 1 && sectionUrls[0] === expectedUrl) {
      return { action: 'unchanged', content: null };
    }
    if (sectionUrls.length === 1) {
      fail(`config conflict: [mcp_servers.agent_room] url is ${sectionUrls[0]}, expected ${expectedUrl}`);
    }
    fail('config conflict: cannot conservatively determine the [mcp_servers.agent_room] url');
  }
  if (dottedAgentRoomUrls.length > 0) {
    // 冻结 dotted key 的匹配分类：matching exact URL 视为已有匹配 binding（不追加 table）；
    // 单一不同 URL 按 mismatch 拒绝；多个不同取值无法保守判定。
    if (dottedAgentRoomUrls.length === 1 && dottedAgentRoomUrls[0] === expectedUrl) {
      return { action: 'unchanged', content: null };
    }
    if (dottedAgentRoomUrls.length === 1) {
      fail(`config conflict: mcp_servers.agent_room.url is ${dottedAgentRoomUrls[0]}, expected ${expectedUrl}`);
    }
    fail('config conflict: cannot conservatively determine the mcp_servers.agent_room.url');
  }
  for (const t of trimmed) {
    if (/^agent_room\s*=\s*\{/.test(t)) {
      fail('config conflict: cannot conservatively evaluate an inline agent_room binding');
    }
    const m = /^url\s*=\s*"([^"]*)"\s*$/.exec(t);
    if (m && m[1] === expectedUrl) {
      fail(`config conflict: ${expectedUrl} is already owned by another server`);
    }
  }
  // 其它 server 的 top-level direct dotted URL assignment 占用 exact expected URL 时按
  // other-server ownership conflict 拒绝；table header 后的同名 key 属于该 table，不属于
  // top-level ownership（agent_room 冻结形态已在上面处理）。
  for (const t of topLevelPrefix(trimmed)) {
    const dm = OTHER_SERVER_DOTTED_URL_PATTERN.exec(t);
    if (dm && dm[2] === expectedUrl) {
      fail(`config conflict: ${expectedUrl} is already owned by another server`);
    }
  }
  let out = text;
  if (!out.endsWith('\n')) out += eol;
  if (!out.endsWith(eol + eol)) out += eol;
  out += `${CONFIG_SECTION}${eol}${urlLine}${eol}`;
  return { action: 'appended', content: out };
}

// .gitignore 的保守计划：存在时逐字保留原内容，只追加缺失的 local runtime 条目；
// 已全部存在则不重写（幂等）。
type GitignorePlan = {
  action: 'created' | 'appended' | 'unchanged';
  content: string | null;
  added: string[];
};

function planGitignore(text: string | null): GitignorePlan {
  if (text === null) {
    return {
      action: 'created',
      content: GITIGNORE_ENTRIES.join('\n') + '\n',
      added: [...GITIGNORE_ENTRIES],
    };
  }
  const eol = detectEol(text);
  const present = new Set(text.split(/\r?\n/).map((l) => l.trim()));
  const added = GITIGNORE_ENTRIES.filter((e) => !present.has(e));
  if (added.length === 0) return { action: 'unchanged', content: null, added: [] };
  let out = text;
  if (!out.endsWith('\n')) out += eol;
  if (!out.endsWith(eol + eol)) out += eol;
  out += added.join(eol) + eol;
  return { action: 'appended', content: out, added };
}

// 在 127.0.0.1 上请求 OS 分配一个可用 ephemeral port；probe socket 用后即关闭。
// 本 helper 不为 probe 与后续 service bind 之间的理论 race 增加 reservation（Contract）。
function allocateLoopbackPort(): Promise<number> {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer();
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        rejectPromise(new Error('no port assigned'));
        return;
      }
      server.close(() => resolvePromise(address.port));
    });
  });
}

// 探测 binding 的 loopback port 是否已有服务监听（connect 成功=open；refused/timeout=closed）。
// 该 probe 不是 Room identity authority，只避免明显重复启动第二个 process。
function probeLoopbackPort(port: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    let settled = false;
    const done = (open: boolean): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolvePromise(open);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.once('timeout', () => done(false));
    socket.setTimeout(300);
  });
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  // project_path 只来自当前 target workspace（host normal path resolution），不扫描其它 project。
  const projectPath = resolve(process.cwd());

  if (parsed.mode === 'probe') {
    const rt = readRuntime(projectPath);
    if (rt.kind === 'missing') fail('no runtime binding exists in this project');
    if (rt.kind === 'invalid') fail(`invalid runtime binding: ${rt.reason}`);
    const open = await probeLoopbackPort(rt.binding.port);
    console.log(JSON.stringify({ port_open: open }));
    return;
  }

  // —— plan 阶段：只读取/验证现有文件，不创建目录、不写文件 ——
  const configPath = join(projectPath, CONFIG_DIR, 'config.toml');
  const gitignorePath = join(projectPath, '.gitignore');
  const configText = existsSync(configPath) ? readFileSync(configPath, 'utf8') : null;
  const gitignoreText = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf8') : null;
  const rt = readRuntime(projectPath);

  let mode: 'created' | 'reused';
  let binding: RuntimeBinding;
  if (rt.kind === 'missing') {
    // fresh binding：operator 只提供一次 agent_room_root。
    if (parsed.agentRoomRoot === undefined) {
      fail('--agent-room-root is required when no runtime binding exists');
    }
    const root = validateAgentRoomRoot(parsed.agentRoomRoot);
    if (configText !== null) {
      // 任何冻结 agent_room 定义形态（section header 或 direct dotted URL key）都必须在
      // port/UUID allocation 与任何文件写入前拒绝（Review finding inc8-r1 零写入 invariant）。
      const configLines = configText.split(/\r?\n/).map((l) => l.trim());
      if (findAgentRoomSection(configLines) >= 0) {
        fail('runtime binding is missing but config already defines [mcp_servers.agent_room]');
      }
      if (findAgentRoomDottedUrls(configLines).length > 0) {
        fail('runtime binding is missing but config already defines mcp_servers.agent_room.url');
      }
    }
    const port = await allocateLoopbackPort();
    binding = {
      agent_room_root: root,
      database_path: join(projectPath, RUNTIME_DIR, 'room.sqlite'),
      project_path: projectPath,
      port,
      room_id: `room-${randomUUID()}`,
    };
    mode = 'created';
  } else if (rt.kind === 'invalid') {
    fail(`invalid runtime binding: ${rt.reason}`);
  } else {
    // valid binding 幂等复用：identity 以 stored 为准；operator 若另行提供 root 必须一致。
    const storedRoot = rt.binding.agent_room_root;
    if (parsed.agentRoomRoot !== undefined && resolve(parsed.agentRoomRoot) !== resolve(storedRoot)) {
      fail(`agent_room_root mismatch: runtime stores ${storedRoot}, provided ${parsed.agentRoomRoot}`);
    }
    validateAgentRoomRoot(storedRoot);
    binding = rt.binding;
    mode = 'reused';
  }

  const expectedUrl = `http://127.0.0.1:${binding.port}/mcp/codex`;
  const configPlan = planConfig(configText, expectedUrl);
  const gitignorePlan = planGitignore(gitignoreText);

  // —— write 阶段：plan 全部通过后才创建目录/写文件（created 模式才写 runtime）——
  if (mode === 'created') {
    mkdirSync(join(projectPath, RUNTIME_DIR), { recursive: true });
    writeFileSync(join(projectPath, RUNTIME_DIR, 'runtime.json'), JSON.stringify(binding, null, 2) + '\n');
  }
  if (configPlan.content !== null) {
    mkdirSync(join(projectPath, CONFIG_DIR), { recursive: true });
    writeFileSync(configPath, configPlan.content);
  }
  if (gitignorePlan.content !== null) {
    writeFileSync(gitignorePath, gitignorePlan.content);
  }

  // deterministic JSON summary：stdout 只是信息输出，不是 Room durable authority。
  const summary: SetupSummary = {
    mode,
    runtime: binding,
    config: { action: configPlan.action },
    gitignore: { action: gitignorePlan.action, added: gitignorePlan.added },
    serve_command: `npm --prefix "${binding.agent_room_root}" run room:serve -- --db "${binding.database_path}" --project "${binding.project_path}" --port ${binding.port}`,
    reload_required: configPlan.action !== 'unchanged',
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err: unknown) => {
  console.error(`setup-project: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
