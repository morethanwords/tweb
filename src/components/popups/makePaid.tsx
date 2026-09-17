import PopupElement, {createPopup} from '@components/popups/indexTsx';
import anchorCallback from '@helpers/dom/anchorCallback';
import placeCaretAtEnd from '@helpers/dom/placeCaretAtEnd';
import shake from '@helpers/dom/shake';
import {Middleware} from '@helpers/middleware';
import {LangPackKey} from '@lib/langPack';
import currencyStarIcon from '@components/currencyStarIcon';
import InputField from '@components/inputField';
import Section from '@components/section';
import showStarsPopup from '@components/popups/stars';
import rootScope from '@lib/rootScope';
import {createSignal, onMount} from 'solid-js';
import createMiddleware from '@helpers/solid/createMiddleware';

export function InputStarsField(options: {
  middleware: Middleware,
  placeholder?: LangPackKey,
  label?: LangPackKey,
  max: number,
  onValue?: (stars: number) => void,
}) {
  const inputField = new InputField({
    inputMode: 'numeric',
    label: options.label,
    placeholder: options.placeholder,
    plainText: true,
    withLinebreaks: false
  });

  inputField.container.classList.add('popup-make-paid-input');

  const star = currencyStarIcon() as HTMLElement;
  star.classList.add('popup-make-paid-star');
  inputField.container.append(star);

  const onInput = () => {
    const value = '' + +inputField.value;
    let newValue = value.replace(/[^0-9]/g, '');
    if(+newValue > options.max) {
      newValue = '' + options.max;
    }
    inputField.setValueSilently(newValue);
    options.onValue?.(+newValue);
  };

  inputField.input.addEventListener('input', onInput);
  options.middleware.onDestroy(() => {
    inputField.input.removeEventListener('input', onInput);
  });

  return inputField;
}

export default async function showMakePaidPopup(onSave: (value: number) => void, editingFrom?: number) {
  const appConfig = await rootScope.managers.apiManager.getAppConfig();
  const [show, setShow] = createSignal(true);

  createPopup(() => {
    const inputField = InputStarsField({
      middleware: createMiddleware().get(),
      label: 'PaidMedia.Enter',
      max: appConfig.stars_paid_post_amount_max
    });

    if(editingFrom) {
      inputField.value = '' + editingFrom;
    }

    onMount(() => placeCaretAtEnd(inputField.input));

    return (
      <PopupElement class="popup-make-paid" closable show={show()}>
        <PopupElement.Header>
          <PopupElement.CloseButton />
          <PopupElement.Title title="PaidMedia.Title" />
        </PopupElement.Header>
        <PopupElement.Body>
          <Section
            caption="PaidMedia.Caption"
            captionArgs={[
              anchorCallback(() => {
                showStarsPopup();
              })
            ]}
          >
            {inputField.container}
          </Section>
        </PopupElement.Body>
        <PopupElement.Footer>
          <PopupElement.FooterButton
            langKey="PaidMedia.Button"
            callback={() => {
              const value = parseInt(inputField.value || '0');
              if(value > 0) {
                onSave(value);
                return;
              }

              shake(inputField.container);
              return false;
            }}
          />
          {editingFrom && (
            <PopupElement.FooterButton
              color="secondary"
              langKey="PaidMedia.KeepFree"
              callback={() => onSave(0)}
            />
          )}
        </PopupElement.Footer>
      </PopupElement>
    );
  });
}
