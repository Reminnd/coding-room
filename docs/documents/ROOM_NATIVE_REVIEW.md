# Codex 原窗口 Room 集成 Review

状态：Approved。Owner/Reviewer：Local Codex，沿用用户持续交付授权。日期：2026-09-27。Baseline：`750de42`；变更与最终 CI 见 [PR #10](https://github.com/Reminnd/coding-room/pull/10)。本记录补充 UI v1 历史 Review。

## Findings

无未解决 blocking finding。真实运行发现并修复两项问题：

- `tools/room-desktop/panel.mjs` 的 `mount`：Codex 更新为 26.924 后存在 global navigation 与 Codex navigation，且原 Pull Request 行已移除。旧 `querySelector('aside nav')` 与单一 Pull Request anchor 导致 `mounted=false`。现在先定位“新对话 / 新聊天”的 navigation；存在 Pull Request 时插入其前，否则紧接新聊天完整行，继承原生行样式。当前实际入口高 30px，与新聊天同高、同左边界。
- 同文件的 `onNavigation`：新版任务行是 `div[role="button"]`，原生 button/a selector 无法关闭 Room。补充 role button/link 后，点击当前任务行确实关闭面板，再点 Room 可重新打开。

## Open questions

无范围内待决定事项。新版应用不再提供侧栏 Pull Request；保留“新聊天正下方”的位置，不伪造原生功能入口。

## Review decision

`approved`。本次操作面、原 profile 选择和启动入口符合用户确认的范围，不创建独立 Codex profile。未修改 Room protocol、SQLite authority 或 Codex 源码。

## Verification

- Windows 418/418 tests、TypeScript、Vite production build、Rust release build通过；DOM 修复后 focused launcher tests 3/3、diff check 通过。最终完整 CI 由 PR #10 对 exact candidate 执行。
- 用户从安装入口重启后的实际进程为 Codex `26.924.2738.0`，原 `%APPDATA%/Codex/web/Codex` profile，CDP 9223，只有一个 Codex 主进程。最初注入因上述 DOM 变化失败；修复后正常 launcher 返回 `connected`，实际 iframe 和截图显示完整 Room 页面。
- 实际 iframe 的八个顶部页签均可打开，embedded Settings 显示跟随 Codex。主内容区与 iframe 边界相同，不存在 Room 的第二套应用侧栏。
- 在真实 host renderer 临时切换 `data-theme`，验证 MutationObserver 向 iframe 传播 theme 和实际 tokens：dark 背景 `#181818`、light `#ffffff`，字体来自 host；随后恢复原 theme。该证据验证主题同步链路，并非模拟 Room 数据。
- 明确先打开 Room，再 reload renderer：入口仍恰好一个，version 4，`mounted=true`、`open=true`。点击原生任务行后 `open=false`，点击 Room 后恢复。
- 实际 Desktop、Start menu Codex shortcuts 热启动后，主进程仍为同一个 PID。真实主窗口 taskbar property store 读回 `AgentRoom.Codex`、`Room.exe --codex` relaunch command 与当前 Codex icon；没有另行执行 Windows taskbar 固定/取消固定操作。
- VS Code 按钮继续使用原已验收 API，参见 [UI v1 Review](./ROOM_UI_REVIEW.md)。本轮追加的 VS Code 点击与 raw launcher 联合命令被自动审批拒绝（`blocked by policy`），没有重试该命令或宣称本轮点击成功；本轮启动证据来自已成功的桌面/开始菜单入口。
- 真实 Room 仍为 DISCUSSION、零 Run；本轮未创建合成 Run 或修改生产 lifecycle。先前无法重启的阻塞在用户重启并继续后解除。
- `documentation: updated`：安装、位置、主题、运行限制、开发状态和目录已同步。既有 documentation-authoring guide 修改排除。经验：原生 app 更新后必须检查实际 navigation 和 role；单凭入口挂载或旧独立窗口的验证不能证明当前主窗口页面可用。

自动注入契约覆盖安装后的 Codex 快捷方式和对应 taskbar relaunch，不覆盖绕过 launcher 的原始 executable 或第三方 Codex++。CDP 注入依赖实际应用 DOM，后续应用更新可能需要适配。
