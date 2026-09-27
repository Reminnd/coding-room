import { useEffect } from 'react';

export const embedded = window.parent !== window && new URLSearchParams(location.search).get('embedded') === 'codex';

export function useHostTheme(theme: string) {
  useEffect(() => {
    if (!embedded) { document.documentElement.dataset.theme = theme; return; }
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent || event.data?.type !== 'room:host-theme') return;
      document.documentElement.dataset.theme = event.data.theme === 'dark' ? 'dark' : 'light';
      for (const name of ['--bg', '--surface', '--surface-2', '--line', '--text', '--muted', '--accent', '--accent-text', '--accent-2', '--font-family']) {
        if (typeof event.data.tokens?.[name] === 'string') document.documentElement.style.setProperty(name, event.data.tokens[name]);
      }
    };
    window.addEventListener('message', receive);
    window.parent.postMessage({ type: 'room:ready' }, '*');
    return () => window.removeEventListener('message', receive);
  }, [theme]);
}
