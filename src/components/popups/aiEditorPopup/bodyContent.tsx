import {AutoHeight} from '@components/autoHeight';
import Button from '@components/buttonTsx';
import {IconTsx} from '@components/iconTsx';
import Scrollable, {ScrollableContextValue} from '@components/scrollable2';
import Space from '@components/space';
import debounce from '@helpers/schedulers/debounce';
import {I18nTsx} from '@helpers/solid/i18n';
import {useObserveResize} from '@hooks/useObserveResize';
import {createSignal, Match, Show, Switch} from 'solid-js';
import {Transition} from 'solid-transition-group';
import styles from './bodyContent.module.scss';
import {useAiEditorPopupContext} from './context';
import {FixTab} from './fixTab';
import {Tabs, useIsAppearing} from './parts';
import {StyleTab} from './styleTab';
import {TranslateTab} from './translateTab';


enum TabKey {
  Translate,
  Style,
  Fix
};

export const AiEditorPopupBodyContent = () => {
  const {onApply, onSend, resultTextSignal: [resultText]} = useAiEditorPopupContext();

  const [activeTab, setActiveTab] = createSignal<TabKey>(TabKey.Style);
  const [hasTransition, setHasTransition] = createSignal(false);

  const [scrollableEl, setScrollableEl] = createSignal<HTMLDivElement>();
  const [scrollableContentEl, setScrollableContentEl] = createSignal<HTMLDivElement>();
  let scrollableContextRef!: ScrollableContextValue;

  const updateScrollable = debounce(() => {
    scrollableContextRef?.onSizeChange();
  }, 100, false, true);

  useObserveResize(scrollableContentEl, updateScrollable);
  useObserveResize(scrollableEl, updateScrollable);

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
      <Space amount='0.5rem' />
      <Scrollable
        ref={setScrollableEl}
        class={styles.scrollable}
        relative
        withBorders='both'
        contextRef={(value) => void (scrollableContextRef = value)}
      >
        <div class={styles.scrollableContent}> {/* Need a separate wrapper for padding */}
          <AutoHeight
            ref={setScrollableContentEl}
            outerClass={styles.autoHeight}
            hasTransition={hasTransition()}
            overflowHidden
          >
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
                  {(_) => {
                    const isAppearing = useIsAppearing(hasTransition);
                    return <div><TranslateTab isAppearing={isAppearing()} /></div>
                  }}
                </Match>
                <Match when={activeTab() === TabKey.Style}>
                  <div><StyleTab /></div>
                </Match>
                <Match when={activeTab() === TabKey.Fix}>
                  {(_) => {
                    const isAppearing = useIsAppearing(hasTransition);
                    return <div><FixTab isAppearing={isAppearing()} /></div>
                  }}
                </Match>
              </Switch>
            </Transition>
          </AutoHeight>
        </div>
      </Scrollable>
      <Space amount='0.5rem' />
      <div class={styles.footerButtons}>
        <Button
          class={styles.applyButton}
          primaryFilled
          disabled={!resultText()}
          onClick={() => {
            if(!resultText()) return;
            onApply(resultText());
          }}
        >
          <I18nTsx key='Apply' />
        </Button>
        <Show when={onSend} keyed>
          {(send) => (
            <Button
              class={styles.sendButton}
              primaryFilled
              disabled={!resultText()}
              onClick={() => {
                if(!resultText()) return;
                send(resultText());
              }}
            >
              <IconTsx class={styles.sendButtonIcon} icon='logo' />
            </Button>
          )}
        </Show>
      </div>
    </div>
  );
};
