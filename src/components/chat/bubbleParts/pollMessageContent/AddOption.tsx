import {IconTsx} from '@components/iconTsx';
import InputField from '@components/inputField';
import {EmojiDropdownButton} from '@components/popups/createPoll/emojiDropdownButton';
import {MediaAttachment} from '@components/popups/createPoll/mediaAttachment';
import {AttachedMedia} from '@components/popups/createPoll/storeContext';
import ripple from '@components/ripple';
import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';
import {keepMe} from '@helpers/keepMe';
import {I18nTsx} from '@helpers/solid/i18n';
import classNames from '@helpers/string/classNames';
import {createSignal, Show} from 'solid-js';
import {Transition} from 'solid-transition-group';
import styles from './styles.module.scss';
import {LocalTextWithEntities} from './utils';

keepMe(ripple);

export const AddOption = (props: {
  inputFieldRef: (value: InputField) => void;
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
  onInput: (text: LocalTextWithEntities) => void;
}) => {
  const [attachment, setAttachment] = createSignal<AttachedMedia>();

  const visible = () => props.visible;

  const inputField = new InputField({
    placeholder: 'NewPoll.Option',
    canWrapCustomEmojis: true,
    onRawInput: () => {
      const {value, entities} = getRichValueWithCaret(inputField.input, true, false);
      props.onInput({text: value, entities});
    }
  });

  const onAfterEnter = () => {
    if(visible()) {
      inputField.input.focus();
    }
  };

  props.inputFieldRef(inputField);

  inputField.placeholder.classList.add(styles.inputFieldPlaceholder);

  return (
    <div class={classNames(styles.pollOption, styles.hasImage)}>
      <Show when={!visible()}>
        <div class={styles.clickableArea} use:ripple={!visible()} onClick={() => props.onVisibleChange(!visible())} />
      </Show>

      <div class={styles.checkContainer}>
        <Transition name='fade'>
          <Show when={!visible()}>
            <IconTsx icon='add' class={styles.addOptionPlus} />
          </Show>
          <Show when={visible()}>
            <EmojiDropdownButton class={styles.emojiDropdownButton} inputField={inputField} />
          </Show>
        </Transition>
      </div>
      <div class={styles.labelRow}>
        <div class={styles.labelText}>
          <Transition name='fade' mode='outin' onAfterEnter={onAfterEnter}>
            <Show when={visible()} fallback={<I18nTsx key='Chat.Poll.AddAnOption' />}>
              <div class={styles.inputFieldInternals}>
                {inputField.input}
                {inputField.placeholder}
              </div>
            </Show>
          </Transition>
        </div>
      </div>
      <div class={styles.optionImage}>
        <Show when={visible()}>
          <MediaAttachment
            btnClass={styles.optionImageBtn}
            imgClass={styles.optionImageImg}
            attachedMedia={attachment()}
            onAttach={setAttachment}
          />
        </Show>
      </div>
    </div>
  );
};
