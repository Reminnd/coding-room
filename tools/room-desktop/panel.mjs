// Runs inside the Codex renderer; no dependency on Codex internals or source edits.
export function installRoomPanel({ url }) {
  if (window.__roomPanel?.status().url === url) return window.__roomPanel.status();
  window.__roomPanel?.remove();
  if (!document.documentElement) {
    document.addEventListener('DOMContentLoaded', () => installRoomPanel({ url }), { once: true });
    return { mounted: false, waitingForDocument: true };
  }
  const id = 'agent-room-sidebar-entry';
  let open = localStorage.getItem('agent-room-panel-open') === 'true';
  const host = document.createElement('div');
  host.id = 'agent-room-panel';
  host.style.cssText = 'position:fixed;z-index:10000;right:8px;bottom:8px;top:54px;left:260px;display:none;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = ':host{color-scheme:light dark}section{height:100%;display:flex;flex-direction:column;background:light-dark(#fff,#171717);border:1px solid light-dark(#dedede,#393939);border-radius:12px;overflow:hidden;box-shadow:0 12px 36px #0002}header{display:flex;align-items:center;gap:12px;padding:9px 14px;font:13px system-ui;color:light-dark(#222,#eee);border-bottom:1px solid light-dark(#eee,#333)}strong{flex:1}button{font:inherit;color:inherit;background:none;border:1px solid light-dark(#ddd,#555);border-radius:6px;padding:4px 10px;cursor:pointer}iframe{border:0;flex:1;width:100%;background:light-dark(#fafafa,#171717)}';
  const section = document.createElement('section');
  section.setAttribute('aria-label', 'Room 工作台');
  const header = document.createElement('header');
  const title = document.createElement('strong');
  title.textContent = 'Room';
  const reload = document.createElement('button');
  reload.textContent = '重新连接';
  const close = document.createElement('button');
  close.textContent = '关闭面板';
  const frame = document.createElement('iframe');
  frame.title = 'Room 工作台';
  frame.src = url;
  reload.addEventListener('click', () => { frame.src = url; });
  header.append(title, reload, close);
  section.append(header, frame);
  shadow.append(style, section);
  const button = document.createElement('button');
  button.id = id;
  button.type = 'button';
  button.setAttribute('aria-label', '打开 Room 工作台');
  button.style.cssText = 'display:flex;align-items:center;gap:10px;width:calc(100% - 20px);margin:2px 10px 8px;padding:9px 12px;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;flex-shrink:0;';
  button.textContent = '▦  Room';
  const position = () => {
    const sidebar = document.querySelector('aside.app-shell-left-panel') ?? document.querySelector('aside');
    const right = sidebar?.getBoundingClientRect().right ?? 0;
    host.style.left = `${Math.max(8, right + 8)}px`;
  };
  const setOpen = (value) => {
    open = value;
    host.style.display = open ? 'block' : 'none';
    button.style.background = open ? 'color-mix(in srgb, currentColor 9%, transparent)' : 'transparent';
    button.setAttribute('aria-expanded', String(open));
    localStorage.setItem('agent-room-panel-open', String(open));
    position();
  };
  button.addEventListener('click', () => setOpen(!open));
  close.addEventListener('click', () => setOpen(false));
  const mount = () => {
    if (!document.body) return;
    if (!host.isConnected) document.body.append(host);
    const nav = document.querySelector('aside nav');
    if (nav && !button.isConnected) nav.insertBefore(button, nav.children[1] ?? null);
    position();
  };
  const onNavigation = (event) => {
    if (event.target.closest?.('aside button, aside a') && !button.contains(event.target)) setOpen(false);
  };
  document.addEventListener('click', onNavigation);
  window.addEventListener('resize', position);
  let pending = false;
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    queueMicrotask(() => { pending = false; mount(); });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  mount();
  setOpen(open);
  window.__roomPanel = {
    open: () => setOpen(true),
    status: () => ({ mounted: button.isConnected, open, url }),
    remove: () => {
      observer.disconnect();
      document.removeEventListener('click', onNavigation);
      window.removeEventListener('resize', position);
      button.remove();
      host.remove();
      delete window.__roomPanel;
    },
  };
  return window.__roomPanel.status();
}

export function panelSource(url) {
  const parsed = new URL(url);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || parsed.protocol !== 'http:') {
    throw new Error('Room panel URL must use local HTTP');
  }
  return `(${installRoomPanel.toString()})(${JSON.stringify({ url: parsed.href })})`;
}
