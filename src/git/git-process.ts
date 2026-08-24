import { execFile } from 'node:child_process';

// git 的致命错误（如 “not a git repository”、“this operation must be run in a work
// tree”、“Needed a single revision”）统一以 exit code 128 退出。repository/HEAD 前置
// 条件的缺失由 git-observer 的 semantic boundary 据此映射为
// git_repository_missing / git_head_missing；本模块只负责把 process 失败原样向上抛。
export const GIT_FATAL_EXIT_CODE = 128;

// 大仓库的路径列表可能超过默认 1 MiB maxBuffer；给出更大上限，避免正常 worktree 因
// 路径数量被误杀。真正超限时 execFile 会报 ENOBUFS 而非静默截断。
const MAX_BUFFER = 64 * 1024 * 1024;

export class GitCommandError extends Error {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly exitCode: number | null;
  readonly stderr: string;

  constructor(
    command: string,
    args: readonly string[],
    cwd: string,
    exitCode: number | null,
    stderr: string,
  ) {
    super(
      `git ${[command, ...args].join(' ')} failed` +
        (exitCode === null ? ' (could not be started)' : ` (exit ${exitCode})`) +
        (stderr ? `: ${stderr.trim()}` : ''),
    );
    this.name = 'GitCommandError';
    this.command = command;
    this.args = args;
    this.cwd = cwd;
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

// 用无 shell 的 execFile 直接传递 argument array，绝不拼接 shell command string。
// encoding 设为 'buffer'，保证 NUL 分隔输出不被按字符串截断或错误解码。成功时返回
// 原始 Buffer stdout；任何非零退出或进程启动失败都以 GitCommandError 抛出，绝不把
// 失败降级为可被解析成 clean/empty evidence 的 null stdout。
export function runGit(command: string, args: readonly string[], cwd: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      [command, ...args],
      { cwd, encoding: 'buffer', maxBuffer: MAX_BUFFER },
      (error, stdout, stderr) => {
        if (!error) {
          resolve(stdout as Buffer);
          return;
        }

        // 进程启动失败（git 不存在）时 code 为 'ENOENT' 字符串，非零退出时为数字
        // exit code；只有数字 exit code 才是 GitCommandError.exitCode，其余为 null。
        const code = (error as { code?: unknown }).code;
        const exitCode = typeof code === 'number' ? code : null;
        reject(new GitCommandError(command, args, cwd, exitCode, stderrToString(stderr)));
      },
    );
  });
}

// execFile 把子进程 stderr 通过 callback 第三个参数传给调用方（Buffer 或 string），
// 而不是挂在 error object 上；抽成 string 供错误消息携带真实 diagnostic。
function stderrToString(stderr: unknown): string {
  if (Buffer.isBuffer(stderr)) {
    return stderr.toString('utf8');
  }
  if (typeof stderr === 'string') {
    return stderr;
  }
  return '';
}
