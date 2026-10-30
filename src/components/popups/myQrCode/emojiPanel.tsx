import {Accessor, createEffect, createMemo, For, onCleanup, onMount, untrack} from 'solid-js';
import EmojiTab from '@components/emoticonsDropdown/tabs/emoji';
import wrapCustomEmoji from '@components/wrappers/customEmoji';
import {makeMediaSize} from '@helpers/mediaSize';
import {getMiddleware} from '@helpers/middleware';
import classNames from '@helpers/string/classNames';
import I18n from '@lib/langPack';
import {AppManagers} from '@lib/managers';
import pause from '@helpers/schedulers/pause';
import {addAppliedEmoji, getAppliedEmoji, getStandardEmojiUrl, loadPresetIds, resolvePresetIds} from './emojiPresets';
import {ThemeEmoji, themeEmojiKey} from './theme';
import styles from '@components/popups/myQrCode.module.scss';

const CHOSEN_EMOJI_SIZE = 24;
const PRESETS_WAIT = 300;
// an adaptive emoji is white here, as on the field: the renderer reads a property of the page's root, not of the sheet
const CHOSEN_EMOJI_COLOR = 'white';

/**
 * The emoji: the shared emoji tab (custom emoji only, as on Android), standing in the sheet. What was put on a code
 * lately comes first, then the presets, which anyone may use; the installed packs are Premium's ("Unlock").
 */
export function EmojiPanel(props: {
  managers: AppManagers,
  emojis: Accessor<ThemeEmoji[]>,
  size: Accessor<{width: number, height: number}>,
  onPick: (docId: DocId) => void
}) {
  let host: HTMLDivElement;
  let tab: EmojiTab;
  const free = new Set<DocId>();

  onMount(() => {
    tab = new EmojiTab({
      managers: props.managers,
      isStandalone: true,
      noRegularEmoji: true,
      noSearch: true,
      packsAfterMainSets: true,
      freeCustomEmoji: free,
      // the presets' set only names slot 4's snowflake: a slow answer must not hold back what was picked before
      mainSets: () => [Promise.race([loadPresetIds(props.managers), pause(PRESETS_WAIT).then(() => resolvePresetIds())]).then((presets) => {
        presets.forEach((id) => free.add(id));
        return [...new Set([...getAppliedEmoji(), ...presets])];
      })],
      onClick: ({docId}) => {
        if(!docId) return;
        addAppliedEmoji(docId);
        props.onPick(docId);
      }
    });
    tab.getContainerSize = props.size;
    tab.textColor = () => CHOSEN_EMOJI_COLOR;
    tab.container.classList.remove('tabs-tab');
    host.append(tab.container);
    tab.init();
    onCleanup(() => tab.destroy());
  });

  // the picks on show are marked, and stay usable whoever picked them: a theme already served is not a Premium act
  createEffect(() => {
    const docIds = props.emojis().map((emoji) => emoji.documentId).filter(Boolean);
    docIds.forEach((id) => free.add(id));
    tab?.setActiveDocIds(docIds);
  });

  return <div ref={host} class={styles.emojiHost} />;
}

function ChosenEmoji(props: {emoji: ThemeEmoji}) {
  const middlewareHelper = getMiddleware();
  onCleanup(() => middlewareHelper.destroy());

  if(!props.emoji.documentId) {
    return <img class={styles.chosenImage} src={getStandardEmojiUrl(props.emoji.emoticon)} alt="" />;
  }

  return (
    <>
      {wrapCustomEmoji({
        docIds: [props.emoji.documentId],
        customEmojiSize: makeMediaSize(CHOSEN_EMOJI_SIZE, CHOSEN_EMOJI_SIZE),
        animationGroup: 'none',
        textColor: CHOSEN_EMOJI_COLOR,
        middleware: middlewareHelper.get()
      })}
    </>
  );
}

/** The emoji on the code, over the sheet in the island's place while their panel is open: a press takes one off */
export function ChosenEmojiStrip(props: {
  emojis: Accessor<ThemeEmoji[]>,
  onRemove: (emoji: ThemeEmoji) => void
}) {
  // by key: a theme coming back from the server makes new objects, and the same emoji must not be drawn anew
  const keys = createMemo(() => props.emojis().map(themeEmojiKey).join('\n'));

  return (
    <div class={classNames(styles.island, styles.chosenStrip)} role="group" aria-label={I18n.format('QRCode.Emoji', true)}>
      <For each={keys().split('\n')}>
        {(key) => {
          const emoji = untrack(props.emojis).find((item) => themeEmojiKey(item) === key);
          return (
            <button
              type="button"
              class={styles.chosenEmoji}
              aria-label={I18n.format('Remove', true)}
              onClick={() => props.onRemove(emoji)}
            >
              <ChosenEmoji emoji={emoji} />
            </button>
          );
        }}
      </For>
    </div>
  );
}
