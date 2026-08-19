(() => {
  if (window.__BACKLOG_GCAL_CALENDAR_LOADED__) return;
  window.__BACKLOG_GCAL_CALENDAR_LOADED__ = true;

  const TTL_MS = 90 * 1000;

  let processing = false;
  let queued = false;

  const consumedContextIds = new Set();

  const taskState = {
    contextId: null,
    taskTabClicked: false,
    detailsClicked: false
  };

  function resetTaskState(contextId) {
    taskState.contextId = contextId;
    taskState.taskTabClicked = false;
    taskState.detailsClicked = false;
  }

  function getContext() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'GET_ISSUE_CONTEXT' },
        (response) => resolve(response?.payload || null)
      );
    });
  }

  function consumeContext(contextId) {
    if (!contextId || consumedContextIds.has(contextId)) return;

    consumedContextIds.add(contextId);

    chrome.storage.local.remove(['backlogIssueContext'], () => {
      void chrome.runtime.lastError;
    });

    chrome.runtime.sendMessage(
      { type: 'CLEAR_ISSUE_CONTEXT' },
      () => void chrome.runtime.lastError
    );
  }

  function visible(element) {
    if (!element) return false;

    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);

    return rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden';
  }

  function normalize(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function textOf(element) {
    return normalize(
      element?.innerText ||
      element?.textContent ||
      element?.getAttribute?.('aria-label') ||
      element?.getAttribute?.('data-tooltip') ||
      ''
    );
  }

  function fieldText(element) {
    if (!element) return '';

    if (
      element.isContentEditable ||
      element.getAttribute('role') === 'textbox'
    ) {
      return normalize(
        (element.innerText || element.textContent || '')
          .replace(/\u200B/g, '')
      );
    }

    return normalize(element.value);
  }

  function fieldIsEmpty(element) {
    return !fieldText(element);
  }

  function clickElement(element) {
    if (!element) return false;

    try {
      element.focus({ preventScroll: true });
    } catch {}

    try {
      element.click();
      return true;
    } catch {}

    const rect = element.getBoundingClientRect();
    const options = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      button: 0,
      view: window
    };

    try {
      element.dispatchEvent(new PointerEvent('pointerdown', {
        ...options,
        buttons: 1
      }));
      element.dispatchEvent(new MouseEvent('mousedown', {
        ...options,
        buttons: 1
      }));
      element.dispatchEvent(new PointerEvent('pointerup', {
        ...options,
        buttons: 0
      }));
      element.dispatchEvent(new MouseEvent('mouseup', {
        ...options,
        buttons: 0
      }));
      element.dispatchEvent(new MouseEvent('click', options));
      return true;
    } catch {
      return false;
    }
  }

  function setNativeValue(element, value) {
    if (!element) return false;

    try {
      element.focus({ preventScroll: true });
    } catch {}

    const prototype = element.tagName === 'TEXTAREA'
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;

    const setter = Object.getOwnPropertyDescriptor(
      prototype,
      'value'
    )?.set;

    if (setter) setter.call(element, value);
    else element.value = value;

    element.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      composed: true,
      inputType: 'insertText',
      data: value
    }));

    element.dispatchEvent(new Event('change', {
      bubbles: true,
      composed: true
    }));

    return true;
  }

  function setEditableValue(element, plainText, html = null) {
    if (!element) return false;

    try {
      element.focus({ preventScroll: true });
    } catch {}

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);

    let inserted = false;

    if (html) {
      try {
        inserted = document.execCommand('insertHTML', false, html);
      } catch {}
    }

    if (!inserted) {
      try {
        inserted = document.execCommand('insertText', false, plainText);
      } catch {}
    }

    if (!inserted) {
      if (html) element.innerHTML = html;
      else element.textContent = plainText;
    }

    element.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      composed: true,
      inputType: 'insertText',
      data: plainText
    }));

    element.dispatchEvent(new Event('change', {
      bubbles: true,
      composed: true
    }));

    return true;
  }

  function findTab(root, pattern) {
    if (!root) return null;

    return [...root.querySelectorAll(
      '[role="tab"],button,[role="button"],div[role="tab"]'
    )].find((element) =>
      visible(element) && pattern.test(textOf(element))
    ) || null;
  }

  function findTitleInput(root) {
    if (!root) return null;

    const selectors = [
      'input[placeholder*="タイトル"]',
      'input[placeholder*="件名"]',
      'input[aria-label*="タイトル"]',
      'input[aria-label*="件名"]',
      'input[placeholder*="title" i]',
      'input[aria-label*="title" i]'
    ];

    for (const selector of selectors) {
      const element = [...root.querySelectorAll(selector)].find(visible);
      if (element) return element;
    }

    return null;
  }

  function findCreationDialog() {
    const titleInputs = [...document.querySelectorAll(
      'input[placeholder*="タイトル"],' +
      'input[placeholder*="件名"],' +
      'input[aria-label*="タイトル"],' +
      'input[aria-label*="件名"],' +
      'input[placeholder*="title" i],' +
      'input[aria-label*="title" i]'
    )].filter(visible);

    for (const title of titleInputs) {
      let current = title.parentElement;

      while (current && current !== document.body) {
        const eventTab = findTab(current, /^(予定|Event)$/i);
        const taskTab = findTab(current, /^(タスク|Task)$/i);

        if (eventTab && taskTab) return current;
        current = current.parentElement;
      }
    }

    return null;
  }

  function findCalendarDescription(root) {
    const selectors = [
      '[contenteditable="true"][aria-label*="説明"]',
      '[contenteditable="true"][aria-label*="description" i]',
      '[contenteditable="true"][data-placeholder*="説明"]',
      '[contenteditable="true"][data-placeholder*="description" i]',
      'textarea[aria-label*="説明"]',
      'textarea[placeholder*="説明"]',
      'textarea[aria-label*="description" i]',
      'textarea[placeholder*="description" i]'
    ];

    for (const selector of selectors) {
      const element = [...root.querySelectorAll(selector)].find(visible);
      if (element) return element;
    }

    return null;
  }

  function findSmallestByText(root, patterns) {
    const candidates = [...root.querySelectorAll(
      'button,[role="button"],[tabindex],span,div'
    )].filter((element) => {
      if (!visible(element)) return false;
      const text = textOf(element);
      return patterns.some((pattern) => pattern.test(text));
    });

    candidates.sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return (leftRect.width * leftRect.height) -
        (rightRect.width * rightRect.height);
    });

    const item = candidates[0];

    return item?.closest(
      'button,[role="button"],[tabindex="0"]'
    ) || item || null;
  }

  function findCalendarDescriptionOpener(dialog) {
    return findSmallestByText(dialog, [
      /説明または\s*Google\s*ドライブの添付ファイルを追加/,
      /^説明を追加$/,
      /Add description or attachments/i,
      /^Add description$/i
    ]);
  }

  function findTaskDetailsOpener(dialog) {
    if (!dialog) return null;

    // Actual Google Calendar DOM used by the Task details opener:
    // <button ...>
    //   <span data-key="description">説明</span>
    //   または
    //   <span data-key="attachments">Google ドライブの添付ファイル</span>
    //   を追加
    // </button>
    //
    // aria-expanded is not reliable here: it can remain "false" even after
    // the panel opens, so do not use it as an open/closed condition.
    const descriptionLabel = [
      ...dialog.querySelectorAll('span[data-key="description"]')
    ].find(visible);

    const button = descriptionLabel?.closest('button') || null;

    if (button && visible(button)) {
      return button;
    }

    return null;
  }

  function findTaskDetails(dialog, title) {
    if (!dialog) return null;

    const selectors = [
      'textarea[placeholder*="詳細"]',
      'textarea[aria-label*="詳細"]',
      '[role="textbox"][aria-label*="詳細"]',
      '[role="textbox"][data-placeholder*="詳細"]',
      '[contenteditable="true"][aria-label*="詳細"]',
      '[contenteditable="plaintext-only"][aria-label*="詳細"]',
      'textarea[placeholder*="details" i]',
      'textarea[aria-label*="details" i]',
      '[role="textbox"][aria-label*="details" i]',
      '[role="textbox"][data-placeholder*="details" i]',
      '[contenteditable="true"][aria-label*="details" i]',
      '[contenteditable="plaintext-only"][aria-label*="details" i]'
    ];

    for (const selector of selectors) {
      const element = [...dialog.querySelectorAll(selector)].find(visible);
      if (element) return element;
    }

    const active = document.activeElement;

    if (
      active &&
      dialog.contains(active) &&
      active !== title &&
      (
        active.matches?.(
          'textarea,[role="textbox"],' +
          '[contenteditable="true"],' +
          '[contenteditable="plaintext-only"]'
        )
      )
    ) {
      const label = normalize([
        active.getAttribute('aria-label'),
        active.getAttribute('placeholder'),
        active.getAttribute('data-placeholder')
      ].filter(Boolean).join(' '));

      if (!/検索|search|タイトル|件名|title|ゲスト|guest/i.test(label)) {
        return active;
      }
    }

    return null;
  }

  function writeTaskUrl(details, url) {
    if (
      details.isContentEditable ||
      details.getAttribute('contenteditable') === 'plaintext-only' ||
      (
        details.getAttribute('role') === 'textbox' &&
        !('value' in details)
      )
    ) {
      return setEditableValue(details, url);
    }

    return setNativeValue(details, url);
  }

  function fillCalendar(context, dialog) {
    const title = findTitleInput(dialog);
    if (!title) return false;

    if (fieldIsEmpty(title)) {
      setNativeValue(title, context.plainText);
    }

    let description = findCalendarDescription(dialog);

    if (!description) {
      const opener = findCalendarDescriptionOpener(dialog);

      if (opener) {
        clickElement(opener);
      }

      return false;
    }

    if (fieldIsEmpty(description)) {
      if (
        description.isContentEditable ||
        description.getAttribute('role') === 'textbox'
      ) {
        setEditableValue(
          description,
          `${context.plainText}\n${context.issueUrl}`,
          context.html
        );
      } else {
        setNativeValue(
          description,
          `${context.plainText}\n${context.issueUrl}`
        );
      }
    }

    const complete =
      fieldText(title).includes(context.plainText) &&
      fieldText(description).includes(context.issueKey);

    if (complete) {
      consumeContext(context.contextId);
    }

    return complete;
  }

  function fillTask(context, dialog) {
    if (taskState.contextId !== context.contextId) {
      resetTaskState(context.contextId);
    }

    // Task mode always performs exactly one Task-tab click.
    // No Event/Task UI inference is used.
    if (!taskState.taskTabClicked) {
      const taskTab = findTab(dialog, /^(タスク|Task)$/i);

      if (!taskTab) return false;

      taskState.taskTabClicked = true;
      clickElement(taskTab);
      return false;
    }

    const title = findTitleInput(dialog);

    if (title && fieldIsEmpty(title)) {
      setNativeValue(title, context.plainText);
    }

    const opener = findTaskDetailsOpener(dialog);

    if (opener && !taskState.detailsClicked) {
      taskState.detailsClicked = true;
      clickElement(opener);
      return false;
    }

    const details = findTaskDetails(dialog, title);

    if (!details) return false;

    if (!fieldText(details).includes(context.issueUrl)) {
      writeTaskUrl(details, context.issueUrl);
    }

    const complete =
      Boolean(title) &&
      fieldText(title).includes(context.plainText) &&
      fieldText(details).includes(context.issueUrl);

    if (complete) {
      consumeContext(context.contextId);
    }

    return complete;
  }

  async function processDialog() {
    if (processing) {
      queued = true;
      return;
    }

    processing = true;

    try {
      const context = await getContext();

      if (!context?.savedAt) return;
      if (consumedContextIds.has(context.contextId)) return;

      if (Date.now() - context.savedAt > TTL_MS) {
        consumeContext(context.contextId);
        return;
      }

      const dialog = findCreationDialog();
      if (!dialog) return;

      if ((context.mode || 'calendar') === 'task') {
        fillTask(context, dialog);
      } else {
        fillCalendar(context, dialog);
      }
    } finally {
      processing = false;

      if (queued) {
        queued = false;
        queueMicrotask(processDialog);
      }
    }
  }

  const observer = new MutationObserver(() => {
    queueMicrotask(processDialog);
  });

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [
      'aria-label',
      'aria-selected',
      'aria-expanded',
      'placeholder',
      'data-placeholder',
      'contenteditable',
      'role'
    ]
  });

  setInterval(processDialog, 200);
  processDialog();
})();
