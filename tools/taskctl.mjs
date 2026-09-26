#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';

function usage(message) {
  if (message) process.stderr.write(`${message}\n\n`);
  process.stderr.write(`Usage:
  taskctl [--url http://127.0.0.1:4317] [--json] projects list
  taskctl [--url ...] [--json] projects add --data <json>|--file <path>
  taskctl [--url ...] [--json] projects import --project-path <absolute> [--name <name>]
  taskctl [--url ...] [--json] projects remove <project-id>
  taskctl [--url ...] [--json] state <project-id>
  taskctl [--url ...] [--json] action <project-id> <action> --data <json>|--file <path>
  taskctl [--url ...] [--json] events <project-id> [--after <sequence>] [--type <event-type>]
  taskctl [--url ...] [--json] export <project-id> [--out <path>]
  taskctl [--url ...] [--json] open <project-id> [--run-id <run-id>]
`);
  process.exit(1);
}

function takeOption(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) usage(`${name} requires a value`);
  args.splice(index, 2);
  return value;
}

function takeFlag(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
}

async function payload(args) {
  const data = takeOption(args, '--data');
  const file = takeOption(args, '--file');
  if ((data && file) || (!data && !file)) usage('exactly one of --data or --file is required');
  try {
    return JSON.parse(data ?? await readFile(file, 'utf8'));
  } catch (error) {
    usage(`invalid JSON payload: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function request(baseUrl, path, options = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    ...options,
    headers: options.body === undefined ? undefined : { 'content-type': 'application/json' },
  });
  const text = await response.text();
  let body;
  try {
    body = text === '' ? null : JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  if (!response.ok) throw new Error(`${body?.error?.code ?? `HTTP ${response.status}`}: ${body?.error?.message ?? text}`);
  return body;
}

function readable(command, value) {
  if (command === 'projects') {
    const projects = value.projects ?? [];
    if (projects.length === 0) return '未配置项目。\n';
    return `${projects.map((project) => `${project.project_id}\t${project.name}\t${project.room_id}\t${project.configuration_error ?? 'ready'}`).join('\n')}\n`;
  }
  if (command === 'state') {
    return `Room ${value.room.room_id}: ${value.room.state}\nRuns: ${value.runs.length}; Questions: ${value.questions.filter((q) => q.status === 'open').length}; Reviews: ${value.reviews.length}; Cursor: ${value.cursor}\n`;
  }
  if (command === 'events') {
    const events = value.events ?? [];
    return `${events.map((event) => `${event.sequence}\t${event.type}\t${event.summary}`).join('\n')}${events.length ? '\n' : '无事件。\n'}`;
  }
  if (command === 'open') return `已请求 VS Code 打开：${value.target}\n`;
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function main() {
  const args = process.argv.slice(2);
  const baseUrl = takeOption(args, '--url', 'http://127.0.0.1:4317');
  const jsonOutput = takeFlag(args, '--json');
  const command = args.shift();
  let result;
  let label = command;

  if (command === 'projects') {
    const subcommand = args.shift();
    if (subcommand === 'list') result = await request(baseUrl, '/api/projects');
    else if (subcommand === 'add') result = await request(baseUrl, '/api/projects', { method: 'POST', body: JSON.stringify(await payload(args)) });
    else if (subcommand === 'import') {
      const projectPath = takeOption(args, '--project-path');
      const name = takeOption(args, '--name');
      if (!projectPath) usage('--project-path is required');
      result = await request(baseUrl, '/api/projects/import-runtime', { method: 'POST', body: JSON.stringify({ project_path: projectPath, ...(name ? { name } : {}) }) });
    } else if (subcommand === 'remove') {
      const projectId = args.shift();
      if (!projectId) usage('project id is required');
      result = await request(baseUrl, `/api/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' });
    } else usage('projects command must be list, add, import, or remove');
  } else if (command === 'state') {
    const projectId = args.shift();
    if (!projectId) usage('project id is required');
    result = await request(baseUrl, `/api/projects/${encodeURIComponent(projectId)}/state`);
  } else if (command === 'action') {
    const projectId = args.shift();
    const action = args.shift();
    if (!projectId || !action) usage('action requires project-id and action name');
    result = await request(baseUrl, `/api/projects/${encodeURIComponent(projectId)}/actions/${encodeURIComponent(action)}`, { method: 'POST', body: JSON.stringify(await payload(args)) });
  } else if (command === 'events') {
    const projectId = args.shift();
    if (!projectId) usage('project id is required');
    const after = takeOption(args, '--after');
    const type = takeOption(args, '--type');
    const query = new URLSearchParams();
    if (after) query.set('after_sequence', after);
    if (type) query.set('type', type);
    result = await request(baseUrl, `/api/projects/${encodeURIComponent(projectId)}/events?${query}`);
  } else if (command === 'export') {
    const projectId = args.shift();
    const out = takeOption(args, '--out');
    if (!projectId) usage('project id is required');
    result = await request(baseUrl, `/api/projects/${encodeURIComponent(projectId)}/export`);
    if (out) {
      await writeFile(out, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
      if (!jsonOutput) {
        process.stdout.write(`已导出：${out}\n`);
        return;
      }
    }
  } else if (command === 'open') {
    label = 'open';
    const projectId = args.shift();
    const runId = takeOption(args, '--run-id');
    if (!projectId) usage('project id is required');
    result = await request(baseUrl, `/api/projects/${encodeURIComponent(projectId)}/open-vscode`, { method: 'POST', body: JSON.stringify(runId ? { run_id: runId } : {}) });
  } else usage('unknown command');

  if (args.length > 0) usage(`unexpected arguments: ${args.join(' ')}`);
  process.stdout.write(jsonOutput ? `${JSON.stringify(result, null, 2)}\n` : readable(label, result));
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
