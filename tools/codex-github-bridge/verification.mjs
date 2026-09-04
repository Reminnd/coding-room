import { dirname, join } from 'node:path';
import { runProcess } from './process.mjs';

const EXECUTABLES = new Set(['git', 'node', 'npm', 'npx']);

export function verificationInvocation(tokens) {
  if (process.platform === 'win32' && (tokens[0] === 'npm' || tokens[0] === 'npx')) {
    const cli = tokens[0] === 'npm' ? 'npm-cli.js' : 'npx-cli.js';
    return { command: process.execPath, args: [join(dirname(process.execPath), 'node_modules', 'npm', 'bin', cli), ...tokens.slice(1)] };
  }
  return { command: tokens[0], args: tokens.slice(1) };
}

export function splitCommand(command) {
  const tokens = [];
  let token = '';
  let quote = null;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (quote) {
      if (char === quote) quote = null;
      else if (char === '\\' && quote === '"' && index + 1 < command.length) token += command[++index];
      else token += char;
    } else if (char === '"' || char === "'") quote = char;
    else if (/\s/.test(char)) {
      if (token) tokens.push(token);
      token = '';
    } else token += char;
  }
  if (quote) throw new Error(`unterminated quote in verification command: ${command}`);
  if (token) tokens.push(token);
  return tokens;
}

export async function runVerification(requirements, cwd, run = runProcess) {
  const evidence = [];
  for (const requirement of requirements) {
    const tokens = splitCommand(requirement);
    if (tokens.length === 0 || !EXECUTABLES.has(tokens[0])) {
      evidence.push({ requirement, kind: 'supervisor_check', passed: null });
      continue;
    }
    const invocation = verificationInvocation(tokens);
    const result = await run(invocation.command, invocation.args, { cwd });
    evidence.push({
      requirement,
      kind: 'command',
      passed: result.exitCode === 0 && !result.error,
      exitCode: result.exitCode,
      stdout: result.stdout.trim().slice(-4000),
      stderr: result.stderr.trim().slice(-4000),
      error: result.error?.message ?? null,
    });
  }
  return evidence;
}
