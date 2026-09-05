const RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'reason'],
  properties: {
    status: { enum: ['ready_to_integrate', 'blocked', 'needs_decision'] },
    reason: { type: 'string' },
  },
};

export function parseSupervisorResult(source) {
  let value;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new Error(`Supervisor result is not JSON: ${error.message}`);
  }
  if (!['ready_to_integrate', 'blocked', 'needs_decision'].includes(value.status) || typeof value.reason !== 'string') {
    throw new Error('Supervisor result must contain exactly an allowed status and reason');
  }
  return { status: value.status, reason: value.reason };
}

export function buildSupervisorPrompt(input) {
  return `You are the Local Codex Supervisor Integration Gate, not the formal Reviewer. Determine only whether this exact candidate semantically complies with its Accepted Task Contract and is safe to integrate into the Stage. You may return only JSON with status ready_to_integrate, blocked, or needs_decision, plus a concise reason. Never return APPROVE or REQUEST_CHANGES. Do not propose unrelated cleanup.\n\nTASK CONTRACT\n${input.contract}\n\nACTUAL GIT FACTS\n${JSON.stringify(input.facts, null, 2)}\n\nNATIVE WORKER FACTS\n${JSON.stringify(input.native, null, 2)}\n\nDEPENDENCY FACTS\n${JSON.stringify(input.dependencies, null, 2)}\n\nVERIFICATION EVIDENCE\n${JSON.stringify(input.verification, null, 2)}\n\nCOMPLETE DIFF\n${input.diff}\n`;
}

export async function runSupervisor({ launcher, worktree, model, contract, facts, native = {}, dependencies, verification, diff }) {
  const processResult = await launcher.execute({
    worktree,
    model,
    outputSchema: RESULT_SCHEMA,
    sandbox: 'read-only',
    prompt: buildSupervisorPrompt({ contract, facts, native, dependencies, verification, diff }),
  });
  if (processResult.error || processResult.exitCode !== 0) {
    return { status: 'blocked', reason: processResult.error?.message ?? processResult.stderr.trim() ?? `Supervisor exited ${processResult.exitCode}` };
  }
  try {
    return parseSupervisorResult(processResult.lastMessage.trim());
  } catch (error) {
    return { status: 'blocked', reason: error.message };
  }
}
