export type StickyIntersectorOptions = {
  rootMargin?: string
};

export default class StickyIntersector {
  private headersObserver: IntersectionObserver;
  private elementsObserver: IntersectionObserver;
  private observed = new Map<HTMLElement, HTMLElement>(); // sticky-target element → its top sentinel
  private rootMargin: string | undefined;

  constructor(
    private container: HTMLElement,
    private handler: (stuck: boolean, target: HTMLElement) => void,
    options?: StickyIntersectorOptions
  ) {
    this.rootMargin = options?.rootMargin;
    this.createObservers();
  }

  private createObservers() {
    this.headersObserver = new IntersectionObserver((entries) => {
      for(const entry of entries) {
        const targetInfo = entry.boundingClientRect;
        const stickyTarget = entry.target.parentElement;
        const rootBoundsInfo = entry.rootBounds;

        // Stuck while the sentinel sits above the root's top edge. Otherwise the
        // section is either in view or scrolled past below — both mean not stuck.
        this.handler(targetInfo.bottom < rootBoundsInfo.top, stickyTarget);
      }
    }, {threshold: 0, root: this.container, rootMargin: this.rootMargin});

    this.elementsObserver = new IntersectionObserver((entries) => {
      // A section is "stuck" while it straddles the root's top edge. Containers
      // have real height, so unlike thin sentinels the observer can't skip their
      // intersection transitions on fast scrolls — this serves as a backup that
      // clears state when headersObserver missed a sentinel crossing.
      for(const entry of entries) {
        const stuck = entry.isIntersecting && entry.boundingClientRect.top < entry.rootBounds.top;
        this.handler(stuck, entry.target as HTMLElement);
      }
    }, {root: this.container, rootMargin: this.rootMargin});
  }

  public setRootMargin(rootMargin: string | undefined) {
    if(this.rootMargin === rootMargin) return;
    this.rootMargin = rootMargin;
    this.headersObserver.disconnect();
    this.elementsObserver.disconnect();
    this.createObservers();
    for(const [element, sentinel] of this.observed) {
      this.headersObserver.observe(sentinel);
      this.elementsObserver.observe(element);
    }
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
    this.observed.set(element, headerSentinel);
    this.headersObserver.observe(headerSentinel);
    this.elementsObserver.observe(element);
  }

  public disconnect() {
    this.headersObserver.disconnect();
    this.elementsObserver.disconnect();
    this.observed.clear();
  }

  public unobserve(element: HTMLElement, headerSentinel?: HTMLElement) {
    this.elementsObserver.unobserve(element);
    const sentinel = this.observed.get(element) ?? headerSentinel;
    if(sentinel) {
      this.headersObserver.unobserve(sentinel);
    }
    this.observed.delete(element);
  }
}
