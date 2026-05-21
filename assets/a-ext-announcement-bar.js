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

  /** @type {number|undefined} */
  #interval = undefined;

  connectedCallback() {
    super.connectedCallback();

    this.addEventListener('mouseenter', this.suspend);
    this.addEventListener('mouseleave', this.resume);
    document.addEventListener('visibilitychange', this.#handleVisibilityChange);

    const closeButton = this.closest('#header-announcements')?.querySelector('.announcement-bar__close');
    closeButton?.addEventListener('click', () => this.#close(), { once: true });

    this.play();
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    this.suspend();
    this.removeEventListener('mouseenter', this.suspend);
    this.removeEventListener('mouseleave', this.resume);
    document.removeEventListener('visibilitychange', this.#handleVisibilityChange);
  }

  #close() {
    this.closest('#header-announcements')?.removeAttribute('sticky');
    document.documentElement.style.setProperty('--header-announcement-is-sticky', 0);
  }

  next() {
    this.current += 1;
  }

  previous() {
    this.current -= 1;
  }

  /**
   * @param {number} [interval]
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

  suspend() {
    clearInterval(this.#interval);
    this.#interval = undefined;
  }

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
    if (relativeIndex < 0) relativeIndex += (this.refs.slides ?? []).length;

    this.refs.slides?.forEach((slide, index) => {
      slide.setAttribute('aria-hidden', `${index !== relativeIndex}`);
    });
  }

  #handleVisibilityChange = () => (document.hidden ? this.pause() : this.resume());
}

if (!customElements.get('announcement-bar-component')) {
  customElements.define('announcement-bar-component', AnnouncementBar);
}
