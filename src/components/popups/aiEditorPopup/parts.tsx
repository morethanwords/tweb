import {ButtonIconTsx} from '@components/buttonIconTsx';
import {ButtonMenuItemOptions} from '@components/buttonMenu';
import EmojiDocumentIcon from '@components/emojiDocumentIcon';
import {IconTsx} from '@components/iconTsx';
import {InstantViewBlocks} from '@components/instantView';
import {instantViewStyles} from '@components/instantViewFormatting';
import ripple from '@components/ripple';
import Scrollable, {ScrollableContextValue} from '@components/scrollable2';
import {Skeleton} from '@components/skeleton';
import deferredPromise from '@helpers/cancellablePromise';
import {copyTextToClipboard} from '@helpers/clipboard';
import anchorCallback from '@helpers/dom/anchorCallback';
import createContextMenu from '@helpers/dom/createContextMenu';
import {keepMe} from '@helpers/keepMe';
import prepareTextWithEntitiesForCopying from '@helpers/prepareTextWithEntitiesForCopying';
import createMiddleware from '@helpers/solid/createMiddleware';
import {I18nTsx} from '@helpers/solid/i18n';
import {requestRAF} from '@helpers/solid/requestRAF';
import classNames from '@helpers/string/classNames';
import {AiComposeTone} from '@layer';
import {ComposeMessageWithAiArgs, ComposeMessageWithAiOkResultData} from '@lib/appManagers/aiTonesManager';
import {LangPackKey} from '@lib/langPack';
import {richMessageToPage} from '@lib/richMessage';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {children, createComputed, createEffect, createMemo, createReaction, createResource, createSignal, createUniqueId, For, JSX, Match, onCleanup, ParentProps, Show, Switch} from 'solid-js';
import {Transition, TransitionGroup} from 'solid-transition-group';
import {EmojifyCheckbox, previewStyles, processEntities} from '@components/popups/previewCard';
import {usePopupContext} from '../indexTsx';
import styles from './bodyContent.module.scss';
import {useAiEditorPopupContext} from './context';
import showCreateTonePopup from './createTonePopup';

export {Divider, Original} from '@components/popups/previewCard';


keepMe(ripple);

type TabsProps<T> = {
  items: {
    label: LangPackKey;
    icon: Icon;
    key: T;
  }[];
  activeKey: T;
  onTabChange: (key: T) => void;
};

export const Tabs = <T, >(props: TabsProps<T>) => {
  return (
    <div class={styles.padded}>
      <div class={styles.tabs}>
        <For each={props.items}>{(item) => (
          <button
            type="button"
            use:ripple
            onClick={() => props.onTabChange(item.key)}
            aria-pressed={props.activeKey === item.key}
            class={styles.tab}
            classList={{
              [styles.active]: props.activeKey === item.key
            }}
          >
            <IconTsx class={styles.tabIcon} icon={item.icon} aria-hidden="true" />
            <I18nTsx class={styles.tabLabel} key={item.label} />
          </button>
        )}</For>
      </div>
    </div>
  );
};

const MAX_CACHED_COMPOSED_MESSAGES = 50;
export const cachedComposedMessages: Map<string, ComposeMessageWithAiOkResultData> = new Map();

const getCachedComposedMessageKey = (args: ComposeMessageWithAiArgs): string => {
  if(args.customPrompt) return undefined;
  try {
    return JSON.stringify(args);
  } catch{
    return undefined;
  }
};

const getCachedComposedMessage = (args: ComposeMessageWithAiArgs): ComposeMessageWithAiOkResultData | undefined => {
  const key = getCachedComposedMessageKey(args);
  return key ? cachedComposedMessages.get(key) : undefined;
};

const setCachedComposedMessage = (key: string, data: ComposeMessageWithAiOkResultData) => {
  cachedComposedMessages.set(key, data);
  // Keep the cache bounded — evict the oldest entry (Map preserves insertion order)
  if(cachedComposedMessages.size > MAX_CACHED_COMPOSED_MESSAGES) {
    cachedComposedMessages.delete(cachedComposedMessages.keys().next().value);
  }
};

class ComposeError extends Error {
  constructor(public isPremiumFlood: boolean) {
    super();
    this.name = 'ComposeError';
  }
}

export const Result = (props: {
  overrideTitle?: JSX.Element;
  emojify?: boolean;
  onEmojify?: () => void;
  isAppearing?: boolean;
  useDiffText?: boolean;
  onPendingChange?: (pending: boolean) => void;
  composeMessageWithAiArgs?: ComposeMessageWithAiArgs;
}) => {
  const {rootScope, toastNew, wrapRichText, showPremiumPopup} = useHotReloadGuard();
  const {
    richMessage,
    resultTextSignal: [, setResultText],
    resultRichMessageSignal: [, setResultRichMessage]
  } = useAiEditorPopupContext();
  const popupContext = usePopupContext();

  let appearDeferred = props.isAppearing ? deferredPromise<void>() : undefined;

  if(appearDeferred) {
    const track = createReaction(() => {
      appearDeferred?.resolve?.();
      appearDeferred = undefined;
    });
    track(() => props.isAppearing);
  }

  const composeMessageWithAiArgs = () => ({
    ...props.composeMessageWithAiArgs,
    richMessage
  });
  const [composedMessage] = createResource(composeMessageWithAiArgs, (args) => {
    const cached = getCachedComposedMessage(args);
    if(cached) return cached;

    return (async() => {
      const [result] = await Promise.all([rootScope.managers.aiTonesManager.composeMessageWithAi(args), appearDeferred]);
      if(result.ok === false) throw new ComposeError(result.isPremiumFlood);

      const key = getCachedComposedMessageKey(args);
      if(key) setCachedComposedMessage(key, result.data);
      return result.data;
    })();
  }, {
    initialValue: getCachedComposedMessage(composeMessageWithAiArgs())
  } as {} /* Note that we need the 'pending' state when the initialValue is undefined - solved by `as {}` */);

  createEffect(() => {
    props.onPendingChange?.(
      composedMessage.state === 'pending' || composedMessage.state === 'refreshing'
    );
  });
  onCleanup(() => props.onPendingChange?.(false));

  let scrollableRef: HTMLDivElement, scrollableContextRef: ScrollableContextValue;
  const [skeletonHeight, setSkeletonHeight] = createSignal<number>();

  const isPremiumFloodError = createMemo(() => composedMessage.error instanceof ComposeError && composedMessage.error.isPremiumFlood);

  const textToRender = createMemo(() => {
    if(composedMessage.state !== 'ready') return;
    const localComposedMessage = composedMessage();
    if(localComposedMessage.resultRichMessage) return;
    if(props.useDiffText) return localComposedMessage.diffText || localComposedMessage.resultText;
    return localComposedMessage.resultText;
  });

  const richPageToRender = createMemo(() => {
    if(composedMessage.state !== 'ready') return;
    const result = composedMessage().resultRichMessage;
    return result && richMessageToPage(result);
  });

  createComputed(() => {
    if(composedMessage.state !== 'ready') return;

    setResultText(composedMessage().resultText);
    setResultRichMessage(composedMessage().resultRichMessage);

    // Note that it needs to be cleared when switching to another tab
    onCleanup(() => {
      setResultText();
      setResultRichMessage();
    });
  });

  createEffect(() => {
    if(composedMessage.state !== 'ready' && scrollableRef?.isConnected) {
      setSkeletonHeight(scrollableRef.clientHeight);
    }
  });

  const onCopyClick = async() => {
    if(composedMessage.state !== 'ready') return;
    const {text, html} = prepareTextWithEntitiesForCopying(composedMessage().resultText);
    try {
      await copyTextToClipboard(text, html, {rethrow: true});
      toastNew({
        langPackKey: 'TextCopied'
      });
    } catch{
      toastNew({
        langPackKey: 'TextCopyFailed'
      });
    }
  };

  return (
    <>
      <div class={previewStyles.resultHeader}>
        <div class={previewStyles.resultTitleWrapper}>
          <Show when={props.overrideTitle} fallback={<I18nTsx key='AiEditor.Result' class={previewStyles.resultTitle} />}>
            {props.overrideTitle}
          </Show>
          <ButtonIconTsx
            class={previewStyles.copyButton}
            classList={{
              [previewStyles.hidden]: composedMessage.state !== 'ready'
            }}
            icon='copy'
            onClick={onCopyClick}
          />
        </div>
        <Show when={props.onEmojify}>
          <EmojifyCheckbox checked={props.emojify} onClick={props.onEmojify} />
        </Show>
      </div>
      <div class={previewStyles.resultContent}>
        <Transition
          name='fade-2'
          mode='outin'
          onAfterEnter={(el) => {
            if(el === scrollableRef) requestRAF(() => {
              scrollableContextRef?.onSizeChange?.();
            });
          }}>
          <Switch>
            <Match when={richPageToRender()} keyed>
              {(page) => (
                <Scrollable
                  ref={scrollableRef}
                  contextRef={(value) => void (scrollableContextRef = value)}
                  relative
                  class={previewStyles.richTextScrollable}
                  withBorders='manual'
                >
                  <InstantViewBlocks
                    webPageId={0}
                    page={page}
                    openNewPage={() => {}}
                    collapse={() => {}}
                    class={instantViewStyles.RichMessage}
                    contentClass={classNames(
                      previewStyles.richTextScrollableContent,
                      previewStyles.nonInteractive
                    )}
                    paddings={0}
                    displayTextDiff={props.useDiffText}
                    style={{'--padding-horizontal': '0px'}}
                  />
                </Scrollable>
              )}
            </Match>
            <Match when={textToRender()} keyed>
              {(text) => (
                <Scrollable
                  tabIndex={0}
                  ref={scrollableRef}
                  contextRef={(value) => void (scrollableContextRef = value)}
                  relative
                  class={previewStyles.richTextScrollable}
                  withBorders='manual'
                >
                  <div class={classNames(previewStyles.richTextScrollableContent, previewStyles.nonInteractive)}>
                    {wrapRichText(text.text, {entities: processEntities(text.entities), middleware: createMiddleware().get()})}
                  </div>
                </Scrollable>
              )}
            </Match>
            <Match when={composedMessage.state === 'pending' || composedMessage.state === 'refreshing'}>
              <ResultSkeleton height={skeletonHeight()} />
            </Match>
            <Match when>
              <div class={previewStyles.error}>
                <Show when={isPremiumFloodError()} fallback={<I18nTsx key='AiEditor.ComposeError' />}>
                  <I18nTsx
                    key='AiEditor.PremiumFlood'
                    args={[
                      anchorCallback(() => {
                        popupContext?.hide();
                        showPremiumPopup();
                      })
                    ]}
                  />
                </Show>
              </div>
            </Match>
          </Switch>
        </Transition>
      </div>
    </>
  );
};

const ResultSkeleton = (props: {height?: number}) => {
  return (
    <Skeleton.Div
      class={previewStyles.resultSkeleton}
      secondary
      style={props.height ? {height: props.height + 'px'} : undefined}
    />
  );
};

type ToneProps = {
  name: JSX.Element;
  selected: boolean;
  withContextMenu?: {
    isSaved: boolean;
    onDelete: () => void;
    onShare: () => void;
    onEdit?: () => void;
  };
  onClick: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
} & ({docId: DocId, icon?: never} | {docId?: never, icon: Icon});

export const Tone = (props: ToneProps) => {
  const {rootScope} = useHotReloadGuard();
  const labelId = createUniqueId();

  let button: HTMLButtonElement;

  createEffect(() => {
    if(!props.withContextMenu) return;

    const {destroy} = createContextMenu({
      buttons: [
        ...(props.withContextMenu.onEdit ? [
          {
            icon: 'edit',
            text: 'Edit',
            onClick: props.withContextMenu.onEdit
          }
        ] as ButtonMenuItemOptions[] : []),
        {
          icon: 'forward',
          text: 'Share',
          onClick: props.withContextMenu.onShare
        },
        {
          icon: 'delete',
          text: props.withContextMenu.isSaved ? 'Remove' : 'Delete',
          danger: true,
          onClick: props.withContextMenu.onDelete
        }
      ],
      listenTo: button
    });

    onCleanup(() => destroy());
  });

  return (
    <button
      type="button"
      ref={button}
      aria-pressed={props.selected}
      aria-labelledby={labelId}
      class={styles.tone}
      classList={{
        [styles.active]: props.selected
      }}
      use:ripple
      onClick={props.onClick}
    >
      <Show
        when={props.docId}
        fallback={<IconTsx class={styles.toneIcon} icon={props.icon!} />}
        keyed
      >
        {(docId) => (
          <EmojiDocumentIcon
            docId={docId}
            color={props.selected ? 'primary-color' : 'primary-text-color'}
            size={42}
            class={styles.toneIcon}
            managers={rootScope.managers}
          />
        )}
      </Show>
      <div id={labelId} class={styles.toneName}>{props.name}</div>
      <Show when={props.withContextMenu}>
        <IconTsx icon='more' class={styles.toneContextMenuIcon} />
      </Show>
    </button>
  );
};

type CreateToneProps = {
  onCreate: (tone: AiComposeTone) => void;
};

export const CreateTone = (props: CreateToneProps) => {
  const {HotReloadGuard, rootScope} = useHotReloadGuard();
  return (
    <button type="button" class={styles.tone} use:ripple onClick={() => {
      showCreateTonePopup({
        onSubmit: async(args) => {
          const createdTone = await rootScope.managers.aiTonesManager.createTone(args);
          props.onCreate(createdTone);
        },
        HotReloadGuard
      });
    }}>
      <IconTsx class={styles.toneIcon} icon='edit_stars_add' aria-hidden="true" />
      <div class={styles.toneName}>
        <I18nTsx key='Create' />
      </div>
    </button>
  );
};

export const useIsAppearing = (hasAnimation: () => boolean) => {
  const [isAppearing, setIsAppearing] = createSignal(true);

  const track = createReaction(() => setIsAppearing(false));
  const finishedAnimation = createMemo(() => !hasAnimation());

  requestRAF(() => {
    track(finishedAnimation);
  });

  return isAppearing;
};

export const useTransitionGroupWhenMeasured = () => {
  const [measured, setMeasured] = createSignal(false);

  const Wrapper = (props: ParentProps) => {
    const resolved = children(() => props.children);
    return (
      <Show when={measured()} fallback={resolved()}>
        <TransitionGroup
          name='fade-2'
          moveClass='t-move-std'
          onBeforeExit={el => {
            el.classList.add(styles.exit);
          }}
        >
          {resolved()}
        </TransitionGroup>
      </Show>
    );
  };

  return {
    Wrapper,
    onMeasured: () => setMeasured(true)
  }
};
