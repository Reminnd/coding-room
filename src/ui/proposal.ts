import { z } from 'zod';

export const proposalDetailsSchema = z.object({
  requirements: z.array(z.string().trim().min(1)).min(1),
  non_goals: z.array(z.string()),
  architecture_decisions: z.array(z.string()),
  scope: z.array(z.string().trim().min(1)).min(1),
  constraints: z.array(z.string()),
  acceptance_criteria: z.array(z.string().trim().min(1)).min(1),
  verification: z.array(z.object({ command: z.string().trim().min(1), detects: z.string().trim().min(1), decision_if_failed: z.string().trim().min(1) })),
  documentation_updates: z.array(z.object({ path: z.string().min(1), expected_change: z.string().min(1) })),
  question_policy: z.string().trim().min(1),
  proposed_fixes: z.array(z.object({ finding_id: z.string().min(1), solution: z.string().trim().min(1) })).optional(),
  sdd: z.object({ specification: z.string(), technical_design: z.string(),
    tasks: z.array(z.object({ id: z.string().trim().min(1), title: z.string().trim().min(1), modules: z.array(z.string()).min(1),
      dependencies: z.array(z.string()), acceptance: z.array(z.string()).min(1), tests: z.array(z.string()).min(1) })) }).optional(),
});
export type ProposalDetails = z.infer<typeof proposalDetailsSchema>;

export const chatQuestionsSchema = z.array(z.object({
  id: z.string().trim().min(1), question: z.string().trim().min(1),
  options: z.array(z.object({ label: z.string().trim().min(1), description: z.string() })).min(2).max(4),
})).min(1).max(3).refine(items => new Set(items.map(item => item.id)).size === items.length);

export const CHAT_CLARIFICATION_FORMAT = `按需求澄清方法逐轮讨论：先梳理目标、范围、约束与验收，再问当前已确定前提下能够回答的决策；依赖未决答案的问题留到下一轮。每轮最多三个问题，给出推荐选项及取舍，等待用户回答，不代替用户决定。已有资料能回答的事实不重复询问；无法读取的资料明确说明。需要澄清时在回复末尾添加 fenced json：{"room_questions":[{"id":"scope","question":"具体问题","options":[{"label":"推荐选项（推荐）","description":"取舍"},{"label":"另一选项","description":"取舍"}]}]}。选项应互斥；Room 另提供自定义答案。澄清轮不输出 room_task；需求已明确后才按方案格式输出。以上是借鉴 grilling Skill 的方法指令，不声称调用了本地 Skill 或 ChatGPT 插件。`;

export function assertSddReady(sdd: ProposalDetails['sdd']): void {
  if (!sdd?.specification.trim()) throw new Error('SDD 需要完整规格与验收场景');
  if (!sdd.technical_design.trim()) throw new Error('请补全技术设计与接口、模块组织');
  if (!sdd.tasks.length) throw new Error('请补全实施任务与测试场景');
  const completed = new Set<string>();
  for (const task of sdd.tasks) {
    if (completed.has(task.id) || task.dependencies.some((id) => !completed.has(id))) throw new Error('实施任务的依赖必须引用前序任务，标识不能重复');
    completed.add(task.id);
  }
}

export function extractProposal(text: string): { text: string; details: ProposalDetails | null } {
  for (const match of text.matchAll(/```json\s*\n([\s\S]*?)\n```/g)) {
    try {
      const parsed = proposalDetailsSchema.safeParse(JSON.parse(match[1]).room_task);
      if (parsed.success) return { text: text.replace(match[0], '').trim(), details: parsed.data };
    } catch { /* Incomplete or unrelated JSON remains part of the visible proposal. */ }
  }
  return { text, details: null };
}

export const PROPOSAL_FORMAT = `When the complete proposal is ready, append exactly one fenced json block with a room_task object containing these fields: requirements (string[]), non_goals (string[]), architecture_decisions (string[]), scope (repository-relative file or directory paths, string[]), constraints (string[]), acceptance_criteria (nonempty string[]), verification ({command,detects,decision_if_failed}[] with real project commands), documentation_updates ({path,expected_change}[]), question_policy (string). This is draft metadata for a later human execution confirmation, never an approval. Do not invent test commands when project research cannot establish them; disclose the missing verification. Keep the explanatory proposal readable outside the JSON block.`;

export const SDD_FORMAT = `For SDD, room_task additionally contains sdd: {specification: string, technical_design: string, tasks: {id, title, modules: string[], dependencies: string[], acceptance: string[], tests: string[]}[]}. Specification records confirmed project requirements, constraints, interfaces and acceptance scenarios; external references inform implementation and module organization only. Technical design explains modules, interfaces and data flow. Order implementation tasks after their dependencies and use task IDs for dependency references. During specification-only drafting, keep technical_design empty and tasks empty; execution waits for the complete proposal. Preserve prior confirmed requirements when completing later sections.`;
