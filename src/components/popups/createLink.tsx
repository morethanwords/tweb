import {createEffect, createSignal} from 'solid-js';
import normalizeLinkUrl from '@helpers/string/normalizeLinkUrl';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import {i18n} from '@lib/langPack';
import InputField from '@components/inputField';
import PopupElement, {createPopup, usePopupContext} from '@components/popups/indexTsx';
import type {CreateLinkPopupOptions} from '@components/popups/createLinkModel';

export type CreateLinkPopupResult = {
  text: string,
  url: string
};

export default function showCreateLinkPopup(
  options: CreateLinkPopupOptions = {}
): Promise<CreateLinkPopupResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    createPopup(() => {
      const textInputField = new InputField({
        label: 'Chat.Input.Editor.Link.Text',
        plainText: true,
        required: true,
        withLinebreaks: false
      });
      const urlInputField = new InputField({
        label: 'URL',
        plainText: true,
        required: true,
        validate: () => !!normalizeLinkUrl(urlInputField.value),
        withLinebreaks: false
      });
      const urlInput = urlInputField.input as HTMLInputElement;
      urlInput.autocapitalize = 'none';
      urlInput.spellcheck = false;
      if(options.text) textInputField.setValueSilently(options.text);
      if(options.url) urlInputField.setValueSilently(options.url);

      const [valid, setValid] = createSignal(false);
      const updateValidity = () => setValid(textInputField.isValid() && urlInputField.isValid());
      subscribeOn(textInputField.input)('input', updateValidity);
      subscribeOn(urlInputField.input)('input', updateValidity);
      subscribeOn(textInputField.input)('keydown', (event) => {
        if(event.key !== 'Enter') return;
        event.preventDefault();
        event.stopPropagation();
        urlInputField.input.focus();
        urlInputField.select();
      });
      updateValidity();
      const Fields = () => {
        const popup = usePopupContext();
        createEffect(() => {
          if(!popup.shown()) return;
          // The shell blurs the previous field while opening. Focus ours once that finishes.
          queueMicrotask(() => {
            if(popup.destroyed || !popup.shown()) return;
            const field = textInputField.value ? urlInputField : textInputField;
            field.input.focus();
            field.select();
          });
        });
        return <div class="popup-create-link-fields">{textInputField.container}{urlInputField.container}</div>;
      };

      return (
        <PopupElement class="popup-create-link" closable onClose={() => {if(!settled) reject();}}>
          <PopupElement.Header>
            <PopupElement.CloseButton />
            <PopupElement.Title>{i18n(options.editing ? 'Chat.Input.Editor.Link.EditTitle' : 'Chat.Input.Editor.Link.Title')}</PopupElement.Title>
          </PopupElement.Header>
          <PopupElement.Body>
            <Fields />
          </PopupElement.Body>
          <PopupElement.Footer>
            <PopupElement.FooterButton
              confirm
              disabled={!valid()}
              langKey={options.editing ? 'Save' : 'Create'}
              callback={() => {
                const url = normalizeLinkUrl(urlInputField.value);
                if(!textInputField.isValid() || !url) return false;
                settled = true;
                resolve({text: textInputField.value, url});
              }}
            />
          </PopupElement.Footer>
        </PopupElement>
      );
    });
  });
}
