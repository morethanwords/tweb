import {AutoHeight} from '@components/autoHeight';
import Space from '@components/space';
import {createSignal, Match, Switch} from 'solid-js';
import {Transition} from 'solid-transition-group';
import styles from './bodyContent.module.scss';
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
              {(_) => {
                const isAppearing = useIsAppearing(hasTransition);
                return <TranslateTab isAppearing={isAppearing()} />
              }}
            </Match>
            <Match when={activeTab() === TabKey.Style}>
              <StyleTab />
            </Match>
            <Match when={activeTab() === TabKey.Fix}>
              {(_) => {
                const isAppearing = useIsAppearing(hasTransition);
                return <FixTab isAppearing={isAppearing()} />
              }}
            </Match>
          </Switch>
        </Transition>
      </AutoHeight>
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
