# Room desktop

2026-10-12 最新修复候选位于 `desktop/release-chatgpt-message-fix`，本轮按真实诊断修复 MarkdownRoot 消息识别及无语言标签的 JSON 代码块读取，解决网页已有回复而 Room 持续等待的问题；此前自动保存、澄清弹窗及状态反馈保留。真实账号需使用新包复测，不要重发已经完成的消息。边界见 [ADR-0007 §3.3](./ADR/0007-electron-task-workbench.md#33-规划调用更正2026-10-12用户明确要求)。以下安装/重装/卸载证据对应早前候选。

当前候选为独立 Electron 工作台，已于 2026-10-12 达到人工测试就绪，见 [ADR-0007](./ADR/0007-electron-task-workbench.md) 和 [本地实施证据](../work/wf-electron-task-workbench/LOCAL_EXECUTION.md#最终本地交付检查2026-10-12)。源码开发使用 Node 24，运行 `npm run desktop:dev`；`npm run desktop:build` 生成 Windows NSIS 安装包。最终包已通过临时安装、独立启动、重装保留数据和卸载验证；等待用户人工测试与最终接受。

Electron 自行启动本地服务，使用任务中心、原生 Plan、SDD 与实际验证证据；不需要 CDP、Codex 窗口注入、Rust 或 Tauri。关闭窗口隐藏到托盘，明确退出会提示并停止本应用拥有的执行与验证。通过“设置 → 关于与诊断 → 打开日志目录”定位桌面服务日志。

应用数据目录中的 `projects.json` 保存项目绑定，`ui-preferences.json` 保存项目/页面选择、筛选、滚动、外观和未发送讨论草稿；任务执行事实仍由各项目 Room SQLite 保存。项目历史的“导出记录”仅导出选定任务的方案、结果、验证与证据引用，不作为代码或数据库备份。

旧安装器曾替换 Codex 快捷方式；本次开发未修改用户现有快捷方式。迁移时应先检查旧快捷方式目标和 `.room-backup`，由用户选择恢复原 Codex 入口；不可盲目删除 profile 或 Room 数据库。

## 当前候选的人工测试

本轮修复产物：`desktop/release-chatgpt-message-fix/Room Setup 0.1.0.exe`；免安装可运行 `desktop/release-chatgpt-message-fix/win-unpacked/Room.exe`。先从托盘明确退出旧 Room，再打开修复版，避免单实例锁把请求交给旧进程。使用同一用户数据位置，不删除或复制登录凭据。常规构建仍默认输出 `desktop/release`；独立输出命令为 `node desktop/electron/build.mjs desktop/release-chatgpt-message-fix`。已内置 Node 24，运行安装版不要求另装 Node。Git、Codex CLI 和 Claude Code CLI 使用本机现有安装与登录；开发 Skill 不随安装包交付。

发送确认超时会继续同步，并自动保存 `chatgpt-send-diagnostic.json`（消息容器角色、ID、长度及控件属性，不含正文）。晚到的新回复可自动解除等待；先回到原任务观察，不重复发送。

若已登录仍找不到输入框：打开 ChatGPT 网页窗口，点击“保存页面诊断”。报告保存在应用数据目录的 `chatgpt-page-diagnostic.json`，工具栏显示具体路径。报告只包含页面路径及控件结构，不含输入值、聊天正文或 cookies。

本地候选未签名。安装器不创建或替换桌面、开始菜单和 Codex 日常快捷方式；直接运行 `Room.exe`，需要时由用户创建自己的快捷方式。旧 Codex 入口恢复见上文迁移说明。

使用独立测试 Git 项目，先完成一个基线 commit，再打开项目文件夹。已有 Room 自动复用绑定；无 Room 时明确点击“为此项目创建 Room”。

| 测试 | 操作路径 | 期望 |
|---|---|---|
| 任务模式 + TDD | 新建任务 → 填目标、任务模式/测试驱动 → 开始讨论 → 生成计划 → 检查并执行 → 开始执行 → 测试/变更/验收 | 实际断言先失败后通过；没有验证命令时不能确认执行；独立 Review 后由用户接受 |
| SDD + TDD | 添加项目规范与外部参考 → 新建 SDD 任务 → 开始讨论 → 打开网页 / 登录 → 返回 Room → 在 Room 输入并发送 → 回答需求弹窗 → 收到方案自动保存提示 → 查看已保存方案 → 审阅并确认执行 | 消息实际经过 ChatGPT 网页；不需复制粘贴，采用方案不启动执行 |
| Chat 会话恢复 | 完成一次讨论 → 退出 Room → 重开同一任务的对话页 | 从已保存的 ChatGPT 会话 URL 读取实际网页消息；不重复发送已有消息 |
| Chat 异常处理 | 登录失效或页面不可用 → 查看 Room 提示 → 打开网页处理 → 返回 Room | 草稿保留；未确认发送时不自动重发；不会切换为 Codex |
| 提问与停止 | 对话中回答澄清；执行中点击停止，查看保留的改动；有实际 Question 时回答并继续 | 不重叠启动第二份执行；范围变化回方案，新 Run 保留旧记录 |
| Review 与交付 | 查看发现、未决问题、证据；存在 finding 时讨论修复方案；接受后预览提交/集成 | 接受与 Git 写操作分开；每次写操作先展示实际范围并由用户确认 |
| 项目与历史 | 两个项目切换；从其他项目待办进入；归档任务；按日期筛选并导出所选任务 | 定位对应任务；读取错误不显示为零任务；导出内容与选择一致 |
| 重启与后台 | 在列表滚动、修改外观、留下讨论草稿后明确退出并重开；点击窗口 ×，从托盘恢复 | 页面、筛选、滚动和讨论草稿恢复；窗口关闭不取消任务；退出时处理实际活动任务 |
| 缩放与键盘 | 1440×900、1000×700，Windows 125%/150%，浅色/深色；Tab、Esc 操作 | 窄窗口使用抽屉，关闭后焦点返回；输入不被导航丢弃，页面不横向溢出 |

自动化已覆盖独立进程的 125%/150% device scale 与 100%/125%/150% Renderer zoom；人工测试仍需确认本机实际显示器和输入体验。

截图中的 `electron.exe 0x80000003` 尚未复现，原因未确认。当前候选在应用数据目录保存 `service.log` 和本地 `crash-dumps/`，关闭崩溃上传。若再次发生，保留出错时正在执行的操作、时间、启动的 exe 路径、截图和该目录，后续按这些证据定位；现有通过记录不代表该异常已修复。

旧协议任务可只读浏览原 Task/Run/Question/Review；未转换为新的工作台任务，不改变其原执行入口和授权。实际登录流程由用户操作，自动验证只读取现有登录，没有替用户重新登录。

## 历史 Codex panel 交付（Superseded）

以下记录解释旧安装行为和迁移背景，不是当前安装说明；其中 Tauri/CDP 脚本不再用于独立 Electron。

Status: Superseded historical implementation. Owner: Local Codex. Scope: Windows local single-user integration. Historical verification: [native integration review](./ROOM_NATIVE_REVIEW.md), [Room UI review](./ROOM_UI_REVIEW.md).

Room uses one HTTP API for the React workbench, taskctl and the `room-ui` Codex Skill. Run `tools/room-desktop/install.ps1` after installing Node 24, Rust MSVC and Visual Studio C++ Build Tools. It builds the UI and launcher, installs the Skill and creates Desktop and Start menu **Codex** shortcuts. They invoke `Room.exe --codex` without a separate Tauri window and retain the installed Codex icon. Existing taskbar shortcuts targeting this Codex or launcher are updated; Codex++ is outside scope. Replaced shortcuts have `.room-backup` copies; the former project-owned Desktop Room shortcut moves to `.agent-room/desktop/Room.lnk.previous`.

The launcher starts the API on `127.0.0.1:4317`, imports the selected project's existing `.agent-room/runtime.json`, and starts the configured MCP server if needed. It stores only UI registry/configuration and logs under `.agent-room/`; RoomService retains SQLite state ownership. Closing the launcher or panel does not terminate a Run or delete data.

## Codex integration

The launcher uses the existing `%APPDATA%/Codex/web/Codex` profile with `--remote-debugging-port=9223 --remote-debugging-address=127.0.0.1`. A matching running debug instance is reused. A running non-debug instance returns `restart_required`: exit Codex normally, then reopen the installed Codex shortcut once. No independent profile is created. A foreign profile occupying 9223 is refused. The activated main window receives the same AppUserModel.ID as the shortcuts and a taskbar relaunch command pointing to this launcher. Direct original-executable launches and third-party shortcuts outside this installation are not covered.

The companion attaches only to the observed Codex `app://-/index.html` renderer. `Page.addScriptToEvaluateOnNewDocument` installs Room **below New conversation and above Pull Request**. Codex 26.924 renamed the former to **新聊天** and removed Pull Request from this sidebar; Room remains directly below 新聊天. The locator selects that conversation navigation rather than the separate global navigation. Its iframe fills the native main content surface; clicking another native sidebar item, including a task row with `role="button"`, closes Room. A DOM observer restores the entry after application rerenders; ResizeObserver aligns the content, and the companion reconnects when the renderer is replaced. No Codex source or app.asar is modified. This is a locally injected panel, not an official extension API; application updates may require selector changes.

UI visibility is stored in renderer local storage. Room uses top tabs with no second application sidebar or floating frame. Parent messages propagate actual Codex font, foreground, background and border tokens and light/dark theme; embedded Settings follows Codex, while standalone HTTP pages retain their own theme control. The Room URL must be local HTTP. Connection changes are logged in `.agent-room/cdp.log`; service output is in `ui.log` and `mcp.log`.

This build's app frame-src policy blocks the loopback iframe. The companion uses the renderer-scoped CDP `Page.setBypassCSP` override and reloads that renderer once on first attachment; subsequent document-start injections restore the panel. The debugging endpoint stays on loopback. The override does not change files or the Room API's request validation.

## Implementation references

Verification covers original-profile process startup after the user's restart, actual rendered iframe, all eight embedded pages, light/dark token propagation, native task navigation, renderer reload and Desktop/Start menu warm launches. Window taskbar properties were read back and match the installed launcher command and AppUserModel.ID. The prior automatic-approval startup rejection was not bypassed; after the user restarted and resumed, the normal launcher connected successfully. Detailed evidence and limits are in the current review.

- [Electron debugging switch](https://www.electronjs.org/docs/latest/api/command-line-switches)
- [CDP document-start API](https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-addScriptToEvaluateOnNewDocument)
- [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/)
- [Windows taskbar relaunch command](https://learn.microsoft.com/en-us/windows/win32/properties/props-system-appusermodel-relaunchcommand)
- [Windows window property store](https://learn.microsoft.com/en-us/windows/win32/api/shellapi/nf-shellapi-shgetpropertystoreforwindow)

The installed Codex build was observed as Chromium 153 with an `app://` renderer; the implementation relies on the observed CDP surface rather than assuming a particular Electron package layout.
