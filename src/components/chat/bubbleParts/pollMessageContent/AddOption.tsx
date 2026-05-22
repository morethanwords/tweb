import appNavigationController, {NavigationItem} from '@components/appNavigationController';
import {IconTsx} from '@components/iconTsx';
import InputField from '@components/inputField';
import {EmojiDropdownButton} from '@components/popups/createPoll/emojiDropdownButton';
import {MediaAttachment} from '@components/popups/createPoll/mediaAttachment';
import {AttachedMedia} from '@components/popups/createPoll/storeContext';
import ripple from '@components/ripple';
import {Spinner} from '@components/spinner';
import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';
import {keepMe} from '@helpers/keepMe';
import {createDelayed} from '@helpers/solid/createDelayed';
import {I18nTsx} from '@helpers/solid/i18n';
import classNames from '@helpers/string/classNames';
import {createEffect, Match, onCleanup, Show, Switch} from 'solid-js';
import {Transition} from 'solid-transition-group';
import {usePollMessageContentProps} from './context';
import styles from './styles.module.scss';
import {NewOptionValues, spinnerThickness} from './utils';

keepMe(ripple);

export const AddOption = (props: {
  inputFieldRef: (value: InputField) => void;
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
  value: string;
  attachment?: AttachedMedia;
  onPartialChange: (text: Partial<NewOptionValues>) => void;
  onEnter: () => void;
  isPending?: boolean;
}) => {
  const contextProps = usePollMessageContentProps();

  const visible = () => props.visible;
  const delayedIsPending = createDelayed(() => props.isPending, false, (value) => value ? 200 : -1);

  const inputField = new InputField({
    placeholder: 'NewPoll.Option',
    canWrapCustomEmojis: true,
    onRawInput: () => {
      const {value, entities} = getRichValueWithCaret(inputField.input, true, false);
      props.onPartialChange({text: value, entities});
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

  createEffect(() => {
    if(props.isPending) {
      inputField.input.contentEditable = 'false';

      onCleanup(() => {
        inputField.input.contentEditable = 'true';
      });
    }
  });

  const onAfterEnter = () => {
    if(visible()) {
      inputField.input.focus();
    }
  };

  return (
    <div
      class={classNames(styles.pollOption, styles.hasMedia, styles.isAddOption)}
      classList={{
        [styles.isIncoming]: !contextProps.isOutgoing
      }}
    >
      <Show when={!visible()}>
        <div class={styles.clickableArea} classList={{[styles.outgoing]: contextProps.isOutgoing}} use:ripple={!visible()} onClick={() => props.onVisibleChange(!visible())} />
      </Show>

      <div class={styles.checkContainer}>
        <Transition name='fade' mode='outin'>
          <Switch>
            <Match when={!visible()}>
              <IconTsx icon='add' class={styles.addOptionPlus} />
            </Match>
            <Match when={delayedIsPending()}>
              <div class={styles.spinnerContainer}>
                <Spinner thickness={spinnerThickness} />
              </div>
            </Match>
            <Match when={visible()}>
              <EmojiDropdownButton class={classNames(styles.emojiDropdownButton, props.isPending && styles.pointerDisabled)} inputField={inputField} />
            </Match>
          </Switch>
        </Transition>
      </div>
      <div class={styles.pollOptionSpacerFirst}></div>
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
      <div class={styles.pollOptionSpacerLast}></div>
      <div
        class={styles.pollOptionMedia}
        classList={{
          [styles.stripped]: !!props.attachment,
          [styles.clickable]: !!props.attachment,
          [styles.pointerDisabled]: props.isPending
        }}
      >
        <Show when={visible()}>
          <MediaAttachment
            btnClass={styles.pollOptionMediaAttachBtn}
            imgClass={styles.pollOptionMediaAttachImg}
            attachedMedia={props.attachment}
            onAttach={(attachment) => props.onPartialChange({attachment})}
          />
        </Show>
      </div>
    </div>
  );
};
