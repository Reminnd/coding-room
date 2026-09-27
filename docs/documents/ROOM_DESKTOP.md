# Room desktop and Codex panel

Status: Runtime verified. Owner: Local Codex. Scope: Windows local single-user integration. Current verification: [native integration review](./ROOM_NATIVE_REVIEW.md). Previous delivery evidence: [Room UI review](./ROOM_UI_REVIEW.md).

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
