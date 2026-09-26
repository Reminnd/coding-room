# TASK CONTRACT — <task_id>

- status: Draft | Accepted
- confirmed_by_user: false
- type: Implementation Task
- background: <why>
- goal: <one outcome>
- requirements: <behaviors>
- depends_on: <task IDs; empty only for DAG roots>
- owns: <exact paths>
- model_policy: <policy>
- reasoning_effort: <low | medium | high>
- runtime_base_sha: <actual base SHA observed by Local Bridge at dispatch>
- implementation_authorized: false
- non_goals: <excluded work>
- architecture_decisions: <frozen choices>
- scope: <owned paths>
- constraints: <boundaries>
- acceptance_criteria: <observable results>
- verification: <command / detects / decision_if_failed>
- documentation_updates: <paths or none>
- question_policy: <stop conditions>

`status: Accepted`与持久化的`implementation_authorized`都不单独构成 dispatch authority；Local Bridge 必须在 batch pre-dispatch gate 通过后使用当次已验证并缓存的 exact Accepted Contract bytes。gate rejection 是 command-level zero-event `PRE_MUTATION_FAILURE`，不得消费预分配`dispatch_id`；possible mutation 后的失败是`POST_MUTATION_UNCERTAIN`，必须停止并由 fresh invocation 重读 authority。

Worker Result 是 task-generic semantic handoff，仅允许以下 common fields：

```yaml
task_id: string
dispatch_id: string
reported_base_sha: string
deviations: [string]
unresolved: [string]
questions: [string]
status: implementation_ready | blocked | needs_decision
```

只有`implementation_ready`增加 non-empty `changed_files: [string]`。native identity、verification、ownership、candidate SHA/parent/changed files由 Controller 与 Git observation拥有，不得写回 Worker Result。
