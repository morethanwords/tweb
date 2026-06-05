import {AutoHeight} from '@components/autoHeight';
import {ButtonIconTsx} from '@components/buttonIconTsx';
import {IconTsx} from '@components/iconTsx';
import {observeResize} from '@components/resizeObserver';
import ripple from '@components/ripple';
import Space from '@components/space';
import {StaticCheckbox} from '@components/staticCheckbox';
import {keepMe} from '@helpers/keepMe';
import {HeightTransition} from '@helpers/solid/heightTransition';
import {I18nTsx} from '@helpers/solid/i18n';
import {requestRAF} from '@helpers/solid/requestRAF';
import classNames from '@helpers/string/classNames';
import {useIsCleaned} from '@hooks/useIsCleaned';
import {LangPackKey} from '@lib/langPack';
import {createComputed, createMemo, createSignal, For, JSX, Match, onCleanup, onMount, Show, Switch} from 'solid-js';
import {Transition} from 'solid-transition-group';
import styles from './bodyContent.module.scss';

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
          {label: 'AiEditor.Style', icon: 'ai_style_tone', key: TabKey.Style},
          {label: 'AiEditor.Fix', icon: 'search', key: TabKey.Fix}
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

  return (
    <div class={styles.tabContent}>
      <Original />
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
  const [emojify, setEmojify] = createSignal(false);

  return (
    <div class={styles.tabContent}>
      <Original onEmojify={!emojify() ? () => setEmojify(true) : undefined} />
      <HeightTransition>
        <Show when={emojify()}>
          <div style={{overflow: 'hidden'}}>
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
        </Show>
      </HeightTransition>
    </div>
  );
};

const FixTab = () => {
  return (
    <div class={styles.tabContent}>
      <Original />
      <Divider />
      <Result />
    </div>
  );
};

const shouldBeCollapsibleFrom = 60;

const Original = (props: {
  onEmojify?: () => void
}) => {
  const [collapsed, setCollapsed] = createSignal(false);
  const [originalContentHeight, setOriginalContentHeight] = createSignal<number>();
  const [raffedHasOnEmojify, setRaffedHasOnEmojify] = createSignal(!!props.onEmojify);

  const isCollapsible = createMemo(() => originalContentHeight() > shouldBeCollapsibleFrom && !raffedHasOnEmojify());

  const actuallyCollapsed = createMemo(() => collapsed() && !props.onEmojify);

  let originalContentRef: HTMLDivElement;

  onMount(() => {
    if(!originalContentRef) return;

    let isFirst = true;

    const unobserve = observeResize(originalContentRef, (entry) => {
      setOriginalContentHeight(originalContentRef.scrollHeight);
      if(isFirst) {
        setCollapsed(isCollapsible());
        isFirst = false;
      }
    });

    onCleanup(() => unobserve());
  });

  createComputed(() => {
    if(!props.onEmojify) {
      setRaffedHasOnEmojify(false);
      return
    }

    const isCleaned = useIsCleaned();

    requestRAF(() => {
      if(isCleaned()) return;
      setRaffedHasOnEmojify(true);
      requestRAF(() => {
        setTimeout(() => {
        }, 400);
      });
    });
  });

  return (
    <>
      <div
        class={styles.originalHeader}
        classList={{
          [styles.clickable]: isCollapsible()
        }}
        use:ripple={isCollapsible()}
        // #click1
        onClick={() => isCollapsible() && setCollapsed(p => !p)}
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
            <Match when={isCollapsible()}>
              <IconTsx icon='arrowhead' class={styles.originalArrow} classList={{[styles.toggled]: actuallyCollapsed()}} />
            </Match>
          </Switch>
        </Transition>
      </div>
      <div
        ref={originalContentRef}
        class={styles.originalContent}
        classList={{
          [styles.collapsed]: actuallyCollapsed(),
          [styles.collapsible]: isCollapsible()
        }}
        style={{'--initial-height': originalContentHeight() + 'px'}}
      >
        <div>{text}</div>
      </div>
    </>
  );
};

const Result = (props: {
  overrideTitle?: JSX.Element;
  emojify?: boolean;
  onEmojify?: () => void;
}) => {
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
        {text2}
      </div>
    </>
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

const texte = 'hi there'
const text = `Animi voluptas blanditiis blanditiis corporis accusantium libero eum necessitatibus. Laboriosam in ullam commodi excepturi dolor eveniet nihil dignissimos. Ipsa qui quia rem praesentium repudiandae voluptatem facere ratione.`;

const text2 = `Nisi voluptas et fuga. Dolorum accusamus maxime magnam hic qui quis ad. Totam aut illo enim dicta aut recusandae hic. Quia placeat sint placeat vel ipsam. Sit nobis nisi cumque labore iusto repellendus.`;
