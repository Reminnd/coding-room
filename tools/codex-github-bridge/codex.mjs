import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { codexExecArgs } from './model-router.mjs';
import { runNativeWorker } from './codex-app-server.mjs';
import { runProcess } from './process.mjs';

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

  async execute({ worktree, model, prompt, outputSchema = null, sandbox = 'workspace-write' }) {
    const temp = await mkdtemp(join(tmpdir(), 'codex-github-bridge-'));
    const lastMessagePath = join(temp, 'last-message.txt');
    const outputSchemaPath = outputSchema ? join(temp, 'output-schema.json') : null;
    try {
      if (outputSchemaPath) await writeFile(outputSchemaPath, `${JSON.stringify(outputSchema)}\n`, 'utf8');
      const result = await this.run(this.codexBin, codexExecArgs({
        worktree,
        model: model.resolvedModel,
        reasoningEffort: model.reasoningEffort,
        lastMessagePath,
        outputSchemaPath,
        sandbox,
      }), { cwd: worktree, input: prompt });
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
    return runNativeWorker({
      codexBin: this.codexBin,
      worktree: context.worktree,
      model: context.model,
      prompt: buildWorkerPrompt(context, contract),
      spawn: this.spawn,
    });
  }
}
