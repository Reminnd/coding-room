# 项目哈希校验删除规划

| 属性 | 内容 |
|---|---|
| 文档状态 | Approved |
| Owner | Codex |
| 主要读者 | 用户、Codex、Claude Code、Reviewer |
| 创建日期 | 2026-08-31 |
| 生效范围 | Agent Room target protocol、Git Observer、Execution Core、Room persistence 与 Plugin workflow |
| 用户确认日期 | 2026-08-31 |
| 关联材料 | [Architecture Review](./HASH_VALIDATION_REMOVAL_ARCHITECTURE_REVIEW.md)、[ADR-0005](./ADR/0005-remove-git-baseline-hash-validation.md)、[Increment 11 Task Contract](./INCREMENT_11_TASK_CONTRACT.md) |

## 1. 摘要

- 背景：用户要求删除项目中的所有哈希校验。仓库盘点确认，项目没有自行计算 SHA/MD5/checksum/fingerprint；唯一会以哈希值改变运行结果的 production 机制是 Git `HEAD`/`baseline_head` 的采集、冻结与相等性校验。
- 推荐结论：删除全部 project-owned Git baseline hash contract，而不是删除名称中偶然出现 `hash` 的无关功能。首次 attempt 继续要求 existing non-bare Git worktree 与 clean staged/unstaged/untracked evidence；continuation 继续要求同一 canonical worktree，但不再读取、保存或比较 commit object ID。
- 影响：Run/RunAttempt schema、SQLite、RoomService claim、Git Observer、Executor、snapshot/status、tests、Plugin Skill 与权威文档发生 breaking change。失去的保证是“continuation 时 HEAD 未变化”的机器校验；保留的保证是 worktree identity、clean-first-attempt、Git path evidence、Task/Run/session lineage 与人工 Diff Review。
- 评审结论：用户已确认“所有哈希校验”采用本文第3节边界，并接受失去HEAD/branch drift自动拒绝；详细Architecture Decision见[Architecture Review](./HASH_VALIDATION_REMOVAL_ARCHITECTURE_REVIEW.md)。

## 2. 盘点结论

| 类别 | 当前事实 | 是否删除 | 理由 |
|---|---|---:|---|
| Git `baseline_head` / actual `HEAD` equality | production 会读取 commit object ID、写入 Run/RunAttempt，并在 continuation 拒绝 mismatch | 是 | 这是项目中唯一 project-owned、会改变运行结果的哈希校验 |
| Git hash format assertions | tests 断言 40 位 hex，并构造 mismatch hash | 是 | 只服务于 baseline hash contract |
| `git_head_missing` | Git Observer 依赖 `HEAD^{commit}`，unborn repository 被拒绝 | 是 | 删除 HEAD hash dependency 后不再有独立语义 |
| `package-lock.json` 的 `integrity: sha512-*` | npm 生成并在 `npm ci` 中消费 | 否 | 属于 package manager lockfile contract，不是项目自定义校验；手工删除会破坏标准 lockfile/reproducibility |
| `URL.hash` | `src/cli/run.ts` 用该属性拒绝 MCP URL fragment | 否 | 这里的 hash 指 URL fragment，不是 digest |
| `randomUUID()` | 生成 Room/Event/Assignment ID | 否 | UUID identity generation 不是哈希校验 |
| 历史 commit object ID | 文档记录 baseline、commit 与 Review 事实 | 否 | 是不可改写的历史证据，不参与未来 runtime 校验 |
| structured idempotency comparison | repository 直接比较已保存 JSON structured content | 否 | 当前实现明确不使用 hash/checksum/fingerprint |

## 3. 目标与边界

### 3.1 目标

1. Target production source、public schema、SQLite 与 Plugin workflow MUST 不再包含 `baseline_head`、`observed_baseline_head` 或任何 commit object ID validation。
2. Git Observer MUST 不再执行 `git rev-parse ... HEAD`；不存在 commit 的 clean non-bare worktree MUST 能进入首次 attempt。
3. 首次 attempt MUST 继续拒绝 non-repository 与 staged/unstaged/untracked 非空 worktree。
4. 后续 attempt MUST 继续解析并校验同一 canonical repository root；HEAD、branch 或 commit变化 MUST 不再阻止 continuation。
5. Run lineage MUST 继续由 `run_id`、Task/Review/Question reference、canonical worktree、frozen participant/role 与 `agent_session_ref`表达，不新增 checksum、fingerprint、mirror或替代 hash。

### 3.2 非目标

- 不删除 npm lockfile integrity metadata，不更换 package manager，不删除 `package-lock.json`。
- 不删除 URL fragment validation、UUID generation、opaque IDs或历史文档中的 commit object ID。
- 不放宽 clean-first-attempt gate、canonical worktree lease、Git evidence failure propagation、Room lifecycle、terminal evidence、authority、idempotency或用户/Git写操作门禁。
- 不新增文件内容 hash、Diff hash、branch-name mirror、timestamp token、scoring model或其它替代性 lineage guard。
- 不修改已归档 v0.2/v0.3 database；不为未启用的 candidate database建立migration/compatibility layer。

## 4. Target 行为

### 4.1 首次 attempt

```text
target path
→ resolve non-bare repository root
→ collect staged / unstaged / untracked evidence
→ any evidence non-empty: worktree_not_clean
→ all empty: freeze canonical worktree and claim attempt
```

不读取 `HEAD`，不要求 repository 已有 commit，不产生 `baseline_head`。

### 4.2 continuation / Fix / retry / Decision

```text
target path
→ resolve canonical repository root
→ collect current staged / unstaged / untracked evidence
→ repository root differs from frozen Run worktree: validation_failed
→ same root: claim next attempt regardless of HEAD/branch/commit
```

Git evidence继续作为当前工作区导航事实；它不替代 live repository，也不成为新的 lineage hash。

### 4.3 Review 与失败语义

- Codex Review继续读取完整 task-owned staged/unstaged/untracked/untracked Diff与live Git状态，不再依赖 `baseline..HEAD`作为必须边界。
- Git command失败继续传播；只有成功返回的空 path set表示empty evidence。
- 删除 `git_head_missing` 后，non-repository仍为`git_repository_missing`，dirty first attempt仍为`worktree_not_clean`。
- HEAD/branch变化不再产生ProtocolError；这是用户要求对应的明确行为变化，不以其它字段补回。

## 5. 实现工作包

1. Protocol/persistence：从 Run、RunAttempt、claim input、schema、SQLite table/mapper、snapshot与Status输出删除 baseline field，并删除无消费者的 `git_head_missing`。
2. Git Observer：把 clean gate收敛为repository-root + path evidence；continuation observation只返回root + evidence，不读取HEAD。
3. Execution Core：首attempt只冻结canonical worktree；后续attempt只比较canonical worktree；RoomService idempotency/content comparison移除baseline成员。
4. Public consumer：更新MCP/CLI/Plugin Skill与setup/packaging说明，确保command、prompt与status不声明baseline authority。
5. Tests：删除hash format/mismatch Oracle，增加clean unborn repository、continuation HEAD/branch变化仍允许、wrong canonical worktree仍拒绝、dirty-first-attempt仍拒绝与schema/SQLite field absence回归。
6. Documentation：在用户确认后更新ADR、Architecture、Room Protocol、MVP Plan、Operations、Project Rules、角色指南与Development Log；历史Contract/Review记录保持不改写。

## 6. 验收标准

1. `rg` 对 production source与active Plugin执行精确检查，不再命中 `baseline_head`、`observed_baseline_head`、`resolveBaselineHead`、`git_head_missing`或 runtime `rev-parse HEAD`。
2. fresh database的 Run/RunAttempt schema与public snapshot均无baseline字段；same-ID retry/conflict仍按剩余structured content正确工作。
3. clean committed repository与clean unborn repository均可完成first-attempt claim；dirty repository仍在claim/process/Event/artifact前拒绝。
4. 同一canonical worktree在HEAD变化、branch变化或新增commit后仍可进行Fix/retry/Decision continuation；不同canonical worktree仍零写入拒绝。
5. Git evidence command fatal failure仍不被降级为empty；terminal、Question、Review/Fix、cancel/guidance与multi-Run isolation regression保持通过。
6. `npm run typecheck`、相关focused suites、`tests/scope.test.ts`与`npm test`全部通过；不得删除、skip或弱化与哈希无关的既有assertion。
7. `package-lock.json` integrity、URL fragment gate、UUID identity与历史commit记录保持。

## 7. 风险与取舍

| 风险 | 直接影响 | 接受后的处理 |
|---|---|---|
| operator在continuation前切换branch或创建commit | Room不再自动拒绝；同一Run可能继续于不同代码祖先 | 依赖项目既有cooperating operator假设、canonical worktree、live Git evidence与Codex完整Diff Review |
| 无commit repository可以启动 | 不再有baseline commit供`baseline..HEAD`比较 | Review只使用live staged/unstaged/untracked与task-owned path证据 |
| breaking schema | 已启用database无法原地兼容 | 推荐在v0.4首次cutover前完成；若v0.4先cutover，则必须另行规划fresh protocol/database，不做in-place migration |

## 8. 执行顺序与门禁

1. Increment 10/11已完成实现、Review与用户接受，accepted source由本次提交进入版本化`main`；active v0.3 runtime仍未cutover。
2. 用户已确认本文范围、Architecture Review、ADR与完整[Increment 11 Task Contract](./INCREMENT_11_TASK_CONTRACT.md)；Contract与Fix均为`Accepted`，实现与验证已完成。
3. 推荐在v0.4首次cutover前完成实现、Review与用户接受，避免先激活随后立即废弃的baseline schema。
4. Current v0.3 Room已处于`ACCEPTED`终态；本次版本化授权已完成，新的planning Room/binding、后续Implementation Task submission、one-shot Run与最终cutover仍为独立授权，不由本文自动获得。

## 9. 待确认项

| 类型 | 内容 | 影响 | Owner | 状态 |
|---|---|---|---|---|
| Decision | “所有哈希校验”定义为全部project-owned runtime hash validation；排除npm integrity、URL fragment、UUID与历史commit IDs | 不需要额外build/package-manager变更 | 用户 | Confirmed |
| Decision | 接受失去HEAD/branch drift自动拒绝，以canonical worktree + live Git evidence +人工Review作为剩余边界 | baseline contract可以完整删除 | 用户 | Confirmed |

## 10. 变更历史

- 2026-08-31：基于用户提出的“删除项目里所有哈希校验”完成仓库盘点并创建Draft；未修改业务代码、测试、实现配置、runtime binding或Git状态。
- 2026-08-31：用户确认范围与行为取舍；规划提升为`Approved`，并形成Approved Architecture Review、Accepted ADR-0005与Draft Increment 11 Task Contract。
