# 前端与 Electron Skill 工作流

> 状态：Current（开发工具与调用规则）；DESKTOP-01 已 Accepted，完整本地开发授权与实际实施状态见 [LOCAL_EXECUTION](../../work/wf-electron-task-workbench/LOCAL_EXECUTION.md)。
> 依据：用户 2026-10-11 提供的五项 Skill 配置方案；适用于 Codex 规划、授权 Worker 实现及 Review。

本指南服务于开发当前软件的过程，具体阶段映射见[开发方案 §5.1](../ADR/0007-electron-task-workbench.md#51-本次重构使用的开发-skill)。这些 Skill 不是 Room 应用功能或运行时依赖，不增加产品 Skill 管理界面，不随 Electron 安装包交付。

## 1. 安装与来源

五项 Skill 均为项目级实体文件，位于 `.agents/skills/`，不使用符号链接。首次使用时完整读取对应 `SKILL.md`，再按需要读取其 references/rules。无需同时调用全部 Skill。

| Skill 入口 | 上游与安装版本 | 用途 |
|---|---|---|
| [ui-ux-pro-max](../../../.agents/skills/ui-ux-pro-max/SKILL.md) | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)，官方 `ui-ux-pro-max-cli@2.15.0` bundled templates | 设计系统、布局、颜色、字体、UX |
| [frontend-design](../../../.agents/skills/frontend-design/SKILL.md) | [anthropics/skills](https://github.com/anthropics/skills/tree/dbd4588f9e1033efb41dad4bef2f7947c8993d44/skills/frontend-design)，ref `dbd4588f9e1033efb41dad4bef2f7947c8993d44` | 既定设计系统内的视觉与交互细化 |
| [vercel-react-best-practices](../../../.agents/skills/vercel-react-best-practices/SKILL.md) | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills/tree/063bee94c3f4df8453406c830b0a7df0f2860278/skills/react-best-practices)，ref `063bee94c3f4df8453406c830b0a7df0f2860278` | React 实现与性能 Review |
| [vercel-composition-patterns](../../../.agents/skills/vercel-composition-patterns/SKILL.md) | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills/tree/063bee94c3f4df8453406c830b0a7df0f2860278/skills/composition-patterns)，同上 ref | 有实际复杂度的组件组合、状态与 API |
| [playwright-cli](../../../.agents/skills/playwright-cli/SKILL.md) | [microsoft/playwright-cli](https://github.com/microsoft/playwright-cli/tree/b85c7a736bb473bf55b584e54a09ffa698d6d871/skills/playwright-cli)，ref `b85c7a736bb473bf55b584e54a09ffa698d6d871`；命令包 `@playwright/cli@0.1.22` | 浏览器交互、snapshot、截图和回归 |

直接仓库 Skill 使用 `skill-installer` 的 `install-skill-from-github.py`，指定上述 ref、源路径和 `--dest .agents/skills`；Vercel 两项用 `--name` 指定表内名称。UI/UX 使用 `npx.cmd --yes ui-ux-pro-max-cli@2.15.0 init --ai universal`，以生成统一 `.agents/skills/` 路径。该版本同时生成六个附带 Skill（banner-design、brand、design、design-system、slides、ui-styling），本项目不保留它们；更新时也只引入所需五项。

Playwright 命令通过固定版本 npm exec 缓存运行，不全局安装、不增加应用运行依赖。上游示例中的 `playwright-cli` 在本项目替换为：

```powershell
npx.cmd --yes --package=@playwright/cli@0.1.22 playwright-cli --help
```

下一轮 Codex 可发现项目 Skill；若界面目录未刷新，重新打开项目会话。其他 worktree 必须实际包含这些文件才能使用，不把当前未提交的安装当作已经传播。已有全局 `playwright` Skill 不覆盖；本流程明确选择项目 `playwright-cli`。

## 2. 权威与适用边界

用户明确要求、角色入口、PROJECT_RULES 与 Accepted Contract 决定工作范围。Skill 提供方法，不授权额外业务实现、Git 写入、对外发送、subagent 或新依赖。

本项目文档确定需求、接口与约束；成熟仓库、模块代码和外部文档用于参考实现与模块组织。设计资料和搜索输出不是新的需求来源。产品交互以[工作台方案](../ROOM_WORKBENCH_PRODUCT.md)和其确认状态为准。

本项目目标为独立 Electron + React/Vite。先读取实际 package.json 和相关代码；只应用匹配已安装版本的规则。跳过 Next.js、RSC、SSR、移动端 safe area/haptics 等不适用建议。不因 Skill 示例引入 Tailwind、图标库、SWR、GSAP 或跨 Electron/Tauri 的通用平台框架。

`frontend-design` 的营销首页、独特性与字体建议服从任务工作台的可读性、一致性和既定 tokens；不要据此增加 hero、虚构统计、无功能按钮。`ui-ux-pro-max` 的 mobile checklist 不能替代 Windows 桌面检查。

## 3. 调用顺序与交付

| 阶段 | 使用方式 | 本阶段产物与下一步 |
|---|---|---|
| 任务定义 | 读取项目需求、现有行为及 Accepted Contract；SDD 引用明确区分项目约束与外部参考 | 可观察的用户行为、边界和验收条件；原生 Plan 只帮助规划，不等于 TDD |
| 设计系统 | `ui-ux-pro-max`：新界面使用 design-system 搜索；局部问题只做一次聚焦搜索 | 布局、语义颜色、字体、间距、组件与状态规范；结果经产品适配后进入同一设计基准 |
| 视觉细化 | `frontend-design`：复用已确定 tokens 和组件，补齐按钮位置、反馈和流程去向 | loading/empty/error/disabled/success、焦点与键盘行为；不另立视觉体系 |
| 行为实现 | 授权 Worker 按下节 TDD；使用 `vercel-react-best-practices` 中适用规则 | 最小可运行行为和直接测试；不为了规则列表全仓重构 |
| 复杂组件 | 只有多 boolean props、共享状态或实际复用需求时读取 `vercel-composition-patterns` | 最小组件 API；简单组件不先建 Provider/通用组件库 |
| 验收 | `playwright-cli` 走真实浏览器路径；Electron 原生路径另测 | 测试命令、结果、必要截图与实际未覆盖项，进入现有 Review/acceptance 流程 |

设计搜索示例（标准库 Python，`-B` 避免缓存写入 Skill）：

```powershell
python -B .agents/skills/ui-ux-pro-max/scripts/search.py "desktop task workbench" --design-system -p "Agent Room"
python -B .agents/skills/ui-ux-pro-max/scripts/search.py "keyboard focus modal" --domain ux -n 1
```

搜索结果先判断是否适合桌面工作台，不直接作为批准设计。设计说明维护在 `docs/documents/`；若使用 `--persist`，指定 `--output-dir docs/documents`，将产生的设计文档登记索引，避免根目录出现第二套文档权威。

## 4. 任务驱动与 TDD 的实际执行

每个行为切片走 `Red → Green → Refactor`，两种产品入口共用此方法：

1. 从任务验收条件选择一个行为，例如“项目切换后任务列表属于新项目”。先写针对公开行为的测试，实际运行并确认因该行为缺失失败。依赖未装、编译失败、测试未被发现不能作为有效 Red。
2. 实现满足该断言的最小改动，运行同一测试得到 Green；不通过删除断言、放宽期望或伪造数据消除失败。
3. Green 后按需要整理组件/状态，保持行为不变，重跑受影响测试。没有实际重构需求可直接进入下个切片。
4. 完整候选形成后运行 Contract 规定的类型检查、构建及相关回归，再验证关键 UI 与原生路径。保存 Red/Green 的精确命令、退出状态及简要原因到现有交付记录，不另建测试台账框架。

纯布局、颜色和文案修改以视觉与操作验收为主，不编写复述 CSS 或源码字符串的测试。既有通过的检查，输入没变就不重复；每个检查必须能说明会发现什么失败、失败后改变什么决定。遵循 stop-that-shit 的范围约束。

## 5. Electron 工程与验收边界

- Main 管理窗口、原生对话框和本应用拥有的进程；Preload 用 typed `contextBridge` 暴露本阶段实际需要的窄 API；Renderer 负责 UI，不直接执行 Shell 或访问特权文件系统。
- 使用 `contextIsolation`、sandbox 与关闭 Renderer Node integration。对暴露的 IPC 校验输入与 sender；只实现当前公开入口需要的校验，依据实际 Electron 版本查阅[官方安全指南](https://www.electronjs.org/docs/latest/tutorial/security)。
- 原生能力沿用既有服务、Room 状态和协议所有权。不要用前端缓存制造另一份执行事实；保持用户输入，准确表达断线、错误、等待与重试。
- 覆盖 Contract 涉及的 Windows 窗口缩放、DPI、键盘焦点及主题状态；不新增未要求的平台支持。
- 浏览器验证应点击真实 UI 控件。Skill 中 WebMCP 快捷操作可用于辅助读取，但不能替代按钮和表单的验收路径。
- Electron 窗口、Preload/IPC、目录选择、托盘、退出/恢复与安装包独立启动，必须使用实际 Electron 进程及适当原生操作验证；浏览器 mock 通过不证明它们可用。需要自动化时参考[Electron 自动化测试文档](https://www.electronjs.org/docs/latest/tutorial/automated-testing)中的 Playwright Electron API。

Playwright 使用独立命名会话与临时测试数据，不接管用户日常浏览器，不连接旧 Codex CDP。以下仅是工具冒烟命令；实际 UI 验收替换为本次测试服务 URL：

```powershell
npx.cmd --yes --package=@playwright/cli@0.1.22 playwright-cli -s=room-ui-check open about:blank --browser=msedge
npx.cmd --yes --package=@playwright/cli@0.1.22 playwright-cli -s=room-ui-check snapshot
npx.cmd --yes --package=@playwright/cli@0.1.22 playwright-cli -s=room-ui-check close
```

截图与日志复用 Contract 的证据目录；不提交临时浏览器 profile。只关闭本次拥有的会话，不使用 `kill-all`。交付时明确区分工具冒烟、浏览器 UI、Electron 原生和安装包验证，未运行的项目如实说明。
