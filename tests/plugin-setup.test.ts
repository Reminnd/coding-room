import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// Increment 8 setup focused regression + actual loopback E2E：以本仓库自身作为
// agent_room_root（其 package.json 定义 room:serve、room:run 与 room:git），在 temporary
// target project 中运行 Skill-owned helper、启动 existing room:serve boundary，并模拟
// Codex Desktop reload 后的 project-scoped MCP continuation（room_create/room_get_state
// 到达 DISCUSSION）。不启动真实/付费 Claude、不执行 room:run、不访问 network、不依赖
// 固定 port 或 global Codex settings。
//
// Increment 10 v0.5 port：fresh/migration setup 现生成 v0.5 八字段 binding
// （ordered archived_database_paths array、database_path=room-v0.5.sqlite、
// protocol_version=0.5-design）；v0.2/v0.3 binding 是 archive 输入（只迁移不复用），
// 旧 database 保持原路径与逐 byte 内容不变；snapshot 断言改用 v0.5 的
// planning_waiting_actor/run_work_items（current_* 字段已移除）。

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const helperPath = join(root, 'plugins', 'agent-room', 'skills', 'agent-room', 'scripts', 'setup-project.ts');
const servePath = join(root, 'src', 'mcp', 'serve.ts');

// 与 helper 冻结的 GITIGNORE_ENTRIES 顺序一致：v0.5 database 条目追加，旧版本条目保留
//（archived database 继续以原路径存在于 .agent-room）。
const GITIGNORE_ENTRIES = [
  '.agent-room/runtime.json',
  '.agent-room/room.sqlite',
  '.agent-room/room.sqlite-*',
  '.agent-room/room-v0.3.sqlite',
  '.agent-room/room-v0.3.sqlite-*',
  '.agent-room/room-v0.5.sqlite',
  '.agent-room/room-v0.5.sqlite-*',
  '.agent-room/artifacts/',
];

// v0.5 八字段：五字段 + protocol_version + control_participant_id +
// archived_database_paths（有序 array）。
const V04_FIELDS = [
  'agent_room_root',
  'archived_database_paths',
  'control_participant_id',
  'database_path',
  'port',
  'project_path',
  'protocol_version',
  'room_id',
];

function runHelper(cwd: string, args: string[] = []): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [helperPath, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 60000,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function makeProject(): string {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-room-setup-'));
  return fixture;
}

function makeGitProject(): string {
  const fixture = makeProject();
  execFileSync('git', ['init', '-q', '-b', 'main'], {
    cwd: fixture,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@example.com',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@example.com',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
    },
  });
  execFileSync('git', ['config', '--local', 'commit.gpgsign', 'false'], { cwd: fixture });
  execFileSync('git', ['config', '--local', 'core.autocrlf', 'false'], { cwd: fixture });
  writeFileSync(join(fixture, 'seed.txt'), 'base');
  execFileSync('git', ['add', '.'], { cwd: fixture });
  execFileSync('git', ['commit', '-q', '-m', 'base'], { cwd: fixture });
  return fixture;
}

function startServe(db: string, project: string, port: number): ChildProcess {
  return spawn(process.execPath, [servePath, '--db', db, '--project', project, '--port', String(port)], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// 等待 existing listening success signal（serve stdout 固定行）。
function waitForListening(child: ChildProcess, timeoutMs: number): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    let out = '';
    const timer = setTimeout(
      () => rejectPromise(new Error(`serve did not report listening within ${timeoutMs}ms; output: ${out}`)),
      timeoutMs,
    );
    child.stdout!.on('data', (chunk: Buffer) => {
      out += chunk.toString();
      if (out.includes('Room MCP listening')) {
        clearTimeout(timer);
        resolvePromise(out);
      }
    });
    child.stderr!.on('data', (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.once('exit', (code) => {
      if (!out.includes('Room MCP listening')) {
        clearTimeout(timer);
        rejectPromise(new Error(`serve exited early (${code}); output: ${out}`));
      }
    });
  });
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    let stderr = '';
    child.stderr!.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const timer = setTimeout(() => rejectPromise(new Error('serve did not exit in time')), timeoutMs);
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolvePromise({ code, stderr });
    });
  });
}

function stopChild(child: ChildProcess | undefined): Promise<void> {
  if (child === undefined || child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolvePromise) => {
    const fallback = setTimeout(resolvePromise, 5000);
    fallback.unref();
    child!.once('exit', () => {
      clearTimeout(fallback);
      resolvePromise();
    });
    child!.kill();
  });
}

test('fresh setup creates the exact eight-field v0.5 binding, project config and ignore rules from an operator-provided root', () => {
  const fixture = makeProject();
  try {
    const r = runHelper(fixture, ['--agent-room-root', root]);
    assert.equal(r.status, 0, r.stderr);
    const summary = JSON.parse(r.stdout) as {
      mode: string;
      runtime: Record<string, unknown>;
      config: { action: string };
      gitignore: { action: string; added: string[] };
      serve_command: string;
      reload_required: boolean;
    };
    assert.equal(summary.mode, 'created');
    const rt = summary.runtime;
    assert.equal(rt.agent_room_root, root);
    assert.equal(rt.database_path, join(fixture, '.agent-room', 'room-v0.5.sqlite'));
    assert.equal(rt.project_path, fixture);
    assert.ok(Number.isInteger(rt.port) && (rt.port as number) >= 1 && (rt.port as number) <= 65535);
    assert.match(rt.room_id as string, /^room-[0-9a-f-]{36}$/);
    // v0.5 binding 额外三字段：frozen protocol version、control participant 与有序 archive array。
    assert.equal(rt.protocol_version, '0.5-design');
    assert.equal(rt.control_participant_id, 'codex-app');
    assert.deepEqual(rt.archived_database_paths, []);
    assert.equal(summary.config.action, 'created');
    assert.equal(summary.gitignore.action, 'created');
    assert.deepEqual(summary.gitignore.added, GITIGNORE_ENTRIES);
    assert.equal(summary.reload_required, true);
    assert.ok(summary.serve_command.startsWith(`npm --prefix "${root}" run room:serve -- `));
    assert.ok(summary.serve_command.includes(`--db "${rt.database_path}"`));
    assert.ok(summary.serve_command.includes(`--project "${rt.project_path}"`));
    assert.ok(summary.serve_command.includes(`--port ${rt.port}`));

    // 磁盘证据：runtime.json 恰好八个字段且与 summary 一致；config/gitignore 为生成内容。
    const runtimeOnDisk = JSON.parse(readFileSync(join(fixture, '.agent-room', 'runtime.json'), 'utf8'));
    assert.deepEqual(runtimeOnDisk, rt);
    assert.deepEqual(Object.keys(runtimeOnDisk).sort(), V04_FIELDS);
    const configText = readFileSync(join(fixture, '.codex', 'config.toml'), 'utf8');
    assert.equal(
      configText,
      `[mcp_servers.agent_room]\nurl = "http://127.0.0.1:${rt.port}/mcp/participants/p~codex-app"\n`,
    );
    const gitignoreText = readFileSync(join(fixture, '.gitignore'), 'utf8');
    assert.equal(gitignoreText, GITIGNORE_ENTRIES.join('\n') + '\n');
    // database schema 只由 existing room:serve 初始化：helper 不得创建 database 文件。
    assert.equal(existsSync(rt.database_path as string), false);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('valid rerun is idempotent: exact identity is reused, files stay byte-identical, reload_required is false', () => {
  const fixture = makeProject();
  try {
    const first = JSON.parse(runHelper(fixture, ['--agent-room-root', root]).stdout);
    const runtimeBefore = readFileSync(join(fixture, '.agent-room', 'runtime.json'), 'utf8');
    const configBefore = readFileSync(join(fixture, '.codex', 'config.toml'), 'utf8');
    const gitignoreBefore = readFileSync(join(fixture, '.gitignore'), 'utf8');

    // 幂等 rerun：不重复提供 root（复用 stored agent_room_root）。
    const r2 = runHelper(fixture, []);
    assert.equal(r2.status, 0, r2.stderr);
    const second = JSON.parse(r2.stdout);
    assert.equal(second.mode, 'reused');
    assert.deepEqual(second.runtime, first.runtime, 'rerun must reuse the exact five runtime values');
    assert.equal(second.config.action, 'unchanged');
    assert.equal(second.gitignore.action, 'unchanged');
    assert.deepEqual(second.gitignore.added, []);
    assert.equal(second.reload_required, false);

    assert.equal(readFileSync(join(fixture, '.agent-room', 'runtime.json'), 'utf8'), runtimeBefore);
    assert.equal(readFileSync(join(fixture, '.codex', 'config.toml'), 'utf8'), configBefore);
    assert.equal(readFileSync(join(fixture, '.gitignore'), 'utf8'), gitignoreBefore);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('existing unrelated config and gitignore content is preserved verbatim and only missing entries are appended', () => {
  const fixture = makeProject();
  try {
    // CRLF config 同时验证 EOL 保留；gitignore 已有无关规则。
    const configOriginal = '# project notes\r\nmcp_enabled = false\r\n';
    const gitignoreOriginal = 'node_modules/\n';
    mkdirSync(join(fixture, '.codex'), { recursive: true });
    writeFileSync(join(fixture, '.codex', 'config.toml'), configOriginal);
    writeFileSync(join(fixture, '.gitignore'), gitignoreOriginal);

    const r = runHelper(fixture, ['--agent-room-root', root]);
    assert.equal(r.status, 0, r.stderr);
    const summary = JSON.parse(r.stdout);
    const port = summary.runtime.port;
    assert.equal(summary.config.action, 'appended');
    assert.equal(summary.gitignore.action, 'appended');

    const configOut = readFileSync(join(fixture, '.codex', 'config.toml'), 'utf8');
    assert.equal(
      configOut,
      `${configOriginal}\r\n[mcp_servers.agent_room]\r\nurl = "http://127.0.0.1:${port}/mcp/participants/p~codex-app"\r\n`,
      'original config content must be preserved verbatim',
    );
    const gitignoreOut = readFileSync(join(fixture, '.gitignore'), 'utf8');
    assert.equal(gitignoreOut, `${gitignoreOriginal}\n${GITIGNORE_ENTRIES.join('\n')}\n`);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('invalid roots, conflicts and mismatches stop before any write and leave every target file untouched', () => {
  // (a) fresh project + 不存在的 agent_room_root：零写入。
  {
    const fixture = makeProject();
    try {
      const r = runHelper(fixture, ['--agent-room-root', join(fixture, 'no-such-root')]);
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /not an existing directory/);
      assert.equal(existsSync(join(fixture, '.agent-room')), false);
      assert.equal(existsSync(join(fixture, '.codex')), false);
      assert.equal(existsSync(join(fixture, '.gitignore')), false);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  }
  // (b) fresh project + root 的 package.json 缺少 room:serve/room:run scripts：零写入。
  {
    const fixture = makeProject();
    try {
      writeFileSync(join(fixture, 'package.json'), JSON.stringify({ scripts: { build: 'node x' } }));
      const r = runHelper(fixture, ['--agent-room-root', fixture]);
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /room:serve, room:run and room:git scripts/);
      assert.equal(existsSync(join(fixture, '.agent-room')), false);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  }
  // (c) runtime 缺失且未提供 root：零写入。
  {
    const fixture = makeProject();
    try {
      const r = runHelper(fixture, []);
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /--agent-room-root is required/);
      assert.equal(existsSync(join(fixture, '.agent-room')), false);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  }
  // (d) runtime 缺失但 config 已有 agent_room section：零写入。
  {
    const fixture = makeProject();
    try {
      mkdirSync(join(fixture, '.codex'), { recursive: true });
      const configOriginal = '[mcp_servers.agent_room]\nurl = "http://127.0.0.1:43210/mcp/codex"\n';
      writeFileSync(join(fixture, '.codex', 'config.toml'), configOriginal);
      const r = runHelper(fixture, ['--agent-room-root', root]);
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /runtime binding is missing but config already defines/);
      assert.equal(existsSync(join(fixture, '.agent-room')), false);
      assert.equal(readFileSync(join(fixture, '.codex', 'config.toml'), 'utf8'), configOriginal);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  }
  // (e) runtime 缺失但 config 已有冻结 agent_room direct dotted URL key（三种 server-name
  // 表示）：必须在 allocation 与任何写入前拒绝，runtime/gitignore 保持不存在。
  for (const dottedLine of [
    'mcp_servers.agent_room.url = "http://127.0.0.1:43210/mcp/codex"',
    'mcp_servers."agent_room".url = "http://127.0.0.1:43210/mcp/codex"',
    "mcp_servers.'agent_room'.url = \"http://127.0.0.1:43210/mcp/codex\"",
  ]) {
    const fixture = makeProject();
    try {
      mkdirSync(join(fixture, '.codex'), { recursive: true });
      writeFileSync(join(fixture, '.codex', 'config.toml'), dottedLine + '\n');
      const r = runHelper(fixture, ['--agent-room-root', root]);
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /runtime binding is missing but config already defines/);
      assert.equal(existsSync(join(fixture, '.agent-room')), false);
      assert.equal(existsSync(join(fixture, '.gitignore')), false);
      assert.equal(readFileSync(join(fixture, '.codex', 'config.toml'), 'utf8'), dottedLine + '\n');
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  }
});

test('existing binding conflicts stop with zero writes: section/dotted url mismatch, other-server url ownership, extra runtime field, root mismatch', () => {
  // 先建立 valid binding，再制造每种 conflict 并核对三份文件 byte-identical。
  const snapshotFiles = (fixture: string): Record<string, string> => ({
    runtime: readFileSync(join(fixture, '.agent-room', 'runtime.json'), 'utf8'),
    config: readFileSync(join(fixture, '.codex', 'config.toml'), 'utf8'),
    gitignore: readFileSync(join(fixture, '.gitignore'), 'utf8'),
  });

  // (a) runtime/config mismatch：agent_room url 使用不同 port。
  {
    const fixture = makeProject();
    try {
      const first = JSON.parse(runHelper(fixture, ['--agent-room-root', root]).stdout);
      const port = first.runtime.port as number;
      const otherPort = port === 65535 ? port - 1 : port + 1;
      writeFileSync(
        join(fixture, '.codex', 'config.toml'),
        `[mcp_servers.agent_room]\nurl = "http://127.0.0.1:${otherPort}/mcp/codex"\n`,
      );
      const before = snapshotFiles(fixture);
      const r = runHelper(fixture, ['--agent-room-root', root]);
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /config conflict: \[mcp_servers\.agent_room\] url is/);
      assert.deepEqual(snapshotFiles(fixture), before);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  }
  // (b) 相同 URL 被其它 server 占用（runtime 存在、agent_room section 不存在）。
  {
    const fixture = makeProject();
    try {
      const first = JSON.parse(runHelper(fixture, ['--agent-room-root', root]).stdout);
      const port = first.runtime.port as number;
      writeFileSync(
        join(fixture, '.codex', 'config.toml'),
        `[mcp_servers.other]\nurl = "http://127.0.0.1:${port}/mcp/participants/p~codex-app"\n`,
      );
      const before = snapshotFiles(fixture);
      const r = runHelper(fixture, ['--agent-room-root', root]);
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /already owned by another server/);
      assert.deepEqual(snapshotFiles(fixture), before);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  }
  // (c) runtime 出现第九个字段：invalid binding，零写入。
  {
    const fixture = makeProject();
    try {
      runHelper(fixture, ['--agent-room-root', root]);
      const runtimePath = join(fixture, '.agent-room', 'runtime.json');
      const original = readFileSync(runtimePath, 'utf8');
      const extended = JSON.parse(original) as Record<string, unknown>;
      (extended as Record<string, unknown>).extra = 'nope';
      writeFileSync(runtimePath, JSON.stringify(extended, null, 2) + '\n');
      const configBefore = readFileSync(join(fixture, '.codex', 'config.toml'), 'utf8');
      const r = runHelper(fixture, ['--agent-room-root', root]);
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /must contain exactly the v0\.2 five fields, the v0\.3 eight fields, or the v0\.5 eight fields/);
      assert.equal(readFileSync(runtimePath, 'utf8'), JSON.stringify(extended, null, 2) + '\n');
      assert.equal(readFileSync(join(fixture, '.codex', 'config.toml'), 'utf8'), configBefore);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  }
  // (d) rerun 提供与 stored 不一致但各自有效的 agent_room_root：mismatch 零写入。
  {
    const fixture = makeProject();
    try {
      runHelper(fixture, ['--agent-room-root', root]);
      const fakeRoot = makeProject();
      try {
        writeFileSync(
          join(fakeRoot, 'package.json'),
          JSON.stringify({ scripts: { 'room:serve': 'node x', 'room:run': 'node x', 'room:git': 'node x' } }),
        );
        const before = snapshotFiles(fixture);
        const r = runHelper(fixture, ['--agent-room-root', fakeRoot]);
        assert.notEqual(r.status, 0);
        assert.match(r.stderr, /agent_room_root mismatch/);
        assert.deepEqual(snapshotFiles(fixture), before);
      } finally {
        rmSync(fakeRoot, { recursive: true, force: true });
      }
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  }
  // (e) runtime/config mismatch：冻结 dotted key 使用不同 port。
  {
    const fixture = makeProject();
    try {
      const first = JSON.parse(runHelper(fixture, ['--agent-room-root', root]).stdout);
      const port = first.runtime.port as number;
      const otherPort = port === 65535 ? port - 1 : port + 1;
      writeFileSync(
        join(fixture, '.codex', 'config.toml'),
        `mcp_servers.agent_room.url = "http://127.0.0.1:${otherPort}/mcp/codex"\n`,
      );
      const before = snapshotFiles(fixture);
      const r = runHelper(fixture, ['--agent-room-root', root]);
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /config conflict: mcp_servers\.agent_room\.url is/);
      assert.deepEqual(snapshotFiles(fixture), before);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  }
  // (f) 相同 URL 被其它 server 的 direct dotted URL assignment 占用：other-server conflict。
  {
    const fixture = makeProject();
    try {
      const first = JSON.parse(runHelper(fixture, ['--agent-room-root', root]).stdout);
      const port = first.runtime.port as number;
      writeFileSync(
        join(fixture, '.codex', 'config.toml'),
        `mcp_servers.other.url = "http://127.0.0.1:${port}/mcp/participants/p~codex-app"\n`,
      );
      const before = snapshotFiles(fixture);
      const r = runHelper(fixture, ['--agent-room-root', root]);
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /already owned by another server/);
      assert.deepEqual(snapshotFiles(fixture), before);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  }
});

test('existing v0.5 binding with a non-codex-app control identity fails before any write with all three files byte-identical', () => {
  // Fix inc9-fr2-5：existing binding 只在 control_participant_id exact 为 codex-app 时复用；
  // mismatch 必须在 runtime/config/gitignore 任何 write 前失败。tamper 只改 runtime.json
  // 的 control_participant_id 值（仍为八字段），public CLI 必须以非零 exit 拒绝且逐 byte 零写入。
  const fixture = makeProject();
  try {
    runHelper(fixture, ['--agent-room-root', root]);
    const runtimePath = join(fixture, '.agent-room', 'runtime.json');
    const configPath = join(fixture, '.codex', 'config.toml');
    const gitignorePath = join(fixture, '.gitignore');
    const tampered = JSON.parse(readFileSync(runtimePath, 'utf8')) as Record<string, unknown>;
    tampered.control_participant_id = 'attacker-app';
    writeFileSync(runtimePath, JSON.stringify(tampered, null, 2) + '\n');
    const before = {
      runtime: readFileSync(runtimePath, 'utf8'),
      config: readFileSync(configPath, 'utf8'),
      gitignore: readFileSync(gitignorePath, 'utf8'),
    };
    const r = runHelper(fixture, ['--agent-room-root', root]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /control_participant_id must be codex-app/);
    assert.equal(readFileSync(runtimePath, 'utf8'), before.runtime);
    assert.equal(readFileSync(configPath, 'utf8'), before.config);
    assert.equal(readFileSync(gitignorePath, 'utf8'), before.gitignore);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('existing v0.5 binding with an unframed candidate config URL fails as a binding/config mismatch with zero writes and no auto-migration', () => {
  // Fix inc9-fr4：既有 binding 的 config 若保留旧 unframed candidate URL（如
  // .../mcp/participants/codex-app），它既不是 framed participant route 也不是 leftover
  // v0.2 /mcp/codex URL，helper 必须按 binding/config mismatch 在任何写入前拒绝
  // （无 auto-compat migration/rewrite），三份文件逐 byte 不变。section 与 frozen dotted
  // 两种定义形态走不同 planConfig 分支，都验证。
  const unframedCases: Array<{ name: string; line: (url: string) => string; conflict: RegExp }> = [
    {
      name: 'section form',
      line: (url) => `[mcp_servers.agent_room]\nurl = "${url}"\n`,
      conflict: /config conflict: \[mcp_servers\.agent_room\] url is/,
    },
    {
      name: 'frozen dotted form',
      line: (url) => `mcp_servers.agent_room.url = "${url}"\n`,
      conflict: /config conflict: mcp_servers\.agent_room\.url is/,
    },
  ];
  for (const c of unframedCases) {
    const fixture = makeProject();
    try {
      const first = JSON.parse(runHelper(fixture, ['--agent-room-root', root]).stdout);
      const port = first.runtime.port as number;
      const unframedUrl = `http://127.0.0.1:${port}/mcp/participants/codex-app`;
      writeFileSync(join(fixture, '.codex', 'config.toml'), c.line(unframedUrl));
      const before = {
        runtime: readFileSync(join(fixture, '.agent-room', 'runtime.json'), 'utf8'),
        config: readFileSync(join(fixture, '.codex', 'config.toml'), 'utf8'),
        gitignore: readFileSync(join(fixture, '.gitignore'), 'utf8'),
      };
      const r = runHelper(fixture, []);
      assert.notEqual(r.status, 0, `${c.name}: unframed candidate URL must be rejected`);
      assert.match(r.stderr, c.conflict);
      assert.equal(readFileSync(join(fixture, '.agent-room', 'runtime.json'), 'utf8'), before.runtime);
      assert.equal(readFileSync(join(fixture, '.codex', 'config.toml'), 'utf8'), before.config);
      assert.equal(readFileSync(join(fixture, '.gitignore'), 'utf8'), before.gitignore);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  }
});

test('valid runtime with a matching frozen dotted agent_room URL reuses the exact identity without appending a table', () => {
  const fixture = makeProject();
  try {
    const first = JSON.parse(runHelper(fixture, ['--agent-room-root', root]).stdout);
    const port = first.runtime.port as number;
    // 把生成的 section 形态改写为冻结的 direct dotted URL assignment；matching exact URL
    // 必须视为已有匹配 binding：幂等复用八字段 identity、不追加 [mcp_servers.agent_room]。
    const configDotted = `mcp_servers.agent_room.url = "http://127.0.0.1:${port}/mcp/participants/p~codex-app"\n`;
    writeFileSync(join(fixture, '.codex', 'config.toml'), configDotted);

    const r = runHelper(fixture, []);
    assert.equal(r.status, 0, r.stderr);
    const second = JSON.parse(r.stdout);
    assert.equal(second.mode, 'reused');
    assert.deepEqual(second.runtime, first.runtime, 'exact eight-field identity must be reused');
    assert.equal(second.config.action, 'unchanged');
    assert.equal(second.reload_required, false);
    assert.equal(readFileSync(join(fixture, '.codex', 'config.toml'), 'utf8'), configDotted);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('missing runtime with dotted agent_room keys nested inside an unrelated table creates a fresh top-level binding and preserves the table verbatim', () => {
  // Review finding inc8-r2：`[unrelated]` table 内的嵌套 dotted key 属于该 table，不是
  // top-level binding。runtime 缺失时 helper 必须 fresh setup 成功（不得报 runtime binding
  // is missing）、逐字保留 existing table 并只追加一次真正的 top-level
  // [mcp_servers.agent_room]（三种冻结 server-name 表示都验证）。
  for (const dottedLine of [
    'mcp_servers.agent_room.url = "http://127.0.0.1:43210/mcp/codex"',
    'mcp_servers."agent_room".url = "http://127.0.0.1:43210/mcp/codex"',
    "mcp_servers.'agent_room'.url = \"http://127.0.0.1:43210/mcp/codex\"",
  ]) {
    const fixture = makeProject();
    try {
      const configOriginal = `[unrelated]\n${dottedLine}\n`;
      mkdirSync(join(fixture, '.codex'), { recursive: true });
      writeFileSync(join(fixture, '.codex', 'config.toml'), configOriginal);

      const r = runHelper(fixture, ['--agent-room-root', root]);
      assert.equal(r.status, 0, r.stderr);
      const summary = JSON.parse(r.stdout) as { mode: string; runtime: { port: number }; config: { action: string } };
      assert.equal(summary.mode, 'created');
      assert.equal(summary.config.action, 'appended');

      const configOut = readFileSync(join(fixture, '.codex', 'config.toml'), 'utf8');
      assert.ok(configOut.startsWith(configOriginal), 'unrelated table bytes must be preserved verbatim');
      const sectionCount = configOut.match(/\[mcp_servers\.agent_room\]/g);
      assert.equal(
        sectionCount === null ? 0 : sectionCount.length,
        1,
        'exactly one top-level agent_room section must be appended',
      );
      assert.ok(configOut.includes(`url = "http://127.0.0.1:${summary.runtime.port}/mcp/participants/p~codex-app"`));

      const runtimeOnDisk = JSON.parse(readFileSync(join(fixture, '.agent-room', 'runtime.json'), 'utf8'));
      assert.deepEqual(Object.keys(runtimeOnDisk).sort(), V04_FIELDS);
      assert.equal(readFileSync(join(fixture, '.gitignore'), 'utf8'), GITIGNORE_ENTRIES.join('\n') + '\n');
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  }
});

test('valid runtime with dotted agent_room/other keys nested inside an unrelated table appends the matching top-level section without identity drift', () => {
  // Review finding inc8-r2：table header 后的嵌套同名 dotted key 不得被当作 matching
  // binding、mismatch 或 other-server ownership conflict。三个子场景都必须逐字保留
  // unrelated table、追加唯一 matching top-level section，且八字段 runtime identity 不漂移。
  const nestedCases: Array<{ name: string; line: (url: string) => string }> = [
    {
      name: 'nested agent_room url equal to expected',
      line: (url) => `mcp_servers.agent_room.url = "${url}"`,
    },
    {
      name: 'nested agent_room url different from expected',
      line: () => 'mcp_servers.agent_room.url = "http://127.0.0.1:43210/mcp/codex"',
    },
    {
      name: 'nested other-server url equal to expected',
      line: (url) => `mcp_servers.other.url = "${url}"`,
    },
  ];
  for (const c of nestedCases) {
    const fixture = makeProject();
    try {
      const first = JSON.parse(runHelper(fixture, ['--agent-room-root', root]).stdout);
      const port = first.runtime.port as number;
      const expectedUrl = `http://127.0.0.1:${port}/mcp/participants/p~codex-app`;
      const configOriginal = `[unrelated]\n${c.line(expectedUrl)}\n`;
      writeFileSync(join(fixture, '.codex', 'config.toml'), configOriginal);
      const gitignoreBefore = readFileSync(join(fixture, '.gitignore'), 'utf8');

      const r = runHelper(fixture, []);
      assert.equal(r.status, 0, r.stderr);
      const second = JSON.parse(r.stdout);
      assert.equal(second.mode, 'reused');
      assert.deepEqual(second.runtime, first.runtime, `exact eight-field identity must not drift (${c.name})`);
      assert.equal(second.config.action, 'appended');
      assert.equal(second.reload_required, true);

      const configOut = readFileSync(join(fixture, '.codex', 'config.toml'), 'utf8');
      assert.ok(configOut.startsWith(configOriginal), 'unrelated table bytes must be preserved verbatim');
      const sectionCount = configOut.match(/\[mcp_servers\.agent_room\]/g);
      assert.equal(
        sectionCount === null ? 0 : sectionCount.length,
        1,
        'exactly one matching top-level agent_room section must be appended',
      );
      assert.ok(configOut.includes(`url = "${expectedUrl}"`));
      assert.equal(readFileSync(join(fixture, '.gitignore'), 'utf8'), gitignoreBefore);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  }
});

// Fix inc9-r6 + Increment 10 v0.5：valid v0.2 binding 的 migration public CLI。旧 database
// 保持原路径与逐 byte 内容不变（archive），生成独立 v0.5 identity；archived_database_paths
// 只含旧 v0.2 database；migration rerun 复用同一 identity 且 mode=reused；conflict 零写入。
test('v0.2 binding is rejected byte-for-byte before direct v0.5 migration', () => {
  const fixture = makeProject();
  try {
    // 测试侧 literal 建立 valid v0.2 五字段 binding 与真实 v0.2 SQLite archive。
    const oldDb = join(fixture, '.agent-room', 'room.sqlite');
    mkdirSync(join(fixture, '.agent-room'), { recursive: true });
    const archive = new DatabaseSync(oldDb);
    archive.exec(
      'CREATE TABLE rooms (room_id TEXT PRIMARY KEY, state TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);',
    );
    archive
      .prepare('INSERT INTO rooms (room_id, state, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('room-v02-1', 'ACCEPTED', '2026-08-29T00:00:00.000Z', '2026-08-29T00:00:00.000Z');
    archive.close();
    const oldDbBytes = readFileSync(oldDb);

    const legacyPort = 43210;
    writeFileSync(
      join(fixture, '.agent-room', 'runtime.json'),
      JSON.stringify(
        {
          agent_room_root: 'D:/agent/room-v02-launcher',
          database_path: oldDb,
          project_path: fixture,
          port: legacyPort,
          room_id: 'room-v02-1',
        },
        null,
        2,
      ) + '\n',
    );
    // 旧 v0.2 config 指向 legacy /mcp/codex URL，migration 必须保守改写为 participant route。
    mkdirSync(join(fixture, '.codex'), { recursive: true });
    const legacyConfig = `[mcp_servers.agent_room]\nurl = "http://127.0.0.1:${legacyPort}/mcp/codex"\n`;
    writeFileSync(join(fixture, '.codex', 'config.toml'), legacyConfig);

    // Increment 12 only supports active v0.3→v0.5. A v0.2 binding remains archive-only.
    const withoutRoot = runHelper(fixture, []);
    assert.notEqual(withoutRoot.status, 0);
    assert.match(withoutRoot.stderr, /v0\.2 binding is archive-only/);
    assert.deepEqual(readFileSync(oldDb), oldDbBytes);
    assert.equal(readFileSync(join(fixture, '.codex', 'config.toml'), 'utf8'), legacyConfig);

    const r = runHelper(fixture, ['--agent-room-root', root]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /v0\.2 binding is archive-only/);
    assert.deepEqual(readFileSync(oldDb), oldDbBytes);
    assert.equal(readFileSync(join(fixture, '.codex', 'config.toml'), 'utf8'), legacyConfig);
    assert.equal(existsSync(join(fixture, '.agent-room', 'room-v0.5.sqlite')), false);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

// Increment 10 v0.5：v0.3→v0.5 migration 的 ordered archive array。旧 v0.3 database 与
// v0.3 binding 记录的 v0.2 archived database 都保持原路径与逐 byte 内容不变，archives 按
// 版本先后排序 [v0.2, v0.3]；生成新 room-v0.5.sqlite、新 room_id 与 control participant，
// 复用 port；migration rerun 复用同一 v0.5 identity。
test('v0.3 binding migration preserves both old databases byte-for-byte and archives them in version order', () => {
  const fixture = makeProject();
  try {
    // 测试侧 literal：真实 v0.2 与 v0.3 SQLite archive，各自带可识别内容。
    const v02Db = join(fixture, '.agent-room', 'room.sqlite');
    const v03Db = join(fixture, '.agent-room', 'room-v0.3.sqlite');
    mkdirSync(join(fixture, '.agent-room'), { recursive: true });
    const makeDb = (path: string, tag: string): Buffer => {
      const db = new DatabaseSync(path);
      db.exec('CREATE TABLE rooms (room_id TEXT PRIMARY KEY, state TEXT NOT NULL);');
      db.prepare('INSERT INTO rooms (room_id, state) VALUES (?, ?)').run(tag, 'ACCEPTED');
      db.close();
      return readFileSync(path);
    };
    const v02Bytes = makeDb(v02Db, 'room-v02-1');
    const v03Bytes = makeDb(v03Db, 'room-v03-1');

    const legacyPort = 43211;
    writeFileSync(
      join(fixture, '.agent-room', 'runtime.json'),
      JSON.stringify(
        {
          agent_room_root: root,
          database_path: v03Db,
          project_path: fixture,
          port: legacyPort,
          room_id: 'room-v03-1',
          protocol_version: '0.3-design',
          control_participant_id: 'codex-app',
          archived_database_path: v02Db,
        },
        null,
        2,
      ) + '\n',
    );
    // v0.3 framed participant route 与 v0.5 expectedUrl 完全一致，migration 不改写 config。
    const framedConfig = `[mcp_servers.agent_room]\nurl = "http://127.0.0.1:${legacyPort}/mcp/participants/p~codex-app"\n`;
    mkdirSync(join(fixture, '.codex'), { recursive: true });
    writeFileSync(join(fixture, '.codex', 'config.toml'), framedConfig);

    const r = runHelper(fixture, []);
    assert.equal(r.status, 0, r.stderr);
    const summary = JSON.parse(r.stdout) as {
      mode: string;
      runtime: Record<string, unknown>;
      config: { action: string };
    };
    assert.equal(summary.mode, 'migrated');
    const rt = summary.runtime;
    assert.equal(rt.database_path, join(fixture, '.agent-room', 'room-v0.5.sqlite'));
    assert.equal(rt.port, legacyPort, 'migration must reuse the v0.3 port');
    assert.match(rt.room_id as string, /^room-[0-9a-f-]{36}$/);
    assert.notEqual(rt.room_id, 'room-v03-1', 'migration must generate a new room_id');
    assert.equal(rt.protocol_version, '0.5-design');
    assert.equal(rt.control_participant_id, 'codex-app');
    assert.deepEqual(
      rt.archived_database_paths,
      [v02Db, v03Db],
      'archives must be ordered [v0.2, v0.3] by version',
    );
    assert.equal(summary.config.action, 'unchanged', 'framed route needs no URL rewrite');

    // 磁盘证据：两个旧 database 逐 byte 不变；新 v0.5 database 只由 serve 初始化。
    assert.deepEqual(readFileSync(v02Db), v02Bytes, 'v0.2 archive must be preserved byte-for-byte');
    assert.deepEqual(readFileSync(v03Db), v03Bytes, 'v0.3 archive must be preserved byte-for-byte');
    assert.equal(existsSync(join(fixture, '.agent-room', 'room-v0.5.sqlite')), false);
    assert.equal(readFileSync(join(fixture, '.codex', 'config.toml'), 'utf8'), framedConfig);

    // migration rerun：mode=reused、identity 稳定、archive list 不变。
    const runtimeBefore = readFileSync(join(fixture, '.agent-room', 'runtime.json'), 'utf8');
    const r2 = runHelper(fixture, []);
    assert.equal(r2.status, 0, r2.stderr);
    const second = JSON.parse(r2.stdout);
    assert.equal(second.mode, 'reused');
    assert.deepEqual(second.runtime, rt, 'migration rerun must reuse the exact v0.5 identity');
    assert.deepEqual(readFileSync(v02Db), v02Bytes);
    assert.deepEqual(readFileSync(v03Db), v03Bytes);
    assert.equal(readFileSync(join(fixture, '.agent-room', 'runtime.json'), 'utf8'), runtimeBefore);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('probe follows the loopback service state and only room:serve initializes the database schema', async () => {
  const fixture = makeProject();
  let child: ChildProcess | undefined;
  try {
    const first = JSON.parse(runHelper(fixture, ['--agent-room-root', root]).stdout);
    const port = first.runtime.port as number;
    const db = first.runtime.database_path as string;

    // service 未启动：port closed。
    const closed = runHelper(fixture, ['--probe']);
    assert.equal(closed.status, 0, closed.stderr);
    assert.deepEqual(JSON.parse(closed.stdout), { port_open: false });

    child = startServe(db, fixture, port);
    await waitForListening(child, 15000);

    const open = runHelper(fixture, ['--probe']);
    assert.equal(open.status, 0, open.stderr);
    assert.deepEqual(JSON.parse(open.stdout), { port_open: true });
    // serve 启动后 database 文件由 RoomService 建立（helper 不初始化 schema）。
    assert.equal(existsSync(db), true);
  } finally {
    await stopChild(child);
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('actual loopback setup E2E: serve boundary plus reload continuation room_create/room_get_state reaches DISCUSSION', async () => {
  const fixture = makeGitProject();
  let child: ChildProcess | undefined;
  let client: Client | undefined;
  try {
    const first = JSON.parse(runHelper(fixture, ['--agent-room-root', root]).stdout);
    const port = first.runtime.port as number;
    const db = first.runtime.database_path as string;
    const roomId = first.runtime.room_id as string;

    // 第一段：现有 room:serve boundary 用 generated database/port 启动。
    child = startServe(db, fixture, port);
    await waitForListening(child, 15000);

    // 第二段（模拟 Codex Desktop reload 后）：project-scoped MCP continuation。
    client = new Client({ name: 'setup-e2e-client', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp/participants/p~codex-app`));
    await client.connect(transport);

    // Room 尚不存在 → room_get_state 返回 entity_not_found tool error。
    const before = await client.callTool({ name: 'room_get_state', arguments: { room_id: roomId } });
    assert.equal(before.isError, true, 'a missing Room must be reported as a tool error');

    // setup mode 只调用一次 room_create；同 ID 已存在时幂等返回 created=false。
    const created = await client.callTool({ name: 'room_create', arguments: { room_id: roomId } });
    assert.equal((created.structuredContent as { created: boolean }).created, true);
    const recreated = await client.callTool({ name: 'room_create', arguments: { room_id: roomId } });
    assert.equal((recreated.structuredContent as { created: boolean }).created, false);

    // 最终 room_get_state 返回同一 Room 且 state=DISCUSSION；v0.5 snapshot 无 current_*
    // 字段：planning-only Room 用 planning_waiting_actor，Task/Run/attempt/review/question
    // 与 run_work_items 均为空数组。
    const state = await client.callTool({ name: 'room_get_state', arguments: { room_id: roomId } });
    const snapshot = state.structuredContent as Record<string, unknown>;
    const room = snapshot.room as { room_id: string; state: string };
    assert.equal(room.room_id, roomId);
    assert.equal(room.state, 'DISCUSSION');
    assert.equal(snapshot.planning_waiting_actor, 'planner', 'planning 状态由 planner 持有下一动作');
    assert.deepEqual(snapshot.tasks, []);
    assert.deepEqual(snapshot.runs, []);
    assert.deepEqual(snapshot.attempts, []);
    assert.deepEqual(snapshot.run_guidance, []);
    assert.deepEqual(snapshot.reviews, []);
    assert.deepEqual(snapshot.questions, []);
    assert.deepEqual(snapshot.run_work_items, []);
    assert.equal((snapshot as Record<string, unknown>).current_task, undefined, 'v0.5 snapshot must not expose current_*');
    const events = snapshot.events as { type: string; sequence: number }[];
    assert.equal(events.length, 1, 'setup continuation must create exactly one Room event');
    assert.equal(events[0].type, 'room_created');
    assert.equal(snapshot.cursor, 1);
  } finally {
    if (client) await client.close();
    await stopChild(child);
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('service bind failure keeps the generated binding and reports the failure', async () => {
  const fixture = makeProject();
  let blocker: ReturnType<typeof createServer> | undefined;
  let child: ChildProcess | undefined;
  try {
    const first = JSON.parse(runHelper(fixture, ['--agent-room-root', root]).stdout);
    const port = first.runtime.port as number;
    const runtimeBefore = readFileSync(join(fixture, '.agent-room', 'runtime.json'), 'utf8');
    const configBefore = readFileSync(join(fixture, '.codex', 'config.toml'), 'utf8');

    // 占用 generated port：现有 room:serve 必须 bind 失败并保留 binding 文件。
    blocker = createServer();
    await new Promise<void>((resolvePromise, rejectPromise) => {
      blocker!.once('error', rejectPromise);
      blocker!.listen(port, '127.0.0.1', () => resolvePromise());
    });

    child = startServe(first.runtime.database_path as string, fixture, port);
    const exited = await waitForExit(child, 15000);
    assert.equal(exited.code, 1, 'bind failure must exit non-zero');
    assert.match(exited.stderr, /failed to bind 127\.0\.0\.1/);

    assert.equal(readFileSync(join(fixture, '.agent-room', 'runtime.json'), 'utf8'), runtimeBefore);
    assert.equal(readFileSync(join(fixture, '.codex', 'config.toml'), 'utf8'), configBefore);
  } finally {
    await stopChild(child);
    await new Promise<void>((resolvePromise) => blocker?.close(() => resolvePromise()));
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('setup helper is standard-library-only and never triggers the launcher, Claude processes, MCP tools or Git mutation', () => {
  const helperSource = readFileSync(helperPath, 'utf8');
  // 只使用 Node.js standard library（import specifier 全部为 node: 前缀）。
  const imports = [...helperSource.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
  assert.ok(imports.length > 0, 'helper must import from standard library modules');
  for (const spec of imports) {
    assert.ok(spec.startsWith('node:'), `non-standard import in helper: ${spec}`);
  }
  // 不触发 one-shot launcher / Claude process / MCP tool / Git mutation（setup 边界证据）：
  // helper 校验 root package.json 的 room:serve/room:run/room:git script 名（positive），但自身不
  // import child_process，因此不可能启动 launcher、Claude 或任何 process（behavioral gate）。
  assert.ok(helperSource.includes('room:serve'), 'helper must validate the room:serve script');
  assert.ok(helperSource.includes('room:run'), 'helper must validate the room:run script');
  assert.ok(helperSource.includes('room:git'), 'helper must validate the room:git script');
  assert.ok(!helperSource.includes('room_submit_task'), 'helper must never submit a Task');
  assert.ok(!helperSource.includes('room_create'), 'helper must never create a Room (Skill MCP continuation owns it)');
  assert.ok(!helperSource.includes('room_get_state'), 'helper must never read Room state');
  assert.ok(!helperSource.includes('child_process'), 'helper must not spawn processes');
  assert.ok(!helperSource.includes('spawn'), 'helper must not spawn processes');
});
