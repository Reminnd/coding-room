import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = mkdtempSync(join(tmpdir(), 'room-desktop-flow-'));
const project = join(root, 'Sample project');
mkdirSync(project);
const reference = join(project, 'requirements.md');
writeFileSync(reference, '# Requirements\nPreserve source files when archiving tasks.');
let instance;
let child;
let passed = false;
let nativeStderr = '';
try {
  instance = await electron.launch({
    ...(process.env.ROOM_TEST_EXECUTABLE ? { executablePath: process.env.ROOM_TEST_EXECUTABLE, args: [] } : { args: ['.'] }),
    env: { ...process.env, ROOM_USER_DATA: join(root, 'profile') }, timeout: 60000,
  });
  child = instance.process();
  child.stderr?.on('data', (chunk) => { nativeStderr += chunk.toString(); });
  const page = await instance.firstWindow();
  page.setDefaultTimeout(15000);
  await page.getByRole('heading', { name: '从一个项目开始' }).waitFor();
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  const crashConfig = await instance.evaluate(({ app, crashReporter }) => ({ uploads: crashReporter.getUploadToServer(), path: app.getPath('crashDumps') }));
  assert.equal(crashConfig.uploads, false);
  assert.equal(crashConfig.path, join(root, 'profile', 'crash-dumps'));
  await instance.evaluate(({ dialog }, project) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [project] }); }, project);
  await page.getByRole('button', { name: '打开项目文件夹' }).click();
  await page.getByRole('button', { name: '为此项目创建 Room', exact: true }).click();
  await page.getByRole('heading', { name: '全部任务', exact: true }).waitFor();
  await page.getByRole('button', { name: '＋ 新建任务' }).click();
  await page.getByLabel('任务标题', { exact: true }).fill('验证草稿恢复');
  await page.getByLabel('希望完成什么').fill('保存任务后重启窗口，仍能看到目标和测试驱动设置。');
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await page.getByRole('button', { name: /验证草稿恢复/ }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: /验证草稿恢复/ }).click();
  await page.getByRole('heading', { name: '验证草稿恢复', exact: true }).waitFor();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByLabel('项目名称', { exact: true }).fill('桌面验收项目');
  await page.getByLabel('默认开发入口', { exact: true }).selectOption('sdd');
  await page.getByLabel('默认验证方式', { exact: true }).selectOption('standard');
  await page.getByRole('button', { name: '全部任务', exact: true }).click();
  await page.getByRole('dialog', { name: '保存未完成的编辑？' }).waitFor();
  await page.getByRole('button', { name: '继续编辑', exact: true }).click();
  await page.getByRole('button', { name: '保存项目设置', exact: true }).click();
  await page.getByText('项目设置已保存，新建任务将采用这些默认值。', { exact: true }).waitFor();
  await page.route('**/api/desktop/agents/codex', (route) => route.fulfill({ json: { connected: true, signed_in: true, native_plan: true, error: null, models: [] } }));
  await page.getByRole('button', { name: '检测连接', exact: true }).first().click();
  await page.getByRole('button', { name: 'Agent 状态', exact: true }).filter({ hasText: 'Codex 已登录' }).waitFor();
  await page.unroute('**/api/desktop/agents/codex');
  await page.getByLabel('主题', { exact: true }).selectOption('dark');
  await page.getByLabel('字号', { exact: true }).selectOption('16');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).fontSize), '16px');
  await page.getByRole('button', { name: '＋ 新建任务' }).click();
  assert.equal(await page.getByRole('radio', { name: /规格模式/ }).isChecked(), true);
  assert.equal(await page.getByRole('radio', { name: '普通验证', exact: true }).isChecked(), true);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '全部任务', exact: true }).click();
  await page.getByRole('button', { name: /验证草稿恢复/ }).click();
  await page.getByRole('button', { name: '方案', exact: true }).click();
  await page.getByText('尚未生成方案。请在对话中明确目标与验收条件。').waitFor();
  const discussionRoute = '**/workbench/tasks/*/discussion';
  await page.route(discussionRoute, (route) => route.fulfill({ json: {
    state: { status: 'running', error: null, text: '正在核对草稿恢复的验收条件。', stream_item_id: 'stream-message', question: null },
    thread: { turns: [{ id: 'stream-turn', items: [
      { id: 'user-message', type: 'userMessage', content: [{ type: 'text', text: '请检查草稿恢复' }] },
      { id: 'stream-message', type: 'agentMessage', text: '正在核对' },
      { id: 'source-read', type: 'commandExecution', command: 'Read requirements.md', cwd: project, status: 'completed', aggregatedOutput: 'Source evidence: preserve saved drafts.' },
    ] }] },
  } }));
  await page.getByRole('button', { name: '对话', exact: true }).click();
  await page.getByText('正在核对草稿恢复的验收条件。', { exact: true }).waitFor();
  assert.equal(await page.locator('.message').count(), 2, 'Stream updates the existing message instead of duplicating it');
  await page.getByText('请检查草稿恢复', { exact: true }).waitFor();
  await page.getByText('来源读取与研究记录', { exact: true }).click();
  await page.getByText('Read requirements.md · completed', { exact: true }).click();
  await page.getByText('Source evidence: preserve saved drafts.', { exact: true }).waitFor();
  await page.getByRole('button', { name: '方案', exact: true }).click();
  await page.unroute(discussionRoute);
  await page.getByRole('button', { name: '切换为 SDD', exact: true }).click();
  await page.getByRole('button', { name: '打开网页 / 登录', exact: true }).waitFor();
  await page.evaluate(async () => {
    const projects = await (await fetch('/api/projects')).json();
    const base = `/api/projects/${projects.projects[0].project_id}/workbench`;
    const { tasks } = await (await fetch(`${base}/tasks`)).json();
    const task = tasks[0];
    if (task.mode !== 'sdd' || task.run_id !== null) throw new Error('Switching to SDD must update planning mode without executing');
    const response = await fetch(`${base}/tasks/${task.id}/proposal`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      expected_version: 0, text: 'SDD 完整方案', details: { requirements: ['保留用户输入'], non_goals: [], architecture_decisions: [], scope: ['src'], constraints: [], acceptance_criteria: ['刷新后恢复'], verification: [], documentation_updates: [], question_policy: '范围变化先讨论',
        sdd: { specification: '保存草稿并在刷新后恢复完整输入。', technical_design: '同一项目数据库保存任务，前端读取服务接口。', tasks: [{ id: 'draft', title: '实现草稿恢复', modules: ['src/store.ts'], dependencies: [], acceptance: ['刷新后读取草稿'], tests: ['关闭并重新打开页面，核对输入'] }] } },
    }) });
    if (!response.ok) throw new Error(await response.text());
  });
  await page.reload();
  await page.getByRole('button', { name: '方案', exact: true }).click();
  await page.getByRole('tab', { name: '技术设计', exact: true }).click();
  await page.getByText('同一项目数据库保存任务，前端读取服务接口。', { exact: true }).waitFor();
  await page.getByRole('tab', { name: '实施任务', exact: true }).click();
  await page.getByRole('heading', { name: '1. 实现草稿恢复', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '检查并执行…', exact: true }).isDisabled(), true);
  await page.getByText('测试驱动任务需要明确验证命令。', { exact: true }).waitFor();
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByRole('tab', { name: '规格', exact: true }).click();
  await page.locator('textarea').first().fill('保存草稿并在刷新后恢复完整输入，允许空白草稿。');
  await page.getByRole('button', { name: '对话', exact: true }).click();
  await page.getByRole('dialog', { name: '保存未完成的编辑？' }).waitFor();
  await page.getByRole('button', { name: '继续编辑', exact: true }).click();
  assert.equal(await page.locator('textarea').first().inputValue(), '保存草稿并在刷新后恢复完整输入，允许空白草稿。');
  await page.getByRole('button', { name: '全部任务', exact: true }).click();
  await page.getByRole('button', { name: '保存并离开', exact: true }).click();
  await page.getByRole('button', { name: /验证草稿恢复/ }).click();
  await page.getByText('保存草稿并在刷新后恢复完整输入，允许空白草稿。', { exact: true }).waitFor();
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByLabel('方案内容', { exact: true }).fill('');
  await page.getByRole('button', { name: '← 返回任务列表', exact: true }).click();
  await page.getByRole('button', { name: '保存并离开', exact: true }).click();
  await page.getByRole('alert').first().waitFor();
  assert.equal(await page.getByRole('dialog', { name: '保存未完成的编辑？' }).isVisible(), true);
  await page.getByRole('button', { name: '继续编辑', exact: true }).click();
  assert.equal(await page.getByLabel('方案内容', { exact: true }).inputValue(), '');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '放弃编辑', exact: true }).click();
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  assert.equal(await page.getByLabel('方案内容', { exact: true }).inputValue(), 'SDD 完整方案');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '项目资料', exact: true }).click();
  await instance.evaluate(({ dialog }, reference) => {
    dialog.showOpenDialog = async (_window, options) => {
      if (!options.properties.includes('openFile')) throw new Error('Expected native file selection');
      return { canceled: false, filePaths: [reference] };
    };
  }, reference);
  await page.getByRole('button', { name: '添加资料', exact: true }).click();
  await page.getByRole('button', { name: '浏览文件', exact: true }).click();
  await page.waitForFunction((expected) => [...document.querySelectorAll('input')].some((input) => input.value === expected), reference);
  assert.equal(await page.getByLabel('文件位置或 URL', { exact: true }).inputValue(), reference);
  await page.getByLabel('名称', { exact: true }).fill('验收要求');
  await page.getByRole('button', { name: '保存资料', exact: true }).click();
  await page.getByRole('button', { name: '读取预览', exact: true }).click();
  await page.getByText(/预览已读取/).waitFor();
  await page.getByText('查看读取预览', { exact: true }).click();
  await page.getByText(/Preserve source files when archiving tasks/).waitFor();
  await page.getByRole('button', { name: '全部任务', exact: true }).click();
  await page.getByRole('button', { name: /验证草稿恢复/ }).click();
  await page.getByRole('button', { name: '任务操作', exact: true }).click();
  await page.getByRole('button', { name: '归档任务', exact: true }).click();
  await page.getByText(/历史记录只读/).waitFor();
  assert.equal(await page.getByRole('button', { name: '编辑', exact: true }).count(), 0);
  await page.getByRole('button', { name: '← 返回任务列表', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: /验证草稿恢复/ }).count(), 0);
  await page.getByRole('button', { name: '项目历史', exact: true }).click();
  await page.getByLabel('更新日期从', { exact: true }).fill('2099-01-01');
  assert.equal(await page.getByRole('button', { name: /验证草稿恢复/ }).count(), 0);
  await page.getByLabel('更新日期从', { exact: true }).fill('');
  await instance.evaluate(({ app, session }, root) => {
    app.setPath('downloads', root);
    globalThis.recordDownload = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Native download timed out')), 15000);
      session.defaultSession.once('will-download', (_event, item) => {
        item.setSavePath(root + '/selected-records.json');
        item.once('done', (_event, state) => { clearTimeout(timeout); resolve(state); });
      });
    });
  }, root);
  await page.getByRole('button', { name: '导出记录', exact: true }).click();
  await page.getByRole('checkbox', { name: '验证草稿恢复', exact: true }).check();
  await page.getByRole('button', { name: '导出所选记录', exact: true }).click();
  assert.equal(await instance.evaluate(() => globalThis.recordDownload), 'completed');
  const exported = JSON.parse(readFileSync(join(root, 'selected-records.json'), 'utf8'));
  assert.equal(exported.records.length, 1);
  assert.equal(exported.records[0].task.title, '验证草稿恢复');
  assert.ok(exported.records[0].proposal_versions.length >= 2);
  await page.getByRole('button', { name: /验证草稿恢复/ }).click();
  await page.getByRole('button', { name: '任务操作', exact: true }).click();
  await page.getByRole('button', { name: '恢复到任务列表', exact: true }).click();
  await page.getByRole('button', { name: '编辑任务', exact: true }).waitFor();
  await page.getByRole('button', { name: '任务操作', exact: true }).click();
  await page.getByRole('button', { name: '新建后续任务', exact: true }).click();
  await page.getByRole('heading', { name: '编辑任务', exact: true }).waitFor();
  assert.equal(await page.getByLabel('希望完成什么', { exact: true }).inputValue(), '');
  await page.getByRole('button', { name: '添加资料并用于本任务', exact: true }).click();
  await page.getByRole('button', { name: '浏览文件', exact: true }).click();
  await page.waitForFunction((expected) => [...document.querySelectorAll('input')].some((input) => input.value === expected), reference);
  await page.getByLabel('名称', { exact: true }).fill('任务参考');
  await page.getByLabel('类型', { exact: true }).selectOption('code');
  await page.getByRole('button', { name: '保存资料', exact: true }).click();
  assert.equal(await page.getByRole('checkbox', { name: /任务参考/ }).isChecked(), true);
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await page.getByRole('button', { name: /验证草稿恢复 · 后续/ }).click();
  await page.getByRole('button', { name: '查看来源任务', exact: true }).click();
  await page.getByRole('heading', { name: '验证草稿恢复', exact: true }).waitFor();
  if (process.env.ROOM_SCREENSHOT) await page.screenshot({ path: process.env.ROOM_SCREENSHOT });
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  await page.evaluate(() => { void window.roomDesktop.quit(); });
  const result = await exited;
  assert.equal(result.signal, null, `Electron was terminated by ${result.signal}\n${nativeStderr}`);
  assert.equal(result.code, 0, `Electron exited abnormally (${result.code})\n${nativeStderr}`);
  passed = true;
  console.log('PASS: native project/file selection, source preview and inline attachment, task archive/restore/followup, draft persistence, SDD editing, renderer isolation, normal exit');
} catch (error) {
  console.error('Desktop smoke failed:', error);
  if (nativeStderr) console.error('Electron stderr:', nativeStderr);
  console.error('Test profile retained for diagnosis:', root);
  throw error;
} finally {
  if (child && child.exitCode === null) await instance.close();
  try { if (passed) rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 }); }
  catch (error) { console.error('Temporary test profile cleanup failed:', root, error.message); }
}
