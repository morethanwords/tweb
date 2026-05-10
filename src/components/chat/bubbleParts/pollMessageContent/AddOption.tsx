import appNavigationController, {NavigationItem} from '@components/appNavigationController';
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
import {createEffect, createSignal, onCleanup, Show} from 'solid-js';
import {Transition} from 'solid-transition-group';
import {usePollMessageContentProps} from './context';
import styles from './styles.module.scss';
import {LocalTextWithEntities} from './utils';

keepMe(ripple);

export const AddOption = (props: {
  inputFieldRef: (value: InputField) => void;
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
  value: string;
  onInput: (text: LocalTextWithEntities) => void;
  onEnter: () => void;
}) => {
  const contextProps = usePollMessageContentProps();

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

  inputField.input.classList.add(styles.inputFieldInput);
  inputField.placeholder.classList.add(...[styles.inputFieldPlaceholder, contextProps.isOutgoing ? styles.outgoing : null].filter(Boolean));

  inputField.input.addEventListener('keydown', (e) => {
    if(e.key === 'Enter') {
      props.onEnter?.();
    }

    if(e.key === 'Backspace' && props.value === '') {
      e.preventDefault();
      props.onVisibleChange(false);
    }
  });

  props.inputFieldRef(inputField);

  createEffect(() => {
    if(!visible()) return;

    const navigationItem: NavigationItem = {
      type: 'inline-message-input',
      onPop: () => void props.onVisibleChange(false)
    };

    appNavigationController.pushItem(navigationItem);

    onCleanup(() => {
      appNavigationController.removeItem(navigationItem);
    });
  });

  const onAfterEnter = () => {
    if(visible()) {
      inputField.input.focus();
    }
  };

  return (
    <div class={classNames(styles.pollOption, styles.hasMedia)}>
      <Show when={!visible()}>
        <div class={styles.clickableArea} classList={{[styles.outgoing]: contextProps.isOutgoing}} use:ripple={!visible()} onClick={() => props.onVisibleChange(!visible())} />
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
      <div class={styles.pollOptionMedia}>
        <Show when={visible()}>
          <MediaAttachment
            btnClass={styles.pollOptionMediaBtn}
            imgClass={styles.pollOptionMediaImg}
            attachedMedia={attachment()}
            onAttach={setAttachment}
          />
        </Show>
      </div>
    </div>
  );
};
