/** Shared helpers for practice page extension smoke tests. */

export async function selectPracticeKey(page, selector, key) {
  await page.evaluate(({ selector: sel, key: k }) => {
    const root = document.querySelector(sel);
    if (!root) return;
    const isInput = root instanceof HTMLTextAreaElement || root instanceof HTMLInputElement;
    const text = isInput ? root.value : (root.innerText || root.textContent || '');
    const start = text.indexOf(k);
    root.focus();
    if (isInput) {
      if (start >= 0) root.setSelectionRange(start, start + k.length);
      return;
    }
    if (start < 0) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let pos = 0;
    let node = walker.nextNode();
    while (node) {
      const len = node.textContent.length;
      if (pos + len > start) {
        const range = document.createRange();
        const offset = start - pos;
        range.setStart(node, offset);
        range.setEnd(node, Math.min(len, offset + k.length));
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        root.dispatchEvent(new Event('select', { bubbles: true }));
        return;
      }
      pos += len;
      node = walker.nextNode();
    }
  }, { selector, key });
}

export async function assertPracticeRedactedLink(page, selector, practiceKey, label) {
  const compose = page.locator(selector);
  const body = await compose.innerText();
  if (!body.includes('[redacted]') || body.includes(practiceKey)) {
    throw new Error(`${label}: expected [redacted] without key`);
  }
  const link = compose.locator('a.gst-redacted, a[href*="unlock"]');
  if (await link.count() === 0) {
    throw new Error(`${label}: [redacted] is plain text — expected clickable unlock link`);
  }
  const href = await link.first().getAttribute('href');
  if (!href || !/unlock/i.test(href)) {
    throw new Error(`${label}: unlock link href missing (${href || 'none'})`);
  }
}
