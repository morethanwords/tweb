import {Accessor, createEffect, onCleanup, onMount} from 'solid-js';
import EmojiTab from '@components/emoticonsDropdown/tabs/emoji';
import {AppManagers} from '@lib/managers';
import {addAppliedEmoji, getAppliedEmoji, loadPresetIds} from './emojiPresets';
import {ThemeEmoji} from './theme';
import styles from '@components/popups/myQrCode.module.scss';

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
      freeCustomEmoji: free,
      mainSets: () => [loadPresetIds(props.managers).then((presets) => {
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
