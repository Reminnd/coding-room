import { codingResultSchema, type CodingResult } from '../protocol/schema.ts';

// Claude Code stream-json 的逐行解释边界。本 leaf 只拥有 stdout JSONL 的事件意义：
// Process Transport 负责 line framing，Integration 负责 protocol error 映射与 terminal
// transition。本模块不启动 process、不写 durable state、不请求 Room transition。
//
// 两个权威来源：
//   - initialization authority：唯一 type=system, subtype=init event，提供 session 与
//     required tool capability（tools 数组含 requiredToolName 比 mcp_servers 非空更接近
//     实际可调用能力）。
//   - terminal authority：唯一 type=result event；assistant message、StructuredOutput
//     tool_use/tool_result、hook 与 progress event 都不是 terminal authority。

// required Room decision tool 的 frozen authority：TypeScript input constraint、runtime
// tools lookup 与 success evidence name 都来自这一常量，不信任 caller 传入的其它 tool name。
export const REQUIRED_ROOM_TOOL_NAME = 'mcp__agent_room__room_ask_question' as const;

export interface ClaudeStreamInterpreterInput {
  expectedTaskId: string;
  requiredToolName: typeof REQUIRED_ROOM_TOOL_NAME;
  expectedSessionId: string | null;
}

// 可区分的解释失败原因；不在本模块映射 ProtocolError code，也不请求 Room transition。
export type ClaudeStreamFailureReason =
  | 'malformed_json_line'
  | 'init_missing'
  | 'init_error'
  | 'init_duplicate'
  | 'required_tool_missing'
  | 'terminal_missing'
  | 'terminal_duplicate'
  | 'terminal_error'
  | 'session_mismatch'
  | 'structured_output_missing'
  | 'coding_result_invalid'
  | 'task_id_mismatch';

export interface ClaudeStreamFailure {
  ok: false;
  reason: ClaudeStreamFailureReason;
  message: string;
}

// 非终态 progress evidence 的最小 metadata，供 Integration 追加 Event/artifact；不保存
// assistant text、thinking 内容或私有 transcript。
export interface ClaudeProgressEvidence {
  type: string | null;
  subtype: string | null;
  outcome: string | null;
}

export interface ClaudeStreamSuccess {
  ok: true;
  sessionId: string;
  requiredTool: { name: string; present: true };
  codingResult: CodingResult;
  terminal: { stopReason: string | null; resultRaw: string | null };
  init: {
    permissionMode: string | null;
    claudeCodeVersion: string | null;
    mcpServers: unknown;
    tools: string[];
  };
  progress: ClaudeProgressEvidence[];
}

export type ClaudeStreamOutcome = ClaudeStreamSuccess | ClaudeStreamFailure;

// 只保存解释所需的最小字段，不复制整个 event object，也不建立通用 event framework。
interface InitEvidence {
  sessionId: string;
  tools: string[];
  mcpServers: unknown;
  permissionMode: string | null;
  claudeCodeVersion: string | null;
}

interface TerminalEvidence {
  sessionId: string;
  stopReason: string | null;
  resultRaw: string | null;
  structuredOutput: unknown;
}

export class ClaudeStreamInterpreter {
  private readonly expectedTaskId: string;
  private readonly expectedSessionId: string | null;

  private outcome: ClaudeStreamOutcome | null = null;
  private init: InitEvidence | null = null;
  private terminal: TerminalEvidence | null = null;
  private readonly progress: ClaudeProgressEvidence[] = [];

  constructor(input: ClaudeStreamInterpreterInput) {
    this.expectedTaskId = input.expectedTaskId;
    this.expectedSessionId = input.expectedSessionId;
  }

  // 逐行消费 stdout。空 line 忽略；任一非空 malformed JSON line 立即失败，不静默跳过。
  // 一旦产出 outcome（失败或已 finish），后续 line 不再改变结果。
  acceptLine(line: string): void {
    if (this.outcome !== null) return;
    if (line === '') return;

    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      this.fail('malformed_json_line', 'non-empty stdout line is not valid JSON');
      return;
    }
    if (typeof event !== 'object' || event === null || Array.isArray(event)) {
      this.fail('malformed_json_line', 'stdout line must be a JSON object event');
      return;
    }

    const record = event as Record<string, unknown>;
    const type = record.type;
    const subtype = record.subtype;

    if (type === 'system' && subtype === 'init') {
      this.acceptInit(record);
    } else if (type === 'result') {
      this.acceptTerminal(record);
    } else {
      // assistant message、StructuredOutput tool_use/tool_result、hook、thinking_tokens
      // 与未知 progress event 都只是非终态 progress evidence。
      this.progress.push({
        type: typeof type === 'string' ? type : null,
        subtype: typeof subtype === 'string' ? subtype : null,
        outcome: typeof record.outcome === 'string' ? record.outcome : null,
      });
    }
  }

  // 结束流，返回唯一 outcome。缺失检查与跨 event 的 session 一致性、structured_output
  // 验证在此时按固定顺序完成，保证确定性且不依赖 event 到达顺序。
  finish(): ClaudeStreamOutcome {
    if (this.outcome !== null) return this.outcome;

    if (this.init === null) {
      return this.fail('init_missing', 'no type=system subtype=init event was found');
    }
    if (this.terminal === null) {
      return this.fail('terminal_missing', 'no type=result terminal event was found');
    }
    if (this.terminal.sessionId !== this.init.sessionId) {
      return this.fail('session_mismatch', 'terminal session_id does not match init session_id');
    }

    const structured = this.terminal.structuredOutput;
    if (typeof structured !== 'object' || structured === null || Array.isArray(structured)) {
      return this.fail('structured_output_missing', 'terminal has no object structured_output');
    }

    // structured_output object 是 CodingResult 的 transport；原始 codingResultSchema 是
    // runtime validation authority。不从 result string 或 assistant text 猜测 object。
    const parsed = codingResultSchema.safeParse(structured);
    if (!parsed.success) {
      const detail = parsed.error.issues.map((issue) => issue.message).join('; ');
      return this.fail('coding_result_invalid', `structured_output failed codingResultSchema: ${detail}`);
    }
    if (parsed.data.task_id !== this.expectedTaskId) {
      return this.fail('task_id_mismatch', 'CodingResult.task_id does not match expectedTaskId');
    }

    this.outcome = {
      ok: true,
      sessionId: this.init.sessionId,
      requiredTool: { name: REQUIRED_ROOM_TOOL_NAME, present: true },
      codingResult: parsed.data,
      terminal: { stopReason: this.terminal.stopReason, resultRaw: this.terminal.resultRaw },
      init: {
        permissionMode: this.init.permissionMode,
        claudeCodeVersion: this.init.claudeCodeVersion,
        mcpServers: this.init.mcpServers,
        tools: this.init.tools,
      },
      progress: this.progress,
    };
    return this.outcome;
  }

  private acceptInit(record: Record<string, unknown>): void {
    if (this.init !== null) {
      this.fail('init_duplicate', 'received a second init event');
      return;
    }
    const sessionId = typeof record.session_id === 'string' ? record.session_id : '';
    if (sessionId === '') {
      this.fail('init_error', 'init event has no non-empty session_id');
      return;
    }
    // required tool presence 只看 init.tools 是否包含 frozen REQUIRED_ROOM_TOOL_NAME，
    // 不依据 mcp_servers 非空。
    const toolsRaw = record.tools;
    if (!Array.isArray(toolsRaw) || !toolsRaw.includes(REQUIRED_ROOM_TOOL_NAME)) {
      this.fail('required_tool_missing', `init tools do not include required tool ${REQUIRED_ROOM_TOOL_NAME}`);
      return;
    }
    if (this.expectedSessionId !== null && sessionId !== this.expectedSessionId) {
      this.fail('session_mismatch', 'init session_id does not match expectedSessionId');
      return;
    }
    this.init = {
      sessionId,
      tools: toolsRaw.filter((tool): tool is string => typeof tool === 'string'),
      mcpServers: record.mcp_servers ?? null,
      permissionMode: typeof record.permissionMode === 'string' ? record.permissionMode : null,
      claudeCodeVersion:
        typeof record.claude_code_version === 'string' ? record.claude_code_version : null,
    };
  }

  private acceptTerminal(record: Record<string, unknown>): void {
    if (this.terminal !== null) {
      this.fail('terminal_duplicate', 'received a second terminal result event');
      return;
    }
    // stop_reason=tool_use 是 structured output 的合法成功事实；只要求 subtype=success 且
    // is_error=false，不要求 end_turn。
    if (record.subtype !== 'success' || record.is_error !== false) {
      this.fail('terminal_error', 'terminal result is not subtype=success with is_error=false');
      return;
    }
    const sessionId = typeof record.session_id === 'string' ? record.session_id : '';
    if (sessionId === '') {
      this.fail('session_mismatch', 'terminal result has no non-empty session_id');
      return;
    }
    if (this.expectedSessionId !== null && sessionId !== this.expectedSessionId) {
      this.fail('session_mismatch', 'terminal session_id does not match expectedSessionId');
      return;
    }
    this.terminal = {
      sessionId,
      stopReason: typeof record.stop_reason === 'string' ? record.stop_reason : null,
      resultRaw: typeof record.result === 'string' ? record.result : null,
      structuredOutput: record.structured_output ?? null,
    };
  }

  private fail(reason: ClaudeStreamFailureReason, message: string): ClaudeStreamFailure {
    const failure: ClaudeStreamFailure = { ok: false, reason, message };
    this.outcome = failure;
    return failure;
  }
}
