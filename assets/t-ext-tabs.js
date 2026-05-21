import { Component } from '@theme/component';

/**
 * @typedef {Object} SocTabsRefs
 * @property {HTMLElement[]} tabs
 * @property {HTMLElement[]} panels
 */

/** @extends {Component<SocTabsRefs>} */
class SocTabsComponent extends Component {
  /** @type {number} */
  #active = 0;

  /** @type {AbortController | null} */
  #abort = null;

  connectedCallback() {
    super.connectedCallback();
    this.#init();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#abort?.abort();
    window.removeEventListener('hashchange', this.#handleHashChange);
  }

  #init() {
    const { tabs } = this.refs;
    if (!tabs?.length) return;

    // Restore from URL hash, or find SSR-selected tab
    const hash = window.location.hash.slice(1);
    if (hash) {
      const fromHash = tabs.findIndex((t) => t.getAttribute('aria-controls') === hash);
      if (fromHash >= 0) this.#active = fromHash;
    } else {
      const selected = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
      if (selected >= 0) this.#active = selected;
    }

    this.#setupEventListeners();
    this.#updateActiveTab();
  }

  #setupEventListeners() {
    this.#abort?.abort();
    this.#abort = new AbortController();
    const opts = { signal: this.#abort.signal };
    const { tabs } = this.refs;

    this.addEventListener('keydown', (e) => this.#handleKeydown(e), opts);

    for (const [i, tab] of (tabs ?? []).entries()) {
      tab.addEventListener('click', () => this.#activate(i, true), opts);
    }

    window.addEventListener('hashchange', this.#handleHashChange);
  }

  /** @param {KeyboardEvent} e */
  #handleKeydown(e) {
    const target = /** @type {HTMLElement} */ (e.target);
    if (target.getAttribute('role') !== 'tab') return;

    const { tabs } = this.refs;
    if (!tabs?.length) return;

    const i = tabs.indexOf(target);
    const navMap = {
      ArrowLeft: -1,
      ArrowRight: 1,
      Home: -i,
      End: tabs.length - 1 - i,
    };

    const offset = navMap[e.key];
    if (offset !== undefined) {
      e.preventDefault();
      const next = (i + offset + tabs.length) % tabs.length;
      tabs[next]?.focus();
      this.#activate(next, true);
    }
  }

  #handleHashChange = () => {
    const hash = window.location.hash.slice(1);
    const { tabs } = this.refs;
    if (!tabs?.length || !hash) return;
    const idx = tabs.findIndex((t) => t.getAttribute('aria-controls') === hash);
    if (idx >= 0) this.#activate(idx, false);
  };

  /**
   * @param {number} index
   * @param {boolean} updateHash
   */
  #activate(index, updateHash) {
    this.#active = index;
    this.#updateActiveTab();

    if (updateHash) {
      const panelId = this.refs.tabs?.[index]?.getAttribute('aria-controls');
      if (panelId) history.replaceState(null, '', `#${panelId}`);
    }
  }

  #updateActiveTab() {
    const { tabs, panels } = this.refs;
    if (!tabs?.length || !panels?.length) return;

    for (const [i, tab] of tabs.entries()) {
      const isActive = i === this.#active;
      tab.setAttribute('aria-selected', String(isActive));
      tab.setAttribute('tabindex', isActive ? '0' : '-1');
    }

    for (const [i, panel] of panels.entries()) {
      panel.toggleAttribute('inert', i !== this.#active);
    }
  }
}

if (!customElements.get('soc-tabs')) {
  customElements.define('soc-tabs', SocTabsComponent);
}
