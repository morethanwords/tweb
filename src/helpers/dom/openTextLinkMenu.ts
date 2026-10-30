import {ButtonMenuItemOptions, ButtonMenuSync} from '@components/buttonMenu';
import contextMenuController from '@helpers/contextMenuController';
import positionMenu from '@helpers/positionMenu';
import {getOverlayRoot} from '@helpers/appWindow';
import {holdLinkPlate} from '@helpers/dom/linkPress';
import I18n from '@lib/langPack';

/**
 * The menu a link in the text opens when it is clicked (a formatted date, a bank card number): at the
 * pointer, or under the link when a key pressed it, with the link lit for as long as it is open.
 * `reposition` places it again once it has grown.
 */
export default function openTextLinkMenu(options: {
  link: HTMLElement,
  event: MouseEvent,
  buttons: ButtonMenuItemOptions[],
  onClose?: () => void
}) {
  const {link, event, buttons, onClose} = options;
  const menu = ButtonMenuSync({buttons});
  menu.classList.add('contextmenu');
  getOverlayRoot().append(menu);

  // a click a key made has no point of its own: the menu opens at the link's inline start
  let point: Pick<Touch, 'pageX' | 'pageY'> = event;
  if(!event.detail) {
    const rect = link.getBoundingClientRect();
    point = {pageX: I18n.getIsRTL() ? rect.right : rect.left, pageY: rect.bottom};
  }

  const reposition = () => positionMenu(point as Touch, menu);
  reposition();

  // a link that says it opens a menu says whether it is open
  const hasPopup = link.hasAttribute('aria-haspopup');
  hasPopup && link.setAttribute('aria-expanded', 'true');

  const releaseLinkPlate = holdLinkPlate(link);
  contextMenuController.openBtnMenu(menu, () => {
    hasPopup && link.setAttribute('aria-expanded', 'false');
    releaseLinkPlate?.();
    onClose?.();
    setTimeout(() => menu.remove(), 300);
  }, link);

  return {menu, reposition};
}
