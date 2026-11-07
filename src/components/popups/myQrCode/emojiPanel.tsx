import {Accessor, createEffect, createSignal, For, on, onCleanup, onMount, Show, untrack} from 'solid-js';
import EmojiTab from '@components/emoticonsDropdown/tabs/emoji';
import {EmoticonsTabStyles} from '@components/emoticonsDropdown/category';
import {EMOTICONSSTICKERGROUP} from '@components/emoticonsDropdown/constants';
import wrapCustomEmoji from '@components/wrappers/customEmoji';
import {makeMediaSize} from '@helpers/mediaSize';
import {getMiddleware} from '@helpers/middleware';
import liteMode from '@helpers/liteMode';
import noop from '@helpers/noop';
import I18n from '@lib/langPack';
import {AppManagers} from '@lib/managers';
import pause from '@helpers/schedulers/pause';
import {addAppliedEmoji, getAppliedEmoji, getStandardEmojiUrl, loadPresetIds, resolvePresetIds} from '@components/popups/myQrCode/emojiPresets';
import {ThemeEmoji, themeEmojiKey} from '@components/popups/myQrCode/theme';
import styles from '@components/popups/myQrCode.module.scss';

const CHOSEN_EMOJI_SIZE = 26;
// `EmojiPickOverlay`: a cell of the island is 34 px; it widens, a new emoji pops in and one taken off shrinks out; the
// island comes and goes as a circle in 40% of its 260 ms
const STRIP_CELL = 34, STRIP_ITEM_MS = 180, STRIP_IN_MS = 104;
const STRIP_POP_EASING = 'cubic-bezier(.34, 1.56, .64, 1)';
const PRESETS_WAIT = 300;
// `QrEmojiPanel`: the emoji as far apart down as across, about 48 px; the CSS keeps the same gap
const EMOJI_GAP = 6;
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
      styles: {...EmoticonsTabStyles.Emoji, gapX: EMOJI_GAP, gapY: EMOJI_GAP},
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
        // the keyboard's group: one with no group is never played, and stays its outline
        animationGroup: EMOTICONSSTICKERGROUP,
        textColor: CHOSEN_EMOJI_COLOR,
        middleware: middlewareHelper.get()
      })}
    </>
  );
}

type StripItem = {key: string, emoji: ThemeEmoji, fresh: boolean, leaving: Accessor<boolean>, setLeaving: (leaving: boolean) => void};

function stripItem(emoji: ThemeEmoji, fresh: boolean): StripItem {
  const [leaving, setLeaving] = createSignal(false);
  return {key: themeEmojiKey(emoji), emoji, fresh, leaving, setLeaving};
}

/**
 * The emoji on the code, in a glass island at the bottom of their panel, over the keyboard (`EmojiPickOverlay`): a
 * press takes one off. A new one grows in, one taken off shrinks away and the rest close up, and the island comes as a
 * circle growing in and goes the same way.
 */
export function ChosenEmojiStrip(props: {
  managers: AppManagers,
  emojis: Accessor<ThemeEmoji[]>,
  onRemove: (emoji: ThemeEmoji) => void
}) {
  // by key: a theme coming back from the server makes new objects, and the same emoji must not be drawn anew; one taken
  // off stays where it stood until it has gone. What is there as the panel opens is there, not coming.
  const [items, setItems] = createSignal<StripItem[]>(untrack(props.emojis).map((emoji) => stripItem(emoji, false)));
  let opening = true;
  onMount(() => opening = false);
  createEffect(on(props.emojis, (emojis) => {
    setItems((previous) => {
      const byKey = new Map(previous.map((item) => [item.key, item]));
      const next: StripItem[] = emojis.map((emoji) => {
        const item = byKey.get(themeEmojiKey(emoji));
        if(item) {
          item.setLeaving(false);
          return item;
        }

        return stripItem(emoji, true);
      });
      const kept = new Set(next);
      previous.forEach((item, index) => {
        if(kept.has(item)) return;
        item.setLeaving(true);
        next.splice(Math.min(index, next.length), 0, item);
      });
      return next;
    });
  }, {defer: true}));

  const gone = (item: StripItem) => setItems((all) => item.leaving() ? all.filter((other) => other !== item) : all);

  return (
    <Show when={items().length}>
      <StripIsland managers={props.managers} items={items} appear={!opening} onRemove={props.onRemove} onGone={gone} />
    </Show>
  );
}

function StripIsland(props: {
  managers: AppManagers,
  items: Accessor<StripItem[]>,
  /** It comes with its first emoji, not with the panel */
  appear: boolean,
  onRemove: (emoji: ThemeEmoji) => void,
  onGone: (item: StripItem) => void
}) {
  let island: HTMLDivElement;
  const animated = () => liteMode.isAvailable('motion');
  // the island going with the last emoji, one for all that go together: an emoji coming back or a new one keeps it
  let exit: Animation | undefined;
  const keep = () => {
    exit?.cancel();
    exit = undefined;
  };
  const goWithIsland = (item: StripItem) => {
    exit ??= island.animate({opacity: [1, 0], scale: [1, 0.6]}, {duration: STRIP_IN_MS, easing: 'ease-in', fill: 'forwards'});
    // gone either way: with the island, or from an island that stays
    exit.finished.then(() => props.onGone(item), () => props.onGone(item));
  };
  // it comes as a circle growing from 0.6 and fading in, then widens with its first emoji
  // read as it is made: by its mount the panel has opened
  const appear = untrack(() => props.appear);
  onMount(() => {
    if(appear && animated()) island.animate({opacity: [0, 1], scale: [0.6, 1]}, {duration: STRIP_IN_MS, easing: 'ease-out'});
  });

  return (
    <div ref={island} class={styles.chosenStrip} role="group" aria-label={I18n.format('Emoji', true)}>
      <For each={props.items()}>
        {(item) => {
          let cell: HTMLButtonElement;
          // the last one going takes the island with it
          const leave = () => {
            const last = props.items().every((other) => other.leaving());
            const shrink = cell.animate({width: [STRIP_CELL + 'px', '0px']}, {duration: STRIP_ITEM_MS, easing: 'ease-in-out', fill: 'forwards'});
            (cell.firstElementChild as HTMLElement)?.animate({scale: [1, 0]}, {duration: STRIP_ITEM_MS, fill: 'forwards'});
            shrink.finished.then(() => {
              if(!last || !props.items().every((other) => other.leaving())) return props.onGone(item);
              goWithIsland(item);
            }, noop);
          };

          onMount(() => {
            keep();
            if(!item.fresh || !animated()) return;
            cell.animate({width: ['0px', STRIP_CELL + 'px']}, {duration: STRIP_ITEM_MS, easing: 'ease-in-out'});
            (cell.firstElementChild as HTMLElement)?.animate({scale: [0, 1]}, {duration: STRIP_ITEM_MS, easing: STRIP_POP_EASING});
          });

          createEffect(on(item.leaving, (leaving) => {
            if(!leaving) {
              keep();
              cell.getAnimations({subtree: true}).forEach((animation) => animation.cancel());
              return;
            }

            if(animated()) leave();
            else props.onGone(item);
          }, {defer: true}));

          // * the emoji each button takes off, said with it: a custom one by the emoji it stands for
          const [emoticon, setEmoticon] = createSignal(item.emoji.emoticon);
          if(!emoticon() && item.emoji.documentId) {
            Promise.resolve(props.managers.appEmojiManager.getCustomEmojiDocument(item.emoji.documentId))
            .then((doc) => setEmoticon(doc?.stickerEmojiRaw), noop);
          }

          return (
            <button
              ref={cell}
              type="button"
              class={styles.chosenEmoji}
              aria-label={emoticon() ? I18n.format('QRCode.RemoveEmoji', true, [emoticon()]) : I18n.format('Remove', true)}
              disabled={item.leaving()}
              onClick={() => props.onRemove(item.emoji)}
            >
              <span class={styles.chosenEmojiArt}>
                <ChosenEmoji emoji={item.emoji} />
              </span>
            </button>
          );
        }}
      </For>
    </div>
  );
}
