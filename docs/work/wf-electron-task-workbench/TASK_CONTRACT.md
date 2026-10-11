# DESKTOP-01：独立 Electron 启动与项目工作台

| 字段 | 内容 |
|---|---|
| task_id | DESKTOP-01 |
| type | Implementation Task |
| status | Accepted |
| confirmed_by_user | true；用户于 2026-10-11 确认完整 DESKTOP-01 Contract |
| Owner | 独立 Local Codex Implementation Worker |
| revision | 2026-10-11；已纳入用户确认的 UI/UX Review 修正 |
| parent goal | [ADR-0007](../../documents/ADR/0007-electron-task-workbench.md) 全部交付范围 |
| 产品参考 | [完整工作台产品/UI 方案](../../documents/ROOM_WORKBENCH_PRODUCT.md)（Draft）；本阶段只实现下述 Scope，不提前扩展为全部产品功能 |

## Background

当前桌面入口是 Tauri launcher + Codex Desktop/CDP 面板。用户确认改用独立 Electron 和任务中心，并保留 SDD、任务驱动、测试驱动及目录清理目标。首先解除桌面运行对 Codex 窗口和源码目录的依赖，后续再连接新任务、原生 Plan 与执行链路。

## Goal

在 Windows 安装后，用户能通过独立 Room 入口打开项目、读取既有 Room 和任务状态、切换项目并重新打开恢复绑定，整个路径不需要 Codex Desktop 启动。

## Requirements

1. 新增 Electron Main 与 Preload，加载构建后的 React 工作台。使用独立应用名称、窗口与快捷方式；不得连接 Codex Desktop、启用其 CDP 或修改其文件/profile。
2. Main 管理本阶段自有 Room UI 服务。前端继续使用同源 HTTP application；不复制 RoomService、不新增工作流数据库、不在 Renderer 直接执行 Shell。Preload 只暴露本阶段需要的目录选择及桌面生命周期操作。
3. 打开项目通过原生目录选择器选择绝对路径。已有 `.agent-room/runtime.json` 经当前 application 导入；已有注册项目复用绑定。首次无绑定时使用清楚的配置流程，不能创建假 Room 或覆盖数据库。
4. 调整导航为项目与任务列表、任务详情、待处理事项及设置。已有任务从真实 snapshot 导出，详情呈现目标、Run 状态、问题与结果；点选待办直接定位对应记录。没有任务时给出真实空状态。
5. 本阶段保留已有可用操作，内部技术字段收进详情；不得为尚未实现的新任务/原生 Plan/TDD 按钮制造成功反馈。后续能力的入口可以暂不显示。
6. 项目切换必须清除旧项目详情并绑定新目标；更新状态不能覆盖正在输入的内容。服务故障显示原因与重试入口，不能用空列表掩盖读取失败。
7. 关闭窗口隐藏到托盘，重开复用已有窗口。明确退出时核对本应用管理的活动执行，允许继续后台运行或停止后退出；不能任意终止其它 Codex、Claude 或外部 Room 进程。
8. 生成 Windows 安装产物，包含 frontend build、Room 服务及其所需运行时资源。当前后端依赖 Node 24 和 `node:sqlite`，Worker 必须验证实际打包运行能力；不能假设 Electron 内置 Node 与开发环境等价，也不能要求用户额外安装 Rust 或从源码目录启动。
9. 应用设置保存到应用数据目录；项目数据库保留既有路径。重新安装或升级不得删除项目数据。首版提供可重复的安装升级路径，不在本阶段建设更新服务器。
10. 对新增生命周期与项目路由行为先写能失败的聚焦测试，再实现并记录通过结果。纯布局调整以实际桌面操作验证，不生成仅断言源代码字符串的测试。
11. 区分项目根目录分支与任务实际执行分支/目录；事实缺失时显示未准备或不可用，不从当前项目分支猜测。任务详情提供返回列表，恢复本项目查询、筛选、滚动及焦点。
12. 项目切换器展示已注册项目的实际待办与读取故障，可从其他项目的待办入口定位任务；不能自动切换项目或丢弃输入。不另建通知中心。
13. 按产品方案 §3 的统一视觉基准实现本阶段页面。未来能力不提前展示可执行入口；本阶段不重复增加新建任务按钮。

## Architecture decisions

- 使用 Electron + 既有 React/Vite 和 Room UI application；UI registry 仍只保存项目绑定。
- 产品执行仍使用已有 RoomService/Runner/GitController 边界。本阶段不引入 Codex 产品执行 adapter，不改变执行授权、协议或角色。
- 第一阶段可保留旧 Tauri/CDP 源码以保证替换前可用，但新入口不得依赖它们；整个目标收口时必须删除替代路径。
- 包管理延续现有 npm；仅新增实现 Electron 打包实际需要的依赖。
- Main/Preload/Renderer 分工明确，开启 contextIsolation 与 sandbox，关闭 Renderer Node integration；contextBridge 只暴露必要的 typed API，IPC 校验其输入和 sender。Skill 仅用于开发，不导入产品代码、不进入安装资源。

## Implementation sequence

以下步骤属于同一 Contract，不是独立审批节点。按依赖顺序执行，不使用 subagent。

| 顺序 | 工作 | 方法与完成证据 |
|---|---|---|
| 1 | 核对现有 application、项目 registry、snapshot 与桌面入口；确定 Electron/Node 打包方式 | 以实际代码和依赖为依据；记录版本、资源位置、构建与启动命令；若必须修改禁止路径，先返回证据 |
| 2 | 明确设计与页面结构 | 读取 `ui-ux-pro-max`，沿用产品方案 §3 tokens；用 `frontend-design` 细化项目打开、任务列表、任务详情及状态；不新增另一套设计系统 |
| 3 | Electron 最小独立启动闭环 | 先覆盖自有服务启动/失败/退出行为的 Red，再实现 Main、Preload、窗口与打包资源，得到 Green；首先证明开发启动与安装目录运行可行 |
| 4 | 真实项目与任务浏览 | 对项目切换、待办定位、列表上下文恢复分别走 Red/Green；实现相应页面，使用 React Best Practices 的适用规则；Composition Patterns 仅用于实际复杂组件 |
| 5 | 生命周期与恢复 | 覆盖隐藏/重开、明确退出、重启绑定恢复与数据保留；只管理本应用拥有的服务和执行 |
| 6 | 验证与交付 | Playwright CLI 验证浏览器可见交互；实际 Electron 和临时安装目录验证原生功能；执行下述检查，整理 candidate 文档与结果 |

每个行为切片先运行测试，确认失败源于目标行为缺失，再作最小实现并重跑。Refactor 只在确有需要时进行。工具缺失、编译失败不能充当 Red；不要破坏已存在的正确行为制造 Red。纯视觉调整使用截图与实际操作证据。

## Scope

逻辑所有权：Electron 启动与安装、React 导航与真实任务浏览、项目选择、服务生命周期、直接相关测试与文档。

允许路径：`desktop/` 中新增 Electron 文件及包配置、`frontend/`、`src/ui/`、直接覆盖本次行为的 `tests/` 文件、根 `package.json`/`package-lock.json`/`.gitignore`/`tsconfig.json`、`docs/documents/ROOM_DESKTOP.md` 与 `docs/documents/ROOM_UI.md` 的 candidate 说明。Controller 更新全局状态和索引。

如果打包需要共享服务入口的最小调整，只能保持现有行为并增加直接验证。`src/room/`、`src/protocol/`、`src/runner/`、GitController、Bridge、AGENTS/CLAUDE 不在本阶段修改范围。

## Non-goals

原生 Plan 接入、新任务草稿持久化、SDD SOP 自动化、完整 TDD 产品面板、多用户、云服务、任意终端、数据库迁移、旧入口删除、旧快捷方式恢复和 Git 提交推送属于后续或独立授权范围。以上并未从 parent goal 移除。

## Constraints

- 开始前读取[前端与 Electron Skill 工作流](../../documents/agent-guides/FRONTEND_DESKTOP_SKILLS.md)及当前阶段相关的项目 `SKILL.md`。先复用/确定设计系统，再视觉实现；React 规则限实际栈，Composition 按实际复杂度使用，Playwright 浏览器验证与 Electron 原生验收分别报告。技能安装不替代独立 dispatch 门禁。
- 不把当前软件行为写成新功能已验收。没有实际运行的安装包不能称为已交付。
- Worker 不使用 subagent，不创建或发送其它聊天，不执行 Git staging/commit/push/branch/worktree 或安装到用户日常快捷方式。
- Worker 返回 task-generic Result；Controller 观察实际 Diff 与验证事实，不能只接受模型自述。
- dispatch 前由 Controller 读取 live baseline、worktree、branch 和完整工作区状态，单独识别本次规划文档；实际 dispatch 前填写 identity，不使用虚构值。

## Acceptance criteria

| ID | 可观察结果 |
|---|---|
| A1 | 不启动 Codex Desktop，安装产物能独立启动 Room；日志和进程没有 CDP/host injection 依赖 |
| A2 | 临时真实 Room fixture 导入后正确显示任务与待办；点选定位对应记录 |
| A3 | 两个项目切换后读取和操作始终命中所选项目，旧详情不残留 |
| A4 | 关闭/重开不重复创建窗口或执行；明确退出处理活动任务；重启恢复注册项目 |
| A5 | 服务启动失败、绑定无效或读取失败显示可理解错误，已有数据与输入保持 |
| A6 | 从独立安装目录启动成功，源码工作目录不是运行前提；安装更新保留 fixture 数据 |
| A7 | 新行为具有 Red/Green 命令证据；TypeScript、前端构建、相关回归通过 |
| A8 | 项目分支与任务实际执行目录明确区分；返回列表恢复本项目查询、筛选与位置；原任务不再符合筛选时保留筛选并说明 |
| A9 | 在项目 B 可从项目切换器发现项目 A 的真实待办并定位；读取失败显示不可用，不以零待办掩盖错误 |
| A10 | 已实现页面遵循产品方案 §3 视觉规范，在 1440×900、1000×700、Windows 125%/150% 缩放及两种主题下主要操作可见且可键盘访问；新任务表单仍属后续范围 |

## Verification

| Command / 操作 | Detects | Decision if failed |
|---|---|---|
| Worker 为本次测试选择 `node --test <actual test paths>` 并记录精确命令 | 新增生命周期、项目隔离、错误显示、导航与跨项目待办不符合 A2–A5、A8–A9 | 修复相应行为；不得声明该项通过 |
| `npm run typecheck` | Main/UI/API 类型或引用断裂 | 修复后继续 |
| `npm --prefix frontend run typecheck` | 前端 TypeScript 类型错误未被 Vite 转译发现 | 修复后继续 |
| `npm --prefix frontend run build` | 生产前端资源无法构建 | 修复后继续 |
| 本次实际 Electron packaging command，写入交付说明 | 安装产物缺失资源或运行时不兼容 | 不交付安装包 |
| 临时项目及临时安装位置的 Windows 实际桌面操作，覆盖 A1–A6、A8–A10 | 单元测试未覆盖真实窗口、安装路径、恢复行为与导航/布局 | 保留错误证据，修复对应路径 |
| `npm test`，在完整候选形成后执行一次 | 共享 API/服务改动破坏原有行为 | 定位相关回归后修复 |
| `git diff --check` | 本次补丁存在空白错误 | 修正本次改动 |

已通过且输入未变化的检查不重复运行；测试与安装使用临时项目，不操作用户真实 Run 或覆盖其运行数据库。

## Documentation updates

更新桌面/API 文档的 candidate 区域，记录实际启动、构建/打包命令、数据位置、生命周期和已验证范围。保留旧安装历史并指向当前候选，不预写后续阶段完成。

## Deliverables

- 范围内完整代码与直接测试，保留用户及前序文档改动，不混入无关清理。
- 可复现构建的 Windows 安装产物及其本地路径；在临时安装目录和临时项目上的真实运行证据。不得用 dev server 截图代替安装验收。
- 在现有 candidate 文档中记录实际 Red/Green 命令、类型/构建/回归结果、浏览器与原生验收范围、必要截图及未覆盖项；不虚构通过结果。
- 按当前 task-generic Result Contract 返回 owned-path 改动及 deviations/unresolved。`implementation_ready` 只表示可进入 Review，不表示用户已经接受或允许 Git 交付。

## Subsequent contracts

本 Contract 完成后，依 ADR 顺序另行形成任务闭环、SDD/TDD、旧入口清理与迁移 Contract。新任务持久化、原生 Plan、Room 执行映射等必须先明确事实所有者和接口，不能将本 Contract 当作完整目标已实现，也不能据此自行扩大范围。

## Question policy

常规布局、命名和实现细节在范围内自行决定。只有范围扩张、数据所有权变化、无法满足安装运行前提或与当前协议冲突时，返回具体证据与最小选择。不得因 aesthetic choice、重复审批或推测性风险停工。

本 Contract 已确认，完成独立 Worker dispatch 后进入 Coding；它不继承历史 UI-01 的 Git 交付授权。
