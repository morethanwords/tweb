import ensureButtonSemantics from '@helpers/dom/ensureButtonSemantics';
import I18n from '@lib/langPack';

export const MEDIA_PREVIEW_SELECTOR = '.attachment, .grouped-item, .media-photo';

/** Both bubble renderers and revealed spoilers use the existing delegated media action. */
export default function makeMediaPreviewsAccessible(container: HTMLElement) {
  const previews = Array.from(container.querySelectorAll<HTMLElement>(MEDIA_PREVIEW_SELECTOR));
  if(container.matches(MEDIA_PREVIEW_SELECTOR)) previews.unshift(container);
  previews.forEach((element) => {
    if(element.hasAttribute('role') || element.querySelector(`${MEDIA_PREVIEW_SELECTOR}, button, a[href], input, [role="button"]`)) return;
    ensureButtonSemantics(element);
    element.setAttribute('aria-label', I18n.format('AccDescr.OpenMedia', true));
  });
}
