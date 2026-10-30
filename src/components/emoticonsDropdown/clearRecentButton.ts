import type {LangPackKey} from '@lib/langPack';
import type {MiddlewareHelper} from '@helpers/middleware';
import type {ReadingManagers} from '@lib/managers';
import ButtonIcon from '@components/buttonIcon';
import confirmationPopup from '@components/confirmationPopup';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import noop from '@helpers/noop';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';

/**
 * The × on a recent category's title that clears it once the user confirms — the recent stickers, the
 * recent reactions. `clear` gets the managers of the session the button was pressed in.
 */
export default function appendClearRecentButton({category, managers, titleLangKey, descriptionLangKey, clear}: {
  category: {elements: {title: HTMLElement}, middlewareHelper: MiddlewareHelper},
  managers: ReadingManagers,
  titleLangKey: LangPackKey,
  descriptionLangKey: LangPackKey,
  clear: (managers: ReadingManagers) => void
}) {
  const button = ButtonIcon('close', {noRipple: true, ariaLabel: titleLangKey});
  category.elements.title.append(button);
  const detach = attachClickEvent(button, () => {
    const sessionManagers = bindManagersToSession(managers);
    confirmationPopup({
      titleLangKey,
      descriptionLangKey,
      button: {
        langKey: 'Clear'
      }
    }).then(() => clear(sessionManagers), noop);
  });

  category.middlewareHelper.get().onDestroy(detach);
}
