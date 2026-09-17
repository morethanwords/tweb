import PopupElement, {addCancelButton, createPopup, PopupButton} from '@components/popups/indexTsx';
import {FormatterArguments, LangPackKey, i18n} from '@lib/langPack';
import {For} from 'solid-js';

// ! cant use PopupPeer/confirmationPopup because of awkward recursive dependencies.
// Originally lived in `src/pages/loginPage.ts` next to the `LoginPage` DOM helper;
// extracted here so the legacy `pages/` module tree could be removed in the
// SolidJS auth-flow refactor.
export function showSimpleConfirmationPopup(options: {
  titleLangKey: LangPackKey;
  descriptionLangKey: LangPackKey;
  descriptionArgs?: FormatterArguments;
  buttons: PopupButton[];
  onCloseAfterTimeout?: () => void;
}) {
  createPopup(() => (
    <PopupElement
      class="popup-peer popup-confirmation"
      closable
      onCloseAfterTimeout={options.onCloseAfterTimeout}
    >
      <PopupElement.Header>
        <PopupElement.Title title={options.titleLangKey} />
      </PopupElement.Header>
      <p class="popup-description">{i18n(options.descriptionLangKey, options.descriptionArgs)}</p>
      <PopupElement.Buttons>
        <For each={options.buttons}>{(button) => (
          <PopupElement.Button
            langKey={button.langKey}
            langArgs={button.langArgs}
            danger={button.isDanger}
            cancel={button.isCancel}
            callback={(e) => button.callback?.(e)}
          >{button.text}</PopupElement.Button>
        )}</For>
      </PopupElement.Buttons>
    </PopupElement>
  ));
}

/** Resolves when the user confirms, rejects on cancel or close. */
export default function simpleConfirmation(options: {
  titleLangKey: LangPackKey;
  descriptionLangKey: LangPackKey;
  descriptionArgs?: FormatterArguments;
  button: PopupButton
}) {
  return new Promise<void>((resolve, reject) => {
    let resolved = false;
    const settle = (accepted: boolean) => {
      if(resolved) return;
      resolved = true;
      accepted ? resolve() : reject();
    };

    const buttons = addCancelButton([options.button]);
    buttons.find((button) => button.isCancel).callback = () => settle(false);
    options.button.callback = () => settle(true);

    showSimpleConfirmationPopup({
      titleLangKey: options.titleLangKey,
      descriptionLangKey: options.descriptionLangKey,
      descriptionArgs: options.descriptionArgs,
      buttons,
      onCloseAfterTimeout: () => settle(false)
    });
  });
}
