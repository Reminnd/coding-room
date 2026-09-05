import { spawn } from 'node:child_process';

export function spawnProcess(command, args = [], options = {}) {
  return spawn(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    windowsHide: true,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

export function runProcess(command, args = [], options = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnProcess(command, args, options);
    } catch (error) {
      resolve({ command, args, exitCode: null, signal: null, stdout: '', stderr: '', error });
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve({ command, args, stdout, stderr, ...result });
    };

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', (error) => finish({ exitCode: null, signal: null, error }));
    child.once('close', (exitCode, signal) => finish({ exitCode, signal, error: null }));

    if (options.input === undefined) child.stdin.end();
    else child.stdin.end(options.input, 'utf8');
  });
}

export async function runChecked(run, command, args = [], options = {}) {
  const result = await run(command, args, options);
  if (result.error || result.exitCode !== 0) {
    const detail = result.error?.message ?? result.stderr.trim() ?? `exit ${result.exitCode}`;
    const error = new Error(`${command} ${args.join(' ')} failed: ${detail}`);
    error.processResult = result;
    throw error;
  }
  return result;
}
