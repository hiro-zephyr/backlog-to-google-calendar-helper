(() => {
  const EDITOR_POLL_MS = 500;
  const CONTEXT_TTL_MS = 90 * 1000;
  const FAIL_TOAST_ID = 'backlog-gcal-helper-calendar-error-toast';
  const STYLE_ID = 'backlog-gcal-helper-calendar-style';

  let cachedContext = null;
  let observerStarted = false;
  let autofillFailureShown = false;
  let ttlClearTimer = null;

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${FAIL_TOAST_ID} {
        position: fixed;
        right: 16px;
        top: 16px;
        z-index: 2147483647;
        max-width: 360px;
        padding: 12px 14px;
        border-radius: 10px;
        background: rgba(32, 33, 36, .96);
        color: #fff;
        font-size: 12px;
        line-height: 1.55;
        box-shadow: 0 6px 16px rgba(0,0,0,.25);
        white-space: pre-wrap;
        word-break: break-word;
      }
    `;
    document.head.appendChild(style);
  }

  function showFailureToast(message, timeout = 4200) {
    addStyles();
    document.getElementById(FAIL_TOAST_ID)?.remove();
    const el = document.createElement('div');
    el.id = FAIL_TOAST_ID;
    el.textContent = message;
    document.body.appendChild(el);
    window.setTimeout(() => el.remove(), timeout);
  }

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function isExpiredContext(context) {
    if (!context?.savedAt) return true;
    const savedAtMs = Date.parse(context.savedAt);
    if (Number.isNaN(savedAtMs)) return true;
    return Date.now() - savedAtMs > CONTEXT_TTL_MS;
  }

  function scheduleContextClear(context) {
    if (!context?.savedAt) return;
    const savedAtMs = Date.parse(context.savedAt);
    if (Number.isNaN(savedAtMs)) return;

    const remainingMs = CONTEXT_TTL_MS - (Date.now() - savedAtMs);
    if (ttlClearTimer) {
      window.clearTimeout(ttlClearTimer);
      ttlClearTimer = null;
    }

    if (remainingMs <= 0) {
      void clearContext();
      return;
    }

    ttlClearTimer = window.setTimeout(() => {
      void clearContext();
    }, remainingMs);
  }

  function setCachedContext(context) {
    cachedContext = context || null;
    autofillFailureShown = false;
    if (context) {
      scheduleContextClear(context);
    } else if (ttlClearTimer) {
      window.clearTimeout(ttlClearTimer);
      ttlClearTimer = null;
    }
  }

  async function getContext() {
    if (cachedContext && !isExpiredContext(cachedContext)) {
      scheduleContextClear(cachedContext);
      return cachedContext;
    }

    if (cachedContext && isExpiredContext(cachedContext)) {
      await clearContext();
      return null;
    }

    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_ISSUE_CONTEXT' }, async (response) => {
        void chrome.runtime.lastError;
        const payload = response?.payload ?? null;
        if (!payload || isExpiredContext(payload)) {
          if (payload) {
            await clearContext();
          }
          resolve(null);
          return;
        }
        setCachedContext(payload);
        resolve(payload);
      });
    });
  }

  async function clearContext() {
    setCachedContext(null);
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'CLEAR_ISSUE_CONTEXT' }, () => {
        void chrome.runtime.lastError;
        resolve();
      });
    });
  }

  function triggerInputEvents(el) {
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: null }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function setNativeInputValue(input, value) {
    const prototype = Object.getPrototypeOf(input);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    if (descriptor?.set) {
      descriptor.set.call(input, value);
    } else {
      input.value = value;
    }
    triggerInputEvents(input);
  }

  function isEmptyInput(el) {
    return !String(el?.value || '').trim();
  }

  function isEmptyContentEditable(el) {
    const text = (el?.innerText || '').replace(/\s+/g, ' ').trim();
    return !text;
  }


  function getTabCandidates() {
    return [...document.querySelectorAll('[role="tab"], button, [role="button"]')]
      .filter((el) => el instanceof HTMLElement);
  }

  function getElementLabel(el) {
    if (!el) return '';
    return normalizeText([
      el.getAttribute('aria-label'),
      el.getAttribute('data-tooltip'),
      el.getAttribute('title'),
      el.textContent
    ].filter(Boolean).join(' '));
  }

  function isTaskTabSelected() {
    const taskTab = getTabCandidates().find((el) => /(^|\s)(タスク|Task)(\s|$)/i.test(getElementLabel(el)));
    if (!taskTab) return false;
    return taskTab.getAttribute('aria-selected') === 'true' ||
      taskTab.getAttribute('aria-pressed') === 'true' ||
      taskTab.classList.contains('selected') ||
      taskTab.classList.contains('is-selected');
  }

  function clickTaskTab() {
    const taskTab = getTabCandidates().find((el) => /(^|\s)(タスク|Task)(\s|$)/i.test(getElementLabel(el)));
    if (!taskTab) return false;
    if (isTaskTabSelected()) return true;
    taskTab.click();
    return true;
  }

  function getDescriptionValue(context) {
    if (context?.mode === 'task') {
      // Google ToDoの詳細欄はリッチテキストではないため、プレーンテキスト寄せにする。
      return [context.plainText, context.issueUrl].filter(Boolean).join('\n');
    }
    return context.html || context.plainText;
  }

  function findTitleInputs() {
    const selectors = [
      'input[aria-label="タイトル"]',
      'input[aria-label*="タイトル"]',
      'input[placeholder="タイトルを追加"]',
      'input[placeholder*="タイトル"]',
      'input[aria-label="Add title"]',
      'input[placeholder="Add title"]',
      'input[data-initial-title="false"]'
    ];
    return [...document.querySelectorAll(selectors.join(','))].filter((el) => el instanceof HTMLInputElement);
  }

  function findDescriptionEditors(context) {
    const selectors = [
      '[contenteditable="true"][aria-label="説明"]',
      '[contenteditable="true"][aria-label*="説明"]',
      '[contenteditable="true"][aria-label*="詳細"]',
      '[contenteditable="true"][aria-label="Description"]',
      '[contenteditable="true"][aria-label*="Description"]',
      '[contenteditable="true"][aria-label*="Details"]',
      'div[role="textbox"][contenteditable="true"][aria-label*="説明"]',
      'div[role="textbox"][contenteditable="true"][aria-label*="詳細"]',
      'div[role="textbox"][contenteditable="true"][aria-label*="Description"]',
      'div[role="textbox"][contenteditable="true"][aria-label*="Details"]'
    ];

    if (context?.mode === 'task') {
      selectors.push(
        'textarea[aria-label*="説明"]',
        'textarea[aria-label*="詳細"]',
        'textarea[aria-label*="Description"]',
        'textarea[aria-label*="Details"]',
        'textarea[placeholder*="説明"]',
        'textarea[placeholder*="詳細"]',
        'textarea[placeholder*="Description"]',
        'textarea[placeholder*="Details"]',
        'input[aria-label*="説明"]',
        'input[aria-label*="詳細"]',
        'input[aria-label*="Description"]',
        'input[aria-label*="Details"]'
      );
    }

    return [...document.querySelectorAll(selectors.join(','))]
      .filter((el) => el instanceof HTMLElement);
  }

  function clickTaskDetailsButton() {
    const candidates = [...document.querySelectorAll('button, [role="button"], div[role="button"]')]
      .filter((el) => el instanceof HTMLElement);

    const detailsButton = candidates.find((el) => {
      const label = getElementLabel(el);
      if (/保存しない|キャンセル|Cancel|Discard|閉じる|Close/i.test(label)) return false;
      return /(詳細を追加|説明を追加|メモを追加|Add details|Add description|Add note|Notes)/i.test(label);
    });

    if (!detailsButton) return false;
    detailsButton.click();
    return true;
  }

  function fillTitle(context) {
    const titleInputs = findTitleInputs();
    let filled = false;
    let usable = false;
    const contextId = context.contextId || 'legacy';

    for (const input of titleInputs) {
      if (input.dataset.backlogGcalAutofilled === contextId) {
        usable = true;
        continue;
      }
      if (!isEmptyInput(input)) {
        usable = true;
        continue;
      }
      setNativeInputValue(input, context.plainText);
      input.dataset.backlogGcalAutofilled = contextId;
      filled = true;
      usable = true;
    }
    return { filled, usable };
  }

  function fillDescription(context) {
    if (context.mode === 'task') {
      clickTaskDetailsButton();
    }

    const editors = findDescriptionEditors(context);
    let filled = false;
    let usable = false;
    const contextId = context.contextId || 'legacy';

    for (const editor of editors) {
      if (editor.dataset.backlogGcalAutofilled === contextId) {
        usable = true;
        continue;
      }

      const isFormField = editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement;
      const isEmpty = isFormField ? isEmptyInput(editor) : isEmptyContentEditable(editor);

      if (!isEmpty) {
        usable = true;
        continue;
      }

      editor.focus();
      const descriptionValue = getDescriptionValue(context);

      if (isFormField) {
        setNativeInputValue(editor, descriptionValue);
      } else if (context.mode === 'task') {
        editor.textContent = descriptionValue;
        triggerInputEvents(editor);
      } else {
        editor.innerHTML = descriptionValue;
        triggerInputEvents(editor);
      }

      editor.dataset.backlogGcalAutofilled = contextId;
      filled = true;
      usable = true;
    }
    return { filled, usable };
  }

  function editorIsOpen(context) {
    return findTitleInputs().length > 0 || findDescriptionEditors(context).length > 0;
  }

  async function tryAutoFillOpenEditor() {
    const context = await getContext();
    if (!context?.plainText) return;

    if (context.mode === 'task') {
      const taskTabFound = clickTaskTab();
      // タスクタブの描画を待つ。見つからない場合は通常入力にフォールバックする。
      if (taskTabFound && !isTaskTabSelected()) {
        return;
      }
    }

    const open = editorIsOpen(context);
    const titleResult = fillTitle(context);
    const descResult = fillDescription(context);
    const success = titleResult.filled || descResult.filled;
    const usable = titleResult.usable || descResult.usable;

    if (success) {
      autofillFailureShown = false;
      scheduleContextClear(context);
      return;
    }

    if (open && !usable && !autofillFailureShown) {
      autofillFailureShown = true;
      showFailureToast('自動入力に失敗しました。貼り付けてください');
    }
  }

  function getActionButton(target) {
    if (!(target instanceof Element)) return null;
    return target.closest('button, [role="button"], div[role="button"]');
  }

  function getButtonLabel(button) {
    if (!button) return '';
    return normalizeText([
      button.getAttribute('aria-label'),
      button.getAttribute('data-tooltip'),
      button.getAttribute('title'),
      button.textContent
    ].filter(Boolean).join(' '));
  }

  function isSaveButton(target) {
    const button = getActionButton(target);
    const label = getButtonLabel(button);
    if (!label) return false;
    if (/保存しない|キャンセル|Cancel|Discard|閉じる|Close/i.test(label)) return false;
    return /(^|\s)(保存|Save)(\s|$)/i.test(label);
  }

  function handleCalendarAction(event) {
    if (!cachedContext || isExpiredContext(cachedContext)) return;
    if (!isSaveButton(event.target)) return;

    window.setTimeout(() => {
      void clearContext();
    }, 1200);
  }

  function startEditorWatcher() {
    if (observerStarted) return;
    observerStarted = true;

    const throttled = (() => {
      let timer = null;
      return () => {
        if (timer) return;
        timer = window.setTimeout(async () => {
          timer = null;
          await tryAutoFillOpenEditor();
        }, 120);
      };
    })();

    const observer = new MutationObserver(() => {
      throttled();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.setInterval(() => { void tryAutoFillOpenEditor(); }, EDITOR_POLL_MS);
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes.backlogIssueContext) return;
    const nextValue = changes.backlogIssueContext.newValue ?? null;

    if (!nextValue || isExpiredContext(nextValue)) {
      setCachedContext(null);
      return;
    }

    setCachedContext(nextValue);
    void tryAutoFillOpenEditor();
  });

  document.addEventListener('pointerdown', handleCalendarAction, true);
  document.addEventListener('mousedown', handleCalendarAction, true);
  document.addEventListener('click', handleCalendarAction, true);

  window.setTimeout(() => {
    startEditorWatcher();
    void tryAutoFillOpenEditor();
  }, 600);
})();
