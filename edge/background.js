const CALENDAR_URL = 'https://calendar.google.com/calendar/u/0/r';

async function focusOrOpenCalendarWindow() {
  const existingTabs = await chrome.tabs.query({ url: ['https://calendar.google.com/*'] });
  if (existingTabs.length > 0) {
    const calendarTab = existingTabs[0];
    if (calendarTab.windowId) await chrome.windows.update(calendarTab.windowId, { focused: true });
    if (calendarTab.id) await chrome.tabs.update(calendarTab.id, { active: true });
    return;
  }
  await chrome.windows.create({
    url: CALENDAR_URL,
    type: 'popup',
    width: 980,
    height: 820,
    focused: true
  });
}

function isBacklogDomain(url = '') {
  return /^https:\/\/.+\.backlog\.(com|jp)\//i.test(url);
}
function isBacklogIssueUrl(url = '') {
  return /^https:\/\/.+\.backlog\.(com|jp)\/view\/[^/?#]+/i.test(url);
}

function injectToast(message, kind = 'error') {
  const STYLE_ID = 'backlog-gcal-helper-inline-style';
  const TOAST_ID = 'backlog-gcal-helper-inline-toast';
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${TOAST_ID} {
        position: fixed; right: 20px; top: 20px; z-index: 2147483647;
        background: rgba(32,33,36,.96); color:#fff; padding:12px 14px;
        border-radius:10px; font-size:12px; line-height:1.55;
        box-shadow:0 6px 16px rgba(0,0,0,.2); max-width:420px;
        white-space:pre-wrap; word-break:break-word;
      }
      #${TOAST_ID}[data-kind="warn"] { background:rgba(191,144,0,.96); }
    `;
    document.head.appendChild(style);
  }
  document.getElementById(TOAST_ID)?.remove();
  const toast = document.createElement('div');
  toast.id = TOAST_ID;
  toast.dataset.kind = kind;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

function notifyTab(tabId, message, kind = 'error') {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, {
    type: 'SHOW_BACKLOG_GCAL_MESSAGE',
    payload: { message, kind }
  }, () => {
    if (!chrome.runtime.lastError) return;
    chrome.scripting.executeScript({
      target: { tabId },
      func: injectToast,
      args: [message, kind]
    }, () => void chrome.runtime.lastError);
  });
}

async function ensureBacklogContentScript(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'PING_BACKLOG_GCAL' }, async (response) => {
      if (!chrome.runtime.lastError && response?.ok) {
        resolve(true);
        return;
      }
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content-backlog.js']
        });
        resolve(true);
      } catch {
        resolve(false);
      }
    });
  });
}

async function prepareFromTab(tab, mode) {
  if (!tab?.id) return;
  if (!isBacklogDomain(tab.url || '')) {
    notifyTab(tab.id, 'Backlog課題ページで起動してください');
    return;
  }
  if (!isBacklogIssueUrl(tab.url || '')) {
    notifyTab(tab.id, '課題詳細ページで起動してください');
    return;
  }

  const ready = await ensureBacklogContentScript(tab.id);
  if (!ready) {
    notifyTab(tab.id, '課題ページとの接続に失敗しました。ページを再読み込みしてください。');
    return;
  }

  chrome.tabs.sendMessage(tab.id, {
    type: 'PREPARE_BACKLOG_FOR_GCAL',
    payload: { mode }
  }, async (response) => {
    if (chrome.runtime.lastError || !response?.ok) {
      const detail = response?.error || chrome.runtime.lastError?.message || '不明なエラー';
      notifyTab(tab.id, `課題キー、URLのコピーに失敗しました。\n手動でコピーしてください。\n\n${detail}`);
      return;
    }
    try {
      await focusOrOpenCalendarWindow();
    } catch (error) {
      notifyTab(tab.id, `カレンダーが開けませんでした。\n手動で開き直してください。\n\n${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

chrome.action.onClicked.addListener(async (tab) => {
  await prepareFromTab(tab, 'calendar');
});

chrome.commands.onCommand.addListener(async (command) => {
  const mode = command === 'open-backlog-to-task'
    ? 'task'
    : command === 'open-backlog-to-calendar'
      ? 'calendar'
      : null;
  if (!mode) return;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab) await prepareFromTab(tab, mode);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'SAVE_ISSUE_CONTEXT') {
    chrome.storage.local.set({
      backlogIssueContext: {
        ...message.payload,
        contextId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        savedAt: Date.now()
      }
    }, () => sendResponse({ ok: !chrome.runtime.lastError }));
    return true;
  }
  if (message?.type === 'GET_ISSUE_CONTEXT') {
    chrome.storage.local.get(['backlogIssueContext'], (result) => {
      sendResponse({ ok: true, payload: result.backlogIssueContext ?? null });
    });
    return true;
  }
  if (message?.type === 'CLEAR_ISSUE_CONTEXT') {
    chrome.storage.local.remove(['backlogIssueContext'], () => sendResponse({ ok: true }));
    return true;
  }
});
