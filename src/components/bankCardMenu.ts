import {appendButtonMenuItems, ButtonMenuItemOptions} from '@components/buttonMenu';
import {toastNew} from '@components/toast';
import {copyTextToClipboard} from '@helpers/clipboard';
import openTextLinkMenu from '@helpers/dom/openTextLinkMenu';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import {LangPackKey} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';

/** a line of the menu that says how the lookup goes rather than doing anything */
function statusItem(text: LangPackKey): ButtonMenuItemOptions {
  return {
    text,
    className: 'is-static',
    secondary: true,
    onClick: undefined
  };
}

/**
 * A bank card number in a text, clicked (tdesktop's BankCardClickHandler): the number to copy at once,
 * and, once the server has looked it up, a line for each place to look it up at and who issued it —
 * "Loading..." until then, an error line if it cannot tell.
 */
export default function openBankCardMenu(link: HTMLElement, event: MouseEvent) {
  const number = link.dataset.bankCard;
  if(!number) {
    return;
  }

  const managers = bindManagersToSession(rootScope.managers);
  const copy = () => {
    copyTextToClipboard(number);
    toastNew({langPackKey: 'CardNumberCopied'});
  };

  const loading: ButtonMenuItemOptions = {...statusItem('Loading'), separator: true};
  let closed = false;
  const {menu, reposition} = openTextLinkMenu({
    link,
    event,
    buttons: [{
      icon: 'copy',
      text: 'CopyCardNumber',
      onClick: copy
    }, loading],
    onClose: () => closed = true
  });

  const show = (items: ButtonMenuItemOptions[]) => {
    if(closed) {
      return;
    }

    loading.element.remove();
    // the line under "Copy" goes with the lookup when it found nothing
    if(!items.length) {
      (loading.separator as HTMLElement).remove();
    }

    appendButtonMenuItems(menu, items);
    reposition();
  };

  managers.appPaymentsManager.getBankCardData(number).then(({title, open_urls}) => {
    const items: ButtonMenuItemOptions[] = open_urls.map(({name, url}) => ({
      icon: 'card',
      regularText: wrapEmojiText(name),
      // the url comes off the wire: it opens the way every other link does, with its checks
      onClick: () => hotReloadGuard.appImManager.openUrl(url, true)
    }));

    if(title) {
      items.push({
        regularText: wrapEmojiText(title),
        secondary: true,
        separator: items.length > 0,
        onClick: copy
      });
    }

    show(items);
  }, () => {
    show([statusItem('Error.AnError')]);
  });
}
