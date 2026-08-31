import type { Run, RunAttempt } from '../protocol/schema.ts';
import type { RoomRecord } from '../room/repository.ts';
import { RoomService } from '../room/room-service.ts';
import type { ClaudeProcessSpawn } from './claude-process.ts';
import { LocalExecutor } from './executor.ts';

// Runner boundary：v0.4 起只做一次 one-shot RunAttempt 的输入组装与委托。process/stream/
// Git/artifact 的 terminal 分类、cancel poll 与单一 settlement 全部归 LocalExecutor 拥有；
// 本模块不保留 SQLite/transition/JSONL authority。runId + attemptId 必须由 caller（one-shot
// CLI）显式提供，一次调用至多执行一个 attempt，不轮询 ready queue、不自动启动下一 Run。

export interface ClaudeRunnerInput {
  roomService: RoomService;
  runId: string;
  attemptId: string;
  targetWorktree: string;
  // serialized Room MCP config，直接作为 --mcp-config 传入 process。
  mcpConfig: string;
  // process boundary 注入 seam：仅 fake-process 测试替换 spawn，不是通用 command runner。
  spawnProcess?: ClaudeProcessSpawn;
  // cancel poll boundary 的检查间隔；仅测试注入以加速取消观察。
  pollIntervalMs?: number;
}

export interface ClaudeRunResult {
  run: Run;
  room: RoomRecord;
  attempt: RunAttempt;
}

export async function runClaude(input: ClaudeRunnerInput): Promise<ClaudeRunResult> {
  const executor = new LocalExecutor({
    roomService: input.roomService,
    runId: input.runId,
    attemptId: input.attemptId,
    targetWorktree: input.targetWorktree,
    mcpConfig: input.mcpConfig,
    ...(input.spawnProcess === undefined ? {} : { spawnProcess: input.spawnProcess }),
    ...(input.pollIntervalMs === undefined ? {} : { pollIntervalMs: input.pollIntervalMs }),
  });
  const result = await executor.execute();
  return { room: result.room, run: result.run, attempt: result.attempt };
}
