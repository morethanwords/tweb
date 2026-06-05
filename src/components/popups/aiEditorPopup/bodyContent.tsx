import {IconTsx} from '@components/iconTsx';
import ripple from '@components/ripple';
import Space from '@components/space';
import {keepMe} from '@helpers/keepMe';
import {I18nTsx} from '@helpers/solid/i18n';
import {LangPackKey} from '@lib/langPack';
import {createMemo, createSignal, For, JSX, Match, onMount, Show, Switch} from 'solid-js';
import styles from './bodyContent.module.scss';
import Button from '@components/buttonTsx';
import {StaticCheckbox} from '@components/staticCheckbox';
import {ButtonIconTsx} from '@components/buttonIconTsx';
import {Transition} from 'solid-transition-group';
import classNames from '@helpers/string/classNames';
import {HeightTransition} from '@helpers/solid/heightTransition';

keepMe(ripple);

enum TabKey {
  Translate,
  Style,
  Fix
};

export const AiEditorPopupBodyContent = () => {
  const [activeTab, setActiveTab] = createSignal<TabKey>(TabKey.Style);

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
      <div class={styles.tabContent}>
        <TranslateTab />
      </div>
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


const collapsibleFrom = 60;

const TranslateTab = () => {
  const [emojify, setEmojify] = createSignal(false);

  return (
    <>
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
    </>
  );
};

const StyleTab = () => {
  const [emojify, setEmojify] = createSignal(false);

  return (
    <>
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
    </>
  );
};

const FixTab = () => {
  return (
    <div>

    </div>
  );
};

const Original = (props: {
  onEmojify?: () => void
}) => {
  const [collapsed, setCollapsed] = createSignal(false);
  const [originalContentHeight, setOriginalContentHeight] = createSignal<number>();
  const [isCollapsible, setIsCollapsible] = createSignal(false);

  const actuallyCollapsed = createMemo(() => collapsed() && !props.onEmojify);
  const actuallyCollapsible = createMemo(() => isCollapsible() && !props.onEmojify);

  let originalContentRef: HTMLDivElement;

  onMount(() => {
    if(!originalContentRef) return;
    const height = originalContentRef.scrollHeight;

    setOriginalContentHeight(height);
    setIsCollapsible(height > collapsibleFrom);
    setCollapsed(height > collapsibleFrom);
  });

  return (
    <>
      <div
        class={styles.originalHeader}
        classList={{[styles.clickable]: actuallyCollapsible()}}
        use:ripple={actuallyCollapsible()}
        onClick={() => actuallyCollapsible() && setCollapsed(p => !p)}
      >
        <I18nTsx key='AiEditor.Original' />
        <Transition name='fade-2'>
          <Switch>
            <Match when={props.onEmojify}>
              <EmojifyCheckbox class={styles.originalCheckbox} checked={false} onClick={props.onEmojify} />
            </Match>
            <Match when={actuallyCollapsible()}>
              <IconTsx icon='arrowhead' class={styles.originalArrow} classList={{[styles.toggled]: actuallyCollapsed()}} />
            </Match>
          </Switch>
        </Transition>
      </div>
      <div
        ref={originalContentRef}
        class={styles.originalContent}
        classList={{[styles.collapsed]: actuallyCollapsed()}}
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
