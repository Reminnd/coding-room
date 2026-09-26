# Room desktop and Codex panel

Status: implementation candidate. Windows, local single-user operation.

Room uses one HTTP API for the React workbench, taskctl and the `room-ui` Codex Skill. The Tauri executable is a small local launcher. Run `tools/room-desktop/install.ps1` once after installing Node 24, Rust MSVC and Visual Studio C++ Build Tools. It builds the UI and launcher, installs the Skill and creates a Desktop `Room` shortcut. Subsequent launches require no terminal.

The launcher starts the API on `127.0.0.1:4317`, imports the selected project's existing `.agent-room/runtime.json`, and starts the configured MCP server if needed. It stores only UI registry/configuration and logs under `.agent-room/`; RoomService retains SQLite state ownership. Closing the launcher or panel does not terminate a Run or delete data.

## Codex integration

The launcher connects to a loopback CDP endpoint on port 9223. When the current instance has no debugging endpoint, it starts the installed Codex executable with a dedicated browser profile and `--remote-debugging-port=9223 --remote-debugging-address=127.0.0.1`. This can create another Codex window; it does not restart or replace an active non-debug instance.

The companion attaches only to the observed Codex `app://-/index.html` renderer. `Page.addScriptToEvaluateOnNewDocument` installs an isolated Room iframe panel and a clickable entry in the Codex sidebar. A DOM observer restores the entry after application rerenders; the local companion reconnects when the renderer is replaced. No Codex source or app.asar is modified. This is a locally injected native-looking panel, not an official native extension API. App updates may change the sidebar DOM; if attachment fails, the launcher reports it and the same UI remains usable in Codex's built-in browser.

UI visibility is stored in the Codex renderer's local storage. The panel has reconnect and close controls. The current Room URL must be local HTTP. The companion logs connection changes in `.agent-room/cdp.log`; service output is in `ui.log` and `mcp.log`.

## Implementation references

- [Electron debugging switch](https://www.electronjs.org/docs/latest/api/command-line-switches)
- [CDP document-start API](https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-addScriptToEvaluateOnNewDocument)
- [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/)

The installed Codex build was observed as Chromium 153 with an `app://` renderer; the implementation relies on the observed CDP surface rather than assuming a particular Electron package layout.
