/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export default class StickyIntersector {
  private headersObserver: IntersectionObserver;
  private elementsObserver: IntersectionObserver;

  constructor(private container: HTMLElement, private handler: (stuck: boolean, target: HTMLElement) => void) {
    this.observeHeaders();
    this.observeElements();
  }

  /**
   * Sets up an intersection observer to notify when elements with the class
   * `.sticky_sentinel--top` become visible/invisible at the top of the container.
   * @param {!Element} container
   */
  private observeHeaders() {
    this.headersObserver = new IntersectionObserver((entries) => {
      for(const entry of entries) {
        const targetInfo = entry.boundingClientRect;
        const stickyTarget = entry.target.parentElement;
        const rootBoundsInfo = entry.rootBounds;

        // Started sticking.
        if(targetInfo.bottom < rootBoundsInfo.top) {
          this.handler(true, stickyTarget);
        }

        // Stopped sticking.
        if(targetInfo.bottom >= rootBoundsInfo.top &&
            targetInfo.bottom < rootBoundsInfo.bottom) {
          this.handler(false, stickyTarget);
        }
      }
    }, {threshold: 0, root: this.container});
  }

  private observeElements() {
    this.elementsObserver = new IntersectionObserver((entries) => {
      const entry = entries
      .filter((entry) => entry.boundingClientRect.top < entry.rootBounds.top)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if(!entry) return;

      const container = entry.isIntersecting ? entry.target : entry.target.nextElementSibling;
      this.handler(true, container as HTMLElement);
    }, {root: this.container});
  }

  /**
   * @param {!Element} container
   * @param {string} className
   */
  private addSentinel(container: HTMLElement, className: string) {
    const sentinel = document.createElement('div');
    sentinel.classList.add('sticky_sentinel', className);
    return container.appendChild(sentinel);
  }

  /**
   * Notifies when elements w/ the `sticky` class begin to stick or stop sticking.
   * Note: the elements should be children of `container`.
   * @param {!Element} container
   */
  public observeStickyHeaderChanges(element: HTMLElement) {
    const headerSentinel = this.addSentinel(element, 'sticky_sentinel--top');
    this.headersObserver.observe(headerSentinel);

    this.elementsObserver.observe(element);
  }

  public disconnect() {
    this.headersObserver.disconnect();
    this.elementsObserver.disconnect();
  }

  public unobserve(element: HTMLElement, headerSentinel: HTMLElement) {
    this.elementsObserver.unobserve(element);
    this.headersObserver.unobserve(headerSentinel);
  }
}
