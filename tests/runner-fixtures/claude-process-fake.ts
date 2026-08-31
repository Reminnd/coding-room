import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import type { ChildProcess } from 'node:child_process';

// 捕获 spawn 边界与 stdin 写入内容，供 fake-process 测试断言 argument contract 与完整 prompt。
export interface SpawnInvocation {
  command: string;
  args: readonly string[];
  options: { cwd: string; shell: false };
}

export type FakeSpawn = (
  command: string,
  args: readonly string[],
  options: { cwd: string; shell: false },
) => ChildProcess;

// 用真实 stream 与 EventEmitter 模拟 transport 依赖的最小 ChildProcess 表面：
// stdin 收集写入内容，stdout/stderr 由测试 push chunk，close/error 由测试 emit。
// 可选 stdinWriteError 注入最小 stdin write failure seam（如 EPIPE），仅服务该 regression。
export class FakeClaudeProcess extends EventEmitter {
  readonly stdin: Writable;
  readonly stdout: PassThrough;
  readonly stderr: PassThrough;
  stdinWritten = '';
  stdinEnded = false;
  // Executor cancel boundary 的证据：abort → child.kill() 的事实。
  killed: NodeJS.Signals | null = null;

  constructor(stdinWriteError?: Error) {
    super();
    this.stdout = new PassThrough();
    this.stderr = new PassThrough();
    this.stdin = new Writable({
      write: (chunk, _encoding, callback) => {
        if (stdinWriteError) {
          callback(stdinWriteError);
          return;
        }
        this.stdinWritten += chunk.toString('utf8');
        callback();
      },
    });
    this.stdin.on('finish', () => {
      this.stdinEnded = true;
    });
  }

  // 与真实 ChildProcess.kill 一致的最小表面：记录信号并同步 emit close(null, signal)，
  // 使 transport 层观察到 signal exit outcome；canceled 分类仍由 Executor 按 attempt status 决定。
  kill(signal?: NodeJS.Signals): boolean {
    this.killed = signal ?? 'SIGTERM';
    this.emit('close', null, this.killed);
    return true;
  }
}

export function makeSpawner(
  child: FakeClaudeProcess,
): { spawner: FakeSpawn; invocations: SpawnInvocation[] } {
  const invocations: SpawnInvocation[] = [];
  const spawner: FakeSpawn = (command, args, options) => {
    invocations.push({ command, args, options });
    return child as unknown as ChildProcess;
  };
  return { spawner, invocations };
}

export function makeThrowingSpawner(
  error: Error,
): { spawner: FakeSpawn; invocations: SpawnInvocation[] } {
  const invocations: SpawnInvocation[] = [];
  const spawner: FakeSpawn = (command, args, options) => {
    invocations.push({ command, args, options });
    throw error;
  };
  return { spawner, invocations };
}

// 等待 stdin 完成写入；用于在断言 stdinWritten 前确保 Writable 已 flush。
export function whenStdinFinished(child: FakeClaudeProcess): Promise<void> {
  if (child.stdinEnded) return Promise.resolve();
  return new Promise((resolve) => child.stdin.once('finish', () => resolve()));
}

// 等待 stdin 发出异步 write error；用于在断言 rejection 前确保 EPIPE 已送达 transport。
export function whenStdinError(child: FakeClaudeProcess): Promise<unknown> {
  return new Promise((resolve) => child.stdin.once('error', resolve));
}
