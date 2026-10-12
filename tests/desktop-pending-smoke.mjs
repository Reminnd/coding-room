import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = mkdtempSync(join(tmpdir(), 'room-pending-'));
const folders = ['Project A', 'Project B'].map((name) => join(root, name));
folders.forEach((path) => mkdirSync(path));
const instance = await electron.launch({ args: ['.'], env: { ...process.env, ROOM_USER_DATA: join(root, 'profile') }, timeout: 60000 });
const child = instance.process();
try {
  const page = await instance.firstWindow();
  page.setDefaultTimeout(15000);
  for (const folder of folders) {
    await instance.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, folder);
    await page.getByRole('button', { name: folder === folders[0] ? '打开项目文件夹' : '打开项目', exact: true }).click();
    await page.getByRole('button', { name: '为此项目创建 Room', exact: true }).click();
    await page.getByRole('heading', { name: '全部任务', exact: true }).waitFor();
    if (folder === folders[0]) {
      await page.getByRole('button', { name: '＋ 新建任务' }).click();
      await page.getByLabel('任务标题', { exact: true }).fill('待确认任务');
      await page.getByLabel('希望完成什么', { exact: true }).fill('确认方案');
      await page.getByRole('button', { name: '保存草稿', exact: true }).click();
      await page.evaluate(async () => {
        const { projects } = await (await fetch('/api/projects')).json();
        const base = `/api/projects/${projects[0].project_id}/workbench`;
        const { tasks } = await (await fetch(`${base}/tasks`)).json();
        const response = await fetch(`${base}/tasks/${tasks[0].id}/proposal`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expected_version: 0, text: '待确认方案', details: { requirements: ['确认范围'], non_goals: [], architecture_decisions: [], scope: ['src'], constraints: [], acceptance_criteria: ['用户看到待办'], verification: [], documentation_updates: [], question_policy: '先回答问题' } }) });
        if (!response.ok) throw new Error(await response.text());
      });
    }
  }
  await page.getByText('其他项目有待办', { exact: true }).click();
  await page.getByRole('button', { name: 'Project A · 1 项待办', exact: true }).click();
  await page.getByRole('heading', { name: '待我处理', exact: true }).waitFor();
  await page.getByRole('button', { name: /待确认任务/ }).click();
  assert.equal(await page.getByRole('button', { name: '方案', exact: true }).getAttribute('aria-current'), 'page');
  const projects = await page.evaluate(async () => (await (await fetch('/api/projects')).json()).projects);
  const other = projects.find((project) => project.name === 'Project B');
  await page.route(`**/api/projects/${other.project_id}/state`, (route) => route.fulfill({ status: 500, json: { error: { message: 'Fixture database unavailable' } } }));
  await page.getByRole('button', { name: '全部任务', exact: true }).click();
  await page.reload();
  await page.getByRole('option', { name: /Project B · 状态不可用/ }).waitFor({ state: 'attached' });
  const current = projects.find((project) => project.name === 'Project A');
  await page.route(`**/api/projects/${current.project_id}/state`, async (route) => {
    const state = await (await route.fetch()).json();
    state.tasks.push({ task_id: 'legacy-task', run_id: 'legacy-run', goal: '既有协议任务', type: 'implementation', created_at: '2026-10-10T10:00:00Z', requirements: ['读取既有记录'], acceptance_criteria: ['不复制执行状态'], scope: ['src'], verification: [{ command: 'node --test' }], background: '来自现有 Room' });
    state.runs.push({ run_id: 'legacy-run', status: 'needs_decision', worktree_path: 'C:/fixture/worktree', updated_at: '2026-10-10T10:00:00Z' });
    state.questions.push({ run_id: 'legacy-run', question: '旧任务需要确认的范围', answer: null });
    await route.fulfill({ json: state });
  });
  await page.reload();
  await page.getByText('既有协议任务', { exact: true }).click();
  await page.getByText('旧任务需要确认的范围', { exact: true }).waitFor();
  await page.getByText('读取既有记录', { exact: true }).waitFor();
  await page.getByLabel('切换项目', { exact: true }).selectOption(other.project_id);
  await page.getByText('项目状态不可用', { exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: '暂无任务', exact: true }).count(), 0);
  await page.getByRole('button', { name: '重新读取项目', exact: true }).click();
  await page.getByText('项目状态不可用', { exact: true }).waitFor();
  const exited = new Promise((resolve) => child.once('exit', resolve));
  await page.evaluate(() => window.roomDesktop.quit());
  assert.equal(await exited, 0);
  console.log(`PASS: cross-project pending navigation and failed-state disclosure; evidence ${root}`);
} finally { if (child.exitCode === null) await instance.close(); }
