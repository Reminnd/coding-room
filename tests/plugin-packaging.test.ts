import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pluginDir = join(root, 'plugins', 'agent-room');
const skillDir = join(pluginDir, 'skills', 'agent-room');
const skillPath = join(skillDir, 'SKILL.md');
const projectSetupPath = join(skillDir, 'references', 'project-setup.md');
const pluginManifestPath = join(pluginDir, '.codex-plugin', 'plugin.json');
const marketplacePath = join(root, '.agents', 'plugins', 'marketplace.json');

function readText(p: string): string {
  return readFileSync(p, 'utf8');
}

// 只扫描 code-fence 块（``` 围栏内）做 secret 检查，避免误伤 prose 中合法示例词。
function codeFenceBlocks(text: string): string[] {
  const blocks: string[] = [];
  const fenceRe = /```[a-z]*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) blocks.push(m[1]);
  return blocks;
}

// 测试侧 literal：Plugin 是 shared/通用包，任何 project-specific 值都不得进入。
const projectSpecificTokens = [
  'my-project',
  'test-project',
  'sample-project',
  'my-room',
  'room-123',
  'example.com',
  'localhost:3000',
  '127.0.0.1:3000',
  '0.0.0.0',
];
// active prefix_rule 写入步骤（host 侧 allow/sandbox rule mutation）是禁入 token；SKILL 的
// prohibition 短语含 "prefix_rule" 字面，因此这里只拒绝写入步骤形态（带 = 的赋值）。
const permissionMutationTokens = [
  'prefix_rule =',
  'prefix_rules =',
  'approval_policy',
  '[rules]',
  '[sandbox]',
  'permissions =',
  'danger-full-access',
];
const secretTokens = ['api_key', 'secret_key', 'password', 'token'];
// key 形态需要长后缀（sk- 单独作为子串会命中 --task-id 等合法 flag，不构成凭据形态）。
const secretPatterns: RegExp[] = [/sk-[A-Za-z0-9]{8,}/];

// v0.5 public tool surface 的测试侧 literal（含 GitAction planner decision）。
// referenced 检查以此为准：SKILL 不得引用任何非 public room_* 标识符。
const v04PublicTools = [
  'room_accept_review',
  'room_add_run_guidance',
  'room_answer_question',
  'room_ask_question',
  'room_begin_architecture_review',
  'room_cancel_run',
  'room_create',
  'room_create_plan',
  'room_create_plan_revision',
  'room_create_role_assignment',
  'room_decide_git_action',
  'room_decide_plan_revision',
  'room_get_state',
  'room_reconcile_plan',
  'room_register_participant',
  'room_request_user_confirmation',
  'room_create_plan',
  'room_create_plan_revision',
  'room_decide_plan_revision',
  'room_reconcile_plan',
  'room_retry_run',
  'room_set_participant_enabled',
  'room_submit_review',
  'room_submit_task',
];

// SKILL workflow 必须路由的 public tools（setup continuation + planning + per-Run
// lifecycle + Question/Review/Fix + cancel/guidance）；participant 管理工具是 bootstrap
// 专用，不进入 workflow routing。
const workflowTools = [
  'room_create',
  'room_get_state',
  'room_begin_architecture_review',
  'room_request_user_confirmation',
  'room_submit_task',
  'room_answer_question',
  'room_retry_run',
  'room_submit_review',
  'room_accept_review',
  'room_cancel_run',
  'room_add_run_guidance',
  'room_decide_git_action',
];

// —— YAML front matter 局部 parser（测试侧 literal；不导入 candidate validator/schema）——
interface FrontMatter {
  name: string;
  description: string;
}

// 必须从文件第一个字符开始才是 front matter；heading-first / 无分隔符形态直接拒绝。
// 只接受本 Fix 所需的两种 scalar：name 为未引用 plain scalar；description 为
// JSON-compatible 的 YAML double-quoted scalar，用 JSON.parse 取得值。任何未引用
// description——尤其含 colon-space 的 `binding: validate` 反例——会被 JSON.parse 拒绝，
// 而不是像旧 parser 那样按第一个 colon 拆分后把剩余文本误判为合法 value。
function parseFrontMatter(text: string): FrontMatter {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  assert.ok(m, 'skill must start with a YAML front matter block');
  const fields = new Map<string, string>();
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    assert.ok(kv, `front matter line must be key: value: ${line}`);
    fields.set(kv[1], kv[2]);
  }
  assert.deepEqual(
    [...fields.keys()],
    ['name', 'description'],
    'front matter must contain exactly name and description',
  );
  const name = fields.get('name');
  const description = fields.get('description');
  assert.ok(name !== undefined && name.length > 0, 'front matter must define name');
  // name 只接受本 Fix 所需的 plain scalar：未引用且不含 mapping 语法（colon + space）。
  assert.ok(
    !/^["']/.test(name) && !name.includes(': '),
    'name must be a plain scalar (unquoted, no mapping syntax)',
  );
  assert.ok(
    description !== undefined && description.length > 0,
    'front matter must define a non-empty description',
  );
  let parsed: unknown;
  try {
    // JSON.parse 同时验证 double-quoted/escape 合法性与取回内容；未引用形态在此被拒绝。
    parsed = JSON.parse(description);
  } catch {
    assert.fail('description must be a JSON-compatible double-quoted YAML scalar');
  }
  assert.ok(
    typeof parsed === 'string' && parsed.length > 0,
    'description must parse to a non-empty string',
  );
  return { name: name as string, description: parsed as string };
}

test('marketplace.json is a Codex repository marketplace root with one nested-schema plugin entry', () => {
  const marketplace = JSON.parse(readText(marketplacePath)) as Record<string, unknown>;
  // 顶层只表达 marketplace identity/interface/plugins。
  assert.deepEqual(Object.keys(marketplace).sort(), ['interface', 'name', 'plugins']);
  assert.equal(marketplace.name, 'agent-room-local');
  const iface = marketplace.interface as Record<string, unknown>;
  assert.deepEqual(Object.keys(iface), ['displayName']);
  assert.equal(iface.displayName, 'Agent Room');
  const plugins = marketplace.plugins as Array<Record<string, unknown>>;
  assert.equal(plugins.length, 1, 'exactly one agent-room entry');
  const entry = plugins[0];
  assert.equal(entry.name, 'agent-room');
  assert.deepEqual(entry.source, { source: 'local', path: './plugins/agent-room' });
  assert.deepEqual(entry.policy, { installation: 'AVAILABLE', authentication: 'ON_INSTALL' });
  assert.equal(entry.category, 'Productivity');
});

test('old flat marketplace layout is explicitly rejected', () => {
  const marketplace = JSON.parse(readText(marketplacePath)) as Record<string, unknown>;
  // 旧 flat schema 把 entry 字段平铺在根对象；根对象不得再出现这些 key。
  for (const flatKey of ['displayName', 'source', 'installation', 'authentication']) {
    assert.ok(!(flatKey in marketplace), `flat top-level key ${flatKey} must not exist`);
  }
  const entry = (marketplace.plugins as Array<Record<string, unknown>>)[0];
  for (const flatKey of ['displayName', 'installation', 'authentication']) {
    assert.ok(!(flatKey in entry), `flat entry key ${flatKey} must not exist`);
  }
  assert.ok(
    typeof entry.source === 'object' && entry.source !== null,
    'entry source must be the nested object',
  );
  assert.ok(
    typeof entry.policy === 'object' && entry.policy !== null,
    'entry policy must be the nested object',
  );
});

test('exactly one plugin and one Skill authority are registered', () => {
  const marketplace = JSON.parse(readText(marketplacePath)) as {
    plugins: Array<{ name: string }>;
  };
  assert.deepEqual(marketplace.plugins.map((p) => p.name), ['agent-room']);
  assert.deepEqual(readdirSync(join(root, 'plugins')), ['agent-room']);
  const manifest = JSON.parse(readText(pluginManifestPath)) as Record<string, unknown>;
  assert.equal(manifest.name, 'agent-room');
  assert.equal(manifest.version, '0.1.0');
  assert.ok(typeof manifest.description === 'string' && manifest.description.length > 0);
  assert.equal(manifest.skills, './skills/');
  // 唯一 SKILL.md：skills 目录树下恰好一个，且就是本项目引用的权威文件。
  const skillFiles: string[] = [];
  function collectSkills(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) collectSkills(p);
      else if (entry.isFile() && entry.name === 'SKILL.md') skillFiles.push(p);
    }
  }
  collectSkills(join(pluginDir, 'skills'));
  assert.deepEqual(skillFiles, [skillPath]);
});

test('shared plugin contains no project-specific values, secrets or permission mutation steps', () => {
  const texts = [
    readText(skillPath),
    readText(projectSetupPath),
    readText(pluginManifestPath),
    readText(marketplacePath),
  ];
  const allText = texts.join('\n');
  for (const token of projectSpecificTokens) {
    assert.ok(!allText.includes(token), `project-specific token leaked into shared plugin: ${token}`);
  }
  for (const token of permissionMutationTokens) {
    assert.ok(!allText.includes(token), `permission mutation step leaked into plugin: ${token}`);
  }
  // secret 检查针对 code-fence 块与 manifest（命令/模板不得携带凭据形态）。
  const fenced = [
    ...texts.slice(0, 2).flatMap(codeFenceBlocks),
    readText(pluginManifestPath),
    readText(marketplacePath),
  ].join('\n');
  for (const token of secretTokens) {
    assert.ok(!fenced.includes(token), `secret-like token in fenced content: ${token}`);
  }
  for (const pattern of secretPatterns) {
    assert.ok(!pattern.test(fenced), `secret-like key pattern in fenced content: ${pattern}`);
  }
  // SKILL 必须说明不提供 active prefix_rule 写入步骤（positive marker）。
  assert.ok(
    readText(skillPath).includes('active `prefix_rule`'),
    'SKILL must state the prefix_rule write prohibition',
  );
});

// 测试侧 frozen description literal：与 Increment 10 v0.5 冻结值（planning-only Room +
// per-Run work items + one-shot RunAttempt 入口）逐字符一致，用于 exact 断言。本局部 parser
// 只验证冻结 metadata 子集（name plain scalar + JSON-compatible double-quoted description、
// 恰好两个字段与负向 grammar fixture），不构成 actual installed-plugin consumer evidence：
// 真实 load/activation 与 bundled resource resolution 由 Codex/operator 在另行授权后执行，
// 未运行前保持 not_run/pending。
const frozenDescription =
  'Use when the operator asks to run the Agent Room workflow for the current project or its local `.agent-room/runtime.json` binding, or to set up the Agent Room for the current project from an operator-provided agent_room_root: validate the project-local Room binding, follow the durable planning-only Room state and per-Run work items through planning, one-shot RunAttempt, Question, Review/Fix and acceptance, and invoke the Agent Room launcher at most once per approved task run.';

test('skill front matter satisfies the frozen metadata subset: exact name, frozen description and negative grammar fixtures', () => {
  const skill = readText(skillPath);
  // 局部 parser 必须拒绝 heading-first 与无 front matter 分隔符的形态（不得只搜索正文单词）。
  assert.throws(() => parseFrontMatter('# Agent Room Skill\n\ntext\n'), /front matter/);
  assert.throws(() => parseFrontMatter('name: agent-room\ndescription: text\n'), /front matter/);
  // 当前错误形态的 direct negative fixture（Review 4 finding）：未引用 description 内容包含
  // `binding: validate`（colon + space）。标准 YAML parser 以 mapping values are not allowed here
  // 拒绝；局部 parser 必须同样直接拒绝，而不是把 colon 后的剩余文本当成合法 value。
  assert.throws(
    () =>
      parseFrontMatter(
        '---\nname: agent-room\ndescription: Use when the operator asks to run the workflow for the current project binding: validate the project-local Room binding, and invoke the launcher at most once.\n---\n',
      ),
    /description must be a JSON-compatible/,
  );
  const fm = parseFrontMatter(skill);
  assert.equal(fm.name, 'agent-room');
  // description 必须与 Increment 10 v0.5 冻结值一致（JSON.parse 取回的内容，不含引号）。
  assert.equal(fm.description, frozenDescription, 'description must equal the frozen value');
  // description 面向 discovery：setup 显式入口 + project-local binding/planning/per-Run/Question/Review-Fix。
  for (const trigger of ['set up the Agent Room', 'runtime.json', 'planning', 'one-shot RunAttempt', 'Question', 'Review/Fix']) {
    assert.ok(fm.description.includes(trigger), `description must cover trigger ${trigger}`);
  }
  // description 不得声称非目标能力（只检查 front matter 描述块）。
  for (const noClaim of ['automatic', 'daemon', 'global config', 'business coding', 'parallel']) {
    assert.ok(!fm.description.toLowerCase().includes(noClaim), `description must not claim ${noClaim}`);
  }
});

test('runtime.json template has exactly the eight v0.5 fields and its port placeholder becomes a JSON integer', () => {
  const setup = readText(projectSetupPath);
  const template = codeFenceBlocks(setup).find((b) => b.includes('agent_room_root'));
  assert.ok(template, 'runtime.json template must be a fenced block');
  // port placeholder 必须不加引号，operator 替换为数字后才是 JSON integer 而非字符串。
  assert.ok(template.includes('"port": <PROJECT_PORT>'), 'port placeholder must stay unquoted');
  const values: Record<string, string> = {
    AGENT_ROOM_ROOT: 'C:/agent-room',
    DATABASE_PATH: 'C:/room.db',
    PROJECT_PATH: 'C:/project',
    PROJECT_PORT: '43210',
    ROOM_ID: 'room-a',
  };
  const substituted = template.replace(/<([A-Z_]+)>/g, (m, name: string) => values[name] ?? m);
  assert.ok(!substituted.includes('<'), 'every placeholder must be replaceable');
  const parsed = JSON.parse(substituted) as Record<string, unknown>;
  assert.deepEqual(Object.keys(parsed).sort(), [
    'agent_room_root',
    'archived_database_paths',
    'control_participant_id',
    'database_path',
    'port',
    'project_path',
    'protocol_version',
    'room_id',
  ]);
  assert.equal(parsed.agent_room_root, 'C:/agent-room');
  assert.equal(parsed.database_path, 'C:/room.db');
  assert.equal(parsed.project_path, 'C:/project');
  assert.equal(parsed.room_id, 'room-a');
  assert.equal(parsed.protocol_version, '0.5-design');
  assert.equal(parsed.control_participant_id, 'codex-app');
  assert.deepEqual(parsed.archived_database_paths, [], 'fresh binding must have an empty archive array');
  assert.ok(Number.isInteger(parsed.port), 'port must be a JSON integer after substitution');
  assert.ok(
    (parsed.port as number) >= 1 && (parsed.port as number) <= 65535,
    'port must be in 1..65535',
  );
});

test('config.toml template defines the exact project-scoped agent_room participant MCP URL', () => {
  const setup = readText(projectSetupPath);
  const block = codeFenceBlocks(setup).find((b) => b.includes('mcp_servers.agent_room'));
  assert.ok(block, 'config.toml template must be a fenced block');
  assert.ok(block.includes('[mcp_servers.agent_room]'));
  assert.ok(
    block.includes('url = "http://127.0.0.1:<PROJECT_PORT>/mcp/participants/p~codex-app"'),
    'URL must be the exact framed control-participant route',
  );
  // 不得内嵌硬编码端口或非 loopback / 非 participant route URL（占位符无数字端口）。
  assert.ok(!/:\d+/.test(block), 'template must not contain a hardcoded port');
});

test('gitignore template ignores the runtime binding, local database files and the artifact directory', () => {
  const setup = readText(projectSetupPath);
  const block = codeFenceBlocks(setup).find((b) => b.includes('.agent-room/runtime.json'));
  assert.ok(block, 'gitignore template must be a fenced block');
  assert.ok(block.includes('.agent-room/runtime.json'));
  assert.ok(block.includes('.agent-room/room.sqlite\n.agent-room/room.sqlite-*'), 'database files must be ignored');
  assert.ok(block.includes('.agent-room/artifacts/'));
});

test('setup requires merging, not overwriting, existing config and gitignore, and stops on conflicts', () => {
  const setup = readText(projectSetupPath);
  assert.ok(setup.includes('merge; never overwrite'), 'setup must require merge, never overwrite');
  assert.ok(
    setup.includes('stop and ask the operator'),
    'setup must stop and ask the operator on binding conflicts',
  );
});

test('skill exposes an explicit setup mode routed only from an operator request and never from the normal workflow', () => {
  const skill = readText(skillPath);
  assert.ok(skill.includes('## Setup mode'), 'skill must define a Setup mode section');
  assert.ok(skill.includes('explicit project setup'), 'setup entry must be an explicit operator request');
  assert.ok(skill.includes('Setup mode is never entered implicitly'), 'setup must never run implicitly');
  assert.ok(skill.includes('setup continuation'), 'reload continuation must be documented');
  assert.ok(skill.includes('reload required'), 'Codex Desktop reload requirement must be reported');
  assert.ok(skill.includes('service_start_pending'), 'rejected/blocked service start must be reported');
  assert.ok(skill.includes('scripts/setup-project.ts'), 'setup mode must route through the Skill-owned helper');
  assert.ok(skill.includes('references/project-setup.md'), 'setup reference must stay referenced');
  // Setup section 只走 room_get_state/room_create 一次 + 服务启动；不含 Task/launcher 通路。
  const setupStart = skill.indexOf('## Setup mode');
  const nextHeading = skill.indexOf('\n## ', setupStart + 1);
  const setupSection = nextHeading >= 0 ? skill.slice(setupStart, nextHeading) : skill.slice(setupStart);
  assert.ok(setupSection.includes('room_create'), 'setup continuation must create the Room once');
  assert.ok(setupSection.includes('room_get_state'), 'setup continuation must verify via room_get_state');
  assert.ok(setupSection.includes('do not invoke the launcher'), 'setup must never invoke the launcher');
  assert.ok(!setupSection.includes('room_submit_task'), 'setup mode must never submit a Task');
  assert.ok(!setupSection.includes('run room:run'), 'setup mode must never run the launcher');
  // launcher invocation 形式只允许出现一次：Step 4 的 one-shot command template。
  assert.equal(skill.match(/run room:run/g)?.length, 1, 'launcher invocation form must appear exactly once');
});

test('setup helper is discoverable, standard-library-only, and the Skill package keeps a single authority', () => {
  const skill = readText(skillPath);
  const helperPath = join(skillDir, 'scripts', 'setup-project.ts');
  assert.ok(existsSync(helperPath), 'setup helper must exist inside the Skill package');
  const helper = readText(helperPath);
  const imports = [...helper.matchAll(/^import[^;]*?from\s+'([^']+)';/gm)].map((m) => m[1]);
  assert.ok(imports.length > 0, 'helper must import its modules');
  for (const spec of imports) {
    assert.ok(spec.startsWith('node:'), `helper may only import Node.js standard library, got ${spec}`);
  }
  assert.ok(!helper.includes('child_process'), 'helper must not be able to spawn any process');
  assert.ok(
    skill.includes('only the existing `room:serve`, `room_create` and `room_get_state`'),
    'setup mode must be routed through the single existing authority',
  );
});

test('skill maps every planning Room state and per-Run status to its legal action with no single-current-Run authority', () => {
  const skill = readText(skillPath);
  // v0.5：Room 是 planning-only（三个状态），execution 状态全部在 per-Run work items。
  assert.ok(skill.includes('planning-only'), 'Room must be described as planning-only');
  const roomStateActions: Array<[string, string]> = [
    ['DISCUSSION', 'room_begin_architecture_review'],
    ['ARCHITECTURE_REVIEW', 'room_request_user_confirmation'],
    ['WAITING_FOR_USER_CONFIRMATION', 'room_submit_task'],
  ];
  for (const [state, action] of roomStateActions) {
    assert.ok(skill.includes(state), `skill must map planning state ${state}`);
    assert.ok(skill.includes(action), `skill must define the planning action for ${state}`);
  }
  // per-Run status 表：ready/running/cancel_requested/needs_decision/failed/canceled/
  // review_required/review_discussion/accepted 各有唯一合法下一动作。
  const runStatusActions: Array<[string, string]> = [
    ['`ready`', 'Step 4'],
    ['`running`', 'Zero launcher invocations'],
    ['`cancel_requested`', 'room_cancel_run'],
    ['`needs_decision`', 'room_answer_question'],
    ['`failed`', 'room_retry_run'],
    ['`review_required`', 'room_submit_review'],
    ['`review_discussion`', 'room_accept_review'],
    ['`accepted`', 'Report and stop'],
  ];
  for (const [status, action] of runStatusActions) {
    assert.ok(skill.includes(status), `skill must map Run status ${status}`);
    assert.ok(skill.includes(action), `skill must define the action for ${status}`);
  }
  // per-Run authority 结构：run_work_items 排序是 authority，绝不推断单一 current Run。
  assert.ok(skill.includes('run_work_items'), 'skill must route via run_work_items');
  assert.ok(skill.includes('waiting_actor'), 'skill must route via per-Run waiting_actor');
  assert.ok(skill.includes('never infers a single'), 'skill must never infer a single current Run');
  // 全部 workflow public tools 被引用；skill 不得引用任何其它 room_* 标识符
  //（无第二状态 authority；participant 管理工具是 bootstrap 专用，不进 workflow routing）。
  for (const tool of workflowTools) {
    assert.ok(skill.includes(tool), `skill must use workflow tool ${tool}`);
  }
  const referenced = new Set(skill.match(/\broom_[a-z_]+/g) ?? []);
  for (const name of referenced) {
    // room_id 是 runtime.json 协议字段，不是 MCP tool；其余任何 room_* 标识符都必须属于 v0.5 public tools。
    if (name === 'room_id') continue;
    assert.ok(v04PublicTools.includes(name), `skill must not reference non-public tool ${name}`);
  }
});

test('skill keeps canonical worktree and session lineage Run-owned without a Git revision argument', () => {
  const skill = readText(skillPath);
  assert.ok(
    skill.includes('The persisted Run owns the canonical worktree'),
    'canonical worktree must be owned by the persisted Run',
  );
  assert.ok(
    skill.includes('frozen by the first attempt'),
    'the first attempt claim must freeze the canonical worktree',
  );
  assert.ok(
    skill.includes('never carries a `--task-id` or Git revision argument'),
    'the one-shot command must not carry a Git revision or task id',
  );
  assert.ok(!skill.includes('observed_baseline_head'), 'no v0.3 caller-baseline authority may remain');
  assert.ok(!skill.includes('rev-parse'), 'no git rev-parse fallback may appear');
  assert.ok(!/git\s+rev/.test(skill), 'no live Git HEAD read may appear');
  // Fix / decision(false) resume / retry 继承 persisted Run 的 lineage；decision(true) 不得 resume 旧 Task。
  assert.ok(
    skill.includes('answer_changes_contract=true') && skill.includes('must not be resumed'),
    'contract-changing answers must return to planning and never resume the old task',
  );
  // Step 4 合法入口由下面的 per-Run gate 测试覆盖（ready work items + answered continuation）。
});

test('skill gates launcher entry to ready Run work items or answered decision continuations: open questions and active runs stay zero-launcher', () => {
  const skill = readText(skillPath);
  // open Question 的 needs_decision Run 只 answer，零 launcher。
  assert.ok(skill.includes('zero launcher'), 'open-question needs_decision must stay zero-launcher');
  assert.ok(skill.includes('current Question is still open'), 'open-question gate must be explicit');
  // answer(false) 成功后 Run 回到 ready，该 answered continuation 成为 Step 4 合法入口。
  assert.ok(skill.includes('answer_changes_contract=false'), 'false-answer branch must be present');
  assert.ok(skill.includes('returns to `ready`'), 'Run returns to ready after a false answer');
  // Step 4 合法入口全部来自 ready work items（四个 continuation 来源，全部显式列出）。
  for (const entry of [
    'a new Implementation Run',
    'a Fix Task continuation',
    'a decision resume',
    'a `room_retry_run` retry',
  ]) {
    assert.ok(skill.includes(entry), `Step 4 must allow entry ${entry}`);
  }
  // 已 answer 的 read model：Question 不再 open，Run 的 canonical worktree/session lineage 由 persisted Run 拥有。
  assert.ok(skill.includes('current Question is answered'), 'answered read model must be explicit');
  assert.ok(skill.includes('session lineage'), 'session lineage must be documented as per-Run');
  // answer(true)：不得 resume，也不得进入 Step 4。
  assert.ok(skill.includes('must not be resumed'), 'true-answer must never resume the old task');
  assert.ok(skill.includes('never enters Step 4'), 'true-answer branch must never enter Step 4');
  // active attempt（running/cancel_requested）：零 launcher。
  assert.ok(skill.includes('Zero launcher invocations'), 'active attempts stay zero-launcher');
  // 显式拒绝旧 Room-state-only gate：既不能出现旧 Step 4 门槛短语，也不能保留任何排他声明。
  assert.ok(
    !skill.includes('Only from `PLAN_READY` / `FIX_PLAN_READY`'),
    'old ready-state-only gate must be rejected',
  );
  assert.ok(
    !skill.toLowerCase().includes('only these states allow planning'),
    'no ready-state-only exclusivity claim may remain',
  );
});

test('skill takes run_id from the durable snapshot, mints a fresh attempt_id and never mints a second id on uncertainty', () => {
  const skill = readText(skillPath);
  // v0.5：run_id 只来自 durable snapshot 的 ready work item，Skill 自身绝不生成 Run id。
  assert.ok(
    skill.includes('comes exclusively from the durable snapshot'),
    'run_id must come exclusively from the durable snapshot',
  );
  assert.ok(skill.includes('it never changes'), 'run_id must stay stable across display/approval/execution');
  assert.ok(
    skill.includes('Never mint a second `run_id`'),
    'uncertain outcome must not mint a second run_id',
  );
  // attempt_id 每次 invocation 一个 fresh 值，claim 未确认前不得 mint 第二个。
  assert.ok(skill.includes('fresh non-empty `attempt_id`'), 'attempt_id must be fresh and non-empty');
  assert.ok(
    skill.includes('never re-execute or mint a second `attempt_id`'),
    'uncertain claim must not mint a second attempt_id',
  );
});

test('one-shot command quotes every path/ID/URL placeholder, carries run_id and a fresh attempt_id, and resolves via the validated agent_room_root', () => {
  const skill = readText(skillPath);
  const commandBlock = codeFenceBlocks(skill).find((b) =>
    b.startsWith('npm --prefix "<AGENT_ROOM_ROOT>" run room:run -- --db'),
  );
  assert.ok(commandBlock, 'one-shot template must be a fenced block starting with the prefixed launcher');
  assert.ok(commandBlock.includes('--db "<DATABASE_PATH>"'));
  assert.ok(commandBlock.includes('--project "<PROJECT_PATH>"'));
  assert.ok(commandBlock.includes('--run-id "<RUN_ID>"'));
  assert.ok(commandBlock.includes('--attempt-id "<FRESH_ATTEMPT_ID>"'));
  assert.ok(
    commandBlock.includes('--mcp-url "http://127.0.0.1:<PROJECT_PORT>/mcp/participants/p~claude-code-cli"'),
    'launcher must target the exact framed worker participant route',
  );
  // v0.5：canonical worktree/task id 由 persisted Run/Task authority 提供，命令不携带 revision。
  assert.ok(!commandBlock.includes('--task-id'), 'one-shot command must not carry a task id');
  assert.ok(!commandBlock.includes('--baseline-head'), 'one-shot command must not carry a baseline');
  assert.ok(!commandBlock.includes('package.json'), 'launcher template must not reference a target manifest');
  assert.ok(!commandBlock.includes('status'), 'launcher template must not contain a status form');
  assert.ok(!skill.includes('npm run room:run'), 'must not run room:run from the target project cwd');
  assert.ok(
    skill.includes('from the target project working directory'),
    'one-shot command must run from the target project working directory',
  );
});

test('skill uses no room:run status form and only the real room:status script for manual viewing', () => {
  const skill = readText(skillPath);
  assert.ok(
    !/run room:run[^\n]*\bstatus\b/.test(skill),
    'no malformed room:run ... status form may exist',
  );
  const statusBlock = codeFenceBlocks(skill).find((b) => b.includes('room:status'));
  assert.ok(statusBlock, 'manual viewing may use the real room:status script');
  assert.ok(
    statusBlock.includes('npm --prefix "<AGENT_ROOM_ROOT>" run room:status -- --db "<DATABASE_PATH>" --room-id "<ROOM_ID>"'),
    'room:status must keep its real existing arguments',
  );
  assert.ok(
    skill.includes('MCP snapshot remains the workflow authority'),
    'project MCP snapshot must remain the workflow authority',
  );
});

test('skill keeps one approval at most one invocation and never mutates host approval policy', () => {
  const skill = readText(skillPath);
  assert.ok(skill.includes('at most one'), 'one approval must authorize at most one invocation');
  assert.ok(skill.includes('zero invocations'), 'rejected approval must mean zero invocations');
  assert.ok(skill.includes('帮我批准'), 'host approval mode must stay the operator-configured UI');
  assert.ok(skill.includes('approvals_reviewer=auto_review'), 'approval reviewer must stay auto_review');
  assert.ok(
    /never (modify|modifies) the approval policy/.test(skill),
    'approval policy must not be mutated',
  );
  assert.ok(skill.includes('never fall back'), 'no operator-direct-run fallback');
});

test('skill re-reads the durable Room after every invocation and reports only the snapshot', () => {
  const skill = readText(skillPath);
  assert.ok(skill.includes('After the command returns'), 'post-run reread step must exist');
  assert.ok(skill.includes('call `room_get_state` again'), 'post-run reread must call room_get_state');
  assert.ok(skill.includes('same `room_id`'), 'reread must use the same room_id');
  assert.ok(skill.includes('durable snapshot'), 'report must follow the durable snapshot');
  // v0.5：report 对象是 Run status 而非 Room 单一大状态。
  for (const runState of ['`review_required`', '`needs_decision`', '`failed`', '`canceled`']) {
    assert.ok(skill.includes(runState), `snapshot Run states must be reportable (${runState})`);
  }
  assert.ok(skill.includes('uncertain'), 'uncertain outcome must be handled');
});

test('launcher regression: npm --prefix reaches the Agent Room CLI from a temporary target cwd without a package manifest', () => {
  const npmCliJs = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  assert.ok(existsSync(npmCliJs), `npm cli not found next to node: ${npmCliJs}`);
  const target = mkdtempSync(join(tmpdir(), 'agent-room-target-'));
  try {
    // temporary target cwd 没有 package.json 或 room:run script，必须仍能经 --prefix 到达 Agent Room CLI。
    assert.equal(existsSync(join(target, 'package.json')), false, 'temporary target cwd must have no manifest');
    const r = spawnSync(
      process.execPath,
      [npmCliJs, '--prefix', root, 'run', 'room:run', '--', '--project', target],
      { cwd: target, encoding: 'utf8', timeout: 30000 },
    );
    assert.notEqual(r.status, 0, 'must exit non-zero at the CLI argument boundary');
    assert.ok(r.stdout.includes('room:run'), 'npm must resolve the Agent Room room:run script via --prefix');
    assert.match(r.stderr, /--db <path> is required/, 'must reach the existing missing-required-argument boundary');
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});
