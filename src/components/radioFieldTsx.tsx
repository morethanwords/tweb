import {createRenderEffect, splitProps} from 'solid-js';
import RadioField from '@components/radioField';
import {attachClassName} from '@helpers/solid/classname';
import {subscribeOn} from '@helpers/solid/subscribeOn';

/** The control only — mount it through `Row.RadioField` and put its label in `Row.Title`. */
export default function RadioFieldTsx(props: ConstructorParameters<typeof RadioField>[0] & {
  ariaLabel?: string,
  checked?: boolean,
  class?: string,
  locked?: boolean,
  onChange?: (checked: boolean, event: Event) => void
}) {
  const [local, radioProps] = splitProps(props, [
    'ariaLabel',
    'checked',
    'class',
    'locked',
    'onChange'
  ]);
  const radioField = new RadioField(radioProps);

  // render effects: the field is checked (locked, named) before it goes into the document — set
  // after, its mark drew itself in as the popup or tab holding it opened
  createRenderEffect(() => {
    if(local.checked !== undefined) {
      radioField.setValueSilently(local.checked);
    }
  });

  createRenderEffect(() => {
    radioField.locked = !!local.locked;
  });

  createRenderEffect(() => {
    const ariaLabel = local.ariaLabel;
    if(ariaLabel) {
      radioField.input.setAttribute('aria-label', ariaLabel);
    } else {
      radioField.input.removeAttribute('aria-label');
    }
  });

  subscribeOn(radioField.input)('change', (event) => {
    local.onChange?.(radioField.checked, event);
  });

  attachClassName(radioField.container, () => local.class);

  return radioField.container;
}
