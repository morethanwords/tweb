import appNavigationController, {NavigationItem} from '@components/appNavigationController';
import {IconTsx} from '@components/iconTsx';
import InputField from '@components/inputField';
import {EmojiDropdownButton} from '@components/popups/createPoll/emojiDropdownButton';
import {MediaAttachment} from '@components/popups/createPoll/mediaAttachment';
import {AttachedMedia, SupportedMediaType} from '@components/popups/createPoll/storeContext';
import ripple from '@components/ripple';
import {Spinner} from '@components/spinner';
import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';
import {keepMe} from '@helpers/keepMe';
import {createDelayed} from '@helpers/solid/createDelayed';
import {I18nTsx} from '@helpers/solid/i18n';
import classNames from '@helpers/string/classNames';
import I18n from '@lib/langPack';
import {createEffect, createMemo, createResource, Match, onCleanup, Show, Switch} from 'solid-js';
import {supportsVideoEncoding} from '@components/mediaEditor/support';
import {Transition} from 'solid-transition-group';
import {usePollMessageContentProps} from './context';
import styles from './styles.module.scss';
import {NewOptionValues, spinnerThickness, useChatRights} from './utils';

keepMe(ripple);

export const AddOption = (props: {
  inputFieldRef: (value: InputField) => void;
  active: boolean;
  onActiveChange: (visible: boolean) => void;
  value: string;
  attachment?: AttachedMedia;
  onPartialChange: (text: Partial<NewOptionValues>) => void;
  onEnter: () => void;
  isPending?: boolean;
}) => {
  const contextProps = usePollMessageContentProps();

  const chatRights = useChatRights({
    peerId: () => contextProps.message.peerId,
    rights: () => ['send_photos', 'send_stickers', 'send_gifs', 'send_videos'],
    getRight: (key) => contextProps.canSend(key)
  })

  const [canEncodeVideoResource] = createResource(() => supportsVideoEncoding());
  const canEncodeVideo = () =>
    canEncodeVideoResource.state === 'ready' && !!canEncodeVideoResource();

  const supportedMediaTypes = createMemo((): SupportedMediaType[] => {
    return [
      ...(chatRights.hasRight('send_photos') ? ['photo'] as const : []),
      ...(chatRights.hasRight('send_stickers') ? ['sticker'] as const : []),
      // GIFs and videos also requires the editor's encoder to be supported by the browser.
      ...(chatRights.hasRight('send_gifs') && canEncodeVideo() ? ['gif'] as const : []),
      ...(chatRights.hasRight('send_videos') && canEncodeVideo() ? ['video'] as const : []),
      'link'
    ];
  });

  const active = () => props.active;
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

  const deactivate = () => {
    if(!props.value) {
      props.onPartialChange({attachment: undefined});
    }

    props.onActiveChange(false);
  };

  inputField.input.addEventListener('keydown', (e) => {
    if(e.key === 'Enter') {
      props.onEnter?.();
    }

    if(e.key === 'Backspace' && props.value === '') {
      e.preventDefault();
      deactivate();
    }
  });

  props.inputFieldRef(inputField);

  createEffect(() => {
    if(!active()) return;

    const navigationItem: NavigationItem = {
      type: 'inline-message-input',
      onPop: () => void deactivate()
    };

    const existing = appNavigationController.findItemByType('inline-message-input');
    if(existing) {
      appNavigationController.backByItem(existing.item);
    }

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
    if(active()) {
      inputField.input.focus();
    }
  };

  return (
    <div
      class={classNames(styles.pollOption, styles.hasMedia, styles.isAddOption)}
      classList={{
        [styles.isOutgoing]: contextProps.isOutgoing,
        [styles.isIncoming]: !contextProps.isOutgoing
      }}
    >
      <Transition name='fade-4' mode='outin' duration={400}>
        <Show when={!active()}>
          <div
            class={styles.clickableArea}
            classList={{
              [styles.outgoing]: contextProps.isOutgoing,
              [styles.pointerDisabled]: active()
            }}
            role='button'
            tabIndex={active() ? -1 : 0}
            aria-label={I18n.i18n('Chat.Poll.AddAnOption').textContent}
            use:ripple={!active()}
            onClick={() => props.onActiveChange(true)}
            onKeyDown={(event) => {
              if(event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              props.onActiveChange(true);
            }}
          />
        </Show>
      </Transition>

      <div class={styles.checkContainer}>
        <Transition name='fade' mode='outin'>
          <Switch>
            <Match when={!active()}>
              <IconTsx icon='add' class={styles.addOptionPlus} />
            </Match>
            <Match when={delayedIsPending()}>
              <div class={styles.spinnerContainer}>
                <Spinner thickness={spinnerThickness} />
              </div>
            </Match>
            <Match when={active()}>
              <EmojiDropdownButton class={classNames(styles.emojiDropdownButton, props.isPending && styles.pointerDisabled)} inputField={inputField} />
            </Match>
          </Switch>
        </Transition>
      </div>
      <div class={styles.pollOptionSpacerFirst}></div>
      <div class={styles.labelRow}>
        <div class={styles.labelText}>
          <Transition name='fade' mode='outin' onAfterEnter={onAfterEnter}>
            <Show when={active()} fallback={<I18nTsx key='Chat.Poll.AddAnOption' />}>
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
        <Show when={active() && supportedMediaTypes().filter(t => t !== 'gif').length > 0}>
          <MediaAttachment
            supportedMediaTypes={supportedMediaTypes()}
            btnClass={styles.pollOptionMediaAttachBtn}
            imgClass={styles.pollOptionMediaAttachImg}
            attachedMedia={props.attachment}
            onLinkPopupClose={() => {
              if(inputField.input.isConnected) inputField.input.focus();
            }}
            onAttach={(attachment) => props.onPartialChange({attachment})}
          />
        </Show>
      </div>
    </div>
  );
};
