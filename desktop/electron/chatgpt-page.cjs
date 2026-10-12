// Runs in an isolated JavaScript world. Only accesses the visible webpage DOM.
function chatgptPage(action, expectedText) {
  const visible = element => element && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
  const find = selector => [...document.querySelectorAll(selector)].find(visible);
  const stop = find('[data-testid="stop-button"], button[aria-label="Stop streaming"], button[aria-label="停止流式传输"], button[aria-label="停止生成"], button[aria-label="停止"]');
  const send = find('[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label="Send message"], button[aria-label="发送消息"], button[aria-label="发送"]');
  // Logged-in ChatGPT can use a contenteditable composer without the public
  // landing page's IDs. Prefer the send button's form, then known composer IDs.
  const editors = [...document.querySelectorAll('textarea,[contenteditable]')].filter(element =>
    visible(element) && (element.tagName === 'TEXTAREA' || element.isContentEditable) &&
    !element.parentElement?.isContentEditable);
  const form = send?.closest('form');
  const formEditors = form ? editors.filter(element => form.contains(element)) : [];
  const known = editors.find(element => element.matches('#prompt-textarea, #mobile-composer-prompt') || element.closest('#prompt-textarea, #mobile-composer-prompt'));
  const editor = formEditors.length === 1 ? formEditors[0] : known ?? (editors.length === 1 ? editors[0] : null);
  if (action === 'diagnose') return {
    page: location.origin + location.pathname,
    selectedEditor: editor ? { tag: editor.tagName, id: editor.id } : null,
    sendButton: send ? { label: send.getAttribute('aria-label'), disabled: Boolean(send.disabled) } : null,
    messageNodes: [...document.querySelectorAll('main article, [data-turn], [data-message-author-role]')].map(element => ({
      tag: element.tagName, turn: element.getAttribute('data-turn'), author: element.getAttribute('data-message-author-role'),
      id: element.getAttribute('data-message-id') ?? element.id, textLength: element.textContent.length,
      hasMarkdown: Boolean(element.querySelector('.markdown')),
    })),
    // Actual signed-in layouts can omit the old message attributes entirely.
    // Capture structure, never message text, to locate their real containers.
    messageStructure: [...(document.querySelector('main, [role="main"]') ?? document.body).querySelectorAll('*')]
      .filter(element => ['DIV', 'SECTION', 'ARTICLE', 'P', 'PRE', 'CODE', 'SPAN', 'BUTTON', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(element.tagName))
      .map(element => ({ tag: element.tagName, id: element.id, class: element.className,
        role: element.getAttribute('role'), testId: element.getAttribute('data-testid'),
        parentTag: element.parentElement?.tagName, parentClass: element.parentElement?.className,
        childCount: element.children.length, textLength: element.textContent.length,
        label: /^(复制|复制回复|复制消息|Copy|Copy response|Read aloud|朗读|停止|发送)$/.test(element.getAttribute('aria-label') ?? '') ? element.getAttribute('aria-label') : null,
      })),
    controls: [...document.querySelectorAll('textarea,[contenteditable],button[aria-label],button[data-testid]')].map(element => ({
      tag: element.tagName, id: element.id, role: element.getAttribute('role'), label: element.getAttribute('aria-label'),
      testId: element.getAttribute('data-testid'), contenteditable: element.getAttribute('contenteditable'),
      visible: Boolean(visible(element)), disabled: Boolean(element.disabled),
    })),
    frameCount: document.querySelectorAll('iframe').length,
  };
  const login = [...document.querySelectorAll('button,a')].some(element => visible(element) && /^(登录|Log in|Sign in)$/.test(element.textContent.trim()));
  // innerText adds visual paragraph spacing; textContent loses block breaks.
  // Read editor lines instead, preserving actual empty paragraphs and spaces.
  function editorText(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    if (['BUTTON', 'SCRIPT', 'STYLE'].includes(node.tagName)) return '';
    if (node.tagName === 'BR') return node.classList.contains('ProseMirror-trailingBreak') ? '' : '\n';
    const children = [...node.childNodes];
    if (children.length === 1 && children[0].nodeName === 'BR') return '';
    const block = child => ['P', 'DIV'].includes(child.nodeName);
    return children.map((child, index) =>
      (index > 0 && (block(child) || block(children[index - 1])) ? '\n' : '') + editorText(child)).join('');
  }
  const input = () => editor?.value ?? (editor ? editorText(editor) : '');
  const normalize = text => text.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ');
  function markdown(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    if (['BUTTON', 'SCRIPT', 'STYLE'].includes(node.tagName)) return '';
    if (node.tagName === 'PRE' || [...node.classList].some(value => value.startsWith('CodeBlock-'))) {
      const code = node.querySelector('code') ?? node;
      let language = /language-([\w-]+)/.exec(code.className)?.[1] ?? node.getAttribute('data-language') ?? '';
      if (!language) {
        try { JSON.parse(code.textContent); language = 'json'; } catch { /* Non-JSON code stays unlabeled. */ }
      }
      return '\n\n```' + language + '\n' + code.textContent.trimEnd() + '\n```\n\n';
    }
    if (node.tagName === 'BR') return '\n';
    const content = [...node.childNodes].map(markdown).join('');
    if (/^H[1-6]$/.test(node.tagName)) return '\n\n' + '#'.repeat(Number(node.tagName[1])) + ' ' + content + '\n\n';
    if (node.tagName === 'LI') return '\n- ' + content.trim() + '\n';
    if (node.tagName === 'A') return '[' + content + '](' + node.getAttribute('href') + ')';
    if (node.tagName === 'TD' || node.tagName === 'TH') return content + '\t';
    return ['P', 'DIV', 'UL', 'OL', 'TR', 'BLOCKQUOTE'].includes(node.tagName) ? '\n' + content + '\n' : content;
  }
  if (action === 'focus') {
    if (login) throw new Error('请登录 ChatGPT 后继续讨论');
    if (!editor || editor.disabled) throw new Error('未找到可用聊天输入框，请打开网页检查');
    if (stop) throw new Error('ChatGPT 正在回复，请等待或停止生成');
    const draft = normalize(input());
    const roomDraft = draft.startsWith('[Room task context]\n') && draft.includes('\n[Room user message]\n');
    if (draft.trim() && !roomDraft) throw new Error('网页中有手动输入的草稿，请打开网页处理后再发送');
    editor.focus();
    if (draft === normalize(expectedText)) return 'reuse';
    // Replace a previous Room attempt through Chromium's editing pipeline so
    // the webpage's editor state receives the same input event as normal typing.
    if (editor.tagName === 'TEXTAREA') editor.select();
    else {
      const range = document.createRange(); range.selectNodeContents(editor);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    }
    return 'replace';
  }
  if (action === 'send') {
    if (normalize(input()) !== normalize(expectedText)) throw new Error('网页输入内容未完整写入，请打开网页检查');
    if (!send || send.disabled || send.getAttribute('aria-disabled') === 'true') return false;
    send.click(); return true;
  }
  if (action === 'stop') { if (!stop) throw new Error('网页当前没有可停止的回复'); stop.click(); return true; }
  const messageSelector = '[data-message-author-role], [data-turn="user"], [data-turn="assistant"], [class*="MarkdownRoot-"]';
  const messageElements = [...document.querySelectorAll(messageSelector)]
    .filter(element => !element.querySelector(messageSelector));
  const messages = messageElements.map((element, index) => {
    const owner = element.closest('[data-message-author-role], [data-turn="user"], [data-turn="assistant"]');
    const role = owner?.getAttribute('data-message-author-role') ?? owner?.getAttribute('data-turn') ?? (element.classList.contains('rich-text-user-turn') ? 'user' : 'assistant');
    const content = element.querySelector('.markdown') ?? element;
    const raw = role === 'user' ? editorText(element.querySelector('.whitespace-pre-wrap') ?? element) : markdown(content).trim();
    const marker = '\n[Room user message]\n';
    const text = role === 'user' && raw.startsWith('[Room task context]\n') && raw.includes(marker) ? raw.slice(raw.lastIndexOf(marker) + marker.length) : raw;
    return { id: (owner ?? element).getAttribute('data-message-id') ?? ((owner ?? element).id || `${role}-${index}`), role, text, raw };
  }).filter(message => ['user', 'assistant'].includes(message.role));
  const pageError = [...document.querySelectorAll('[role="alert"]')].filter(visible).map(element => element.innerText).filter(Boolean).join('\n');
  return { messages, composerEmpty: Boolean(editor && !input().trim()), generating: Boolean(stop), ready: Boolean(editor && !editor.disabled && !login),
    error: pageError || (login ? '请登录 ChatGPT 后继续讨论' : !editor ? editors.length > 1 ? '网页有多个可编辑区域，无法确定聊天输入框，请关闭网页中的搜索或编辑面板' : '未找到聊天输入框，请打开网页检查登录、验证提示或页面状态' : null) };
}
module.exports = { chatgptPage };
