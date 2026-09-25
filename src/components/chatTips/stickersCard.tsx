import {createEffect, createMemo, createResource, For, on, Show} from 'solid-js';

import anchorCallback from '@helpers/dom/anchorCallback';
import {getStickerSetInputByStickerSet} from '@appManagers/utils/stickers/getStickerSetInput';
import {StickerSet} from '@layer';
import {i18n, LangPackKey} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {useAppSettings} from '@stores/appSettings';
import {StateSettings} from '@config/state';

import showStickersPopup from '@components/popups/stickers';
import {AppStickersTab} from '@components/solidJsTabs/tabs';
import {StickerTsx} from '@components/wrappers/sticker';

import TipCard, {openSettingsTab, TipCardButton, useTipReady} from '@components/chatTips/tipCard';
import styles from '@components/chatTips/chatTips.module.scss';

/** macOS shows three featured packs side by side in the content slot. */
const SETS_LIMIT = 3;

const COVER_SIZE = 88;

type SuggestMode = StateSettings['stickers']['suggest'];

const MODES: [SuggestMode, Icon, LangPackKey][] = [
  ['none', 'stop', 'SuggestStickersNone'],
  ['installed', 'newprivate', 'SuggestStickersInstalled'],
  ['all', 'stickers_face', 'SuggestStickersAll']
];

/**
 * Stickers tip — macOS' `WidgetStickersController`: the "Suggest Stickers by Emoji" mode in the
 * button row (the same `settings.stickers.suggest` key Stickers and Emoji writes), a few trending
 * packs as the content, and a line pointing at the full Trending list.
 */
export default function StickersTipCard() {
  const {appSidebarLeft, rootScope} = useHotReloadGuard();
  const [appSettings, setAppSettings] = useAppSettings();

  const [featured] = createResource(async() => {
    const sets = await rootScope.managers.appStickersManager.getFeaturedStickers();
    return sets.slice(0, SETS_LIMIT).map(({set}) => set);
  });

  const markReady = useTipReady();
  createEffect(on(featured, (sets) => sets && markReady()));

  const buttons = (): TipCardButton[] => MODES.map(([value, icon, langKey]) => ({
    icon,
    text: i18n(langKey),
    selected: appSettings.stickers.suggest === value,
    onClick: () => setAppSettings('stickers', 'suggest', value)
  }));

  return (
    <TipCard
      title={i18n('Stickers.SuggestStickers')}
      buttons={buttons()}
      contentTitle={i18n('Stickers.Trending')}
      description={i18n('ChatTips.Stickers.Description', [
        anchorCallback(() => openSettingsTab(appSidebarLeft, AppStickersTab))
      ])}
    >
      <div class={styles.stickerSets}>
        <For each={featured()}>{(set) => <TrendingStickerSet set={set} />}</For>
      </div>
    </TipCard>
  );
}

/** One trending pack: its cover sticker over the pack title. Clicking it opens the pack. */
function TrendingStickerSet(props: {set: StickerSet.stickerSet}) {
  const {rootScope} = useHotReloadGuard();
  const input = createMemo(() => getStickerSetInputByStickerSet(props.set));

  // `getFeaturedStickers` only caches the pack headers, so the cover is fetched per pack (from
  // the manager's own cache on every visit after the first).
  const [cover] = createResource(async() => {
    const set = await rootScope.managers.appStickersManager.getStickerSet(input());
    return set.documents.find((doc) => doc._ !== 'documentEmpty');
  });

  // Named by the pack title under the cover; the cover itself is decoration.
  return (
    <button type="button" class={styles.stickerSet} onClick={() => showStickersPopup(input())}>
      <div class={styles.stickerSetCover} aria-hidden="true">
        <Show when={cover()}>{(doc) => (
          <StickerTsx
            sticker={doc()}
            width={COVER_SIZE}
            height={COVER_SIZE}
            extraOptions={{group: 'CHAT-TIPS', play: true, loop: true, withLock: true}}
          />
        )}</Show>
      </div>
      <div class={styles.stickerSetName}>{wrapEmojiText(props.set.title)}</div>
    </button>
  );
}
