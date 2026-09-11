import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { codexExecArgs } from './model-router.mjs';
import { runNativeWorker } from './codex-app-server.mjs';
import { postMutationUncertain } from './lifecycle.mjs';
import { runProcess } from './process.mjs';

export const SUPERVISOR_ONLY_MODEL = Object.freeze({
  modelPolicy: 'coding_strong',
  resolvedModel: 'gpt-5.6-sol',
  reasoningEffort: 'high',
  fallbackUsed: false,
});

export const SUPERVISOR_ONLY_CODEX_EXECUTABLE = 'C:\\Users\\RM\\AppData\\Local\\Programs\\OpenAI\\Codex\\bin\\codex.exe';

export const SUPERVISOR_ONLY_ENV_ALLOWLIST = Object.freeze([
  'SystemRoot', 'WINDIR', 'ComSpec', 'PATH', 'PATHEXT', 'TEMP', 'TMP',
  'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY',
]);

export const SUPERVISOR_ONLY_DISABLED_FEATURES = Object.freeze([
  'apps',
  'browser_use',
  'browser_use_external',
  'browser_use_full_cdp_access',
  'computer_use',
  'image_generation',
  'js_repl',
  'multi_agent',
  'plugins',
]);

const SUPERVISOR_ONLY_CONFIG_OVERRIDES = Object.freeze([
  'mcp_servers.agent_room.enabled=false',
  'mcp_servers.node_repl.enabled=false',
  'mcp_servers.cua_repl.enabled=false',
  'notify=[]',
]);

function supervisorOnlyArgs(args) {
  const execIndex = args.indexOf('exec');
  if (execIndex === -1) throw new Error('Codex exec argv is missing the exec command');
  const rootOptions = [
    '--strict-config',
    ...SUPERVISOR_ONLY_DISABLED_FEATURES.flatMap((feature) => ['--disable', feature]),
    ...SUPERVISOR_ONLY_CONFIG_OVERRIDES.flatMap((override) => ['--config', override]),
  ];
  const execOptions = ['--ignore-user-config', '--ephemeral'];
  return [...args.slice(0, execIndex), ...rootOptions, 'exec', ...execOptions, ...args.slice(execIndex + 1)];
}

export function supervisorOnlyEnvironment(source = process.env) {
  const environment = {};
  for (const name of SUPERVISOR_ONLY_ENV_ALLOWLIST) {
    if (typeof source[name] === 'string') environment[name] = source[name];
  }
  environment.HTTP_PROXY = 'http://127.0.0.1:7890';
  environment.HTTPS_PROXY = 'http://127.0.0.1:7890';
  return environment;
}

export function supervisorOnlyArgvTemplate(worktree) {
  return supervisorOnlyArgs(codexExecArgs({
    worktree,
    model: SUPERVISOR_ONLY_MODEL.resolvedModel,
    reasoningEffort: SUPERVISOR_ONLY_MODEL.reasoningEffort,
    lastMessagePath: '<temp-last-message-path>',
    outputSchemaPath: '<temp-output-schema-path>',
    sandbox: 'read-only',
  }));
}

function dispatchEnvelope(context) {
  return [
    `task_id=${context.task.task_id}`,
    `dispatch_id=${context.task.dispatch_id}`,
    `repository=${context.repository}`,
    `base_sha=${context.baseSha}`,
    `stage_branch=${context.stageBranch}`,
    `task_branch=${context.task.task_branch}`,
    `worktree=${context.worktree}`,
    `task_contract_path=${context.task.task_contract_path}`,
    `model_policy=${context.model.modelPolicy}`,
    `resolved_model=${context.model.resolvedModel}`,
    `reasoning_effort=${context.model.reasoningEffort}`,
  ].join('; ');
}

export function buildWorkerPrompt(context, contract) {
  return `You are the Local Codex implementation Worker for an already user-approved task. Read the complete Task Contract below before editing and follow it exactly. Implement only owned paths and accepted requirements. Do not perform formal Review, do not modify main or the Stage branch, do not broaden scope, or invent fallback behavior. You must not spawn subagents unless the complete exact Accepted Task Contract explicitly authorizes Root-only native multi-agent delegation. Any such authorization applies only to the Root Worker; child-spawned writing descendants remain forbidden. Do not run git add, git commit, git checkout, git branch, git reset, git rebase, or git push. Run every required focused verification and leave the verified implementation as an unstaged working-tree Diff. Finish with status implementation_ready and the exact Required Coding Result fields from the Contract; the Bridge Controller will independently verify Git facts and create the candidate commit outside the native sandbox.\n\nDISPATCH ENVELOPE\n${dispatchEnvelope(context)}\n\nOWNED PATHS\n${JSON.stringify(context.task.owns)}\n\nDEPENDENCY FACTS\n${JSON.stringify(context.dependencies ?? [], null, 2)}\n\n--- TASK CONTRACT START ---\n${contract}\n--- TASK CONTRACT END ---\n`;
}

export class CodexLauncher {
  constructor({ codexBin = 'codex', run = runProcess, spawn } = {}) {
    this.codexBin = codexBin;
    this.run = run;
    this.spawn = spawn;
  }

  async execute({ worktree, model, prompt, outputSchema = null, sandbox = 'workspace-write', environment, supervisorOnly = false }) {
    const temp = await mkdtemp(join(tmpdir(), 'codex-github-bridge-'));
    const lastMessagePath = join(temp, 'last-message.txt');
    const outputSchemaPath = outputSchema ? join(temp, 'output-schema.json') : null;
    try {
      if (outputSchemaPath) await writeFile(outputSchemaPath, `${JSON.stringify(outputSchema)}\n`, 'utf8');
      const baseArgs = codexExecArgs({
        worktree,
        model: model.resolvedModel,
        reasoningEffort: model.reasoningEffort,
        lastMessagePath,
        outputSchemaPath,
        sandbox,
      });
      const result = await this.run(this.codexBin, supervisorOnly ? supervisorOnlyArgs(baseArgs) : baseArgs, {
        cwd: worktree,
        input: prompt,
        ...(environment === undefined ? {} : { env: environment }),
      });
      let lastMessage = '';
      try {
        lastMessage = await readFile(lastMessagePath, 'utf8');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      return { ...result, lastMessage };
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }

  async launchWorker(context, contract) {
    const result = await runNativeWorker({
      codexBin: this.codexBin,
      worktree: context.worktree,
      model: context.model,
      prompt: buildWorkerPrompt(context, contract),
      spawn: this.spawn,
    });
    if (!result.error) return result;
    return {
      ...result,
      error: postMutationUncertain('worker_launch', `Worker launch/start outcome is uncertain: ${result.error.message}`, {
        native: result.native ?? null,
      }),
    };
  }
}

export class SupervisorOnlyLauncher {
  constructor({ launcher, canonicalCodexExecutable, worktree, environmentSource = process.env }) {
    this.launcher = launcher;
    this.canonicalCodexExecutable = canonicalCodexExecutable;
    this.worktree = worktree;
    this.environmentSource = environmentSource;
  }

  async execute(input) {
    if (this.canonicalCodexExecutable !== SUPERVISOR_ONLY_CODEX_EXECUTABLE
      || this.launcher.codexBin !== this.canonicalCodexExecutable) {
      throw new Error('Supervisor-only launcher executable does not match the approved canonical path');
    }
    if (input.worktree !== this.worktree || input.sandbox !== 'read-only') {
      throw new Error('Supervisor-only launcher requires the exact worktree and read-only sandbox');
    }
    if (input.model?.resolvedModel !== SUPERVISOR_ONLY_MODEL.resolvedModel
      || input.model?.reasoningEffort !== SUPERVISOR_ONLY_MODEL.reasoningEffort
      || input.model?.fallbackUsed !== false) {
      throw new Error('Supervisor-only launcher requires the exact model, effort, and no fallback');
    }
    return this.launcher.execute({
      ...input,
      environment: supervisorOnlyEnvironment(this.environmentSource),
      supervisorOnly: true,
    });
  }
}
