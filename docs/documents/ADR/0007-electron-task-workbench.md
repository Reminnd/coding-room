# ADR-0007：独立 Electron 与任务工作台

| 属性 | 内容 |
|---|---|
| 状态 | Accepted target；完整本地实现已获用户授权，候选待人工测试与最终接受 |
| 日期 | 2026-10-11 |
| Owner | Codex |
| 决策者 | 用户 |
| Reader | 用户、实施 Worker、Reviewer |
| 范围 | Room 桌面产品、SDD、任务驱动、测试驱动与旧入口清理 |
| 首个实施契约 | [DESKTOP-01](../../work/wf-electron-task-workbench/TASK_CONTRACT.md)（Accepted） |
| 产品交互细化 | [完整产品与 UI 方案](../ROOM_WORKBENCH_PRODUCT.md)（Accepted target） |

本文使用 MUST 表示必须满足的目标行为，SHOULD 表示默认建议，MAY 表示可选能力。下文保留目标与决策时基线；2026-10-12 候选已达到人工测试就绪，实际实现与验证见 [LOCAL_EXECUTION](../../work/wf-electron-task-workbench/LOCAL_EXECUTION.md)。

## 1. 已确认方向与现状

用户于 2026-10-11 明确确认：“独立 Electron＋以任务为中心。要任务驱动，也要测试驱动”。原始目标同时要求 SDD、参考成熟 GitHub 仓库/开发文档/模块代码、审阅并清理无用文件，以及严格遵循 Stop That Shit。同日进一步明确来源分类，并要求完整按钮级产品/UI 方案与 TDD 操作讲解；这不表示已确认首个实施契约。

决策时的 React 页面按 Plan、Run、Question、Review、GitAction 划分，并要求输入实体 ID 和 JSON。决策时的 Tauri launcher 启动 Codex Desktop，通过 CDP 注入 iframe；因此独立 Electron 需要替换启动与交互路径。既有 RoomService、SQLite、GitController 和 Claude Runner 仍有实际消费者，保留其可用能力。

仓库开发用的 `tools/codex-github-bridge/codex-app-server.mjs` 是一次性 ephemeral Worker transport，不是产品内持续对话客户端；不能把它原样接入后宣称原生 Plan、用户提问与恢复已完成。

## 2. 使用者操作模型

用户操作的对象是一项需求；内部 Plan、Task、Run、Attempt 等引用由应用建立，技术详情按需展开。

主界面采用项目与任务列表、任务内容区、可收起详情区。任务内容区包含对话、方案、变更、测试；统一“待我处理”入口定位问题、审批和验收。设置只包含项目、Agent、主题及实际支持的执行配置。

完整主路径：

1. 打开项目文件夹，识别 Git、已有 Room 和 Agent 可用情况。已有数据继续使用；没有 Room 时明确创建。
2. 新建任务，输入目标，选择“SDD”或“任务模式”，附加需要阅读的来源。
3. Agent 读取来源、提出必要问题，输出可编辑的范围、方案、步骤与验收条件。
4. 用户确认当前方案后执行；用户不手填内部 ID、节点 JSON 或 worktree 映射。
5. 同一任务显示进度、变更、测试及问题。回答改变范围时修订方案，不静默扩大执行范围。
6. 验收页显示实际 Diff、测试与 Review。用户接受或提出修改；Git 操作显示实际文件范围并遵循既有确认边界。

待办 MUST 可直接处理；操作失败保留输入和已有变更；切换项目 MUST 同时切换任务、会话与操作目标。任务列表不使用虚构统计。重新打开应用恢复持久化任务，进程已消失的执行不得仍显示为正在运行。

## 3. SDD、任务驱动与测试驱动

开发入口与验证方式是两个维度，避免把两个不同含义都缩写为 TDD。

| 维度 | 界面名称 | 行为 |
|---|---|---|
| 开发入口 | SDD | 来源阅读 → 规格与场景 → 技术方案与模块边界 → 任务拆分 → 实现、验证、文档更新 |
| 开发入口 | 任务模式 | 原生 Codex Plan → 精简任务计划与验收 → 确认执行 → 验证与交付 |
| 执行方法 | 测试驱动（TDD） | 在任一入口下按 Red → Green → Refactor 实施适用的行为变更 |

测试驱动 SHOULD 默认用于可自动验证的代码行为变更。用户可以对纯文案、文档或无可行自动化入口的任务选择普通验证；应用不得把没有运行测试的任务显示为 TDD 通过。

### 3.1 SDD 来源与 SOP

- 成熟 GitHub 仓库、模块代码文件、非本项目开发文档均用于参考实现与模块组织。
- 本项目开发文档用于确定需求、接口与约束；用户当前明确要求优先于旧文档。
- 当前项目代码和测试同时提供既有实现事实；与文档冲突时明确指出，不静默改写需求。详细来源分类及界面行为以[产品方案](../ROOM_WORKBENCH_PRODUCT.md#2-来源规则)为准。
- 来源冲突应写入方案供用户决定，外部仓库不能自动覆盖本项目要求。
- 参考 GitHub Spec Kit 的规格/计划/任务链路和 OpenSpec 的已有项目变更与归档方法；只采用需要的步骤，不同时安装两套规范系统。
- 规格、方案和任务保持一份权威内容，界面显示该内容；小任务可以在同一文档分节，不强制生成大量空文件。

### 3.2 原生 Plan 与 TDD 证据

仅选择 Codex 原生 Plan 的规划路径通过 Codex App Server 接入。使用安装版本实际提供的 `collaborationMode`，保留模式内置指令；实现时核对该版本的协议。模式不可用时显示原因，不把普通提示词模式标为“原生 Plan”。普通规划的调用边界见 §3.3。

计划阶段以只读权限进行代码调研；用户确认后进入执行。计划模式本身不等于测试驱动，也不代替 Room 对执行与 Git 的授权。

TDD 的必要证据：

1. Red：记录实际测试命令、目标用例和因预期行为缺失而失败的结果；环境错误不算 Red。
2. Green：针对同一行为进行最小实现，以实际测试结果证明通过。
3. Refactor：确有整理需要时进行等价重构，重跑受影响测试；无需重构时可以结束。

应用 MUST 从命令执行事实显示阶段和结果，不能只显示 Agent 自述。修复用例应覆盖原始症状，不能改弱断言来制造 Green；中断时保留失败用例和工作区以便继续。

### 3.3 规划调用更正（2026-10-12，用户明确要求）

普通需求讨论、SDD 规格、设计与任务拆分 MUST 调用 Chat。前期的 Work/Codex 调用只用于用户确认后的执行；唯一规划例外是用户采用真正的 Codex 原生 Plan。此决定替代此前将全部规划交给 App Server 的设计。

| 阶段与选择 | 调用目标 | 进入执行的条件 |
|---|---|---|
| 普通规划，包括 SDD | Chat | 完整方案经用户确认后单独派发 |
| 明确采用 Codex 原生 Plan 的规划 | Codex App Server 的原生 `plan` 模式 | 同上，Plan 结束本身不授权执行 |
| 已确认方案的执行 | 已接入且由用户选择的执行器；Work/Codex 属于此阶段 | 保留 Room 的 Run/Attempt 与原有执行确认 |

Chat 指会话调用目标，不是 UI 对话框的名称。Codex 的只读 sandbox、`default` 模式或 ChatGPT 登录均不能证明调用了 Chat。Chat 不可用时 MUST 保留草稿并说明原因，不自动转用 Work/Codex。此更正不新增 Work Runner，也不把现有 Claude Runner 改名为 Work。

更正前的实现对两种开发入口均调用 `startPlanTurn()`。当前源码已让 `WorkbenchPlanning.start()` 拒绝 SDD；SDD 使用 Room 自己的讨论 UI，通过内置页面桥接模块与 Electron 内的官方 ChatGPT 网页交互。任务模式继续使用真正的原生 Plan。既有双模式测试证明的是 Codex Plan 与执行链路，不能作为 Chat 规划的验收证据。

用户已于 2026-10-12 明确：Chat 指 **ChatGPT 普通聊天，使用现有账号**。API 聊天模型和以 ChatGPT 账号登录的 Codex 均不满足此选择。该接入目标不再是待确认项。

官方接口核对：目前查阅的官方文档没有提供供独立 Electron 创建、发送和读取普通 Chat 会话的客户端接口。[Sign in with ChatGPT](https://learn.chatgpt.com/docs/sign-in-with-chatgpt) 的套餐推理使用 Work/Codex 用量，也不授予聊天记录访问；不能用该能力替代普通 Chat。

用户已明确：全部讨论必须在 Electron 内完成，并进一步确认 Room 保留自己的输入框与消息列表，由插件／页面桥接搬运网页内容。此前外部 ChatGPT → MCP → Room 建议未采用，手动剪贴板交接被本次决定替代。候选实现使用 Electron `WebContentsView` 加载官方 `https://chatgpt.com/`，每个任务拥有独立网页实例，共享持久化账号 session。网页平时隐藏，只在用户点击“打开网页 / 登录”时显示。ChatGPT 拥有聊天历史，Room 保存任务、来源、关联会话 URL 和版本化方案。

该方案的具体交接：

1. SDD“开始讨论”进入 Room 讨论页。用户在 Room 输入消息并点击“发送”，Main 获取当前任务目标、来源元数据与已有预览、当前方案及输出格式，一并写入官方网页输入框，再触发网页发送。路径和预览不被宣称为完整文件读取；上传文件使用应用内网页入口。
2. `chatgpt-page.cjs` 在网页 isolated world 内读取实际消息 DOM、发送与停止控件；Room 同步显示实际回复，保留代码围栏以供方案解析。它是随桌面应用交付的专用页面桥接模块，不是任意 Chrome 扩展，也不调用 ChatGPT 私有后端 API。没有实际网页消息时不制造回复。
3. 按用户 2026-10-12 补充要求，回复结束且文本稳定后 Main 将最新回复提交 `chatgpt-output`：有效 `room_task` 自动保存为方案草稿，`room_questions` 返回需求选择框。复用 `WorkbenchStore.saveProposal()` 与版本校验，同一网页回复 ID 只自动保存一次；过期版本拒绝覆盖。手动“采用此方案”保留。不创建 Run、不启动执行器。缺少结构化范围与验收信息时仍需补全后才能执行。
4. 原生 Plan 路径继续使用真正的 `collaborationMode=plan`。从任务模式切换为 SDD 后进入 Chat 交接，既有 Codex 历史保留真实来源。
5. 页面加载失败、需要登录或找不到控件时显示原因。发送由本次新增的用户回显确认；若网页折叠或改写回显，本次点击后新出现的非空回复加已清空输入框也可确认接收，发送前已有消息不作为确认依据。超时后继续同步，晚到确认解除等待并清除旧提示；未确认时保留草稿，不自动重发。回到 Room 只隐藏网页，保留会话；应用正常退出才关闭其网页实例。真实验收须覆盖现有账号登录、Room 内往返讨论、方案采用和应用重启后的会话恢复。

远端页面使用独立持久化 session，无 Node integration，无 Room preload。网页容器为独立顶层窗口，与 Room 无 parent/modal 关系，双方最小化互不联动；应用退出仍统一释放。Room Renderer 经 sender 校验后的窄 IPC 调用 Main；Main 执行固定页面适配器，不接受 Renderer 提供的任意脚本。网页不会获得执行器或文件系统权限。不会复制已有浏览器的 cookies 或登录凭据。输入框优先按发送按钮所属表单中的可编辑控件识别，再匹配已知 ID 或唯一可编辑区域；有歧义时不猜测。登录、消息选择器及网页行为依赖官方页面，网页变化时需维护适配器。

验证边界：正常宿主已只读验证官方首页与未登录状态识别；DOM 替身的真实 Electron 测试覆盖 Room 输入、网页发送、流式同步、结构化方案采用、任务隔离、停止生成与正常退出。该结果不证明现有账号登录、实际推理及登录后网页选择器兼容；这些仍需人工测试。

用户另行确认按 Skill 方法澄清，由 Room 展示选择框。实现将 grilling 的逐轮决策方法及问题格式写入普通 Chat 提示，不安装或声称调用网页插件。状态依据发送确认、网页生成控件与实际回复文本呈现；“思考或准备回复”表示等待输出，不展示或推断隐藏推理过程。

## 4. 技术方向与数据所有权（Proposed）

```mermaid
flowchart LR
  UI[React 任务工作台] -->|受限 IPC| Desktop[Electron Main / Preload]
  UI -->|同源 HTTP| API[Room UI application]
  Desktop -->|启动与管理| API
  API --> Room[RoomService / Scheduler / Runner / GitController]
  Room --> DB[既有 SQLite]
  Room --> Git[项目 Git]
  API -->|普通规划，接入方式待明确| Chat[Chat]
  API -->|原生 Plan 的 stdio RPC 与事件| Codex[Codex App Server]
```

- Electron 负责窗口、项目目录选择、通知、后台进程及安装更新生命周期；Renderer 不直接执行 Shell 或打开 SQLite。
- 继续使用现有 HTTP application 边界，供工作台和 taskctl 使用。MCP 保留实际执行器所需能力。
- Codex App Server 只提供原生 Plan 路径的规划对话、提问与审批事件；普通规划使用 §3.3 的 Chat 路径。现有 Claude 执行路径继续可用；把 Codex 产品执行纳入 Room 时必须使用实际 Run/Attempt 语义，不能直接用仓库开发 Bridge 冒充产品 Runner。
- SQLite 继续拥有 Room 执行、审批和结果；Git 拥有代码事实。原生 Plan 聊天记录由 App Server 拥有，Room 只保存恢复所需的关联。Chat 会话的标识、历史与恢复接口随实际接入方式确定，不复用 Codex thread ID 冒充 Chat 会话。
- 当前 Plan schema 没有任务标题、开发入口、草稿或 thread 关联。新任务持久化必须在第二阶段契约中明确最小字段和所有者，再实现；不能把这些事实只放在 localStorage 或项目 registry。
- 不引入通用 Agent 插件框架、微服务、额外付费 API、云端账户系统或新的哈希校验。

关闭窗口默认隐藏到托盘；明确退出时如有活动执行，提供继续后台运行或停止后退出。异常退出后依据持久化状态和真实进程观察恢复，不重复启动旧执行。安装包包含运行 Room 所需资源；用户无需在源码目录运行 npm 或 Rust 构建。

## 5. 交付顺序与完成条件

| 阶段 | 交付 | 验收重点 |
|---|---|---|
| DESKTOP-01 | 独立 Electron 安装包、项目打开、真实 Room 状态与任务浏览 | Codex Desktop 未启动仍可用；安装目录独立于源码；不丢失已有项目绑定与数据 |
| 后续任务闭环 | 任务中心、原生 Plan、来源与方案、提问、执行和恢复 | 从新建需求到实际变更和验收不需要手填 ID/JSON；切换项目及重启关联正确 |
| 后续双入口与 TDD | SDD SOP、轻量任务模式、Red/Green/Refactor 证据 | 两种入口均能完成一项真实行为变更，界面展示实际失败和通过测试 |
| 后续迁移与收口 | 删除旧入口、恢复被修改的 Codex 快捷方式、目录归档 | Room 独立启动，Codex 原入口正常，升级保留数据，旧路径消费者同步删除或更新 |

第一阶段是依赖基础，不是整个目标完成。整体交付必须覆盖上述全部阶段和真实用户操作；仅安装壳或静态原型不满足目标。

2026-10-11 UI/UX Review 修正方向已获用户确认，并落实到[产品方案 §3–§5、§8、§10、§13](../ROOM_WORKBENCH_PRODUCT.md)：区分项目与执行分支、项目切换器跨项目待办、返回列表保留上下文、草稿与讨论启动校验分开、统一新建入口，以及“检查并执行…”与最终“开始执行”分开命名。视觉基准及响应式规则统一维护在产品方案 §3，不另建平行设计规范。DESKTOP-01 落实已有任务浏览相关修正；新任务草稿和讨论校验随后续任务闭环交付。

### 5.1 本次重构使用的开发 Skill

用户明确要求将五项 Skill 整合到当前开发方案，供开发本软件的 Agent 使用。它们不属于 Room 产品功能，不添加 Skill 管理页面、产品内调用链或运行时依赖，也不随 Electron 安装包交付。`.agents/skills/` 只是仓库开发工具的位置。

| 本次开发步骤 | 使用 Skill | 应交付的具体内容 |
|---|---|---|
| 实现前完善工作台设计 | `ui-ux-pro-max` | 基于已有按钮级产品方案，确定侧栏、任务列表、任务详情的布局，以及颜色、字体、间距、主题和状态 tokens |
| DESKTOP-01 与后续页面实现 | `frontend-design` | 按同一设计基准实现项目打开、任务浏览及各阶段纳入范围的页面；补齐加载、空、错误、禁用和焦点状态 |
| React 行为实现与 Review | `vercel-react-best-practices` | 处理当前改动中的请求、状态订阅与渲染问题；只采用 React/Vite 适用规则 |
| 出现实际复杂组件时 | `vercel-composition-patterns` | 为任务详情页签、方案编辑区等实际需要拆分的组件确定状态归属与组合方式，不预建通用框架 |
| 各阶段 UI 验收 | `playwright-cli` | 操作已实现的导航、表单和项目切换，检查反馈与布局并保存必要截图；Electron 原生能力按该阶段 Contract 单独验收 |

新增可测试行为仍按 Red → Green → Refactor 实现；Skill 负责设计与工程方法，不能代替失败测试、实际执行或验收证据。具体调用与工具命令见[前端与 Electron Skill 工作流](../agent-guides/FRONTEND_DESKTOP_SKILLS.md)。

## 6. 清理方案

保留 `desktop/`、`frontend/`、`src/`、`tests/`、`tools/` 的职责边界，不为目录美观引入新的 monorepo 框架。

| 对象 | 处理与时机 |
|---|---|
| `desktop/src-tauri/`、`desktop/web/` | Electron 替代验收后删除旧 launcher 源码和专用资源 |
| `tools/room-desktop/` | 将仍需的 Room 服务启动职责迁入 Electron；删除 CDP、panel、Codex host、旧 installer/taskbar 逻辑 |
| `frontend/src/host-theme.ts` | 消除宿主消息通信，保留独立主题能力并调整 Settings 消费者 |
| `tests/room-desktop.test.ts` | 用独立启动与生命周期测试替代已退出产品的 Codex profile/CDP 测试 |
| 历史 Increment/Fix/Review | 从当前阅读入口分离；移动时同步实际引用，不删除仍作为 Oracle 的 Contracts |
| `.agent-room/` 和历史数据库 | 保留；移除项目绑定不等于删除项目数据 |
| lockfiles、Plugins、CLI、Bridge | 按实际消费者判断，不能仅因名称旧或脱离桌面入口而删除 |

旧 installer 曾替换 Desktop、Start menu 和匹配的 taskbar Codex 快捷方式，并生成 `.room-backup`。替换时只恢复仍指向本项目 launcher 且可核对原目标的入口，不覆盖用户之后改过的快捷方式；无法确认的入口呈现给用户处理。

## 7. 决策范围与后续契约

独立 Electron、任务中心、同时支持任务驱动与测试驱动已获确认，不再重复询问。首个完整 Contract DESKTOP-01 已获用户确认；其范围内技术决定按该 Contract 执行，后续阶段技术细化仍需对应契约；历史 UI-01 的派发与 Git 授权不自动扩展到本次交付。

第二阶段开始前需要把草稿/会话关联持久化、App Server 与 Room 执行映射写成明确契约。这是具体设计工作，不把所有者冲突留给 Worker 自行猜测。第一阶段不修改现有 Room protocol 或数据库。

## 8. 备选与依据

继续 CDP 注入不能满足独立窗口目标；仅给旧网页增加 Electron 外壳不能满足任务交互目标；整体重写后端会丢弃已有执行与状态能力，因此采用分阶段替换产品入口并复用已验证后端。

- [Electron Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model)：Main、Renderer、Preload 与后台进程职责。
- [Codex App Server](https://learn.chatgpt.com/docs/app-server)：thread/turn、collaborationMode、交互请求及恢复接口；部分能力为 experimental。
- [GitHub Spec Kit](https://github.com/github/spec-kit)：规格、计划、任务和实现链路。
- [OpenSpec](https://github.com/Fission-AI/OpenSpec)：已有项目的变更规范、实现与归档。
- [当前桌面入口](../ROOM_DESKTOP.md)、[当前 UI/API](../ROOM_UI.md)：现有行为与迁移起点。
