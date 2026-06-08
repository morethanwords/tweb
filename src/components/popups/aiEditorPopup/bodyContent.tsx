import {AutoHeight} from '@components/autoHeight';
import {ButtonIconTsx} from '@components/buttonIconTsx';
import EmojiDocumentIcon from '@components/emojiDocumentIcon';
import {IconTsx} from '@components/iconTsx';
import {observeResize} from '@components/resizeObserver';
import ripple from '@components/ripple';
import Scrollable from '@components/scrollable2';
import {Skeleton} from '@components/skeleton';
import Space from '@components/space';
import {StaticCheckbox} from '@components/staticCheckbox';
import deferredPromise from '@helpers/cancellablePromise';
import {keepMe} from '@helpers/keepMe';
import pause from '@helpers/schedulers/pause';
import createMiddleware from '@helpers/solid/createMiddleware';
import {HeightTransition} from '@helpers/solid/heightTransition';
import {I18nTsx} from '@helpers/solid/i18n';
import {requestRAF} from '@helpers/solid/requestRAF';
import {useEdgeAutoScroll} from '@helpers/solid/useEdgeAutoScroll';
import classNames from '@helpers/string/classNames';
import {useIsCleaned} from '@hooks/useIsCleaned';
import {AiComposeTone, TextWithEntities} from '@layer';
import {ComposeMessageWithAiArgs} from '@lib/appManagers/aiTonesManager';
import {LangPackKey} from '@lib/langPack';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {createComputed, createMemo, createReaction, createResource, createSignal, For, JSX, Match, onCleanup, onMount, Show, Switch, useContext} from 'solid-js';
import {Transition} from 'solid-transition-group';
import styles from './bodyContent.module.scss';
import {AiEditorPopupContext, useAiEditorPopupContext} from './context';
import showCreateTonePopup from './createTonePopup';


keepMe(ripple);

enum TabKey {
  Translate,
  Style,
  Fix
};

export const AiEditorPopupBodyContent = () => {
  const [activeTab, setActiveTab] = createSignal<TabKey>(TabKey.Style);

  const [hasTransition, setHasTransition] = createSignal(false);

  return (
    <div class={styles.bodyContent}>
      <Tabs
        items={[
          {label: 'Translate', icon: 'premium_translate', key: TabKey.Translate},
          {label: 'AiEditor.Style', icon: 'edit_stars', key: TabKey.Style},
          {label: 'AiEditor.Fix', icon: 'search_check', key: TabKey.Fix}
        ]}
        activeKey={activeTab()}
        onTabChange={setActiveTab}
      />
      <Space amount='1rem' />
      <AutoHeight hasTransition={hasTransition()} outerClass={styles.autoHeight}>
        <Transition
          name='fade-2'
          onBeforeExit={(el) => {
            el.classList.add(styles.exit);
            setHasTransition(true);
          }}
          onAfterExit={() => setHasTransition(false)}
          onBeforeEnter={() => setHasTransition(true)}
          onAfterEnter={() => setHasTransition(false)}
        >
          <Switch>
            <Match when={activeTab() === TabKey.Translate}>
              <TranslateTab />
            </Match>
            <Match when={activeTab() === TabKey.Style}>
              <StyleTab />
            </Match>
            <Match when={activeTab() === TabKey.Fix}>
              <FixTab />
            </Match>
          </Switch>
        </Transition>
      </AutoHeight>
    </div>
  );
};

type TabsProps<T> = {
  items: {
    label: LangPackKey;
    icon: Icon;
    key: T;
  }[];
  activeKey: T;
  onTabChange: (key: T) => void;
};

const Tabs = <T, >(props: TabsProps<T>) => {
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


const TranslateTab = () => {
  const [emojify, setEmojify] = createSignal(false);

  const {text: originalText} = useContext(AiEditorPopupContext);

  return (
    <div class={styles.tabContent}>
      <Original text={originalText} />
      <Divider />
      <Result
        overrideTitle={
          <I18nTsx
            class={styles.resultTitle}
            key='AiEditor.TranslateTo'
            args={[<span class={styles.resultLanguage} use:ripple>Spanish</span>]}
          />
        }
        emojify={emojify()}
        onEmojify={() => setEmojify(!emojify())}
      />
    </div>
  );
};

const StyleTab = () => {
  const {rootScope} = useHotReloadGuard();
  const [emojify, setEmojify] = createSignal(false);
  const [tonesListEl, setTonesListEl] = createSignal<HTMLDivElement>();
  const [selectedTone, setSelectedTone] = createSignal<AiComposeTone>();
  const [runningAnimations, setRunningAnimations] = createSignal(0);

  const {text: originalText} = useContext(AiEditorPopupContext);

  // TODO: Handle errors
  const [tones] = createResource(() => rootScope.managers.aiTonesManager.getTones());

  useEdgeAutoScroll({
    axis: () => 'horizontal',
    container: tonesListEl,
    innerThreshold: () => 32,
    outerThreshold: () => 16,
    interval: () => 320,
    startInterval: () => 800,
    startDelay: () => 200,
    padding: () => 4,
    rampFactor: () => 0.75
  });

  const onSelectTone = (tone: AiComposeTone) => {
    if(tone === selectedTone()) setSelectedTone()
    else setSelectedTone(tone);
  };

  const selectedToneSlugOrId = () => {
    const localSelectedTone = selectedTone();
    if(!localSelectedTone) return undefined;
    if(localSelectedTone._ === 'aiComposeTone') return localSelectedTone.id.toString();
    return localSelectedTone.tone;
  };

  return (
    <div>
      <div class={styles.section}>
        <Scrollable class={styles.tonesList} ref={setTonesListEl} axis='x' relative>
          <CreateTone />
          <For each={tones()}>
            {(tone) => (
              <Tone
                docId={tone.emoji_id}
                name={tone.title}
                selected={tone === selectedTone()}
                onClick={[onSelectTone, tone]}
              />
            )}
          </For>
        </Scrollable>
      </div>
      <Space amount='1rem' />
      <div class={styles.tabContent}>
        <Original text={originalText} onEmojify={!emojify() && !selectedTone() ? () => setEmojify(true) : undefined} />
        <HeightTransition onRunningAnimations={setRunningAnimations}>
          <Show when={emojify() || selectedTone()}>
            {(_) => {
              const [isAppearing, setIsAppearing] = createSignal(true);

              const track = createReaction(() => setIsAppearing(false));
              const finishedAnimation = createMemo(() => runningAnimations() === 0);

              requestRAF(() => {
                track(finishedAnimation);
              });

              return (
                <div style={{overflow: 'hidden'}}>
                  <Divider />
                  <Result
                    isAppearing={isAppearing()}
                    emojify={emojify()}
                    onEmojify={() => setEmojify(!emojify())}
                    composeMessageWithAiArgs={{
                      text: originalText,
                      toneNameOrId: selectedToneSlugOrId(),
                      emojify: emojify()
                    }}
                  />
                </div>
              );
            }}
          </Show>
        </HeightTransition>
      </div>
    </div>
  );
};

const FixTab = () => {
  const {text: originalText} = useContext(AiEditorPopupContext);

  return (
    <div class={styles.tabContent}>
      <Original text={originalText} />
      <Divider />
      <Result />
    </div>
  );
};

const shouldBeCollapsibleFrom = 60;

const Original = (props: {
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
              <IconTsx icon='arrowhead' class={styles.originalArrow} classList={{[styles.toggled]: isActuallyCollapsed()}} />
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
        <div>{wrapRichText(props.text.text, {entities: props.text.entities, middleware: createMiddleware().get()})}</div>
      </div>
    </>
  );
};

const Result = (props: {
  overrideTitle?: JSX.Element;
  emojify?: boolean;
  onEmojify?: () => void;
  isAppearing?: boolean;
  composeMessageWithAiArgs?: ComposeMessageWithAiArgs;
}) => {
  const {rootScope, wrapRichText} = useHotReloadGuard();
  const context = useAiEditorPopupContext();

  let appearDeferred = props.isAppearing ? deferredPromise<void>() : undefined;

  if(appearDeferred) {
    const track = createReaction(() => {
      appearDeferred?.resolve?.();
      appearDeferred = undefined;
    });
    track(() => props.isAppearing);
  }

  const [composedMessage] = createResource(() => props.composeMessageWithAiArgs, async(args) => {
    await Promise.all([pause(20), appearDeferred])
    return {
      resultText: {
        _: 'textWithEntities',
        text: context.text.text + '\n' + [...Array(10 + Math.floor(Math.random() * 40))].map(() => 'hello').join(' '),
        entities: context.text.entities
      }
    };
    // return rootScope.managers.aiTonesManager.composeMessageWithAi(args);
  });

  const [hasTransition, setHasTransition] = createSignal(false);

  onMount(() => {
    requestRAF(() => {
      setHasTransition(true);
    });
  });

  return (
    <>
      <div class={styles.resultHeader}>
        <div class={styles.resultTitleWrapper}>
          <Show when={props.overrideTitle} fallback={<I18nTsx key='AiEditor.Result' class={styles.resultTitle} />}>
            {(title) => <>{title()}</>}
          </Show>
          <ButtonIconTsx class={styles.copyButton} icon='copy' />
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
                <div>
                  {wrapRichText(message.resultText.text, {entities: message.resultText.entities, middleware: createMiddleware().get()})}
                </div>
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
    <div>
      <Skeleton secondary loading />
      <Skeleton secondary loading />
      <Skeleton secondary loading />
      <Skeleton secondary loading />
      <Skeleton secondary loading />
    </div>
  );
};

const Divider = () => {
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

const Tone = (props: {
  docId: DocId;
  name: string;
  selected: boolean;
  onClick: JSX.EventHandlerUnion<HTMLDivElement, MouseEvent>;
}) => {
  const {rootScope} = useHotReloadGuard();

  return (
    <div
      class={styles.tone}
      classList={{
        [styles.active]: props.selected
      }}
      use:ripple
      onClick={props.onClick}
    >
      <EmojiDocumentIcon docId={props.docId} color='primary-text-color' size={42} class={styles.toneIcon} managers={rootScope.managers} />
      <div class={styles.toneName}>{props.name}</div>
    </div>
  );
};

const CreateTone = () => {
  const {HotReloadGuard} = useHotReloadGuard();
  return (
    <div class={styles.tone} use:ripple onClick={() => {
      showCreateTonePopup({
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

const texte = 'hi there'
const text = `Animi voluptas blanditiis blanditiis corporis accusantium libero eum necessitatibus. Laboriosam in ullam commodi excepturi dolor eveniet nihil dignissimos. Ipsa qui quia rem praesentium repudiandae voluptatem facere ratione.`;

const text2 = `Nisi voluptas et fuga. Dolorum accusamus maxime magnam hic qui quis ad. Totam aut illo enim dicta aut recusandae hic. Quia placeat sint placeat vel ipsam. Sit nobis nisi cumque labore iusto repellendus.`;

const docId = '5345804987123378599';

//  int PremiumLimits::aiComposeSavedTonesDefault() const {
// return appConfigLimit("aicompose_tone_saved_limit_default", 5);
//  }
//  int PremiumLimits::aiComposeSavedTonesPremium() const {
// return appConfigLimit("aicompose_tone_saved_limit_premium", 20);
//  }

/*
const auto maxExamples = session->appConfig().get<int>(
u"aicompose_tone_examples_num"_q,
3);

AICOMPOSE_TONE_SLUG_INVALID
AICOMPOSE_FLOOD_PREMIUM
if (type == u"AICOMPOSE_TONE_SLUG_INVALID"_q
|| type == u"AICOMPOSE_TONE_INVALID"_q
|| type == u"TONE_NOT_FOUND"_q) {

*/
