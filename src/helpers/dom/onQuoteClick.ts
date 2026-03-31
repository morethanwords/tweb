import Scrollable from '@components/scrollable';
import animateSomethingWithScroll from '@helpers/animateSomethingWithScroll';
import cancelEvent from '@helpers/dom/cancelEvent';
import liteMode from '@helpers/liteMode';
import pause from '@helpers/schedulers/pause';
import ScrollSaver from '@helpers/scrollSaver';

export default function onQuoteClick(
  e: Event,
  quoteDiv: HTMLElement,
  scrollable?: Scrollable,
  createScrollSaver?: () => ScrollSaver
) {
  const isTruncated = quoteDiv.classList.contains('is-truncated');
  const isExpanded = quoteDiv.classList.contains('is-expanded');
  const isGood = isTruncated || isExpanded;
  if(isGood && window.getSelection().isCollapsed) {
    cancelEvent(e);

    if(createScrollSaver) {
      const hasAnimations = liteMode.isAvailable('animations');
      if(hasAnimations) {
        (quoteDiv as any).ignoreQuoteResize = Infinity;
      }

      const scrollSaver = createScrollSaver();
      scrollSaver.save();

      let onTransitionEnd: (e: TransitionEvent) => void;

      const animationPromise = hasAnimations ? Promise.race([
        pause(1000).then(() => {
          quoteDiv.removeEventListener('transitionend', onTransitionEnd);
        }),
        new Promise<void>((resolve) => {
          onTransitionEnd = (e: TransitionEvent) => {
            if(e.target === quoteDiv) {
              resolve();
              delete (quoteDiv as any).ignoreQuoteResize;
            }
          };

          quoteDiv.addEventListener('transitionend', onTransitionEnd, {once: true});
        })
      ]) : Promise.resolve();

      animateSomethingWithScroll(animationPromise, scrollable, scrollSaver);
    }

    quoteDiv.classList.toggle('is-expanded');
    quoteDiv.classList.toggle('is-truncated', isExpanded);
    return true;
  }

  return false;
}
