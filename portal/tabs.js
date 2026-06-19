/**
 * Lightweight tab panels for portal console pages (admin, etc.).
 */
(function (global) {
  function init(root, { defaultTab, storageKey, onChange } = {}) {
    if (!root) return null;
    const tablist = root.querySelector('[role="tablist"]');
    if (!tablist) return null;

    const tabs = [...tablist.querySelectorAll('[role="tab"]')];
    const panels = [...root.querySelectorAll('[role="tabpanel"]')];
    const key = storageKey || (root.id ? `veil-tab:${root.id}` : null);

    function select(id) {
      if (!id) return;
      for (const tab of tabs) {
        const active = tab.dataset.tab === id;
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
        tab.tabIndex = active ? 0 : -1;
      }
      for (const panel of panels) {
        const active = panel.dataset.panel === id;
        panel.hidden = !active;
        panel.setAttribute('aria-hidden', active ? 'false' : 'true');
      }
      if (key) {
        try {
          localStorage.setItem(key, id);
        } catch {
          /* ignore */
        }
      }
      onChange?.(id);
    }

    tablist.addEventListener('click', (event) => {
      const tab = event.target?.closest?.('[role="tab"]');
      if (!tab || !tablist.contains(tab)) return;
      select(tab.dataset.tab);
    });

    tablist.addEventListener('keydown', (event) => {
      const current = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
      if (current < 0) return;
      let next = current;
      if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
      else return;
      event.preventDefault();
      tabs[next].focus();
      select(tabs[next].dataset.tab);
    });

    let initial = defaultTab || tabs[0]?.dataset.tab;
    if (key) {
      try {
        const saved = localStorage.getItem(key);
        if (saved && tabs.some((t) => t.dataset.tab === saved)) initial = saved;
      } catch {
        /* ignore */
      }
    }
    select(initial);
    return { select };
  }

  global.GoldspirePortalTabs = { init };
})(typeof window !== 'undefined' ? window : globalThis);
