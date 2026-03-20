import { Component } from '@theme/component';
import { onAnimationEnd, prefersReducedMotion } from '@theme/utilities';

/**
 * @element countdown-timer
 * @fires countdown-finished - When the countdown reaches zero
 *
 * @attr {string} ends-at - Required ISO 8601 datetime string
 * @attr {boolean} paused - Pauses the timer (useful for SSR/hydration)
 * @attr {string} expiration-behavior - "none" or "hide" (removes parent section)
 *
 * @slot label - Optional label before the timer
 * @slot days - Customize "Days" label
 * @slot hours - Hrs
 * @slot minutes - Mins
 * @slot seconds - Secs
 */
export class CountdownTimer extends Component {
  static get observedAttributes() {
    return ['ends-at', 'paused', 'expiration-behavior'];
  }

  constructor() {
    super();
    this._interval = null;
    this._endTime = null;
    this._observer = null;
    this._isVisible = true;
  }

  connectedCallback() {
    super.connectedCallback();
    this._parseEndTime();
    this._setupIntersectionObserver();
    this._updateDisplay();
    // Handle dynamic adds (editor preview) where DOMContentLoaded has already fired
    if (this.hasAttribute('paused') && document.readyState !== 'loading') {
      this.removeAttribute('paused');
    }
  }

  /**
   * @param {string} name
   * @param {string} oldValue
   * @param {string} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;

    if (name === 'ends-at') {
      this._parseEndTime();
      this._restartTimer();
    } else if (name === 'paused') {
      this._restartTimer();
    }
  }

  updatedCallback() {
    this._parseEndTime();
    this._restartTimer();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._stopTimer();
    this._observer?.disconnect();
  }

  _parseEndTime() {
    const isoString = this.getAttribute('ends-at');
    if (!isoString) {
      console.warn('<countdown-timer> missing required `ends-at` attribute');
      return;
    }

    const date = new Date(isoString);
    if (isNaN(date.getTime())) {
      console.error('<countdown-timer> invalid date format:', isoString);
      return;
    }

    this._endTime = date;
  }

  _restartTimer() {
    this._stopTimer();
    if (!this.hasAttribute('paused') && this._isVisible) {
      this._startTimer();
    }
  }

  _startTimer() {
    if (this._interval || !this._endTime) return;
    this._updateDisplay();
    this._interval = setInterval(() => this._updateDisplay(), 1000);
  }

  _stopTimer() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  _setupIntersectionObserver() {
    this._observer = new IntersectionObserver(
      (entries) => {
        const isIntersecting = entries.some((e) => e.isIntersecting);
        this._isVisible = isIntersecting;

        if (isIntersecting && !this.hasAttribute('paused')) {
          this._startTimer();
        } else {
          this._stopTimer();
        }
      },
      { rootMargin: '500px' }
    );

    this._observer.observe(this);
  }

  async _updateDisplay() {
    if (!this._endTime) return;

    const diff = this._endTime.getTime() - Date.now();

    if (diff <= 0) {
      this._stopTimer();

      if (this.getAttribute('expiration-behavior') === 'hide') {
        const target = this.closest('.countdown-timer-block') ?? this;
        if (!prefersReducedMotion()) {
          target.animate(
            { opacity: [1, 0], transform: ['translateY(0)', 'translateY(-10px)'] },
            { duration: 300, easing: 'ease-out' }
          );
          await onAnimationEnd(target, () => {});
        }
        target.remove();
      }

      this.dispatchEvent(new CustomEvent('countdown-finished', { bubbles: true, composed: true }));
      return;
    }

    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    this._setTime(days, hours, minutes, seconds);
  }

  /**
   * @param {number} days
   * @param {number} hours
   * @param {number} minutes
   * @param {number} seconds
   */
  _setTime(days, hours, minutes, seconds) {
    /**
     * @param {string} refName
     * @param {number} value
     */
    const updateEl = (refName, value) => {
      const ref = this.refs[refName];
      const el = Array.isArray(ref) ? ref[0] : ref;
      if (!el) return;
      const newValue = value.toString().padStart(2, '0');
      if (el.textContent !== newValue) el.textContent = newValue;
    };

    updateEl('daysValue', days);
    updateEl('hoursValue', hours);
    updateEl('minutesValue', minutes);
    updateEl('secondsValue', seconds);

    // Hide days unit and its separator when days reaches 0
    const daysRef = this.refs.daysValue;
    const daysEl = Array.isArray(daysRef) ? daysRef[0] : daysRef;
    if (daysEl) {
      const daysUnit = daysEl.closest('.unit');
      const daysSeparator = daysUnit?.nextElementSibling;

      const hide = days === 0;
      if (daysUnit) daysUnit.style.display = hide ? 'none' : '';
      if (daysSeparator && daysSeparator.textContent?.trim() === ':') {
        daysSeparator.style.display = hide ? 'none' : '';
      }
    }

    this.style.setProperty('--countdown-days', String(days));
    this.style.setProperty('--countdown-hours', String(hours));
    this.style.setProperty('--countdown-minutes', String(minutes));
    this.style.setProperty('--countdown-seconds', String(seconds));
  }
}

if (!customElements.get('countdown-timer')) {
  customElements.define('countdown-timer', CountdownTimer);
}
