# ELECTRON-FULL-LOCAL：持续交付至人工测试

## 2026-10-12 — 实际消息 DOM 修复候选

用户复测 `confirm-fix` 后仍未同步。真实 `chatgpt-send-diagnostic.json`（21:22:59）有正常会话地址、可编辑输入与停止按钮，但 `messageNodes=[]`；用户消息与回复均未被已有选择器捕获。此前段落与新回复确认测试只证明替身路径，不能代表当前真实页面通过。

用户使用诊断版保存的新报告（21:31:56）提供实际结构：`MarkdownRoot-*` 消息根节点、`rich-text-user-turn` 用户标记、`CodeBlock-*` 下有 PRE 和无 PRE 的 CODE。新增用例在旧实现返回 0 条消息（期望 2 条），修复后通过。消息根节点与旧角色容器去重；无语言标签的有效 JSON 恢复 json fence，使输出处理可继续解析方案与澄清。源码完整回归通过，证据 `C:/Users/RM/AppData/Local/Temp/room-chatgpt-bridge-Fn9oKD/report.json`。新候选 `desktop/release-chatgpt-message-fix`，未修改用户登录数据，真实账号复测待完成。

打包后的 Room.exe 完整链路回归通过，证据 `C:/Users/RM/AppData/Local/Temp/room-chatgpt-bridge-SYsxRu/report.json`。测试采用真实结构的隔离替身页面，不代表已代替用户完成真实账号验收。documentation: updated。

## 2026-10-12 — 发送确认恢复

原样复现：`node tests/desktop-chatgpt-bridge-smoke.mjs` 在用户消息以段落显示后，网页已完成回复，Room 仍 pending；Red 证据 `room-chatgpt-bridge-8g4C3g`。修复结构读取及发送前消息基线后，Green 证据 `room-chatgpt-bridge-JkD341`：段落回显可确认；折叠用户回显时，仅新增回复加空输入框可确认；已有历史回复不提前确认；10 秒晚到回复解除超时并清除旧提示，原草稿正确清空，仍不自动重发。

新产物目录 `desktop/release-chatgpt-confirm-fix`。超时诊断 `chatgpt-send-diagnostic.json` 只记录控件、消息容器角色/ID/长度，不含正文；可继续观察实际网页结构差异。本轮未读取用户当前聊天正文或修改其登录配置。

打包 Room.exe 完整回归通过，证据 `C:/Users/RM/AppData/Local/Temp/room-chatgpt-bridge-lunKXM/report.json`，同时验证超时诊断包含消息结构而没有正文。用户应回到原任务读取现有回复，不重发已完成消息。

## 2026-10-12 — 自动保存与澄清讨论闭环

用户报告无自动保存、无需求选择框、思考输出无反馈，并确认按 Skill 方法澄清。候选实现：普通 Chat 提示加入 grilling 逐轮澄清方法和 `room_questions` 格式；Main 轮询识别生成状态和最新回复，回复结束且稳定 1400ms 后提交输出处理；后端验证问题或方案格式，方案以网页回复 ID 去重且保持乐观版本校验；Room 提供需求 Modal、自定义答案、暂时关闭及重新打开入口，答案回到原 Chat。顶部状态显示发送、等待、输出、保存及停止。

测试 `node --test tests/workbench-planning.test.ts tests/proposal.test.ts` 先因输出处理缺失失败，完成后 5/5 通过，覆盖选择结构、无执行、版本去重、人工编辑保护与过期版本拒绝。类型检查及前端构建通过。源码 Electron 回归 `room-chatgpt-bridge-WFnq2b` 覆盖状态反馈、澄清选择、回答回传及方案自动保存。新候选目录 `desktop/release-chatgpt-discussion`。真实账号消息往返及输出结构仍需用户复测。

全量测试 440/440 通过，日志 `C:/Users/RM/AppData/Local/Temp/room-chatgpt-discussion-tests.log`。首轮打包验证 `room-chatgpt-bridge-5vuGXj` 通过，检查弹窗截图后隐藏聊天区交接 JSON，并取消澄清回复的手动方案采用按钮；前端类型检查与构建再次通过。

最终打包版本回归通过，证据 `C:/Users/RM/AppData/Local/Temp/room-chatgpt-bridge-HQDPHy/report.json`，包含隐藏交接元数据及刷新后方案版本仍为 1 的直接断言。用户可从托盘退出旧版后运行 `desktop/release-chatgpt-discussion/win-unpacked/Room.exe`；新澄清规则随下一条 Room 消息发送到网页。

## 2026-10-12 — 中文发送按钮的实际诊断与修复

读取用户显式保存的 `C:/Users/RM/AppData/Roaming/Room/chatgpt-page-diagnostic.json`，文件时间 20:20:06。发送控件的实际属性为 `BUTTON`、`label=发送`、`testId=null`、`visible=true`、`disabled=false`。适配器原来仅匹配“发送消息”等标签，没有匹配“发送”，故未点击实际可用按钮。

最小 DOM 测试改用上述属性后，发送返回 false（Red）；补充该标签后通过（Green）。完整桥接测试同时去掉按钮 testid，并使用 `aria-label="发送"`，源码回归通过，证据 `room-chatgpt-bridge-pcE3H2`。修复产物目录 `desktop/release-chatgpt-button-fix`，未停止旧应用或修改真实账号数据。

打包 Room.exe 同一回归通过，证据为 `C:/Users/RM/AppData/Local/Temp/room-chatgpt-bridge-kSXnIp/report.json`。实际账号控件已取得诊断证据，真实消息发送仍待用户复测。

## 2026-10-12 — 段落编辑器的完整性误报

`node tests/desktop-chatgpt-bridge-smoke.mjs` 在一次段落转换后复现“网页输入内容未完整写入”（Red，`room-chatgpt-bridge-ctylyw`）。最小 `node tests/desktop-chatgpt-page-smoke.mjs` 进一步确认相同完整文本的 `<p>` 表示被误判为不同草稿；DOM 中正文未缺失，差异来自 `innerText` 额外插入的段落换行。

改为结构读取后两个命令通过（Green，完整链路证据 `room-chatgpt-bridge-3u8aWH`）。最小测试覆盖 `<p>`、`<div>`、空段落、编辑器占位 BR、中文和代码缩进，并断言真实缺字、缩进变化、真实空行减少仍拒绝发送。完整链路覆盖写入后段落转换以及此前的重试、采用、隔离和退出行为。

候选产物目录 `desktop/release-chatgpt-text-fix`；真实账号页面仍需用户复测。没有以替身页面测试宣称已验证真实 ChatGPT 推理。

打包 Room.exe 同一桥接回归通过，证据为 `C:/Users/RM/AppData/Local/Temp/room-chatgpt-bridge-KAOuMJ/report.json`；NSIS 安装包 137319313 bytes，2026-10-12 20:14:24。未覆盖或关闭用户正在运行的版本。

## 2026-10-12 — 发送失败后从 Room 重试

发送按钮不可用时，Room 已写入网页的消息会残留，旧 `focus` 操作把它当作外部草稿拒绝。回归 `room-chatgpt-bridge-VxhxaF` 复现用户相同错误（Red）。修复按 Room 上下文及用户消息标记识别自身草稿，相同内容复用，更新后的内容通过选区加 `insertText` 替换；网页独立手动草稿不被覆盖。

源码回归 `room-chatgpt-bridge-KYO9Nf` 通过（Green）：发送前失败保留 Room 草稿、再次点击发送成功且只有一份上下文、确认后清空输入、contenteditable 中旧 Room 草稿替换，以及已有回复同步、采用、隔离和退出断言。独立产物目录为 `desktop/release-chatgpt-send-fix`，不覆盖用户正在运行的旧版本。真实账号聊天仍由用户复测，替身网页测试不代表真实推理验收。

打包 Room.exe 同一回归通过，证据为 `C:/Users/RM/AppData/Local/Temp/room-chatgpt-bridge-u3va4a/report.json`；安装包 `Room Setup 0.1.0.exe` 为 137319083 bytes。未执行安装或停止用户现有应用。

## 2026-10-12 — 人工反馈后的窗口与输入框修复

用户已确认内嵌网页可登录，报告窗口最小化联动与已登录输入框无法识别。实际代码存在 parent/modal 绑定和固定 ID 限制；临时网页回归先失败于这两点。修复为独立顶层窗口、按聊天表单或唯一可编辑控件识别；覆盖 textarea、contenteditable 和同时存在搜索框的场景。富文本测试发现的 NBSP 差异已在发送和回显比较中规范化。页面脚本错误保留具体原因；用户可显式保存无正文的控件诊断。

源码完整桌面桥接测试通过，证据目录 `room-chatgpt-bridge-Lr4qxg`；类型检查通过。用户实际页面未开启调试端口，本轮未读取其登录凭据、聊天内容或 DOM，实际账号输入识别仍需复测。修复候选输出到 `desktop/release-chatgpt-fix`，保留用户正在运行的旧包与登录数据。

打包 Room.exe 同一回归通过，证据目录 `room-chatgpt-bridge-coF84R`，明确验证双方独立最小化、非固定 ID textarea、带搜索框的 contenteditable、诊断导出、发送与退出。NSIS 文件 137318858 bytes，2026-10-12 19:47:05；未安装或覆盖用户正在运行的旧候选。正常账号的实际页面尚待复测，不以替身回归宣布用户第二项问题已完成真实验收。

## 2026-10-12 — Room 自有讨论窗口与网页桥接（本轮候选）

用户确认 Room 显示自己的输入框与消息列表，由插件／页面桥接与内嵌 ChatGPT 普通聊天搬运内容。本轮采用随应用交付的 `chatgpt-page.cjs` 专用页面适配器，替换剪贴板流程；没有新增 Chrome 扩展运行框架。接口与产品流程以 ADR-0007 §3.3 和产品方案 §7 为准。

实现：每个任务独立 WebContentsView，账号 session 共享持久化；主页面经受限 IPC 调用固定适配器，在 isolated world 读取 DOM，通过实际网页输入与发送控件交互。Room 展示网页回复，点击“采用此方案”保存版本化草稿。网页用户消息确认前不清空草稿、不自动重发。可在应用内显示网页处理登录或上传文件，返回时隐藏，退出应用时释放。

TDD：`node tests/desktop-chatgpt-bridge-smoke.mjs` 在旧实现因缺少 Room 讨论输入框失败（Red）；新实现源码与打包 Room.exe 均通过（Green）。覆盖登录状态恢复、Room 发送、网页流式回复、JSON 代码围栏保留和结构化方案采用、无执行实体、刷新不重发、两任务会话隔离、停止生成及正常退出。打包证据：`C:/Users/RM/AppData/Local/Temp/room-chatgpt-bridge-CsWzsk/report.json`。旧剪贴板 smoke 已由新流程测试取代。

类型检查、前端生产构建、规划与方案解析 4 项回归、既有桌面交互 smoke 通过。最终完整回归 439/439 通过，日志为临时目录中的 `room-page-bridge-tests.log`。官方首页只读探针 `room-chatgpt-probe-QVs9O2` 已验证实际未登录页面被适配器识别；没有登录或发送真实消息。

安装候选：`desktop/release/Room Setup 0.1.0.exe`，137317966 bytes，2026-10-12 13:42:56。需人工在该候选中完成真实账号登录、Room 输入到真实 Chat 回复、方案采用及应用重启恢复。测试替身通过不代表登录后网页结构或实际推理已经验收；没有提交 Git。

## 此前剪贴板候选（历史，已由上述桥接取代）

2026-10-12 后续澄清：用户明确使用现有账号的 ChatGPT 普通 Chat，已解除账号/API 类型待确认项。用户随后明确全部讨论必须在 Electron 内完成。当前已实现内嵌官方 ChatGPT 网页及显式剪贴板方案导入，未采用外部 MCP 讨论方案。不得继续重复询问账号/API 选择，也不得把该澄清记为真实账号聊天验收已完成。

本轮证据：类型检查、前端生产构建、2 项规划回归和既有桌面交互 smoke 通过。新增 `tests/desktop-chatgpt-smoke.mjs` 在源码与打包 Room.exe 上均通过，验证实际任务 HTTP 接口、规划资料复制、草稿版本保存、无 Run/原生 thread、远端页面隔离及关闭返回。打包测试证据位于临时目录 `room-chatgpt-flow-dngxGm/report.json`。页面替身不证明 ChatGPT 实际推理。

官方未登录首页探针在正常宿主通过，证据位于临时目录 `room-chatgpt-probe-YZr5SK`。受限执行曾出现 AppContainer 读取 Electron 安装目录 ACL 错误与 `0x80000003`，不能据此断定用户较早截图的根因。没有修改 ACL 或关闭 sandbox。

本轮安装包已重建：`desktop/release/Room Setup 0.1.0.exe`，137315133 bytes，2026-10-12 12:49:10。本轮验证了免安装 Room.exe；早前安装/重装/卸载证据仍属于早前产物。真实账号登录、发送讨论、复制完整结构化回复、重新打开会话仍待人工验证。

完整回归在正常宿主通过：439/439，0 failed，日志为临时目录中的 `room-chatgpt-host-tests.log`。受限执行在真实子进程停止测试处未结束，已停止该次运行；不计为通过。文档影响已同步 ADR、产品流程、桌面人工测试与文档入口，documentation: updated。当前无新增已证实阻塞代码 finding；真实账号流程尚待人工验证，不能声明普通 Chat 端到端验收完成。

后续目标（2026-10-12，进行中）：用户要求普通规划调用 Chat，仅原生 Codex Plan 为例外。源码已分开 SDD ChatGPT 与原生 Plan 路径；安装包已重建，账号实际聊天尚未验收；以下交付结论保留为更正前事实。需求与当前接入边界见 [ADR-0007 §3.3](../../documents/ADR/0007-electron-task-workbench.md#33-规划调用更正2026-10-12用户明确要求)。本轮已核对实际 `WorkbenchPlanning.start()`、`startPlanTurn()` 与讨论 UI，并修订目标文档；未以文档更新替代真实 Chat 实现与验收。

状态：Accepted dispatch / REVIEW_REQUIRED，2026-10-12 已达到人工测试就绪。用户 2026-10-11 授权一次性本地独立 Worker，以完整方案建立原生 Goal，持续开发至人工测试。此授权覆盖 ADR-0007 四阶段及必要修复，替代本次 GitHub Stage/Router 调度与逐阶段启动确认；不改变产品内用户执行/验收授权。以下检查点保留实施过程，最终交付结论见文末；候选尚未获用户最终接受或集成。

- dispatch_id：`electron-full-local-20261011-01`
- baseline：`6f3a4c2ce71a9373e10dfd0ee9df645207d8d45f`
- branch：`codex/electron-desktop-01`
- worktree：`C:/Users/RM/.codex/worktrees/7af7/codex-claudecode-room`
- Worker：原生线程 `01a12b24-e9bb-7790-a1c5-d2961f5eef50`，原生 Goal 已建立。

## 范围与顺序

1. 按 DESKTOP-01 完成 Electron 生命周期、真实项目浏览与 Windows 打包。
2. 持久化任务草稿、来源关联和 App Server thread 引用；接入原生 Plan、方案修订与现有 Room 执行。
3. 完成任务页面、SDD 来源/规格、TDD 实际命令证据、Review/验收与现有 Git preview。
4. 替代验证后清理失效 Tauri/CDP 源码，更新运行文档，产出安装文件和人工测试说明。

开发 Skill 只指导实现，不进入应用或安装资源。无 subagent、Git staging/commit/push、分支/worktree 管理；不改变真实数据库、Codex profile、日常快捷方式。必要依赖、临时安装与自动验证已授权。

## 数据与接口决定

新增用户任务元数据位于同一项目 Room SQLite 中的专用表：任务标题、目标、入口、验证方式、来源引用、App Server thread 关联、对应 Plan/Task/Run 引用。任务 UI 状态从草稿与已有 Room 事实推导，不复制 Run/Review 状态。App Server 保存聊天历史；数据库只保存关联及产品方案版本。项目 registry 继续只保存绑定。

服务端从项目 ID 解析唯一绑定，所有新任务操作核对 room_id。新增 HTTP 接口在现有 loopback application 上实现，复用 RoomService/PlanScheduler/GitController。规划 turn 使用原生 collaborationMode 和只读 sandbox；执行前用户确认完整方案，产品执行仍由 Room Run/Attempt 跟踪。实际后续字段和方法随对应切片记录，不引入通用 Agent 框架。

Electron Main 使用独立子进程运行 Room HTTP 服务；打包带入匹配项目 Node 24 的运行时，避免依赖 Electron 内置 Node 的 SQLite/TypeScript 支持。服务只监听 loopback 随机端口，Main 在 ready 后加载，异常可见。Preload 仅提供目录选择与窗口生命周期。

## 验证与停止条件

可测试行为先 Red 后 Green，纯视觉做操作/截图；运行类型检查、相关回归、生产构建、实际 Electron/安装路径验证。测试使用临时项目。自动步骤完成后提供实际安装产物、启动方式、人工测试路径与未覆盖项；此时 Goal 可完成，表示人工测试就绪，不表示用户最终接受。任何缺失能力必须如实呈现。

## 实施检查点（未完成交付）

2026-10-11：Electron 主进程、受限 preload、独立 Node 24 服务、项目打开/显式创建、同库任务草稿与来源元数据已实现。新工作台入口已替换前端启动入口；任务编辑、资料管理、讨论与方案浏览已接通。旧页面及 Tauri/CDP 文件尚未清理，执行/测试/变更/验收页仍待接通，不是可交付终态。

原生 App Server 已实际完成 initialize 与 collaborationMode/list，本机返回 Plan/Default。规划 transport 使用持久 thread、read-only sandbox、内置 Plan instructions；任务 thread 引用、完整方案版本、用户提问与断线状态已有实现和协议测试。没有以普通提示词冒充原生 Plan；尚未进行实际模型生成的端到端测试。

自动验证事实：桌面服务、草稿/来源、公开 HTTP 路径、Plan 协议与提问/断线测试通过；既有 UI API 的五项回归通过；类型检查与前端生产构建通过。`tests/desktop-smoke.mjs` 使用临时项目验证真实 Electron 的原生目录选择、明确创建、保存草稿、刷新恢复、renderer 隔离与显式退出；源码运行与打包后的 `desktop/release/win-unpacked/Room.exe` 均通过。`desktop/release/Room Setup 0.1.0.exe` 已生成（开发中快照，后续必须重建）；尚未执行安装/卸载验收。

2026-10-11 后续切片：方案编辑与版本记录、执行确认、独立 worktree 准备、Managed MCP、Claude Runner、执行日志、实际命令证据、Git Diff、独立 Review 与人工接受已接通。桌面 artifacts 写入项目数据库旁的目录，不污染执行 worktree。验证工具只执行 Accepted Task 中指定索引的命令，保存真实 cwd、stdout、stderr 与 exit code；TDD 阶段标签不替代输出证据。

Review 通过独立 read-only App Server thread 生成；接受前核对被审候选文件内容与实际验证记录。候选变化会拒绝接受，允许同一 succeeded attempt 在 review_discussion 下新增 Review，保留历史并使用 latest Review。测试已覆盖旧候选拒绝、新候选重新审阅与接受。实际模型 Review 尚未完成端到端验证。

执行准备失败保留同一 Plan/Task/Run；用户重新预览确认后使用新的 GitAction。测试覆盖目标目录被占用、解除占用、重新准备成功及原目录改动保留。退出仅停止当前桌面拥有的 Run，并等待 terminal settlement；外部 Run 不受影响。活动记录没有当前进程观察时，页面显示执行状态未知，禁止重复启动，不把数据库 running 当作存活证明。

验证事实：RoomService 与执行/Review 共 65 项回归通过；桌面停止、UI API、执行和 Review 共 8 项通过；新增执行观察测试及类型检查通过。Runner/CLI 的 73 项回归、真实 MCP 验证调用与 Windows 命令引号修复已完成。前端生产构建通过，安装产物仍需在完整功能完成后重建。

修复切片已接通：原生 Plan 可讨论当前 Review findings，方案保存 Review basis 与 proposed_fixes；人工确认后生成同一 Run 的 Fix Task，保留目录和 parent Task lineage。旧 Review basis、非当前 finding 与超出已有节点范围的修复被拒绝。验收页提供讨论入口，方案页展示对应解决方案并确认执行。两项 Review/Fix 测试、规划/执行/停止共五项测试和前端生产构建通过。当前 Task 的验收验证只使用其对应 attempts 与确切命令，避免继承旧 Task 的测试成功记录。

Git 交付与手动验证切片已接通：桌面新任务采用既有 single integration node / integration_only 门禁，接受后单独 preview/确认提交及 fast-forward。真实临时 Git 仓库测试证明预览无提交、接受后文件变化拒绝提交、dirty target 拒绝集成、确认后提交与集成成功；原目录改动在用户明确整理前保持不变。手动验证复用当前 Task 的批准命令，只在没有活动 Attempt 时运行，记录 stage=verification；已接入“重跑失败测试”和“运行本任务验证”。验证进程退出前保持数据库打开，关闭服务会停止并等待实际命令终态。

范围修订切片已完成主路径：遵循原协议“scope-changing answer 后新建 Implementation Run”，同一用户任务保存 prior_run_ids 和 Question basis；确认卡片列出将带入的已有改动，新 Run 在独立目录从确认的源 commit 创建并复制这些改动，旧 Run/Attempt/目录保留。预览后的源改动变化会拒绝执行；目录准备失败后重新检查可恢复。九项相关测试通过，包含同一修订的失败恢复；执行与交付回归继续通过。

SDD 切片：方案元数据增加规格、技术设计、实施任务/依赖/验收/测试场景；执行前必须完整，完整内容进入 Task background。UI 支持生成规格、补全设计与任务、三页切换和编辑保存。真实 Electron 临时 profile 测试验证 SDD tabs/editing、草稿恢复、renderer 隔离及退出通过；受限环境首轮临时目录清理失败，授权环境重跑通过。

用户随后报告 Windows `electron.exe` 异常弹窗（`0x80000003`）。未找到匹配的 Application 1000/1001 事件或仍存活的项目 Electron 进程，失败测试目录也无服务日志；尚未确认异常原因，不能归因于清理失败。桌面 smoke 已增加退出码/信号断言、stderr 输出和失败 profile 保留；授权环境实测完整操作及退出码 `0` 通过，未复现该异常。未据此修改 GPU、sandbox 或 Electron 版本；此结果不表示截图异常已修复。

资料和任务管理切片：新增原生文件/目录选择、实际来源预览与失败重试、原文定位、任务编辑中添加并关联资料；资料用途仍按类型与归属确定。任务菜单支持重命名、取消、归档/恢复和后续任务，历史只读并保留原文件、Run 及来源引用；后续任务的讨论得到前任务结果上下文，但不继承执行授权。活动执行禁止归档，accepted Run 禁止取消，归档阻止验证及交付写操作。

验证事实：`node --test tests/workbench-api.test.ts` 首轮因读取入口缺失返回 400（预期 200）失败；实现后通过。类型检查、前端构建及相关 store/planning/amendment/review 回归通过。真实 Electron smoke 发现资料类型控件缺少准确的可访问名称，修正后完整验证文件选择、预览、内联关联、归档/恢复、后续任务及正常退出通过。执行回归中新断言最初使用了已关闭的测试数据库连接，改为在检查时打开连接后通过；实际活动/accepted 门禁保持正确。

重启恢复切片：同库记录实际服务/子进程 PID，桌面执行期间增量保存 stdout/stderr，恢复重用现有 stream interpreter 提取可靠 session。执行与测试页增加进程检查、明确说明和确认结束遗留记录操作；活进程/可观察子树、缺少归属或进程查询失败均不结算、不重放。running/decision_requested/cancel_requested 分别遵守 interrupted/needs_decision/canceled 语义，保留 Git 改动、问题和实际日志。缺少旧归属的历史记录仍需定位原执行入口，不伪造已停止。

退出切片：Electron IPC 断开会关闭本应用拥有的执行与服务；退出提示包含手动验证命令。停止发生在 claim 前时等待所属 launch 准备结果，再按实际 Attempt 取消。真实命令测试在受限环境暴露 taskkill 未能停止子进程且未反馈的问题，已补充命令失败传播，保留运行状态并支持再次停止。仅清理了已核实属于该测试的子进程树；授权环境重新验证实际命令停止成功。

验证事实：恢复首轮因入口尚未实现失败，随后 running/decision_requested/cancel_requested 三项测试通过，覆盖缺失归属、存活子进程拒绝、原文件保留和不自动重放。桌面停止、实际手动测试和实际 Red/Green 验证通过；Windows `desktop-process-smoke.mjs` 读取真实进程并验证 IPC 断开后进程及 HTTP 服务消失；真实 Electron 原有完整操作回归、类型检查与前端构建通过。

项目设置切片：同库保存新任务默认入口、验证方式与 Codex 规划模型；项目名称保存在 registry，移除绑定后再次打开同目录复用原 Room。设置页提供实际 Agent 检测、模型目录、主题/字号、日志位置、单独登录入口和未保存提醒。检测不发起登录，模型选择不修改 Codex 全局配置。

验证事实：设置 API 首轮返回 404，实现后持久化与移除/重开测试通过；Agent capabilities、原生 Plan 与 UI API 共九项相关测试通过。实际只读检测确认本机 Codex 原生 Plan、模型目录和登录信息可读，Claude CLI 及登录状态可读；没有运行真实登录。真实 Electron 操作验证设置保存、未保存提醒、默认任务选项、主题、字号及完整既有操作通过，进程正常退出；类型检查和前端构建通过。

范围修订首次执行修复：把原仅记录 launch 的测试改为通过 Application → runRoomRun → LocalExecutor 的实际入口，复现 `worktree_not_clean`。桌面现在保存确认带入的目标 Run、目录、HEAD 和文件字节；Runner 仅在该快照完全匹配时允许 dirty first attempt。普通新任务继续要求 clean worktree，不新增 CLI 绕过选项。原目录与旧 Run 保留，新 Run 使用自己的 session。

验证事实：修订主路径由 Red 转 Green；缺少带入授权和确认后内容变化均在 claim/process 前拒绝。修订、公开执行路径、Runner 与 CLI 共 56 项测试通过；类型检查通过。此测试使用真实 Git/SQLite/Runner，Claude process 为测试替身，实际模型执行仍待完成。

下一切片：剩余交互与真实模型端到端验收；清理旧入口，重建并验证安装/卸载，交付人工测试说明。当前仍为 CODING，不是人工测试就绪。

2026-10-12 方案编辑切片：方案正文、SDD、范围、验收条件与验证命令的修改接入统一未保存提醒；切换页签、返回列表、编辑任务或切换项目需保存、放弃或继续编辑。保存失败保留输入和当前页；取消编辑也遵循提醒。存在未保存方案时任务操作按钮说明需先保存或取消，避免归档等操作使编辑内容失效。

验证事实：真实 Electron 首轮未出现保存提醒而失败，修复后通过继续编辑、保存并离开、保存失败停留和放弃后恢复已保存方案。测试发现方案文本框缺少稳定的可访问名称，补充明确标签后完整桌面回归通过并正常退出；前端类型检查和生产构建通过。当前仍未进行真实模型全流程及最终安装验收。

真实模型 Plan 验证：`tests/desktop-model-smoke.mjs` 使用临时 Git 项目和 Room，实际调用本机 Codex 原生 Plan。任务模式和 SDD 模式均生成可解析方案；SDD 的规格、设计及有序依赖通过完整性检查，独立新客户端读取持久讨论成功，源码 Git 状态保持干净。实际证据保存在 `C:/Users/RM/AppData/Local/Temp/room-model-smoke-A1T9xQ/report.json`。此 opt-in 脚本不属于默认单元测试；后续执行验证复用该临时目录。

任务模式真实执行：Claude 通过 Managed MCP 留下实际 Red（缺少 sum.js，exit 1）和 Green（三个测试通过，exit 0）证据，独立 Codex Review 已批准。真实 Plan 把同一命令的 Red/Green 分为两个索引，暴露验收错误地要求每个索引分别成功的问题；回归复现后改为当前 Task 内按确切命令匹配最终成功及 Red → Green 顺序，提交前检查同步修正。三项执行/Review 回归通过，原真实候选无需重跑已成功的步骤即通过验收，证据为同临时目录下 `task-acceptance.json` 与 Room 数据库。

多任务修复：真实 SDD 第二项任务在创建 Plan 时暴露旧 `plans.room_id` 唯一索引限制。快照和调度原本已按 plan_id 隔离，现把该索引改为普通索引；已有数据库只在授权创建 Plan 的事务内转换。公开执行测试复现后转绿，证明第二项任务拥有独立 Plan/目录、首项 accepted 历史保持不变，覆盖旧索引转换。调度、快照、GitController、桌面执行共 36 项回归及类型检查通过。

SDD 真实执行验收完成：在同一临时项目中使用第二份实际原生 Plan，Claude 实现后通过实际 Red/Green、独立 Codex Review 与接受接口；`execution-report.json` 记录 review=`review-54cf023b-7d62-489d-92cb-c626338b36ff`、accepted=true，测试进程 exit 0。没有真实仓库提交或集成。剩余交互、旧入口清理、最终安装包/安装卸载及人工测试交付尚未完成，Goal 继续。

讨论页切片：按 task/turn 保存用户原始输入，读历史时显示原输入，App Server 的完整研究上下文保持不变；方案消息移除已解析的 room_task 元数据块，结构化内容仍用于方案页。生成中的 Agent 文本按 item ID 更新，避免把不同消息拼在一起或在历史消息旁重复展示。六项规划/存储测试、类型检查、前端构建及真实 Electron 页面操作通过；页面流式验证使用受控接口响应，真实模型 Plan/执行证据仍见前段。

SDD 切换与清理：方案页增加“切换为 SDD”，沿用 thread、来源和方案历史，禁止已派发任务切换，不触发模型或执行。存储测试先失败后通过，实际 Electron 按钮回归通过。原生文件选择 smoke 改为等待异步结果写回，避免过早断言。

已删除 31 个 Git 跟踪且与 HEAD 一致的旧 Tauri/CDP 启动文件、旧 React 页面与入口、旧宿主主题、DAG 和对应测试；所有删除可从 HEAD 恢复。旧 CSS 已解除引用，新工作台仅使用 workbench.css，移除旧页面独占的 Primitives。自动审批首次拒绝递归删除后，核对完整 Git 基线并缩小为单个已跟踪文件删除获准完成；未触及未跟踪文件和目录。构建及独立 Electron 回归通过；旧安装快捷方式的人工迁移说明已保留于 ROOM_DESKTOP，尚未执行最终安装/卸载。

安装快照验证：2026-10-12 构建的 NSIS 包已在临时目录 `C:/Users/RM/AppData/Local/Temp/room-install-smoke-7hFwem` 完成安装、脱离源码目录启动、托盘隐藏/恢复、第二进程唤回原窗口、重装保留任务草稿和卸载保留项目/profile 数据。`desktop/release/install-smoke.json` 五项均为 true。该包早于以下交互更新，最终候选仍需重建。全量测试首轮 438 项中仅 scope 白名单拒绝新增 verification.ts；按当前实现更新文件/依赖白名单后，两项 scope 测试通过。

偏好与定位：随机服务端口导致 localStorage 跨重启失效已被真实 Electron 测试复现。Main 通过窄 IPC 把界面偏好和未发送讨论草稿保存到应用数据目录 `ui-preferences.json`，Renderer 启动前读取；项目状态仍由原 SQLite 保存。实际重启验证项目、任务、页签、搜索、主题字号和讨论草稿恢复通过。停留在长任务列表时退出重启曾回到顶部，增加按项目/页面保存滚动位置后同一测试通过；返回任务行仍恢复焦点。

跨项目与旧记录：顶栏每 10 秒读取已注册项目的实际任务、snapshot 和当前启动观察，显示待办数量或“状态不可用”；从其他项目待办进入目标项目待办列表，任务按状态定位方案/执行/验收。既有协议任务没有 workbench 元数据时，直接从原 snapshot 展示同 Run 的任务、问题、执行结果与 Review，只读且不复制执行状态。`desktop-pending-smoke.mjs` 先复现缺失入口和旧记录遗漏，实现后通过；跨项目任务使用真实临时项目，故障与旧记录展示使用受控 snapshot 响应。

变更与验收：Diff 支持并排/统一、行号和将具体行意见追加到已有讨论草稿，用户发送前不调用模型；打开编辑器支持所选 worktree 中的相对文件。公开 API 先失败后通过，实际 Electron Diff 操作通过。测试页按当前 Task 的确切命令展示最新结果，解决 Red/Green 分列不同索引时仍显示旧失败的问题；TDD 过程保留全部历史。Review 展示 trigger、requirement_relation、open_questions，并提供测试/变更/执行证据跳转。`desktop-diff-smoke.mjs` 使用受控 Diff/runtime 验证这些交互通过。

历史导出：增加本地日期的更新时间筛选、所选任务 JSON 导出，包含方案版本、执行结果、验证、Review 与来源/日志引用，不包含完整代码或数据库。实际 Electron 原生下载完成并检查文件内容；浏览器 download 事件在 Electron 中不触发，测试改为原生 will-download/done 事件。完整 `desktop-smoke.mjs` 通过。

TDD 证据更正与补验：前一临时项目的首次 Red 是缺少 sum.js，不能作为有效行为 Red。新的 `C:/Users/RM/AppData/Local/Temp/room-model-smoke-NGzvBL` 预置可导入、固定返回零的 sum stub；两个原生 Plan 明确先写数值断言。执行 smoke 要求实际 Red 输出包含 ERR_ASSERTION/AssertionError。任务模式与 SDD 均已通过真实 Claude、有效行为断言 Red、Green、独立 Codex Review 与接受；`report.json` 和 `execution-report.json` 保存两种结果，进程 exit 0。

当前仍为 CODING。剩余重点：窄窗口抽屉与缩放/键盘/视觉验收、执行分支及来源读取信息、最终整体验证、重建安装包和人工测试说明。截图 `electron.exe 0x80000003` 仍未复现，未宣称修复。未操作用户日常快捷方式或进行本仓库 Git 写入。

## 最终本地交付检查（2026-10-12）

窄窗口现在自动收起任务概况，低于 1000 CSS px 使用导航抽屉；原生 dialog 管理焦点、Esc 和未保存导航。`desktop-layout-smoke.mjs` 在 1440×900、1000×700、Renderer zoom 100%/125%/150% 下通过；分别以进程 device scale 1.25 和 1.5 验证，并读取实际 devicePixelRatio。浅深主题、键盘到达发送按钮、抽屉焦点返回、页面无横向溢出均通过。Electron 原生像素截图位于 `C:/Users/RM/AppData/Local/Temp/room-layout-RbtF5j`，已查看浅色/深色截图并核对布局；没有更改 Windows 全局显示设置。

任务标题下方显示实际执行分支及目录；对话可展开真实 App Server 研究记录，顶栏显示上次 Agent 检测结果。方案缺少 TDD 命令时禁用执行预览并说明原因；版本视图展示范围对比和当时来源，约束/非目标可读。读取项目失败保留故障与重试入口，不以“暂无任务”掩盖失败。相应 Electron 回归通过。

1. **Findings**：本地候选检查未发现尚未解决的阻塞实现 finding。复现的偏好丢失、列表滚动、跨项目待办、旧任务遗漏、测试结果索引、缺失验证命令入口与相关交互问题均已修复并验证。
2. **Open Questions / 用户决定**：等待用户按 [人工测试路径](../../documents/ROOM_DESKTOP.md#当前候选的人工测试) 验证实际使用体验。截图 `0x80000003` 原因仍未确认；候选增加本地 crash dump 与进程退出日志，不上传，也未宣称故障已修复。旧协议任务保持只读；登录和日常快捷方式由用户操作。
3. **Review Decision**：`approved`，仅表示本地候选可进入人工测试，不替代用户最终接受、正式 GitHub Review 或 Git 集成。
4. **验证摘要**：`npm test` 438/438；项目类型检查、前端生产构建、原生 Electron 的偏好/待办/历史/Diff/Review/缩放交互通过；两个真实模型模式均已完成有效断言 Red → Green → 独立 Review → 接受。最终打包 `Room.exe` 的完整桌面 smoke 通过且退出码 0。documentation: updated。

最终安装产物为 `desktop/release/Room Setup 0.1.0.exe`，137310585 bytes，构建时间 2026-10-12 11:47:32（本机时间）；`win-unpacked/Room.exe` 的 ProductName/FileDescription 为 Room，ProductVersion 为 0.1.0.0。应用和安装器未签名；Room 图标与版本资源已写入。

最终安装验证目录 `C:/Users/RM/AppData/Local/Temp/room-install-smoke-ZxZQzz`：安装、脱离源码目录启动、托盘/单实例、重装保留草稿、卸载保留项目与 profile 全部通过；结果见 `desktop/release/install-smoke.json`。测试先遇到把启动中欢迎页误当作最终页面的时序问题，已等待实际项目加载；续接只使用原测试目录。注册表识别同步修正为版本化 DisplayName 与确切 UninstallString，未替换其他安装。

Electron 已启用仅本地崩溃采集；真实打包 smoke 验证 uploadToServer=false，crashDumps 位于临时 profile 内。没有人为制造崩溃来冒充截图复现。测试安装已卸载；保留其项目/profile 证据，最终安装包和免安装目录可供用户测试。

旧 Tauri/CDP 的 31 个已跟踪文件和随后核实为空的旧目录已清理；五项开发 Skill 保留且不进入安装包。仓库未 stage/commit/push，未改用户日常快捷方式或真实 Room 数据库。原生 Goal 的停止条件已满足：交付至人工测试阶段。
