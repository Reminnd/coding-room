# T05R02 — Controller-Owned Candidate Commit

| 属性 | 值 |
|---|---|
| task_id | T05R02-controller-owned-candidate-commit |
| type | Native Bootstrap Repair Task |
| status | Proposed |
| confirmed_by_user | false |
| Owner / Reader | Codex / 用户、manual bootstrap Worker |
| updated | 2026-09-07 |
| execution_surface | manual_pre_native_codex_exec |
| router_dispatchable | false |
| model_policy / model | coding_strong / gpt-5.6-sol |
| reasoning_effort | high |
| fallback / internal_multi_agent | none / false |
| planning_base_stage_sha | f777c32cce0852ef1eb4f89ac2a4121e02bc3e2f |
| main_base_sha | bd41ea8a1e259300241a345a659e7da90e24af0d |
| authority | [Stage](../../STAGE.md)、[Router](../../ROUTER_CONTRACT.md) |

本 Contract 冻结 Proposed target，不授权 Implementation。MUST 表示强制要求。用户限定本轮四份 governance 文档，因此 architecture decision 在本 Contract 单一记录，不扩大到共享 ADR 或索引。

## 1. Background / authoritative evidence

用户提供的 T05D00 probe：thread=01a07afa-da72-7172-abdc-9cca9a775e7f，turn=01a07afa-daf3-7991-93c9-3207c9922992，native terminal=completed，gpt-5.6-sol/medium。file create success；git add -- T05D00_NATIVE_GIT_PROBE.txt failed：

> fatal: Unable to create 'D:/agent/case/codex-claudecode-room/.git/worktrees/T05D00-native-git-commit-probe/index.lock': Permission denied

git commit 未执行。native_git_candidate_capability=fail；failure boundary=linked_worktree_git_metadata_protected_by_native_sandbox。T05R01 writableRoots=[worktree, gitCommonDir] 不足以授予实际 Git metadata write capability。这不是 T05F00 implementation defect、verification failure、prompt wording 不足或 missing git-common-dir discovery。

T05F00 dispatch=wf15-s02-t05f00-root-multi-agent-prompt-boundary-004 已 immutable terminal blocked。thread=01a07ac6-b43e-7053-9263-47dca6c62301，turn=01a07ac6-b4c4-7243-88a7-a71c2460fc03。exact Bridge reason：

> Worker completed with invalid required Coding Result: reported_task_head_sha must be a non-empty string

禁止 replay -004，现在不生成 -005。保留 T05F00 dirty worktree 与 T05D00 probe worktree/branch，不修改、stage、commit、cleanup 或复用为 repair candidate。

## 2. Goal / architecture

native Worker 只交付 working-tree implementation；Bridge Controller 在 native sandbox 外，依据独立 Git facts、Router owns 与 Router verification 创建唯一 candidate commit，然后恢复既有 integration pipeline。

T05R02 修复 Router Worker 完成 candidate 所依赖的机制，自身必须 manual_pre_native_codex_exec，不通过尚未修复的 Router 自举，不加入 tasks[]/Ready Set，不伪造 Bridge task_integrated。

## 3. Scope freeze / implementation decisions

exact allowlist 为 requirements 中列出的四个 production files 与三个 direct test files，共七路径。read-only inspection 支持全部七路径：buildWorkerPrompt 当前要求 Worker commit；runNativeWorker 发现 gitCommonDir 并加入 writableRoots；Controller 强制 candidate_ready/reported_task_head_sha，先收集 candidate 再 verification；GitRepository 已拥有 facts/mechanicalGate/push/integrate。三个对应 test files 可闭合新顺序与现有回归，无需第八文件。

以下为本次 Planning 对后文建议项作出的唯一具体决定：

- 删除 git-common-dir preflight 与仅供其使用的 import/parameter；writableRoots=[exact worktree]。保留 explicit thread/turn cwd、approvalPolicy=never、thread sandbox=workspace-write、turn type=workspaceWrite、networkAccess=false。read-only Git inspection 不需要额外 writable root。
- 唯一 deterministic message 为 chore(task): complete <task_id>。task_id 来自 validated Router Task，message 作为独立 argv 传 Git。
- 保留 narrow parser；三种 status 均要求 task_id、dispatch_id、reported_base_sha、status non-empty strings，以及 changed_files/deviations/unresolved/questions string lists；identity exact match。implementation_ready changed_files 非空；blocked/needs_decision 可为空并原 status settle，在 stage/commit/Supervisor/push 前 STOP。
- implementation_ready 暂保留现有 native_backend 与 verification success-map shape/checks，prompt 明确字段：native_backend 的 interface/worker_mode/explicit_thread_cwd/explicit_turn_cwd/terminal_event/silent_fallback；verification 的 bridge_tests/typecheck/full_tests/diff_check。blocked/needs_decision 不要求 success maps。maps 不是最终 authority；legacy full_tests self-report amendment 不替代 Router ordinary pass。reported_task_head_sha 不再必需；不增加 candidate_ready 双模式 fallback。T05F01 后续负责完整 generic cleanup。
- ownership 使用 Router owns + actual paths，现有 T05-specific path 检查不得代替或阻断该 authority。
- working collection 使用 tracked unstaged paths 与 ordinary untracked paths 的 union；可用 git diff --name-only --no-renames -z 和 git ls-files --others --exclude-standard -z，staged 使用 git diff --cached --name-only --no-renames -z。rename 按 delete/add，working/staged/commit collection 保持同一 path semantics。Git observation 失败 blocked，不当作 empty/clean。
- verification 后只按用户冻结比较 path-set，不引入 content hash。commit 后复用 mechanicalGate 已有检查，并补 head != base 与 exact path-set equality；不重复运行同一事实检查。
- 保留现有 no-subagents prompt boundary，不提前实现 T05F00 Root delegation。

## 4. Requirements / acceptance criteria

以下按用户本轮要求完整冻结；其中 scope 与具体建议项由上节收敛，不授权扩大。
### 四、核心Architecture Decision

冻结新authority：

native Worker authority:
working_tree_implementation_only

native Worker git metadata authority:
none

candidate commit authority:
Bridge Controller outside native sandbox

Router verification authority:
Bridge Controller / runVerification

ownership authority:
Router owns + independently observed Git facts

Supervisor authority:
unchanged

Task push / Stage integration:
unchanged

Formal Review authority:
chatgpt_fixed_chat

核心顺序：

Native Worker edits
→ Worker returns implementation-ready semantic result
→ Bridge independently inspects dirty working tree
→ ownership gate
→ Router verification
→ re-read working tree
→ Bridge stages exact changed files outside sandbox
→ Bridge creates exactly one candidate commit
→ collectTaskFacts
→ mechanicalGate
→ Supervisor Integration
→ Task push
→ controlled Stage cherry-pick
→ Stage push

### 五、Worker不得再执行Git metadata writes

production Worker prompt必须明确：

* do not git add
* do not git commit
* do not checkout
* do not branch
* do not reset
* do not rebase
* do not push

Worker只允许修改Task-owned working-tree files。

Worker仍可使用read-only Git inspection：

git status
git diff
git rev-parse HEAD

Worker完成Implementation与Contract要求的自检后返回：

implementation_ready

而不是：

candidate_ready

candidate只有Bridge Controller成功commit后才存在。

### 六、T05R02 Worker Result transition boundary

T05R02不要提前完成T05F01的全部generic-result重构。

只增加当前bootstrap所需的最小transition semantic：

允许：

implementation_ready
blocked
needs_decision

对于：

implementation_ready

要求：

task_id
dispatch_id
reported_base_sha
changed_files
deviations
unresolved
questions
status

不得要求：

reported_task_head_sha

因为此时candidate尚不存在。

当前T05-specific：

native_backend
verification

字段如为保持transition兼容确有必要可以暂时保留，

但必须明确：

它们不是最终authority。

native facts仍来自processResult.native。

verification最终authority仍来自Router runVerification。

不要在T05R02中提前完成T05F01完整generic cleanup。

### 七、pre-commit working-tree gate

Bridge收到合法：

implementation_ready

后，candidate commit之前必须独立确认：

Task HEAD == dispatch base

Task branch == exact task_branch

index/staged changes == empty

working-tree changed files != empty

actual working-tree changed files全部属于Router owns

# Worker reported changed_files set

actual working-tree changed-files set

集合顺序不重要，membership必须完全一致。

必须包含ordinary untracked files。

不能只使用：

git diff --name-only

因为它会漏掉untracked。

禁止hash index、patch-id index、workflow DB。

### 八、Router Verification before commit

ownership/identity gate通过后：

执行现有：

runVerification(task.verification)

所有command必须ordinary pass。

verification失败：

blocked
STOP

不得stage。
不得commit。

verification后重新读取：

HEAD
branch
staged paths
actual working-tree changed files

必须仍满足：

HEAD == base

branch unchanged

staged empty

changed-file set与verification前完全相同

否则：

blocked
STOP

不要自动restore。

### 九、Bridge Controller candidate commit

verification全部pass后，

Bridge Controller作为sandbox外Host process执行exact-path staging。

必须使用独立观察得到的：

actual working-tree changed files

执行等价：

git add -- <exact changed paths>

禁止：

git add .
git add -A

staging后确认：

# staged files set

exact actual changed-files set

运行：

git diff --cached --check

必须pass。

然后Bridge创建exactly one deterministic Conventional Commit。

不要由Worker提供任意shell commit command。

commit message应由Bridge确定。

建议冻结：

chore(task): complete <task_id>

如现有项目Conventional Commit规则要求不同最小格式，可在Planning时根据现有测试/规范确定一个唯一deterministic格式。

禁止amend。

commit失败：

blocked
STOP

不得retry。

不得Host外部人工fallback。

### 十、candidate形成后恢复现有流程

commit成功后：

collectTaskFacts()

必须确认：

taskHeadSha != base

parent == base

exactly one parent

branch exact

worktree clean

actual commit changed files exact

ownership pass

git diff --check pass

然后调用既有：

mechanicalGate()

之后：

completeDiff
Independent Supervisor
dependency gate
Task push
controlled cherry-pick
Stage push
task_integrated publication

这些既有语义不得改变。

十一、native sandbox最小化

T05D00已经证明：

gitCommonDir writableRoot不能解决Git metadata保护。

因此Planning必须审阅是否应删除T05R01加入的：

git rev-parse --path-format=absolute --git-common-dir

以及：

writableRoots:

* worktree
* gitCommonDir

目标architecture应为：

native Worker无需Git metadata write authority。

preferred：

writableRoots:

* exact Task worktree

如果当前Codex runtime仍因read-only Git inspection需要gitdir read access而必须保留其它read-only行为，只保留实际必要语义。

不得：

dangerFullAccess

不得：

approvalPolicy=on-request

不得：

把整个repository parent/home/drive加入writableRoots。

十二、Proposed exact implementation scope

Planning优先冻结为exactly以下production files：

1.

tools/codex-github-bridge/codex.mjs

2.

tools/codex-github-bridge/codex-app-server.mjs

3.

tools/codex-github-bridge/controller.mjs

4.

tools/codex-github-bridge/git.mjs

以及direct tests：

5.

tools/codex-github-bridge/tests/codex.test.mjs

6.

tools/codex-github-bridge/tests/controller.test.mjs

7.

tools/codex-github-bridge/tests/git.test.mjs

如果read-only inspection证明可以在更小scope完成：

允许Planning缩小。

如果必须增加第8个production file：

needs_decision
STOP

不要擅自扩大。

十三、关键direct tests

至少冻结：

1. Worker prompt明确禁止stage/commit/push。
2. Worker prompt仍要求完整Task Contract注入。
3. native sandbox writable root不再假设gitCommonDir可写。
4. implementation_ready不要求reported_task_head_sha。
5. blocked/needs_decision在candidate commit前settle。
6. implementation_ready要求HEAD仍等于dispatch base。
7. preexisting staged change → blocked。
8. untracked owned file被working-tree changed-files collection正确观察。
9. Worker changed_files与actual working set mismatch → blocked。
10. ownership violation → blocked before stage。
11. verification failure → no git add / no commit。
12. verification后working set drift → blocked。
13. successful path exact-path git add。
14. staged set mismatch → blocked。
15. cached diff-check failure → blocked。
16. exactly one Controller-owned commit。
17. candidate parent exact dispatch base。
18. candidate worktree clean。
19. existing mechanicalGate / Supervisor / push / integration behavior unchanged。
20. no Worker git commit requirement remains。

### 十四、T05R02 execution compatibility

T05R02自身执行时，

current production Bridge尚未拥有Controller-owned commit。

因此T05R02必须使用：

manual_pre_native_codex_exec

model:

gpt-5.6-sol

reasoning_effort:

high

fallback:
none

internal_multi_agent:
false

T05R02 Worker只能实现并verification。

若最终自身commit仍被native sandbox阻止：

保留verified Diff
STOP

允许后续单独用户授权一次Host mechanical commit。

这仅用于T05R02 bootstrap自身。

T05R02 integrated之后：

不得再把Host mechanical commit作为正常Task fallback。

### 十五、T05F00后续

T05R02 integrated并process STOP之后：

再进行fresh planning：

T05F00 retry -005

此时：

-004保持immutable blocked history。

-005必须使用新的：

Worker implementation_ready
→ Controller-owned candidate commit

语义。

不要现在生成-005 exact Contract。

不要现在旋转Router dispatch。

### 十六、T05F01

T05F01仍：

Proposed
confirmed_by_user=false

不执行。

T05R02只解决candidate commit authority。

T05F01后续仍负责：

generic Worker Result boundary

但在T05R02集成后重新审阅其Contract，

删除已经由T05R02解决的重复内容，

避免双重实现。


## 5. Non-goals / constraints

不实现 T05F00 delegation、T05F01 完整 generic cleanup、T06；不改 Router JSON、dispatch、dependencies、owns。禁止 Task-ID special case、Router field、policy engine、compatibility layer、dependency、新 module、hash/fingerprint、workflow DB、自愈或自动修复。Implementation 需要超出七路径时 needs_decision / STOP。

本轮不执行 Implementation、Task dispatch、Supervisor、Task push、cherry-pick、main write、Formal Review、merge、rebase、force 或 evidence cleanup。

## 6. Verification

下表用于后续 Implementation，当前 planning 不运行这些 implementation checks：

| command | detects | decision_if_failed |
|---|---|---|
| node --test tools/codex-github-bridge/tests/codex.test.mjs tools/codex-github-bridge/tests/controller.test.mjs tools/codex-github-bridge/tests/git.test.mjs | requirements 中 20 项 direct authority/order/path regressions | 保留 Diff，仅在 scope 内修复；否则 needs_decision |
| node --test tools/codex-github-bridge/tests/*.test.mjs | Bridge consumers 与既有交付流程回归 | 不交付 candidate |
| npm run typecheck | 类型/导入回归 | 不交付 candidate |
| git diff --check | working Diff whitespace error | 修复 owned Diff 后交付 |

direct tests MUST 从 buildWorkerPrompt、native launch、BridgeController.processResult、GitRepository public path 提供证据；期望值、调用次数与顺序来自 test-side Oracle。额外覆盖 branch mismatch、post-verification HEAD/branch/staged drift、commit failure 恰好一次尝试/no retry、post-commit set mismatch；不以 helper 自述替代 public evidence。

本轮 planning gates：node --test tests/router-contract-reader.test.ts 必须 18/18；git diff --check pass；exact 四份 governance changed paths；Router JSON byte-equivalent；tools、T05F00 -004 Contract、T05F01 Contract、T06 unchanged。失败不 commit/push。JSON 直接 byte comparison，不使用 hash。

## 7. documentation_updates / execution compatibility

后续 Implementation documentation_updates=none（exact seven-file scope）。本轮 Codex 仅维护本 Contract、STAGE、Router prose、Supervisor prose，新能力保持 Proposed，不宣称 Current/integrated。

exact Contract acceptance 后另行准备/记录实际 baseline、Task branch/worktree，并授权 manual execution；完整注入本 Contract。T05R02 Worker 只实现与 verification，不执行 Git metadata writes。自身 commit 受 sandbox 限制时保留 verified Diff / STOP；后续用户可单独授权一次 Host mechanical commit，仅用于 T05R02 bootstrap 自身。Git integration/publication 仍需后续授权，记录真实 Git source/Stage facts，不伪造 Bridge event。

T05R02 integrated 且 process STOP 后才 fresh planning -005，并重审 T05F01，删除已完成的重复范围。当前不生成该 retry Contract、不执行下游。

## 8. question_policy / Required bootstrap result

需要扩大七路径、改变 authority/既有 delivery、引入 dependency 或缺失实际 execution metadata 时 needs_decision / STOP，不擅自扩大或派发。

未来 manual Worker final 包含 task_id、status（implementation_ready/blocked/needs_decision）、reported_base_sha、changed_files、summary、deviations、verification（逐命令真实 outcome）、unresolved、questions、documentation_changes、candidate_commit_created=false。manual bootstrap 无 Router dispatch_id，不伪造；本段自身交付格式不冒充 production transition。未运行不报 pass，无 candidate 不伪造 candidate SHA。

next_required_action=T05R02_exact_contract_acceptance。本轮 planning commit 仅为 docs(s02): plan T05R02 candidate commit boundary，parent exact f777c32cce0852ef1eb4f89ac2a4121e02bc3e2f；一次普通 non-force Stage push 后 STOP。
