(() => {
  if (window.__backlogGcalHelperLoaded) return;
  window.__backlogGcalHelperLoaded = true;

  const TOAST_CLASS = 'backlog-gcal-helper-toast';
  const STYLE_ID = 'backlog-gcal-helper-style';

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${TOAST_CLASS} {
        position: fixed;
        right: 20px;
        top: 20px;
        z-index: 2147483647;
        background: rgba(32, 33, 36, .96);
        color: #fff;
        padding: 12px 14px;
        border-radius: 10px;
        font-size: 12px;
        line-height: 1.55;
        box-shadow: 0 6px 16px rgba(0, 0, 0, .2);
        max-width: 420px;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .${TOAST_CLASS}[data-kind="warn"] {
        background: rgba(191, 144, 0, .96);
        color: #fff;
      }
    `;
    document.head.appendChild(style);
  }

  function showToast(message, timeout = 4200, kind = 'error') {
    addStyles();
    document.querySelectorAll(`.${TOAST_CLASS}`).forEach((el) => el.remove());
    const toast = document.createElement('div');
    toast.className = TOAST_CLASS;
    toast.dataset.kind = kind;
    toast.textContent = message;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), timeout);
  }

  function findIssueKey() {
    const urlMatch = location.pathname.match(/\/view\/([^/?#]+)/i);
    if (urlMatch?.[1]) return urlMatch[1];

    const bodyText = document.body?.innerText ?? '';
    const textMatch = bodyText.match(/[A-Z][A-Z0-9_]+-\d+/);
    return textMatch?.[0] ?? '';
  }

  function normalizeText(value) {
    return (value || '').replace(/\s+/g, ' ').trim();
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function parseTitleFromDocumentTitle(issueKey) {
    const raw = normalizeText(document.title || '');
    if (!raw || !issueKey) return '';

    const escapedKey = escapeRegExp(issueKey);
    const patterns = [
      new RegExp(`^\\[?${escapedKey}\\]?\\s+(.+?)\\s*(?:\\||-).*$`, 'i'),
      new RegExp(`^\\[?${escapedKey}\\]?\\s+(.+)$`, 'i')
    ];

    for (const pattern of patterns) {
      const match = raw.match(pattern);
      const candidate = normalizeText(match?.[1] || '');
      if (candidate) return candidate;
    }

    return '';
  }

  function findIssueTitle(issueKey) {
    const titleFromDoc = parseTitleFromDocumentTitle(issueKey);
    if (titleFromDoc) return titleFromDoc;

    const keyAnchor = issueKey
      ? document.querySelector(`a[href*="/view/${CSS.escape(issueKey)}"], [href$="/view/${CSS.escape(issueKey)}"]`)
      : null;

    if (keyAnchor) {
      const parent = keyAnchor.closest('div, section, article, header') || keyAnchor.parentElement;
      const texts = [
        keyAnchor.nextElementSibling?.textContent,
        parent?.querySelector('h1, h2, [data-testid="IssueSummary-text"], [data-testid="IssueSummary"], .IssueSummary, .issue-summary')?.textContent
      ].map(normalizeText).filter(Boolean);

      for (const candidate of texts) {
        if (candidate && candidate !== issueKey) return candidate;
      }
    }

    const selectors = [
      '[data-testid="IssueSummary-text"]',
      '[data-testid="IssueSummary"]',
      '.IssueSummary',
      '.issue-summary',
      'main h1',
      'article h1'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      const text = normalizeText(el?.textContent);
      if (text && text !== issueKey) return text;
    }

    return '';
  }

  function buildPlainText(issueKey, issueTitle) {
    return [issueKey, issueTitle].filter(Boolean).join(' ').trim();
  }

  function buildHtml(issueKey, issueTitle, issueUrl) {
    const esc = (value) => value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');

    const safeKey = esc(issueKey);
    const safeTitle = esc(issueTitle);
    const safeUrl = esc(issueUrl);
    return `<a href="${safeUrl}">${safeKey}</a>${safeTitle ? ` ${safeTitle}` : ''}`;
  }

  async function writeClipboard(plainText, html) {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      await navigator.clipboard.writeText(plainText);
      return { rich: false };
    }

    const item = new ClipboardItem({
      'text/plain': new Blob([plainText], { type: 'text/plain' }),
      'text/html': new Blob([html], { type: 'text/html' })
    });
    await navigator.clipboard.write([item]);
    return { rich: true };
  }

  async function prepare(mode = 'calendar') {
    const issueKey = findIssueKey();
    const issueTitle = findIssueTitle(issueKey);
    const issueUrl = location.href;
    const plainText = buildPlainText(issueKey, issueTitle);
    const html = buildHtml(issueKey, issueTitle, issueUrl);

    if (!issueKey || !plainText) {
      throw new Error('課題キーまたは件名を取得できなかった');
    }

    await writeClipboard(plainText, html);

    await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'SAVE_ISSUE_CONTEXT',
        payload: { issueKey, issueTitle, issueUrl, plainText, html, mode }
      }, (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        if (!response?.ok) {
          reject(new Error('課題情報の保存に失敗した'));
          return;
        }
        resolve();
      });
    });

    return { ok: true, plainText, mode };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'PING_BACKLOG_GCAL') {
      sendResponse({ ok: true });
      return false;
    }

    if (message?.type === 'PREPARE_BACKLOG_FOR_GCAL') {
      prepare(message.mode || 'calendar')
        .then((payload) => sendResponse(payload))
        .catch((error) => {
          console.error('[Backlog GCal Helper] failed:', error);
          sendResponse({ ok: false, error: String(error?.message || error) });
        });
      return true;
    }

    if (message?.type === 'SHOW_BACKLOG_GCAL_MESSAGE') {
      const text = String(message.payload?.message || '');
      if (text) {
        showToast(text, 5000, message.payload?.kind || 'error');
      }
      sendResponse({ ok: true });
    }
  });
})();
