import { Component } from '@theme/component';

/**
 * Announcement banner custom element that allows fading between content.
 * Based on the Slideshow component.
 *
 * @typedef {object} Refs
 * @property {HTMLElement} slideshowContainer
 * @property {HTMLElement[]} [slides]
 * @property {HTMLButtonElement} [previous]
 * @property {HTMLButtonElement} [next]
 *
 * @extends {Component<Refs>}
 */
export class AnnouncementBar extends Component {
  #current = 0;

  /**
   * The interval ID for automatic playback.
   * @type {number|undefined}
   */
  #interval = undefined;

  static STORAGE_KEY = 'announcementBarClosed';

  connectedCallback() {
    super.connectedCallback();

    /**
    * Check if the bar should be hidden (closed within last 24 hours)
    */
    if (this.constructor.hasBeenClosedRecently()) {
      this.#hidePermanently();
      return;
    }

    /**
    * Find the close button
    */
    const closeButton = this.closest('#header-announcements')?.querySelector('.announcement-bar__close');
    if (!closeButton) return;

    /**
    * Add click handler
    */
    closeButton.addEventListener('click', () => {
      this.#hidePermanently();

      // Store closed timestamp
      localStorage.setItem(this.constructor.STORAGE_KEY, Date.now().toString());
    }, { once: true });

    this.addEventListener('mouseenter', this.suspend);
    this.addEventListener('mouseleave', this.resume);
    document.addEventListener('visibilitychange', this.#handleVisibilityChange);

    this.play();
  }

  /**
   * Clean up
   */
  disconnectedCallback() {
    super.disconnectedCallback();

    this.suspend();
    this.removeEventListener('mouseenter', this.suspend);
    this.removeEventListener('mouseleave', this.resume);
    document.removeEventListener('visibilitychange', this.#handleVisibilityChange);

  }

  /**
   * Hide the bar and disable sticky behavior
   */
  #hidePermanently() {

    const bar = this.closest('#header-announcements');
    if (bar) {
      bar.removeAttribute('sticky');
    }
    document.documentElement.style.setProperty('--header-announcement-is-sticky', 0);

  }

  next() {
    this.current += 1;
  }

  previous() {
    this.current -= 1;
  }

  /**
   * Starts automatic slide playback.
   * @param {number} [interval] - The time interval in seconds between slides.
   */
  play(interval = this.autoplayInterval) {
    if (!this.autoplay) return;

    this.paused = false;
    this.suspend();

    this.#interval = setInterval(() => {
      if (this.matches(':hover') || document.hidden) return;

      this.next();
    }, interval);
  }

  /**
   * Pauses automatic slide playback.
   */
  pause() {
    this.paused = true;
    this.suspend();
  }

  get paused() {
    return this.hasAttribute('paused');
  }

  set paused(paused) {
    this.toggleAttribute('paused', paused);
  }

  /**
   * Suspends automatic slide playback.
   */
  suspend() {
    clearInterval(this.#interval);
    this.#interval = undefined;
  }

  /**
   * Resumes automatic slide playback if autoplay is enabled.
   */
  resume() {
    if (!this.autoplay || this.paused) return;

    this.pause();
    this.play();
  }

  get autoplay() {
    return Boolean(this.autoplayInterval);
  }

  get autoplayInterval() {
    const interval = this.getAttribute('autoplay');
    const value = parseInt(`${interval}`, 10);

    if (Number.isNaN(value)) return undefined;

    return value * 1000;
  }

  get current() {
    return this.#current;
  }

  set current(current) {
    this.#current = current;

    let relativeIndex = current % (this.refs.slides ?? []).length;
    if (relativeIndex < 0) {
      relativeIndex += (this.refs.slides ?? []).length;
    }

    this.refs.slides?.forEach((slide, index) => {
      slide.setAttribute('aria-hidden', `${index !== relativeIndex}`);
    });
  }

  /**
   * Pause the slideshow when the page is hidden.
   */
  #handleVisibilityChange = () => (document.hidden ? this.pause() : this.resume());

  /**
   * Checks if the announcement bar was closed within the last 24 hours
   * @returns {boolean}
   */
  static hasBeenClosedRecently() {
    const closedTimeStr = localStorage.getItem(this.STORAGE_KEY);
    if (!closedTimeStr) return false;

    const closedTime = parseInt(closedTimeStr, 10);
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;

    return now - closedTime < twentyFourHours;
  }
}

if (!customElements.get('announcement-bar-component')) {
  customElements.define('announcement-bar-component', AnnouncementBar);
}
