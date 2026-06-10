import {ButtonIconTsx} from '@components/buttonIconTsx';
import EmojiDocumentIcon from '@components/emojiDocumentIcon';
import {IconTsx} from '@components/iconTsx';
import {observeResize} from '@components/resizeObserver';
import ripple from '@components/ripple';
import Scrollable from '@components/scrollable2';
import {Skeleton} from '@components/skeleton';
import {StaticCheckbox} from '@components/staticCheckbox';
import deferredPromise from '@helpers/cancellablePromise';
import {copyTextToClipboard} from '@helpers/clipboard';
import createContextMenu from '@helpers/dom/createContextMenu';
import {keepMe} from '@helpers/keepMe';
import prepareTextWithEntitiesForCopying from '@helpers/prepareTextWithEntitiesForCopying';
import pause from '@helpers/schedulers/pause';
import createMiddleware from '@helpers/solid/createMiddleware';
import {I18nTsx} from '@helpers/solid/i18n';
import {requestRAF} from '@helpers/solid/requestRAF';
import classNames from '@helpers/string/classNames';
import {useIsCleaned} from '@hooks/useIsCleaned';
import {AiComposeTone, TextWithEntities} from '@layer';
import {ComposeMessageWithAiArgs, ComposeMessageWithAiResult} from '@lib/appManagers/aiTonesManager';
import {LangPackKey} from '@lib/langPack';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {batch, children, createComputed, createEffect, createMemo, createReaction, createResource, createSignal, For, JSX, Match, onCleanup, onMount, ParentProps, Show, Switch} from 'solid-js';
import {Transition, TransitionGroup} from 'solid-transition-group';
import styles from './bodyContent.module.scss';
import {useAiEditorPopupContext} from './context';
import showCreateTonePopup from './createTonePopup';


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
    <div class={styles.tabs}>
      <For each={props.items}>{(item) => (
        <div
          use:ripple
          onClick={() => props.onTabChange(item.key)}
          class={styles.tab}
          classList={{
            [styles.active]: props.activeKey === item.key
          }}
        >
          <IconTsx class={styles.tabIcon} icon={item.icon} />
          <I18nTsx class={styles.tabLabel} key={item.label} />
        </div>
      )}</For>
    </div>
  );
};

const shouldBeCollapsibleFrom = 60;

export const Original = (props: {
  isAppearing: boolean;
  text: TextWithEntities.textWithEntities;
  onEmojify?: () => void
  onMeasured?: () => void
}) => {
  const {wrapRichText} = useHotReloadGuard();

  const [isCollapsed, setIsCollapsed] = createSignal(false);
  const [originalContentHeight, setOriginalContentHeight] = createSignal<number>();
  const [hasOnEmojifyRaffed, setHasOnEmojifyRaffed] = createSignal(!!props.onEmojify);

  const isCollapsible = createMemo(() => originalContentHeight() > shouldBeCollapsibleFrom);
  const isActuallyCollapsible = createMemo(() => isCollapsible() && !hasOnEmojifyRaffed());

  const isActuallyCollapsed = createMemo(() => isCollapsed() && !props.onEmojify);

  let originalContentRef: HTMLDivElement;
  let originalScrollableRef: HTMLDivElement;

  onMount(() => {
    if(!originalContentRef) return;

    // Note that the tab is in a <Transition mode='outin'>, which means the content is rendered, and then after some time is added into the DOM
    // So we need to wait for a resize event to get the proper scrollHeight
    const unobserve = observeResize(originalContentRef, () => {
      batch(() => {
        setOriginalContentHeight(originalContentRef.scrollHeight);
        setIsCollapsed(isCollapsible());
        props.onMeasured?.();
      });

      unobserve();
    });

    onCleanup(() => unobserve());
  });

  createComputed(() => {
    if(!props.onEmojify) {
      setHasOnEmojifyRaffed(false);
      return
    }

    const isCleaned = useIsCleaned();

    requestRAF(() => {
      if(isCleaned()) return;
      setHasOnEmojifyRaffed(true);
    });
  });

  createEffect(() => {
    if(!originalScrollableRef) return;
    if(!isActuallyCollapsed()) return;
    originalScrollableRef.scrollTo({top: 0});
  });

  return (
    <>
      <div
        class={styles.originalHeader}
        classList={{
          [styles.clickable]: isActuallyCollapsible()
        }}
        use:ripple={isActuallyCollapsible()}
        // #click1
        onClick={() => isActuallyCollapsible() && setIsCollapsed(p => !p)}
      >
        <I18nTsx key='AiEditor.Original' />
        <Transition name='fade-2'>
          <Switch>
            <Match when={props.onEmojify}>
              <EmojifyCheckbox
                class={styles.originalCheckbox}
                checked={false}
                onClick={() => {
                  // we want this to trigger after the outer click handler #click1
                  requestRAF(() => {
                    props.onEmojify?.();
                  });
                }}
              />
            </Match>
            <Match when={isActuallyCollapsible()}>
              <div class={styles.originalArrow} classList={{[styles.toggled]: isActuallyCollapsed()}}>
                <IconTsx icon='arrowhead' class={styles.originalArrowIcon} />
              </div>
            </Match>
          </Switch>
        </Transition>
      </div>
      <div
        class={styles.originalContent}
        classList={{
          [styles.collapsible]: isCollapsible(),
          [styles.collapsed]: isActuallyCollapsed()
        }}
        style={{'--original-content-height': originalContentHeight() + 'px'}}
      >
        <div ref={originalContentRef} class={styles.richText}>
          <Scrollable ref={originalScrollableRef} class={styles.originalScrollable} relative>
            {wrapRichText(props.text.text, {entities: props.text.entities, middleware: createMiddleware().get()})}
          </Scrollable>
        </div>
        <div
          class={styles.originalOverlay}
          classList={{
            [styles.hasTransition]: !props.isAppearing
          }}
        />
      </div>
      <Show when={isCollapsible() && !isActuallyCollapsed()}>
        <div
          class={styles.originalFakeHeight}
          style={{'--original-content-height': originalContentHeight() + 'px'}}
        />
      </Show>
    </>
  );
};

const cachedComposedMessages: Map<string, ComposeMessageWithAiResult> = new Map();

const getCachedComposedMessageKey = (args: ComposeMessageWithAiArgs): string => {
  try {
    return JSON.stringify(args);
  } catch{
    return undefined;
  }
};

const getCachedComposedMessage = (args: ComposeMessageWithAiArgs): ComposeMessageWithAiResult | undefined => {
  const key = getCachedComposedMessageKey(args);
  return key ? cachedComposedMessages.get(key) : undefined;
};

export const Result = (props: {
  overrideTitle?: JSX.Element;
  emojify?: boolean;
  onEmojify?: () => void;
  isAppearing?: boolean;
  composeMessageWithAiArgs?: ComposeMessageWithAiArgs;
}) => {
  const {rootScope, wrapRichText, toastNew} = useHotReloadGuard();
  const {text: originalText, resultTextSignal: [, setResultText]} = useAiEditorPopupContext();

  let appearDeferred = props.isAppearing ? deferredPromise<void>() : undefined;

  if(appearDeferred) {
    const track = createReaction(() => {
      appearDeferred?.resolve?.();
      appearDeferred = undefined;
    });
    track(() => props.isAppearing);
  }

  const [composedMessage] = createResource(() => props.composeMessageWithAiArgs, (args) => {
    const cached = getCachedComposedMessage(args);
    if(cached) return cached;

    // return (async() => {
    // Don't forget about appearDeferred
    //   const result = await rootScope.managers.aiTonesManager.composeMessageWithAi(args);
    //   const key = getCachedComposedMessageKey(args);
    //   if(key) cachedComposedMessages.set(key, result);
    //   return result;
    // })();

    return (async() => {
      await Promise.all([pause(20 + Math.floor(Math.random() * 1000)), appearDeferred]);
      const result = {
        resultText: {
          _: 'textWithEntities',
          text: originalText.text + '\n' + [...Array(10 + Math.floor(Math.random() * 40))].map(() => 'hello').join(' '),
          entities: originalText.entities
        } as TextWithEntities
      };
      cachedComposedMessages.set(getCachedComposedMessageKey(args), result);
      return result;
    })();
  }, {
    initialValue: getCachedComposedMessage(props.composeMessageWithAiArgs)
  });

  let scrollableRef: HTMLDivElement;
  const [skeletonHeight, setSkeletonHeight] = createSignal<number>();

  createEffect(() => {
    if(composedMessage.state !== 'ready' && scrollableRef?.isConnected) {
      setSkeletonHeight(scrollableRef.clientHeight);
    }
  });

  createComputed(() => {
    if(composedMessage.state !== 'ready') return;

    setResultText(composedMessage().resultText);

    onCleanup(() => {
      setResultText();
    });
  });

  const onCopyClick = async() => {
    if(composedMessage.state !== 'ready') return;
    const {text, html} = prepareTextWithEntitiesForCopying(composedMessage().resultText);
    try {
      await copyTextToClipboard(text, html);
      toastNew({
        langPackKey: 'TextCopied'
      });
    } catch(e) {
      toastNew({
        langPackKey: 'TextCopyFailed'
      });
    }
  };

  return (
    <>
      <div class={styles.resultHeader}>
        <div class={styles.resultTitleWrapper}>
          <Show when={props.overrideTitle} fallback={<I18nTsx key='AiEditor.Result' class={styles.resultTitle} />}>
            {props.overrideTitle}
          </Show>
          <ButtonIconTsx
            class={styles.copyButton}
            classList={{
              [styles.hidden]: composedMessage.state !== 'ready'
            }}
            icon='copy'
            onClick={onCopyClick}
          />
        </div>
        <Show when={props.onEmojify}>
          <EmojifyCheckbox checked={props.emojify} onClick={props.onEmojify} />
        </Show>
      </div>
      <div class={styles.resultContent}>
        <Transition name='fade-2' mode='outin'>
          <Show when={composedMessage.state === 'ready' && composedMessage()} keyed fallback={<ResultSkeleton height={skeletonHeight()} />}>
            {(message) => (
              <Scrollable ref={scrollableRef} relative class={classNames(styles.resultScrollable, styles.richText)}>
                {wrapRichText(message.resultText.text, {entities: message.resultText.entities, middleware: createMiddleware().get()})}
              </Scrollable>
            )}
          </Show>
        </Transition>
      </div>
    </>
  );
};

const ResultSkeleton = (props: {height?: number}) => {
  return (
    <Skeleton.Div
      class={styles.resultSkeleton}
      secondary
      style={props.height ? {height: props.height + 'px'} : undefined}
    />
  );
};

export const Divider = () => {
  return <div class={styles.divider}></div>;
};

const EmojifyCheckbox = (props: {
  class?: string;
  checked: boolean;
  onClick: () => void;
}) => {
  return (
    <div class={classNames(styles.emojifyCheckbox, props.class)} onClick={props.onClick} use:ripple>
      <StaticCheckbox round checked={props.checked} />
      <I18nTsx key='AiEditor.Emojify' />
    </div>
  );
};

export const Tone = (props: {
  docId: DocId;
  name: string;
  selected: boolean;
  withContextMenu?: {
    isSaved: boolean;
    onDelete: () => void;
    onShare: () => void;
    onEdit: () => void;
  };
  onClick: JSX.EventHandlerUnion<HTMLDivElement, MouseEvent>;
}) => {
  const {rootScope} = useHotReloadGuard();

  let div: HTMLDivElement;

  createEffect(() => {
    if(!props.withContextMenu) return;

    const {destroy, open} = createContextMenu({
      buttons: [
        {
          icon: 'edit',
          text: 'Edit',
          onClick: props.withContextMenu.onEdit
        },
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
      listenTo: div
    });

    onCleanup(() => destroy());
  });

  return (
    <div
      ref={div}
      class={styles.tone}
      classList={{
        [styles.active]: props.selected
      }}
      use:ripple
      onClick={props.onClick}
    >
      <EmojiDocumentIcon docId={props.docId} color='primary-text-color' size={42} class={styles.toneIcon} managers={rootScope.managers} />
      <div class={styles.toneName}>{props.name}</div>
      <Show when={props.withContextMenu}>
        <IconTsx icon='more' class={styles.toneContextMenuIcon} />
      </Show>
    </div>
  );
};

type CreateToneProps = {
  onCreate: (tone: AiComposeTone) => void;
};

export const CreateTone = (props: CreateToneProps) => {
  const {HotReloadGuard, rootScope} = useHotReloadGuard();
  return (
    <div class={styles.tone} use:ripple onClick={() => {
      showCreateTonePopup({
        onSubmit: async(args) => {
          const createdTone = await rootScope.managers.aiTonesManager.createTone(args);
          props.onCreate(createdTone);
        },
        HotReloadGuard
      });
    }}>
      <IconTsx class={styles.toneIcon} icon='edit_stars_add' />
      <div class={styles.toneName}>
        <I18nTsx key='Create' />
      </div>
    </div>
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
            if(!(el instanceof HTMLElement)) return;
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
