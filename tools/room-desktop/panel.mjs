// Runs in the Codex renderer; the host owns navigation, geometry and theme.
export function installRoomPanel({ url }) {
  const version = 4;
  if (window.__roomPanel?.status().version === version && window.__roomPanel.status().url === url) return window.__roomPanel.status();
  window.__roomPanel?.remove();
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', () => installRoomPanel({ url }), { once: true });
    return { mounted: false, waitingForDocument: true };
  }
  let open = localStorage.getItem('agent-room-panel-open') === 'true';
  const frameUrl = new URL(url);
  frameUrl.searchParams.set('embedded', 'codex');
  const host = document.createElement('div');
  host.id = 'agent-room-panel';
  host.style.cssText = 'position:fixed;z-index:20;display:none;overflow:hidden;';
  const frame = document.createElement('iframe');
  frame.title = 'Room';
  frame.src = frameUrl.href;
  frame.style.cssText = 'display:block;width:100%;height:100%;border:0;';
  host.append(frame);
  const button = document.createElement('button');
  button.id = 'agent-room-sidebar-entry';
  button.type = 'button';
  button.setAttribute('aria-label', 'Room');
  button.innerHTML = '<span class="flex min-w-0 items-center text-base gap-2 flex-1 text-default"><span class="flex icon-leading-slot min-w-[var(--icon-leading-size)] shrink-0 items-center justify-center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 10h16M10 10v10"/></svg></span><span>Room</span></span>';
  const tokens = {
    '--bg': '--color-token-main-surface-primary', '--surface': '--color-token-main-surface-primary',
    '--surface-2': '--color-background-primary-soft-hover', '--line': '--color-border-primary-outline',
    '--text': '--color-text-primary-surface', '--muted': '--color-text-secondary-solid',
    '--accent': '--color-background-primary-solid', '--accent-text': '--color-text-primary-solid',
    '--accent-2': '--color-background-primary-soft-hover', '--font-family': '--font-sans-default',
  };
  const syncTheme = () => {
    const style = getComputedStyle(document.documentElement);
    const values = Object.fromEntries(Object.entries(tokens).map(([name, source]) => [name, style.getPropertyValue(source).trim()]).filter(([, value]) => value));
    frame.contentWindow?.postMessage({ type: 'room:host-theme', theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light', tokens: values }, frameUrl.origin);
    host.style.background = values['--bg'] || style.backgroundColor;
  };
  const position = () => {
    const surface = document.querySelector('main[class*="MainContentSurface"]');
    const rect = surface?.getBoundingClientRect();
    if (!rect) return;
    host.style.left = `${rect.left}px`;
    host.style.top = `${rect.top}px`;
    host.style.width = `${rect.width}px`;
    host.style.height = `${rect.height}px`;
  };
  const setOpen = (value) => {
    open = value;
    host.style.display = open ? 'block' : 'none';
    button.style.background = open ? 'var(--color-background-primary-soft-hover)' : '';
    button.setAttribute('aria-current', open ? 'page' : 'false');
    button.setAttribute('aria-expanded', String(open));
    localStorage.setItem('agent-room-panel-open', String(open));
    position();
    syncTheme();
  };
  button.addEventListener('click', () => setOpen(true));
  const resize = new ResizeObserver(position);
  let observedSurface;
  const mount = () => {
    if (!host.isConnected) document.body.append(host);
    const items = Array.from(document.querySelectorAll('aside nav button,aside nav a'));
    const newChat = items.find((item) => /^(新对话|新聊天|New chat|New conversation)$/.test(item.textContent.trim()));
    const nav = newChat?.closest('nav');
    const pullRequest = Array.from(nav?.querySelectorAll('button,a') ?? []).find((item) => /^Pull Requests?$/.test(item.textContent.trim()));
    if (pullRequest) {
      if (button.nextElementSibling !== pullRequest) pullRequest.parentElement.insertBefore(button, pullRequest);
      button.className = pullRequest.className;
    } else if (newChat) {
      const row = newChat.closest('[data-codex-tab-conversation-drop-target]') ?? newChat.parentElement.closest('.sidebar-item') ?? newChat;
      if (row.nextElementSibling !== button) row.after(button);
      button.className = `${newChat.className} hover:bg-primary-ghost-hover`;
    }
    button.style.width = '100%';
    button.style.height = 'var(--nav-item-height,var(--height-token-row))';
    button.style.flex = 'none';
    const surface = document.querySelector('main[class*="MainContentSurface"]');
    if (surface && surface !== observedSurface) { resize.disconnect(); resize.observe(surface); observedSurface = surface; }
    position();
  };
  const onNavigation = (event) => {
    if (event.target.closest?.('aside button,aside a,aside [role="button"],aside [role="link"]') && !button.contains(event.target)) setOpen(false);
  };
  const onMessage = (event) => { if (event.source === frame.contentWindow && event.origin === frameUrl.origin && event.data?.type === 'room:ready') syncTheme(); };
  document.addEventListener('click', onNavigation);
  window.addEventListener('message', onMessage);
  window.addEventListener('resize', position);
  frame.addEventListener('load', syncTheme);
  const observer = new MutationObserver(mount);
  observer.observe(document.body, { childList: true, subtree: true });
  const themeObserver = new MutationObserver(syncTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
  mount();
  setOpen(open);
  window.__roomPanel = {
    open: () => setOpen(true),
    status: () => ({ version, mounted: button.isConnected, open, url }),
    remove: () => {
      observer.disconnect(); themeObserver.disconnect(); resize.disconnect();
      document.removeEventListener('click', onNavigation);
      window.removeEventListener('message', onMessage);
      window.removeEventListener('resize', position);
      button.remove(); host.remove(); delete window.__roomPanel;
    },
  };
  return window.__roomPanel.status();
}

export function panelSource(url) {
  const parsed = new URL(url);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || parsed.protocol !== 'http:') throw new Error('Room panel URL must use local HTTP');
  return `(${installRoomPanel.toString()})(${JSON.stringify({ url: parsed.href })})`;
}
