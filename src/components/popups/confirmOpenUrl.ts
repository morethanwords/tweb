import showPeerPopup from '@components/popups/peer';

/**
 * Asks before opening a link whose address was not shown (a masked link, a tg:// link this client cannot open, a
 * widget's link), with the whole address written into `anchor`. Open follows it as a plain link within that press of
 * the button, while the browser still takes it as the user's doing; `onClose` runs once the popup is gone, either way.
 */
export default function confirmOpenUrl(anchor: HTMLAnchorElement, onClose?: () => void) {
  anchor.className = 'anchor-url';
  anchor.textContent = anchor.href;
  showPeerPopup('popup-masked-url', {
    titleLangKey: 'OpenUrlTitle',
    descriptionLangKey: 'OpenUrlAlert2',
    descriptionLangArgs: [anchor],
    buttons: [{
      langKey: 'Open',
      callback: () => {
        anchor.click();
      }
    }],
    onCloseAfterTimeout: onClose
  });
}
