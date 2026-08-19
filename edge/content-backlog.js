(() => {
  if (window.__BACKLOG_GCAL_HELPER_LOADED__) return;
  window.__BACKLOG_GCAL_HELPER_LOADED__ = true;

  const TOAST_CLASS = 'backlog-gcal-helper-toast';
  const STYLE_ID = 'backlog-gcal-helper-style';

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${TOAST_CLASS} {
        position:fixed; right:20px; top:20px; z-index:2147483647;
        background:rgba(32,33,36,.96); color:#fff; padding:12px 14px;
        border-radius:10px; font-size:12px; line-height:1.55;
        box-shadow:0 6px 16px rgba(0,0,0,.2); max-width:420px;
        white-space:pre-wrap; word-break:break-word;
      }
      .${TOAST_CLASS}[data-kind="warn"] { background:rgba(191,144,0,.96); }
    `;
    document.head.appendChild(style);
  }
  function showToast(message, timeout=5000, kind='error') {
    addStyles();
    document.querySelectorAll(`.${TOAST_CLASS}`).forEach(el => el.remove());
    const toast = document.createElement('div');
    toast.className = TOAST_CLASS;
    toast.dataset.kind = kind;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), timeout);
  }
  function normalizeText(value) {
    return (value || '').replace(/\s+/g, ' ').trim();
  }
  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  function findIssueKey() {
    const m = location.pathname.match(/\/view\/([^/?#]+)/i);
    if (m?.[1]) return m[1];
    return document.body?.innerText?.match(/[A-Z][A-Z0-9_]+-\d+/)?.[0] || '';
  }
  function parseTitleFromDocumentTitle(issueKey) {
    const raw = normalizeText(document.title);
    const key = escapeRegExp(issueKey);
    for (const p of [
      new RegExp(`^\\[?${key}\\]?\\s+(.+?)\\s*(?:\\||-).*$`, 'i'),
      new RegExp(`^\\[?${key}\\]?\\s+(.+)$`, 'i')
    ]) {
      const candidate = normalizeText(raw.match(p)?.[1]);
      if (candidate) return candidate;
    }
    return '';
  }
  function findIssueTitle(issueKey) {
    const fromTitle = parseTitleFromDocumentTitle(issueKey);
    if (fromTitle) return fromTitle;
    const selectors = [
      '[data-testid="IssueSummary-text"]','[data-testid="IssueSummary"]',
      '.IssueSummary','.issue-summary','main h1','article h1'
    ];
    for (const selector of selectors) {
      const text = normalizeText(document.querySelector(selector)?.textContent);
      if (text && text !== issueKey) return text;
    }
    return '';
  }
  function buildHtml(key, title, url) {
    const esc = v => String(v).replaceAll('&','&amp;').replaceAll('<','&lt;')
      .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
    return `<a href="${esc(url)}">${esc(key)}</a>${title ? ` ${esc(title)}` : ''}`;
  }
  async function writeClipboard(plainText, html) {
    if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([new ClipboardItem({
        'text/plain': new Blob([plainText], {type:'text/plain'}),
        'text/html': new Blob([html], {type:'text/html'})
      })]);
    } else {
      await navigator.clipboard.writeText(plainText);
    }
  }
  async function prepare(mode) {
    const issueKey = findIssueKey();
    const issueTitle = findIssueTitle(issueKey);
    const issueUrl = location.href;
    const plainText = [issueKey, issueTitle].filter(Boolean).join(' ').trim();
    const html = buildHtml(issueKey, issueTitle, issueUrl);
    if (!issueKey || !plainText) throw new Error('課題キーまたは件名を取得できなかった');

    await writeClipboard(plainText, html);
    await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type:'SAVE_ISSUE_CONTEXT',
        payload:{ issueKey, issueTitle, issueUrl, plainText, html, mode }
      }, response => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!response?.ok) return reject(new Error('課題情報の保存に失敗した'));
        resolve();
      });
    });
    return {ok:true};
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'PING_BACKLOG_GCAL') {
      sendResponse({ok:true});
      return;
    }
    if (message?.type === 'PREPARE_BACKLOG_FOR_GCAL') {
      prepare(message.payload?.mode || 'calendar')
        .then(sendResponse)
        .catch(error => sendResponse({ok:false, error:String(error?.message || error)}));
      return true;
    }
    if (message?.type === 'SHOW_BACKLOG_GCAL_MESSAGE') {
      showToast(String(message.payload?.message || ''), 5000, message.payload?.kind || 'error');
      sendResponse({ok:true});
    }
  });
})();
