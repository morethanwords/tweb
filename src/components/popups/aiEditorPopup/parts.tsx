import {AutoHeight} from '@components/autoHeight';
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
import {createComputed, createEffect, createMemo, createReaction, createResource, createSignal, For, JSX, Match, onCleanup, onMount, Show, Switch} from 'solid-js';
import {Transition} from 'solid-transition-group';
import styles from './bodyContent.module.scss';
import {useAiEditorPopupContext} from './context';
import showCreateTonePopup from './createTonePopup';
import createContextMenu from '@helpers/dom/createContextMenu';


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
  text: TextWithEntities.textWithEntities;
  onEmojify?: () => void
}) => {
  const {wrapRichText} = useHotReloadGuard();

  const [isCollapsed, setIsCollapsed] = createSignal(false);
  const [originalContentHeight, setOriginalContentHeight] = createSignal<number>();
  const [hasOnEmojifyRaffed, setHasOnEmojifyRaffed] = createSignal(!!props.onEmojify);

  const isCollapsible = createMemo(() => originalContentHeight() > shouldBeCollapsibleFrom);
  const isActuallyCollapsible = createMemo(() => isCollapsible() && !hasOnEmojifyRaffed());

  const isActuallyCollapsed = createMemo(() => isCollapsed() && !props.onEmojify);

  let originalContentRef: HTMLDivElement;

  onMount(() => {
    if(!originalContentRef) return;

    const unobserve = observeResize(originalContentRef, () => {
      setOriginalContentHeight(originalContentRef.scrollHeight);
      setIsCollapsed(isCollapsible());
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
        ref={originalContentRef}
        class={styles.originalContent}
        classList={{
          [styles.collapsed]: isActuallyCollapsed(),
          [styles.collapsible]: isActuallyCollapsible()
        }}
        style={{'--initial-height': originalContentHeight() + 'px'}}
      >
        <div class={styles.richText}>{wrapRichText(props.text.text, {entities: props.text.entities, middleware: createMiddleware().get()})}</div>
      </div>
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

  const [hasTransition, setHasTransition] = createSignal(false);

  onMount(() => {
    requestRAF(() => {
      setHasTransition(true);
    });
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
        <AutoHeight hasTransition={hasTransition()}>
          <Transition name='fade-2' mode='outin'>
            <Show when={composedMessage.state === 'ready' && composedMessage()} keyed fallback={<ResultSkeleton />}>
              {(message) => (
                <Scrollable relative class={classNames(styles.resultScrollable, styles.richText)}>
                  {wrapRichText(message.resultText.text, {entities: message.resultText.entities, middleware: createMiddleware().get()})}
                </Scrollable>
              )}
            </Show>
          </Transition>
        </AutoHeight>
      </div>
    </>
  );
};

const ResultSkeleton = () => {
  return (
    // Necessary wrapper for transition
    <div>
      <Skeleton.Div secondary />
      <Skeleton.Div secondary />
      <Skeleton.Div secondary />
      <Skeleton.Div secondary />
      <Skeleton.Div secondary />
    </div>
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
