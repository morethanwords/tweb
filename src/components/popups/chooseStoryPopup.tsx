import PopupElement, {createPopup} from '@components/popups/indexTsx';
import Scrollable from '@components/scrollable';
import ListenerSetter from '@helpers/listenerSetter';
import {StoriesProfileList} from '@components/stories/profileList';
import {StoryItem} from '@layer';
import {createEffect, createSignal, on, onCleanup} from 'solid-js';
import {getFirstChild} from '@solid-primitives/refs';

import styles from '@components/popups/chooseStoryPopup.module.scss';

export default function showChooseStoryPopup(options: {
  peerId: PeerId,
  albumId: number,
  onFinish: (result: {added: number[], removed: number[]} | null) => void
}) {
  const {peerId, albumId} = options;
  // closing without confirming answers `null`, but the buttons answer for themselves
  let finished = false;
  const finish = (result: {added: number[], removed: number[]} | null) => {
    finished = true;
    options.onFinish(result);
  };

  createPopup(() => {
    const listenerSetter = new ListenerSetter();
    onCleanup(() => listenerSetter.removeAll());

    const scrollable = new Scrollable();
    scrollable.container.classList.add('search-super'); // ! for selection
    onCleanup(() => scrollable.destroy());

    const {render, state, selection, actions} = StoriesProfileList({
      peerId,
      archive: true,
      scrollable,
      listenerSetter,
      withSelection: true,
      forPicker: true
    });

    const el = getFirstChild(render, (v) => v instanceof Element) as Element;
    if(el) scrollable.append(el);

    actions.load();

    selection.toggleSelection(true, true);

    // auto-select stories already in the album as they load
    const originalIds = new Set<number>();
    createEffect(on(() => state.peer?.stories, (stories) => {
      if(!stories) return;
      for(const story of stories) {
        if(story._ === 'storyItem' && story.albums?.includes(albumId) && !originalIds.has(story.id)) {
          originalIds.add(story.id);
          if(!selection.isMidSelected(peerId, story.id)) {
            selection.toggleMid(peerId, story.id);
          }
        }
      }
    }));

    scrollable.onScrolledBottom = () => {
      actions.load();
    };

    const getResult = () => {
      const currentMids = selection.selectedMids.get(peerId);
      const current = currentMids ? new Set(currentMids) : new Set<number>();
      const added: number[] = [];
      const removed: number[] = [];
      for(const id of current) {
        if(!originalIds.has(id)) added.push(id);
      }
      for(const id of originalIds) {
        if(!current.has(id)) removed.push(id);
      }
      return {added, removed};
    };

    // nothing to confirm until the picked set differs from what the album already holds
    const [canConfirm, setCanConfirm] = createSignal(false);
    createEffect(on(selection.count, () => {
      const {added, removed} = getResult();
      setCanConfirm(!!(added.length || removed.length) || !!originalIds.size);
    }));

    return (
      <PopupElement
        class={styles.popup}
        closable
        onClose={() => !finished && options.onFinish(null)}
      >
        <PopupElement.Header>
          <PopupElement.CloseButton />
          <PopupElement.Title title="Stories.Albums.AddToAlbum" />
        </PopupElement.Header>
        <PopupElement.Body>{scrollable.container}</PopupElement.Body>
        <PopupElement.Footer>
          <PopupElement.FooterButton
            langKey="Confirm"
            disabled={!canConfirm()}
            callback={() => finish(getResult())}
          />
        </PopupElement.Footer>
      </PopupElement>
    );
  });
}
